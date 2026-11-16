import Foundation

// Modelle für Nachrichten. Alle Felder außer id sind optional und werden tolerant gelesen:
// Ein falsch typisiertes Feld verwirft nur dieses Feld, ein unlesbares Listenelement nur dieses Element.

/// Gespräch aus GET /conversations. Eine Gruppe ist alles, was nicht DM mit Partner ist.
struct Conversation: Decodable, Identifiable, Hashable {
    let id: String
    var kind: String?
    var title: String?
    var name: String?
    var description: String?
    var avatar: String?
    var emoji: String?
    var partnerId: String?
    var unread: Int?
    var mentions: Int?
    var archived: Bool?
    var pendingRequests: Int?
    var visibility: String?
    var updatedTs: String?
    /// true, wenn der Server das Gespräch als Anfrage einer fremden Person führt. Fehlt das Feld, ist es false.
    var messageRequest: Bool?

    private enum CodingKeys: String, CodingKey {
        case id, kind, title, name, description, avatar, emoji, partnerId, unread, mentions, archived
        case pendingRequests, visibility, updatedTs, messageRequest
    }

    init(id: String,
         kind: String? = nil,
         title: String? = nil,
         name: String? = nil,
         description: String? = nil,
         avatar: String? = nil,
         emoji: String? = nil,
         partnerId: String? = nil,
         unread: Int? = nil,
         mentions: Int? = nil,
         archived: Bool? = nil,
         pendingRequests: Int? = nil,
         visibility: String? = nil,
         updatedTs: String? = nil,
         messageRequest: Bool? = nil) {
        self.id = id
        self.kind = kind
        self.title = title
        self.name = name
        self.description = description
        self.avatar = avatar
        self.emoji = emoji
        self.partnerId = partnerId
        self.unread = unread
        self.mentions = mentions
        self.archived = archived
        self.pendingRequests = pendingRequests
        self.visibility = visibility
        self.updatedTs = updatedTs
        self.messageRequest = messageRequest
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIdentifier(forKey: .id)
        kind = container.lenient(String.self, .kind)
        title = container.lenient(String.self, .title)
        name = container.lenient(String.self, .name)
        description = container.lenient(String.self, .description)
        avatar = container.lenient(String.self, .avatar)
        emoji = container.lenient(String.self, .emoji)
        partnerId = container.lenient(String.self, .partnerId)
        unread = container.lenient(Int.self, .unread)
        mentions = container.lenient(Int.self, .mentions)
        archived = container.lenient(Bool.self, .archived)
        pendingRequests = container.lenient(Int.self, .pendingRequests)
        visibility = container.lenient(String.self, .visibility)
        updatedTs = container.lenient(String.self, .updatedTs)
        messageRequest = container.lenient(Bool.self, .messageRequest)
    }

    /// Direktnachricht mit genau einer anderen Person.
    var isDirect: Bool { kind == "dm" && partnerId.nonEmptyText != nil }
    var isGroup: Bool { !isDirect }
    var isArchived: Bool { archived == true }
    /// Anfrage einer Person, mit der du noch nichts zu tun hattest. Die Entscheidung trifft der Server.
    var isMessageRequest: Bool { messageRequest == true }
    /// Ungelesen-Zähler, geklemmt auf 0...1_000_000, damit die Summe über alle Gespräche nicht überläuft.
    var unreadCount: Int { clampedCount(unread) }

    /// Titel ohne Profil-Cache. Für DMs liefert ConversationsStore.title(for:) den Namen des Partners.
    var fallbackTitle: String {
        title.nonEmptyText ?? name.nonEmptyText ?? (isDirect ? "Direktnachricht" : "Gruppe")
    }

    var updatedDate: Date? { ISODate.parse(updatedTs) }
}

/// Reaktion unter einer Nachricht.
struct Reaction: Decodable, Hashable {
    var emoji: String
    var count: Int
    var mine: Bool
    var names: [String]

    private enum CodingKeys: String, CodingKey {
        case emoji, count, mine, names
    }

    init(emoji: String, count: Int, mine: Bool, names: [String] = []) {
        self.emoji = emoji
        self.count = clampedCount(count)
        self.mine = mine
        self.names = names
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        emoji = try container.decode(String.self, forKey: .emoji)
        count = clampedCount(container.lenient(Int.self, .count))
        mine = container.lenient(Bool.self, .mine) ?? false
        names = container.lenient(LossyArray<String>.self, .names)?.elements ?? []
    }

    /// Je Emoji genau ein Eintrag (die Liste dient als ForEach-ID). Dubletten werden zum ersten Eintrag addiert;
    /// die Summe bleibt geklemmt, damit viele Dubletten nicht überlaufen.
    static func deduplicated(_ list: [Reaction]) -> [Reaction] {
        var result: [Reaction] = []
        var indexByEmoji: [String: Int] = [:]
        for reaction in list {
            if let index = indexByEmoji[reaction.emoji] {
                result[index].count = clampedCount(result[index].count + clampedCount(reaction.count))
                result[index].mine = result[index].mine || reaction.mine
                result[index].names += reaction.names.filter { !result[index].names.contains($0) }
            } else {
                indexByEmoji[reaction.emoji] = result.count
                result.append(reaction)
            }
        }
        return result
    }
}

/// Anhang aus GET /conversations/:id/messages (Feld attachments). Der Server schickt id, name, mimeType,
/// size und bei Sprachnachrichten durationMs. Breite und Höhe schickt er für Anhänge heute nicht; sie sind
/// nur tolerant mitgelesen, damit ein späterer Server-Stand ohne App-Änderung wirkt.
struct Attachment: Decodable, Identifiable, Hashable {
    let id: String
    var name: String?
    var mimeType: String?
    var size: Int?
    var width: Int?
    var height: Int?
    var durationMs: Int?

    private enum CodingKeys: String, CodingKey {
        case id, name, mimeType, size, width, height, durationMs
    }

    init(id: String,
         name: String? = nil,
         mimeType: String? = nil,
         size: Int? = nil,
         width: Int? = nil,
         height: Int? = nil,
         durationMs: Int? = nil) {
        self.id = id
        self.name = name
        self.mimeType = mimeType
        self.size = size
        self.width = width
        self.height = height
        self.durationMs = durationMs
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIdentifier(forKey: .id)
        name = container.lenient(String.self, .name)
        mimeType = container.lenient(String.self, .mimeType)
        size = container.lenient(Int.self, .size)
        width = container.lenient(Int.self, .width)
        height = container.lenient(Int.self, .height)
        durationMs = container.lenient(Int.self, .durationMs)
    }

    var isImage: Bool { mimeType?.lowercased().hasPrefix("image/") == true }
    var isAudio: Bool { mimeType?.lowercased().hasPrefix("audio/") == true }
    /// Anzeigename. Ohne Namen heißt die Datei "Datei".
    var displayName: String { name.nonEmptyText ?? "Datei" }
}

/// Nachricht aus GET /conversations/:id/messages.
struct Message: Decodable, Identifiable, Hashable {
    struct Gif: Decodable, Hashable {
        var url: String?
        var title: String?
        var width: Int?
        var height: Int?

        private enum CodingKeys: String, CodingKey {
            case url, title, width, height
        }

        init(url: String? = nil, title: String? = nil, width: Int? = nil, height: Int? = nil) {
            self.url = url
            self.title = title
            self.width = width
            self.height = height
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            url = container.lenient(String.self, .url)
            title = container.lenient(String.self, .title)
            width = container.lenient(Int.self, .width)
            height = container.lenient(Int.self, .height)
        }
    }

    struct SystemInfo: Decodable, Hashable {
        var kind: String?
        var targets: [String]?
        var title: String?

        private enum CodingKeys: String, CodingKey {
            case kind, targets, title
        }

        init(kind: String? = nil, targets: [String]? = nil, title: String? = nil) {
            self.kind = kind
            self.targets = targets
            self.title = title
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            kind = container.lenient(String.self, .kind)
            targets = container.lenient(LossyArray<String>.self, .targets)?.elements
            title = container.lenient(String.self, .title)
        }
    }

    let id: String
    var kind: String?
    var body: String?
    var ts: String?
    var authorId: String?
    var author: String?
    var mine: Bool?
    var edited: Bool?
    var replyToId: String?
    var reactions: [Reaction]
    /// true, wenn der Server Anhänge mitschickt (auch dann, wenn ein Anhang nicht lesbar war).
    var hasAttachments: Bool
    /// Lesbare Anhänge in Serverreihenfolge. Sprachnachrichten haben genau einen, als ersten.
    var attachments: [Attachment]
    var gif: Gif?
    var system: SystemInfo?
    /// Anruf, wenn die Nachricht einen trägt (Anrufzeile im Verlauf). Sonst nil.
    var call: CallInfo?

    private enum CodingKeys: String, CodingKey {
        case id, kind, body, ts, authorId, author, mine, edited, replyToId, reactions, attachments, gif, system, call
    }

    init(id: String,
         kind: String? = "text",
         body: String? = nil,
         ts: String? = nil,
         authorId: String? = nil,
         author: String? = nil,
         mine: Bool? = nil,
         edited: Bool? = nil,
         replyToId: String? = nil,
         reactions: [Reaction] = [],
         hasAttachments: Bool = false,
         attachments: [Attachment] = [],
         gif: Gif? = nil,
         system: SystemInfo? = nil,
         call: CallInfo? = nil) {
        self.id = id
        self.kind = kind
        self.call = call
        self.body = body
        self.ts = ts
        self.authorId = authorId
        self.author = author
        self.mine = mine
        self.edited = edited
        self.replyToId = replyToId
        self.reactions = reactions
        self.attachments = attachments
        self.hasAttachments = hasAttachments || !attachments.isEmpty
        self.gif = gif
        self.system = system
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIdentifier(forKey: .id)
        kind = container.lenient(String.self, .kind)
        body = container.lenient(String.self, .body)
        ts = container.lenient(String.self, .ts)
        authorId = container.lenient(String.self, .authorId)
        author = container.lenient(String.self, .author)
        mine = container.lenient(Bool.self, .mine)
        edited = container.lenient(Bool.self, .edited)
        replyToId = container.lenient(String.self, .replyToId)
        reactions = Reaction.deduplicated(container.lenient(LossyArray<Reaction>.self, .reactions)?.elements ?? [])
        // Zählen über die Rohelemente, damit auch ein unlesbarer Anhang den Hinweis "Anhang" auslöst.
        if var attachments = try? container.nestedUnkeyedContainer(forKey: .attachments) {
            var count = 0
            while !attachments.isAtEnd, (try? attachments.decode(IgnoredValue.self)) != nil {
                count += 1
            }
            hasAttachments = count > 0
        } else {
            hasAttachments = false
        }
        attachments = (try? container.decode(LossyArray<Attachment>.self, forKey: .attachments))?.elements ?? []
        gif = container.lenient(Gif.self, .gif)
        system = container.lenient(SystemInfo.self, .system)
        call = container.lenient(CallInfo.self, .call)
    }

    var date: Date { ISODate.parse(ts) ?? .distantPast }
    var isSystem: Bool { kind == "system" || system != nil }
    var isText: Bool { (kind ?? "text") == "text" && !hasAttachments && gif == nil }
    var isEdited: Bool { edited == true }

    /// GIF aus GIPHY (gif-Feld oder Art "gif").
    var isGif: Bool { gif != nil || kind == "gif" }
    /// Sprachnachricht: Art "voice", der Anhang ist die Aufnahme.
    var isVoice: Bool { kind == "voice" }
    var voiceAttachment: Attachment? { isVoice ? attachments.first : nil }
    /// Bilder in Serverreihenfolge (ohne die Sprachaufnahme).
    var imageAttachments: [Attachment] { isVoice ? [] : attachments.filter(\.isImage) }
    /// Alle übrigen Anhänge, also Dateien.
    var fileAttachments: [Attachment] { isVoice ? Array(attachments.dropFirst()) : attachments.filter { !$0.isImage } }

    /// Platzhalter für Inhalte ohne Text, z. B. "Foto", "3 Fotos", "Datei: Angebot.pdf". nil bei normalem Text.
    var placeholderText: String? {
        if isGif { return "GIF" }
        if isVoice {
            guard let voice = voiceAttachment else { return "Sprachnachricht" }
            let length = MediaFormat.duration(ms: voice.durationMs)
            return length.isEmpty ? "Sprachnachricht" : "Sprachnachricht, \(length)"
        }
        guard hasAttachments || (kind != nil && kind != "text" && kind != "system") else { return nil }
        if attachments.isEmpty { return "Anhang" }
        let images = imageAttachments.count
        let files = fileAttachments
        if files.isEmpty { return images == 1 ? "Foto" : "\(images) Fotos" }
        if images == 0 {
            return files.count == 1 ? "Datei: \(files[0].displayName)" : "\(files.count) Dateien"
        }
        return "\(attachments.count) Anhänge"
    }

    /// Kleines Symbol vor dem Platzhalter.
    var placeholderSymbol: String? {
        guard placeholderText != nil else { return nil }
        if isGif { return "play.rectangle" }
        if isVoice { return "waveform" }
        if attachments.isEmpty { return "paperclip" }
        let images = imageAttachments.count
        let files = fileAttachments
        if files.isEmpty { return images == 1 ? "photo" : "photo.stack" }
        if images == 0 { return files.count == 1 ? MediaFormat.fileSymbol(for: files[0]) : "doc.on.doc" }
        return "paperclip"
    }

    /// Symbol für Vorschauen und Zitate, nur wenn der Platzhalter statt eines Textes gezeigt wird.
    var previewSymbol: String? { body.nonEmptyText == nil ? placeholderSymbol : nil }

    /// Text für Vorschauen und Zitate: Körper, sonst Platzhalter.
    var previewText: String {
        if let placeholderText, body.nonEmptyText == nil { return placeholderText }
        return body.nonEmptyText ?? system?.title.nonEmptyText ?? ""
    }
}

/// Profil aus GET /users/:id, GET /users/search und GET /conversations/:id/members.
/// Die Matching-Felder (Ziele, Interessen, Skills, Sprachen, Arbeitsstil) liefert nur GET /users/:id;
/// sie dienen dem Hinweis „Für genauere Vorschläge fehlen noch: …“ unter „Für dich“.
struct Profile: Decodable, Identifiable, Hashable {
    let id: String
    var displayName: String?
    var handle: String?
    var headline: String?
    var avatar: String?
    var role: String?
    var goals: [String]
    var interests: [String]
    var skills: [String]
    var techStack: [String]
    var languages: [String]
    /// true, wenn der Arbeitsstil-Test gemacht wurde. Der Server schickt workStyle als Text oder Objekt; der Inhalt ist hier egal.
    var hasWorkStyle: Bool

    private enum CodingKeys: String, CodingKey {
        case id, displayName, handle, headline, avatar, role, goals, interests, skills, techStack, languages, workStyle
    }

    init(id: String,
         displayName: String? = nil,
         handle: String? = nil,
         headline: String? = nil,
         avatar: String? = nil,
         role: String? = nil,
         goals: [String] = [],
         interests: [String] = [],
         skills: [String] = [],
         techStack: [String] = [],
         languages: [String] = [],
         hasWorkStyle: Bool = false) {
        self.id = id
        self.displayName = displayName
        self.handle = handle
        self.headline = headline
        self.avatar = avatar
        self.role = role
        self.goals = goals
        self.interests = interests
        self.skills = skills
        self.techStack = techStack
        self.languages = languages
        self.hasWorkStyle = hasWorkStyle
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIdentifier(forKey: .id)
        displayName = container.lenient(String.self, .displayName)
        handle = container.lenient(String.self, .handle)
        headline = container.lenient(String.self, .headline)
        avatar = container.lenient(String.self, .avatar)
        role = container.lenient(String.self, .role)
        goals = container.lenient(LossyArray<String>.self, .goals)?.elements ?? []
        interests = container.lenient(LossyArray<String>.self, .interests)?.elements ?? []
        skills = container.lenient(LossyArray<String>.self, .skills)?.elements ?? []
        techStack = container.lenient(LossyArray<String>.self, .techStack)?.elements ?? []
        languages = container.lenient(LossyArray<String>.self, .languages)?.elements ?? []
        hasWorkStyle = container.hasValue(.workStyle)
    }

    var name: String { displayName.nonEmptyText ?? "Unbekannt" }
}

/// Anwesenheit aus GET /presence und den Live-Ereignissen. Unbekannte Werte werden zu .unknown.
enum PresenceStatus: String, Decodable, Hashable {
    case online
    case away
    case offline
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PresenceStatus(rawValue: raw.lowercased()) ?? .unknown
    }

    var isOnline: Bool { self == .online }
}

/// Ereignis aus GET /realtime/poll.
struct RealtimeEvent: Decodable, Hashable {
    var type: String?
    var conversationId: String?
    var userId: String?
    var name: String?
    var online: Bool?
    var status: PresenceStatus?
    var statuses: [String: PresenceStatus]?
    /// Anruf-Ereignisse (type "call"): Anruf-ID, Aktion ("started", "declined", …) und ob es klingelt.
    var callId: String?
    var action: String?
    var ring: Bool?
    var kind: String?
    var callerName: String?
    var callerHeadline: String?
    var conversationTitle: String?

    private enum CodingKeys: String, CodingKey {
        case type, conversationId, userId, name, online, status, statuses
        case callId, action, ring, kind, callerName, callerHeadline, conversationTitle
    }

    init(type: String? = nil,
         conversationId: String? = nil,
         userId: String? = nil,
         name: String? = nil,
         online: Bool? = nil,
         status: PresenceStatus? = nil,
         statuses: [String: PresenceStatus]? = nil,
         callId: String? = nil,
         action: String? = nil,
         ring: Bool? = nil,
         kind: String? = nil,
         callerName: String? = nil,
         callerHeadline: String? = nil,
         conversationTitle: String? = nil) {
        self.type = type
        self.conversationId = conversationId
        self.userId = userId
        self.name = name
        self.online = online
        self.status = status
        self.statuses = statuses
        self.callId = callId
        self.action = action
        self.ring = ring
        self.kind = kind
        self.callerName = callerName
        self.callerHeadline = callerHeadline
        self.conversationTitle = conversationTitle
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = container.lenient(String.self, .type)
        conversationId = container.lenient(String.self, .conversationId)
        userId = container.lenient(String.self, .userId)
        name = container.lenient(String.self, .name)
        online = container.lenient(Bool.self, .online)
        status = container.lenient(PresenceStatus.self, .status)
        statuses = container.lenient([String: PresenceStatus].self, .statuses)
        callId = container.lenient(String.self, .callId)
        action = container.lenient(String.self, .action)
        ring = container.lenient(Bool.self, .ring)
        kind = container.lenient(String.self, .kind)
        callerName = container.lenient(String.self, .callerName)
        callerHeadline = container.lenient(String.self, .callerHeadline)
        conversationTitle = container.lenient(String.self, .conversationTitle)
    }

    /// Anwesenheit aus einem einzelnen presence-Ereignis: status hat Vorrang, sonst online-Flag.
    var resolvedStatus: PresenceStatus? {
        if let status { return status }
        if let online { return online ? .online : .offline }
        return nil
    }
}

/// Eine Seite des Verlaufs.
struct MessagesPage {
    let messages: [Message]
    let hasMore: Bool
}

// MARK: - Hilfen zum Lesen

/// ISO-8601-Zeitstempel mit oder ohne Sekundenbruchteile.
enum ISODate {
    private static let withFractions: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func parse(_ string: String?) -> Date? {
        guard let string = string.nonEmptyText else { return nil }
        return withFractions.date(from: string) ?? plain.date(from: string)
    }
}

/// Liste, die unlesbare Elemente überspringt statt die ganze Antwort zu verwerfen.
struct LossyArray<Element: Decodable>: Decodable {
    let elements: [Element]

    init(_ elements: [Element]) {
        self.elements = elements
    }

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var result: [Element] = []
        while !container.isAtEnd {
            if let element = try? container.decode(Element.self) {
                result.append(element)
            } else if (try? container.decode(IgnoredValue.self)) == nil {
                // Weder lesbar noch überspringbar: abbrechen, damit die Schleife endet.
                break
            }
        }
        elements = result
    }
}

/// Liest ein beliebiges JSON-Element, ohne es zu behalten. Dient zum Überspringen.
struct IgnoredValue: Decodable {
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { return }
        if (try? container.decode(Bool.self)) != nil { return }
        if (try? container.decode(Double.self)) != nil { return }
        if (try? container.decode(String.self)) != nil { return }
        if (try? container.decode([String: IgnoredValue].self)) != nil { return }
        if (try? container.decode([IgnoredValue].self)) != nil { return }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unbekannter Wert")
    }
}

extension KeyedDecodingContainer {
    /// Optionaler Wert; Typfehler werden wie ein fehlendes Feld behandelt.
    func lenient<T: Decodable>(_ type: T.Type, _ key: Key) -> T? {
        (try? decodeIfPresent(type, forKey: key)) ?? nil
    }

    /// true, wenn das Feld da und nicht null ist (ein leerer Text zählt als nicht gesetzt). Der Typ ist egal.
    func hasValue(_ key: Key) -> Bool {
        guard contains(key), (try? decodeNil(forKey: key)) == false else { return false }
        if let string = try? decode(String.self, forKey: key) { return !string.isEmpty }
        return true
    }

    /// IDs kommen als String, zur Sicherheit auch als Zahl akzeptiert.
    func decodeIdentifier(forKey key: Key) throws -> String {
        if let string = try? decode(String.self, forKey: key), !string.isEmpty {
            return string
        }
        if let number = try? decode(Int.self, forKey: key) {
            return String(number)
        }
        throw DecodingError.dataCorruptedError(forKey: key, in: self, debugDescription: "ID fehlt")
    }
}
