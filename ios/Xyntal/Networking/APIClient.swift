import Foundation

/// Fehler, die in der App angezeigt werden. Texte sind deutsch und ohne Server-Details.
enum AppError: LocalizedError {
    case network
    case unauthorized
    /// Zwei-Faktor-Code fehlt oder ist falsch. Die Anmeldung zeigt dann das Code-Feld.
    /// ticket ist nur bei Anbieter-Anmeldungen (Apple, Google, Discord) gesetzt; der Code geht dann an den /complete-Aufruf.
    case twoFactor(String, ticket: String?)
    /// Erste Anmeldung über einen Anbieter, für die noch kein Konto existiert (BIRTHDATE_REQUIRED). Das Geburtsdatum wird dann im Abschluss-Blatt abgefragt; ticket ist der Fahrschein dafür.
    case birthDateRequired(String, ticket: String?)
    /// Der Server lehnt das Konto ab, weil das Alter unter 16 ist (UNDERAGE). Der Text ist der freundliche Hinweis.
    case underage(String)
    /// E-Mail ist schon vergeben. Die Registrierung zeigt dann den Button "Zur Anmeldung".
    case accountExists(String)
    /// Beitritt braucht den Arbeitsstil-Test (DNA_REQUIRED). Die Community-Ansicht bietet dann den Test an.
    case assessmentRequired(String)
    /// Der Server hat die Anfrage dauerhaft abgelehnt (4xx außer 401/429). Eine unveränderte Wiederholung bringt nichts.
    case rejected
    case message(String)

    var errorDescription: String? {
        switch self {
        case .network:
            return "Keine Verbindung zum Server. Prüfe dein Netz und versuche es erneut."
        case .unauthorized:
            return "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an."
        case .rejected:
            return AppError.genericMessage
        case .twoFactor(let text, _), .birthDateRequired(let text, _), .underage(let text), .message(let text), .accountExists(let text), .assessmentRequired(let text):
            return text
        }
    }

    static let genericMessage = "Das hat leider nicht geklappt. Bitte versuche es später erneut."

    /// Anzeigetext für beliebige Fehler. Unbekannte Fehler bekommen den allgemeinen Text, nie rohe Systemtexte.
    static func displayText(for error: Error) -> String {
        (error as? AppError)?.errorDescription ?? genericMessage
    }
}

/// Schlanker Client für den Xyntal-Server (api.xyntal.de), nur mit URLSession.
/// Antworten haben die Form { data, error }. Fehlertexte werden nur angezeigt, wenn sie bekannt sind.
/// Es gibt keinen Token-Refresh: lehnt der Server das Token ab, ist die Sitzung beendet.
final class APIClient {
    /// Servertexte (deutsch, vom Server übersetzt), die die App anzeigen darf. Alle anderen werden ersetzt.
    private static let knownServerTexts: Set<String> = [
        "E-Mail oder Passwort ist falsch.",
        "Dieser Code ist ungültig oder abgelaufen.",
        "Bitte gib E-Mail und Passwort ein.",
        "Bitte gib eine gültige E-Mail-Adresse ein.",
        "Die Eingabe ist unvollständig oder ungültig.",
        "Person nicht gefunden.",
        "Du kannst dich nicht selbst blockieren.",
        "Zu viele Meldungen. Bitte versuche es später noch einmal.",
        "Zu viele Anmeldecodes für diese Adresse. Bitte versuch es in einer Stunde noch einmal."
    ]

    /// Gerätename für die Sitzung auf dem Server. Enthält keine personenbezogenen Daten.
    private static let deviceName = "Xyntal iOS-App"

    private static let decoder = JSONDecoder()
    private static let encoder = JSONEncoder()

    /// nil, wenn die Basis-URL kein https ist. Dann scheitert jede Anfrage (siehe init).
    private let baseURL: URL?
    private let urlSession: URLSession

    init(baseURL: URL = AppConfig.apiBaseURL, urlSession: URLSession = APIClient.makeSession()) {
        // Nur https ist erlaubt. Im Debug bricht das früh ab; im Release scheitert jede Anfrage, statt unverschlüsselt zu senden.
        if baseURL.scheme?.lowercased() == "https" {
            self.baseURL = baseURL
        } else {
            assertionFailure("APIClient: Die Basis-URL muss https verwenden.")
            self.baseURL = nil
        }
        self.urlSession = urlSession
    }

    /// Eigene Session ohne Cache auf dem Datenträger. Weiterleitungen werden abgelehnt.
    static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        return URLSession(configuration: configuration, delegate: RedirectBlocker(), delegateQueue: nil)
    }

    // MARK: - Anmeldung und Konto

    /// POST /auth/login. Liefert das Sitzungs-Token; der Server gibt es nur bei der Anmeldung heraus.
    func login(email: String, password: String, code: String?) async throws -> String {
        let result = try await send("auth/login",
                                    method: "POST",
                                    body: LoginRequest(email: email, password: password, deviceName: Self.deviceName, code: code),
                                    as: LoginResult.self)
        return result.token
    }

    /// POST /auth/register. Legt ein Konto an und liefert Token und Konto (HTTP 201).
    func register(email: String, password: String, displayName: String, birthdate: String) async throws -> RegisterResult {
        try await send("auth/register",
                       method: "POST",
                       body: RegisterRequest(email: email, password: password, displayName: displayName, deviceName: Self.deviceName, birthdate: birthdate),
                       as: RegisterResult.self,
                       mapFailure: Self.registerFailure)
    }

    /// GET /auth/me: prüft das Token und liefert das eigene Konto.
    func me(token: String) async throws -> CurrentUser {
        let result = try await send("auth/me", token: token, as: MeResult.self)
        return result.user
    }

    /// POST /auth/logout. Fehler werden ignoriert, lokal ist die Sitzung ohnehin beendet.
    func logout(token: String) async {
        _ = try? await send("auth/logout", method: "POST", token: token, as: Ack.self)
    }

    /// POST /auth/email-code/request: schickt einen Code an die Adresse des Kontos. Er wird für die Kontolöschung gebraucht.
    func requestDeletionCode(email: String) async throws {
        _ = try await send("auth/email-code/request",
                           method: "POST",
                           body: EmailRequest(email: email),
                           as: Ack.self)
    }

    /// POST /auth/account/delete mit dem E-Mail-Code und, falls 2FA aktiv ist, dem 2FA-Code.
    func deleteAccount(code: String, totpCode: String?, token: String) async throws {
        _ = try await send("auth/account/delete",
                           method: "POST",
                           token: token,
                           body: DeleteAccountRequest(code: code, totpCode: totpCode),
                           as: Ack.self)
    }

    // MARK: - Mitglieder, Sperren, Meldungen

    /// GET /discover/people ohne Suchbegriff, seitenweise. Gesperrte und ausgeblendete Profile fehlen schon in der Antwort.
    func members(token: String, offset: Int, limit: Int) async throws -> MemberPage {
        let result = try await send("discover/people",
                                    token: token,
                                    query: [URLQueryItem(name: "offset", value: String(offset)),
                                            URLQueryItem(name: "limit", value: String(limit))],
                                    as: PeopleResult.self)
        return MemberPage(people: result.people, hasMore: result.hasMore ?? false)
    }

    /// GET /users/blocks: eigene Sperren, neueste zuerst. Nur die Felder von BlockedMember.
    func blockedMembers(token: String) async throws -> [BlockedMember] {
        let result = try await send("users/blocks", token: token, as: BlocksResult.self)
        return result.blocks
    }

    /// POST /users/:id/block
    func blockUser(id: String, token: String) async throws {
        let userId = try Self.validatedUserId(id)
        _ = try await send("users/\(userId)/block", method: "POST", token: token, as: Ack.self)
    }

    /// DELETE /users/:id/block
    func unblockUser(id: String, token: String) async throws {
        let userId = try Self.validatedUserId(id)
        _ = try await send("users/\(userId)/block", method: "DELETE", token: token, as: Ack.self)
    }

    /// Nutzer-IDs sind UUIDs. Alles andere wird nicht in den Pfad gesetzt.
    static func validatedUserId(_ id: String) throws -> String {
        guard UUID(uuidString: id) != nil else { throw AppError.message(AppError.genericMessage) }
        return id
    }

    /// POST /reports mit targetType "user". Der Server prüft nur, ob ein Grund da ist (höchstens 200 Zeichen).
    func reportUser(id: String, reason: String, details: String?, token: String) async throws {
        _ = try await send("reports",
                           method: "POST",
                           token: token,
                           body: ReportRequest(targetType: "user", targetId: id, reason: reason, details: details),
                           as: Ack.self)
    }

    /// GET /users/:id/ai-summary: kurze, von der KI geschriebene Vorstellung. 404 heißt, das Profil ist nicht sichtbar.
    /// 502 wird als eigener Text gemeldet, damit die Ansicht "Nochmal versuchen" anbietet. Sprache: Accept-Language aus send().
    func aiSummary(userId: String, token: String) async throws -> MemberSummary {
        let id = try Self.validatedUserId(userId)
        return try await send("users/\(id)/ai-summary",
                              token: token,
                              as: MemberSummary.self,
                              mapFailure: { status, _, _ in
                                  status == 502 ? .message(MemberSummary.upstreamErrorText) : nil
                              })
    }

    // MARK: - Nachrichten

    /// GET /conversations: alle Gespräche, auch archivierte. Die App blendet archivierte selbst aus.
    func conversations(token: String) async throws -> [Conversation] {
        let result = try await send("conversations", token: token, as: ConversationsResult.self, maxBytes: Self.maxListResponseBytes)
        return result.conversations.elements
    }

    /// GET /users/:id: öffentliches Profil, z. B. für den Namen des DM-Partners.
    func profile(id: String, token: String) async throws -> Profile {
        let userId = try Self.validatedUserId(id)
        let result = try await send("users/\(userId)", token: token, as: ProfileResult.self)
        return result.profile
    }

    /// GET /users/search?q=: Personen für ein neues Gespräch. Der Server erwartet mindestens 2 Zeichen.
    func searchUsers(query: String, token: String) async throws -> [Profile] {
        let result = try await send("users/search",
                                    token: token,
                                    query: [URLQueryItem(name: "q", value: query)],
                                    as: UsersResult.self,
                                    maxBytes: Self.maxListResponseBytes)
        return result.users.elements
    }

    /// GET /presence?ids=: Anwesenheit für bis zu 100 Nutzer-IDs. Ungültige IDs werden weggelassen.
    func presence(ids: [String], token: String) async throws -> [String: PresenceStatus] {
        let valid = ids.filter { UUID(uuidString: $0) != nil }.prefix(100)
        guard !valid.isEmpty else { return [:] }
        let result = try await send("presence",
                                    token: token,
                                    query: [URLQueryItem(name: "ids", value: valid.joined(separator: ","))],
                                    as: PresenceResult.self)
        return result.statuses ?? [:]
    }

    /// GET /conversations/:id/messages. Erste Seite mit limit; ältere mit before/beforeId; Auffrischen mit since/sinceId.
    func messages(conversationId: String,
                  limit: Int,
                  before: (ts: String, id: String)? = nil,
                  since: (ts: String, id: String)? = nil,
                  token: String) async throws -> MessagesPage {
        let id = try Self.validatedPathId(conversationId)
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let before {
            query.append(URLQueryItem(name: "before", value: before.ts))
            query.append(URLQueryItem(name: "beforeId", value: before.id))
        }
        if let since {
            query.append(URLQueryItem(name: "since", value: since.ts))
            query.append(URLQueryItem(name: "sinceId", value: since.id))
        }
        let result = try await send("conversations/\(id)/messages", token: token, query: query, as: MessagesResult.self)
        return MessagesPage(messages: result.messages.elements, hasMore: result.hasMore ?? false)
    }

    /// POST /conversations/:id/messages: Textnachricht ohne Anhänge oder Erwähnungen.
    func sendMessage(conversationId: String, body: String, replyToId: String?, token: String) async throws {
        let id = try Self.validatedPathId(conversationId)
        _ = try await send("conversations/\(id)/messages",
                           method: "POST",
                           token: token,
                           body: SendMessageRequest(body: body, replyToId: replyToId),
                           as: Ack.self)
    }

    /// POST /conversations/:id/read: alles im Gespräch als gelesen markieren.
    func markRead(conversationId: String, token: String) async throws {
        let id = try Self.validatedPathId(conversationId)
        _ = try await send("conversations/\(id)/read", method: "POST", token: token, body: EmptyBody(), as: Ack.self)
    }

    /// POST /conversations/:id/typing: Tipp-Hinweis an die anderen. Der Aufrufer drosselt und ignoriert Fehler.
    func sendTyping(conversationId: String, token: String) async throws {
        let id = try Self.validatedPathId(conversationId)
        _ = try await send("conversations/\(id)/typing", method: "POST", token: token, body: EmptyBody(), as: Ack.self)
    }

    /// GET /conversations/:id/members
    func conversationMembers(conversationId: String, token: String) async throws -> [Profile] {
        let id = try Self.validatedPathId(conversationId)
        let result = try await send("conversations/\(id)/members", token: token, as: MembersResult.self, maxBytes: Self.maxListResponseBytes)
        return result.members?.elements ?? []
    }

    /// PATCH /messages/:id
    func editMessage(id: String, body: String, token: String) async throws {
        let messageId = try Self.validatedPathId(id)
        _ = try await send("messages/\(messageId)", method: "PATCH", token: token, body: EditMessageRequest(body: body), as: Ack.self)
    }

    /// DELETE /messages/:id
    func deleteMessage(id: String, token: String) async throws {
        let messageId = try Self.validatedPathId(id)
        _ = try await send("messages/\(messageId)", method: "DELETE", token: token, as: Ack.self)
    }

    /// POST /messages/:id/reactions: setzt oder entfernt die eigene Reaktion mit diesem Emoji.
    func toggleReaction(messageId: String, emoji: String, token: String) async throws {
        let id = try Self.validatedPathId(messageId)
        _ = try await send("messages/\(id)/reactions", method: "POST", token: token, body: ReactionRequest(emoji: emoji), as: Ack.self)
    }

    /// POST /conversations mit kind "dm". Der Server liefert ein bestehendes Gespräch, falls es eines gibt.
    func createDirectConversation(userId: String, token: String) async throws -> Conversation {
        let id = try Self.validatedUserId(userId)
        let result = try await send("conversations",
                                    method: "POST",
                                    token: token,
                                    body: CreateConversationRequest(kind: "dm", memberIds: [id], title: nil),
                                    as: ConversationResult.self)
        return result.conversation
    }

    /// POST /conversations mit kind "group".
    func createGroupConversation(memberIds: [String], title: String, token: String) async throws -> Conversation {
        let ids = try memberIds.map { try Self.validatedUserId($0) }
        let result = try await send("conversations",
                                    method: "POST",
                                    token: token,
                                    body: CreateConversationRequest(kind: "group", memberIds: ids, title: title),
                                    as: ConversationResult.self)
        return result.conversation
    }

    // MARK: - Matching („Für dich“)

    /// GET /matches/people?limit=: Vorschläge, beste Passung zuerst. Ausgeblendete Personen fehlen schon in der Antwort.
    func matches(limit: Int, token: String) async throws -> [MatchPerson] {
        let result = try await send("matches/people",
                                    token: token,
                                    query: [URLQueryItem(name: "limit", value: String(limit))],
                                    as: MatchPeopleResult.self,
                                    maxBytes: Self.maxListResponseBytes)
        return result.people?.elements ?? []
    }

    /// GET /matches/interactions?action=saved: gespeicherte Vorschläge.
    func savedMatches(token: String) async throws -> [MatchPerson] {
        let result = try await send("matches/interactions",
                                    token: token,
                                    query: [URLQueryItem(name: "action", value: MatchAction.saved.rawValue)],
                                    as: MatchPeopleResult.self,
                                    maxBytes: Self.maxListResponseBytes)
        return result.people?.elements ?? []
    }

    /// GET /matches/people/:id: Erklärung der Passung. 404 heißt, das Profil ist nicht (mehr) sichtbar.
    func matchDetail(id: String, token: String) async throws -> MatchDetail {
        let userId = try Self.validatedUserId(id)
        let result = try await send("matches/people/\(userId)",
                                    token: token,
                                    as: MatchDetailResult.self,
                                    mapFailure: { status, _, _ in
                                        status == 404 ? .message("Dieses Profil ist nicht (mehr) sichtbar.") : nil
                                    })
        return result.match
    }

    /// POST /matches/interactions: speichern, Speichern zurücknehmen oder ausblenden.
    /// Grund und Notiz gehören nur zu "dismissed"; die Notiz wird vorher auf 200 Zeichen gekürzt.
    func recordMatchInteraction(targetId: String,
                                action: MatchAction,
                                reason: DismissReason? = nil,
                                note: String? = nil,
                                token: String) async throws {
        let userId = try Self.validatedUserId(targetId)
        let trimmedNote = note.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).truncatedToUTF16(DismissReason.noteLimit) }
        _ = try await send("matches/interactions",
                           method: "POST",
                           token: token,
                           body: MatchInteractionRequest(targetType: "user",
                                                         targetId: userId,
                                                         action: action.rawValue,
                                                         reason: action == .dismissed ? reason?.rawValue : nil,
                                                         note: action == .dismissed ? trimmedNote.nonEmptyText : nil),
                           as: Ack.self)
    }

    /// GET /realtime/poll: Long-Polling. Der Server hält die Verbindung offen, daher ein längerer Timeout.
    func pollRealtime(client: String, token: String) async throws -> [RealtimeEvent] {
        let result = try await send("realtime/poll",
                                    token: token,
                                    query: [URLQueryItem(name: "client", value: client)],
                                    as: EventsResult.self,
                                    timeout: Self.longPollTimeout)
        return result.events?.elements ?? []
    }

    /// Timeout für Long-Polling. Die normale Grenze von 20 s bleibt für alle anderen Anfragen.
    private static let longPollTimeout: TimeInterval = 70

    /// Gesprächs- und Nachrichten-IDs müssen keine UUIDs sein. Erlaubt sind nur [A-Za-z0-9_-], höchstens 128 Zeichen.
    /// Damit braucht der Pfad keine weitere Kodierung; appending(path:) kodiert ohnehin.
    private static let safePathIdScalars = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")

    static func validatedPathId(_ id: String) throws -> String {
        guard !id.isEmpty, id.count <= 128,
              id.unicodeScalars.allSatisfy({ safePathIdScalars.contains($0) }) else {
            throw AppError.message(AppError.genericMessage)
        }
        return id
    }

    // MARK: - Anfrage

    /// Obergrenze für Antwortkörper. Größere Antworten gelten als Netzfehler.
    private static let maxResponseBytes = 5 * 1024 * 1024
    /// Listen mit eingebetteten Avataren (data-URLs) dürfen größer sein.
    static let maxListResponseBytes = 15 * 1024 * 1024

    /// Zeichen, die in Query-Namen und -Werten unkodiert bleiben dürfen. Anders als urlQueryAllowed
    /// werden auch + & = ? / ; kodiert, damit z. B. ein "+" im Suchbegriff nicht als Leerzeichen gelesen wird.
    private static let queryValueAllowed: CharacterSet = {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "+&=?/;")
        return allowed
    }()

    private static func percentEncodedQueryValue(_ value: String) throws -> String {
        guard let encoded = value.addingPercentEncoding(withAllowedCharacters: queryValueAllowed) else {
            throw AppError.message(AppError.genericMessage)
        }
        return encoded
    }

    /// Intern für Erweiterungen in anderen Dateien (APIClient+*.swift) zugänglich.
    func send<T: Decodable>(_ path: String,
                            method: String = "GET",
                            token: String? = nil,
                            query: [URLQueryItem]? = nil,
                            body: (any Encodable)? = nil,
                            as type: T.Type,
                            mapFailure: ((Int, String, String) -> AppError?)? = nil,
                            timeout: TimeInterval = 20,
                            maxBytes: Int = APIClient.maxResponseBytes) async throws -> T {
        guard let baseURL else { throw AppError.message(AppError.genericMessage) }
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)
        if let query {
            components?.percentEncodedQueryItems = try query.map { item in
                URLQueryItem(name: try Self.percentEncodedQueryValue(item.name),
                             value: try item.value.map(Self.percentEncodedQueryValue))
            }
        }
        guard let url = components?.url else { throw AppError.message(AppError.genericMessage) }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // Der Server antwortet auf Deutsch, wenn die App Deutsch spricht.
        request.setValue("de", forHTTPHeaderField: "Accept-Language")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try Self.encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch let error as URLError {
            // Abbruch ist kein Fehler für den Nutzer und wird still behandelt.
            if error.code == .cancelled { throw CancellationError() }
            throw AppError.network
        }

        guard let http = response as? HTTPURLResponse else { throw AppError.network }
        // Unerwartet große Antworten werden nicht dekodiert.
        guard data.count <= maxBytes else { throw AppError.network }
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? Self.decoder.decode(ErrorEnvelope.self, from: data)
            let code = envelope?.error?.code ?? ""
            let message = envelope?.error?.message ?? ""
            if let mapped = mapFailure?(http.statusCode, code, message) {
                throw mapped
            }
            throw Self.failure(status: http.statusCode, code: code, message: message,
                               ticket: envelope?.ticket, retryAfter: envelope?.error?.retryAfter)
        }

        guard let envelope = try? Self.decoder.decode(Envelope<T>.self, from: data),
              let result = envelope.data else {
            throw AppError.message("Die Daten konnten nicht gelesen werden. Bitte versuche es später erneut.")
        }
        return result
    }

    /// Übersetzt Fehlerantworten in deutsche Texte. Server-Texte nur für bekannte Fälle.
    private static func failure(status: Int, code: String, message: String, ticket: String? = nil, retryAfter: String? = nil) -> AppError {
        switch code {
        case "UNAUTHENTICATED":
            return .unauthorized
        case "TWOFA_REQUIRED":
            return .twoFactor("Bitte gib deinen Zwei-Faktor-Code ein.", ticket: ticket)
        case "TWOFA_INVALID":
            return .twoFactor("Der Zwei-Faktor-Code ist falsch.", ticket: ticket)
        case "SSO_REQUIRED":
            // Konten mit Pflicht-SSO melden sich nur in der Desktop-App an.
            return .message("Bitte melde dich in der Desktop-App an.")
        case "ACCOUNT_BANNED":
            return .message("Dieses Konto wurde gesperrt.")
        case "COOLDOWN_ACTIVE":
            // Arbeitsstil-Test innerhalb der Sperrfrist. retryAfter steht im error-Objekt (ISO-Datum).
            return .message(cooldownText(retryAfter: retryAfter))
        case "BIRTHDATE_REQUIRED":
            // Erste Anmeldung über einen Anbieter: Der Fahrschein steht in error.ticket, wie bei 2FA.
            return .birthDateRequired("Für dein Konto brauchen wir dein Geburtsdatum.", ticket: ticket)
        case "UNDERAGE":
            // Der Server lehnt die Registrierung unter 16 ab. Gleicher Wortlaut wie die
            // freundliche Hürde im Formular, damit es sich nicht wie eine Strafe anfühlt.
            return .underage("Xyntal ist ab 16 Jahren. Sobald du 16 wirst, bist du herzlich willkommen.")
        default:
            break
        }
        if knownServerTexts.contains(message) {
            return .message(message)
        }
        if status == 429 {
            return .message("Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.")
        }
        if status == 409 && code == "VALIDATION_FAILED" {
            // Kontolöschung: noch Arbeitsbereiche mit anderen Mitgliedern. Der Server-Text ist englisch.
            return .message("Du besitzt noch Arbeitsbereiche mit anderen Mitgliedern. Übergib sie oder lösche sie zuerst.")
        }
        return .message(AppError.genericMessage)
    }

    /// Text für COOLDOWN_ACTIVE mit dem Datum, ab dem der Arbeitsstil-Test wiederholt werden darf.
    private static func cooldownText(retryAfter: String?) -> String {
        guard let date = ISODate.parse(retryAfter) else {
            return "Den Test kannst du gerade noch nicht wiederholen. Bitte versuche es später erneut."
        }
        let day = date.formatted(.dateTime.day().month(.wide).year().locale(Locale(identifier: "de_DE")))
        return "Den Test kannst du ab dem \(day) wiederholen."
    }

    /// Fehlerantworten von POST /auth/register. Nur die Fälle dieser Anfrage; alles andere geht an failure().
    private static func registerFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code) {
        case (403, "FORBIDDEN"):
            return .message("Die Registrierung ist gerade geschlossen.")
        case (403, "SSO_REQUIRED"):
            return .message("Bitte melde dich über deine Organisation an.")
        case (400, "VALIDATION_FAILED"):
            return .message("Bitte prüfe E-Mail, Passwort und Anzeigename.")
        case (409, "EMAIL_TAKEN"):
            // Einheitlicher Text, egal ob das Konto von xyntal.de stammt. Der Server-Text wird nicht angezeigt.
            return .accountExists("Für diese E-Mail gibt es schon ein Konto. Melde dich an.")
        case (429, _):
            return knownServerTexts.contains(message)
                ? .message(message)
                : .message("Zu viele Versuche. Bitte warte kurz.")
        default:
            return nil
        }
    }
}

// MARK: - Antwortformen

/// Gemeinsame Hülle: { data, error }.
private struct Envelope<T: Decodable>: Decodable {
    let data: T?
    let error: ErrorBody?
}

private struct ErrorEnvelope: Decodable {
    let error: ErrorBody?
    /// data.ticket bei 2FA-Antworten der Anbieter-Anmeldung. Andere Formen von data stören die Fehlerauswertung nicht.
    let ticket: String?

    private enum CodingKeys: String, CodingKey {
        case error, data
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        error = try container.decodeIfPresent(ErrorBody.self, forKey: .error)
        ticket = (try? container.decodeIfPresent(TicketBody.self, forKey: .data))?.ticket
    }
}

private struct ErrorBody: Decodable {
    let code: String?
    let message: String?
    /// Nur bei COOLDOWN_ACTIVE: ISO-Datum, ab dem wieder versucht werden darf.
    let retryAfter: String?
}

private struct TicketBody: Decodable {
    let ticket: String?
}

/// Antworten ohne Inhalt, z. B. { "reported": true }.
private struct Ack: Decodable {}

private struct LoginResult: Decodable {
    let token: String
}

/// Antwort von POST /auth/register (HTTP 201). Ein 201 gilt als angelegtes Konto, created wird nicht ausgewertet.
struct RegisterResult: Decodable {
    let token: String
    let user: CurrentUser
    let created: Bool?
}

private struct MeResult: Decodable {
    let user: CurrentUser
}

private struct PeopleResult: Decodable {
    let people: [Member]
    let hasMore: Bool?
}

private struct BlocksResult: Decodable {
    let blocks: [BlockedMember]
}

/// Eine Seite der Mitgliederliste. hasMore sagt, ob eine weitere Seite per offset abrufbar ist.
struct MemberPage {
    let people: [Member]
    let hasMore: Bool
}

private struct ConversationsResult: Decodable {
    let conversations: LossyArray<Conversation>
}

private struct ConversationResult: Decodable {
    let conversation: Conversation
}

private struct ProfileResult: Decodable {
    let profile: Profile
}

private struct UsersResult: Decodable {
    let users: LossyArray<Profile>
}

private struct PresenceResult: Decodable {
    let statuses: [String: PresenceStatus]?
}

private struct MessagesResult: Decodable {
    let messages: LossyArray<Message>
    let hasMore: Bool?
}

private struct MembersResult: Decodable {
    let members: LossyArray<Profile>?
}

private struct EventsResult: Decodable {
    let events: LossyArray<RealtimeEvent>?
}

private struct MatchPeopleResult: Decodable {
    let people: LossyArray<MatchPerson>?
}

private struct MatchDetailResult: Decodable {
    let match: MatchDetail
}

/// Lehnt jede HTTP-Weiterleitung ab. Die API braucht keine, und ein Token wandert so nie zu einem anderen Host.
private final class RedirectBlocker: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession,
                    task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

// MARK: - Anfragen

private struct LoginRequest: Encodable {
    let email: String
    let password: String
    let deviceName: String
    let code: String?
}

private struct RegisterRequest: Encodable {
    let email: String
    let password: String
    let displayName: String
    let deviceName: String
    /// Geburtsdatum als YYYY-MM-DD. Der Server prüft damit das Mindestalter von 16.
    let birthdate: String
}

private struct EmailRequest: Encodable {
    let email: String
}

private struct DeleteAccountRequest: Encodable {
    let code: String
    let totpCode: String?
}

private struct ReportRequest: Encodable {
    let targetType: String
    let targetId: String
    let reason: String
    let details: String?
}

/// Leerer JSON-Körper "{}" für POST-Aufrufe ohne Daten.
private struct EmptyBody: Encodable {}

private struct SendMessageRequest: Encodable {
    let body: String
    let attachments: [String] = []
    let mentions: [String] = []
    let mentionEveryone = false
    let replyToId: String?

    private enum CodingKeys: String, CodingKey {
        case body, attachments, mentions, mentionEveryone, replyToId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(body, forKey: .body)
        try container.encode(attachments, forKey: .attachments)
        try container.encode(mentions, forKey: .mentions)
        try container.encode(mentionEveryone, forKey: .mentionEveryone)
        // Nur mitschicken, wenn gesetzt; der Server erwartet das Feld sonst nicht.
        try container.encodeIfPresent(replyToId, forKey: .replyToId)
    }
}

private struct EditMessageRequest: Encodable {
    let body: String
}

private struct ReactionRequest: Encodable {
    let emoji: String
}

/// Körper für POST /matches/interactions. reason und note nur mitschicken, wenn gesetzt.
private struct MatchInteractionRequest: Encodable {
    let targetType: String
    let targetId: String
    let action: String
    let reason: String?
    let note: String?

    private enum CodingKeys: String, CodingKey {
        case targetType, targetId, action, reason, note
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(targetType, forKey: .targetType)
        try container.encode(targetId, forKey: .targetId)
        try container.encode(action, forKey: .action)
        try container.encodeIfPresent(reason, forKey: .reason)
        try container.encodeIfPresent(note, forKey: .note)
    }
}

private struct CreateConversationRequest: Encodable {
    let kind: String
    let memberIds: [String]
    let title: String?

    private enum CodingKeys: String, CodingKey {
        case kind, memberIds, title
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encode(memberIds, forKey: .memberIds)
        try container.encodeIfPresent(title, forKey: .title)
    }
}
