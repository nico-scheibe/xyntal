import Foundation

/// Öffentliche Community (ohne Konto). Dieselbe Quelle wie die Community-Seite der Website.
extension APIClient {
    /// Höchstens so viele Beiträge fragt die App an; der Server deckelt ohnehin.
    static let communityPostLimit = 30

    /// GET /public/community?limit=&lang=de ohne Token. Liefert Kopfdaten, Kanäle und Beiträge, neueste zuerst.
    /// Kein If-None-Match: Der Client sieht keine Antwort-Header, daher vergleicht der Store den Inhalt selbst.
    func publicCommunity(limit: Int = APIClient.communityPostLimit) async throws -> CommunityFeed {
        let clamped = min(max(limit, 1), 100)
        return try await send("public/community",
                              query: [URLQueryItem(name: "limit", value: String(clamped)),
                                      URLQueryItem(name: "lang", value: "de")],
                              as: CommunityFeed.self,
                              maxBytes: Self.maxListResponseBytes)
    }

    /// GET /communities/discover (mit Token): alle Communitys zum Beitreten. Die offizielle steht oben.
    func discoverCommunities(token: String) async throws -> [DiscoverCommunity] {
        let result = try await send("communities/discover", token: token, as: CommunityDiscovery.self)
        return result.communities
    }

    /// POST /communities/:id/join (mit Token). Der Server verlangt den abgeschlossenen Arbeitsstil-Test (DNA_REQUIRED).
    func joinCommunity(id: String, token: String) async throws {
        let communityId = try Self.validatedPathId(id)
        _ = try await send("communities/\(communityId)/join",
                           method: "POST",
                           token: token,
                           as: CommunityJoinResult.self,
                           mapFailure: Self.communityJoinFailure)
    }

    /// POST /communities (mit Token): gründet eine Community, du wirst Eigentümer. Liefert die Id der neuen Community.
    /// Die Antwort enthält keine Beschreibung und keine Kanäle; die Liste lädt die App danach neu.
    func createCommunity(name: String, description: String, category: String, tags: [String], token: String) async throws -> CreatedCommunity {
        let result = try await send("communities",
                                    method: "POST",
                                    token: token,
                                    body: CommunityCreateRequest(name: name, description: description, category: category, tags: tags),
                                    as: CommunityCreatedResult.self,
                                    mapFailure: Self.communityCreateFailure)
        return result.community
    }

    /// GET /communities/:id (mit Token): deine Rechte und die Kanäle, die du lesen darfst. Nicht-Mitglieder bekommen 404.
    func memberCommunity(id: String, token: String) async throws -> MemberCommunity {
        let communityId = try Self.validatedPathId(id)
        return try await send("communities/\(communityId)", token: token, as: MemberCommunity.self)
    }

    /// PATCH /communities/:id (mit Token): setzt Logo (avatar) oder Banner (banner) als data-URL. Ein leerer String entfernt es.
    /// Weggelassene Felder bleiben unverändert, deshalb geht im Rumpf nur das eine Feld. Der Server schneidet nichts zu.
    func updateCommunityImage(id: String, kind: CommunityImageKind, value: String, token: String) async throws {
        let communityId = try Self.validatedPathId(id)
        _ = try await send("communities/\(communityId)",
                           method: "PATCH",
                           token: token,
                           body: CommunityImageRequest(kind: kind, value: value),
                           as: CommunityUpdatedResult.self,
                           mapFailure: Self.communityImageFailure)
    }

    /// GET /channels/:id/posts (mit Token): alle Beiträge des Kanals, neueste zuerst. Der Server blättert nicht.
    func channelPosts(channelId: String, token: String) async throws -> [ChannelPost] {
        let id = try Self.validatedPathId(channelId)
        let result = try await send("channels/\(id)/posts",
                                    token: token,
                                    as: ChannelPostsResult.self,
                                    maxBytes: Self.maxListResponseBytes)
        return result.posts
    }

    /// POST /posts/:id/reactions (mit Token): schaltet deine Reaktion um. Liefert alle Reaktionen des Beitrags neu.
    func toggleReaction(postId: String, emoji: String, token: String) async throws -> [ChannelReaction] {
        let id = try Self.validatedPathId(postId)
        let result = try await send("posts/\(id)/reactions",
                                    method: "POST",
                                    token: token,
                                    body: ChannelReactionRequest(emoji: emoji),
                                    as: ChannelReactionsResult.self)
        return result.reactions
    }

    /// DELETE /posts/:id (mit Token). Der Server erlaubt es dem Autor und Moderatoren.
    func deleteChannelPost(id: String, token: String) async throws {
        let postId = try Self.validatedPathId(id)
        _ = try await send("posts/\(postId)", method: "DELETE", token: token, as: ChannelDeletedResult.self)
    }

    /// POST /channels/:id/posts (mit Token): Text, Datei-Ids und optional eine Umfrage. Der Server verlangt Text,
    /// Anhang oder Umfrage und übernimmt höchstens 10 Ids. Eine Umfrage darf mit Text und Anhängen zusammen kommen.
    func sendChannelPost(channelId: String, body: String, attachmentIds: [String], poll: ChannelPollInput? = nil, token: String) async throws {
        let id = try Self.validatedPathId(channelId)
        let failure: (Int, String, String) -> AppError? = poll == nil ? Self.channelPostFailure : Self.pollPostFailure
        _ = try await send("channels/\(id)/posts",
                           method: "POST",
                           token: token,
                           body: ChannelPostRequest(body: body, attachments: attachmentIds, poll: poll),
                           as: ChannelPostCreatedResult.self,
                           mapFailure: failure)
    }

    /// POST /polls/:id/vote (mit Token): setzt deine Stimme. Eine neue Stimme ersetzt die alte. Liefert die frische Umfrage.
    func votePoll(pollId: String, option: Int, token: String) async throws -> CommunityPoll {
        let id = try Self.validatedPathId(pollId)
        let result = try await send("polls/\(id)/vote",
                                    method: "POST",
                                    token: token,
                                    body: PollVoteRequest(option: option),
                                    as: PollResult.self,
                                    mapFailure: Self.pollVoteFailure)
        guard let poll = result.poll else { throw AppError.message(AppError.genericMessage) }
        return poll
    }

    /// POST /polls/:id/close (mit Token): schließt die Umfrage endgültig. Nur Moderatoren. Liefert die frische Umfrage.
    func closePoll(pollId: String, token: String) async throws -> CommunityPoll {
        let id = try Self.validatedPathId(pollId)
        let result = try await send("polls/\(id)/close",
                                    method: "POST",
                                    token: token,
                                    as: PollResult.self,
                                    mapFailure: Self.pollCloseFailure)
        guard let poll = result.poll else { throw AppError.message(AppError.genericMessage) }
        return poll
    }

    /// Fehler von POST /channels/:id/posts. Der Server-Text ist englisch, deshalb stehen hier deutsche Texte.
    private static func channelPostFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code) {
        case (403, "FORBIDDEN"):
            return .message("Du darfst in diesem Kanal nicht schreiben.")
        case (404, "NOT_FOUND"):
            return .message("Diesen Kanal gibt es nicht mehr oder du kannst ihn nicht lesen.")
        default:
            return nil
        }
    }

    /// Fehler von POST /channels/:id/posts, wenn der Beitrag eine Umfrage enthält. Alles andere wie ein normaler Beitrag.
    private static func pollPostFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code) {
        case (403, "FORBIDDEN"):
            return .message("Du darfst in diesem Kanal keine Umfrage starten.")
        case (400, "VALIDATION_FAILED"):
            // Die App prüft Frage und Antworten vorher. Diese Meldung kommt nur, wenn die Prüfung nicht gegriffen hat.
            return .message("Die Umfrage passt nicht: Sie braucht eine Frage und mindestens zwei verschiedene Antworten.")
        default:
            return channelPostFailure(status: status, code: code, message: message)
        }
    }

    /// Fehler von POST /polls/:id/vote. 409 heißt: Die Umfrage ist schon geschlossen.
    private static func pollVoteFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code) {
        case (409, _):
            return .stale("Diese Umfrage ist schon geschlossen.")
        case (400, "VALIDATION_FAILED"):
            return .message("Diese Antwort gibt es nicht mehr.")
        case (404, "NOT_FOUND"):
            return .stale("Diese Umfrage gibt es nicht mehr.")
        default:
            return nil
        }
    }

    /// Fehler von POST /polls/:id/close.
    private static func pollCloseFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code) {
        case (403, "FORBIDDEN"):
            return .message("Nur Moderatoren können diese Umfrage schließen.")
        case (404, "NOT_FOUND"):
            return .stale("Diese Umfrage gibt es nicht mehr.")
        default:
            return nil
        }
    }

    /// Fehler von POST /communities. Der Server-Text ist englisch, deshalb steht hier der deutsche Text.
    private static func communityCreateFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code) {
        case (403, "DNA_REQUIRED"):
            return .assessmentRequired("Bevor du eine Community gründest, machst du den Arbeitsstil-Test. Danach geht es hier.")
        case (400, "VALIDATION_FAILED"):
            return .message("Der Name fehlt oder ist zu lang. Bitte prüfe ihn und versuche es erneut.")
        default:
            return nil
        }
    }

    /// Fehler von POST /communities/:id/join. Der Server-Text ist englisch, deshalb steht hier der deutsche Text.
    private static func communityJoinFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code) {
        case (403, "DNA_REQUIRED"):
            return .assessmentRequired("Bevor du beitrittst, machst du den Arbeitsstil-Test. Danach kannst du hier beitreten.")
        case (404, "NOT_FOUND"):
            return .message("Diese Community gibt es nicht mehr.")
        default:
            return nil
        }
    }

    /// Fehler von PATCH /communities/:id für Logo und Banner. Die Texte stehen in CommunityImageError.
    /// 403 ist .stale, damit die Anzeige die Rechte neu lädt. 413 und 400 heißen „zu groß“: Die Länge ist die einzige
    /// Grenze, die der Server für das Bild nennt, und das Format stimmt bei unserer JPEG-Ausgabe immer.
    private static func communityImageFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code) {
        case (403, "FORBIDDEN"):
            return .stale(CommunityImageError.forbiddenText)
        case (413, _), (400, "VALIDATION_FAILED"):
            return .message(CommunityImageError.tooLargeText)
        default:
            return nil
        }
    }
}

private struct ChannelReactionRequest: Encodable {
    let emoji: String
}

/// Umfrage eines neuen Beitrags: Frage und Antworten in der Reihenfolge, wie sie angezeigt werden.
/// Die App prüft vorher, was der Server prüft (2 bis 8 verschiedene Antworten, Groß- und Kleinschreibung zählt nicht).
struct ChannelPollInput: Encodable {
    let question: String
    let options: [String]
}

/// Rumpf von POST /channels/:id/posts. Ist keine Umfrage dabei, fehlt das Feld im JSON ganz (nil wird nicht gesendet).
private struct ChannelPostRequest: Encodable {
    let body: String
    let attachments: [String]
    let poll: ChannelPollInput?
}

/// Antwort auf POST /channels/:id/posts. Der Inhalt wird nicht gebraucht, für den Erfolg zählt der Statuscode.
private struct ChannelPostCreatedResult: Decodable {}

private struct PollVoteRequest: Encodable {
    let option: Int
}

/// Antwort von Umfrage-Abstimmen und -Schließen: { poll: ... }. Der Server gibt null, wenn der Beitrag weg ist.
private struct PollResult: Decodable {
    let poll: CommunityPoll?
}

private struct CommunityCreateRequest: Encodable {
    let name: String
    let description: String
    let category: String
    let tags: [String]
}

/// Die Community, wie POST /communities sie zurückgibt. Mehr enthält die Antwort nicht.
struct CreatedCommunity: Decodable {
    let id: String
    let name: String
    let category: String
    let tags: [String]
}

/// Antwort von POST /communities: { community: { id, name, category, tags } }.
private struct CommunityCreatedResult: Decodable {
    let community: CreatedCommunity
}

/// Rumpf von PATCH /communities/:id für ein Bild. Nur das Feld des gewählten Bildes ist gesetzt. nil fehlt im JSON,
/// weil die Eigenschaften optional sind und der Encoder nil-Felder nicht schreibt.
private struct CommunityImageRequest: Encodable {
    let avatar: String?
    let banner: String?

    init(kind: CommunityImageKind, value: String) {
        avatar = kind == .logo ? value : nil
        banner = kind == .banner ? value : nil
    }
}

/// Antwort von PATCH /communities/:id. Der Inhalt wird nicht gebraucht; die App setzt die neue Fassung selbst.
private struct CommunityUpdatedResult: Decodable {}

private struct ChannelReactionsResult: Decodable {
    let reactions: [ChannelReaction]

    private enum CodingKeys: String, CodingKey {
        case reactions
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        reactions = container.lenient(LossyArray<ChannelReaction>.self, .reactions)?.elements ?? []
    }
}

private struct ChannelDeletedResult: Decodable {}
