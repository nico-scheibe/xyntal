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

    /// GET /communities/:id (mit Token): deine Rechte und die Kanäle, die du lesen darfst. Nicht-Mitglieder bekommen 404.
    func memberCommunity(id: String, token: String) async throws -> MemberCommunity {
        let communityId = try Self.validatedPathId(id)
        return try await send("communities/\(communityId)", token: token, as: MemberCommunity.self)
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

    /// POST /channels/:id/posts (mit Token): Text und Datei-Ids. Der Server verlangt Text oder Anhang und übernimmt
    /// höchstens 10 Ids. Umfragen gehören nicht hierher, die kommen mit einem eigenen Paket.
    func sendChannelPost(channelId: String, body: String, attachmentIds: [String], token: String) async throws {
        let id = try Self.validatedPathId(channelId)
        _ = try await send("channels/\(id)/posts",
                           method: "POST",
                           token: token,
                           body: ChannelPostRequest(body: body, attachments: attachmentIds),
                           as: ChannelPostCreatedResult.self,
                           mapFailure: Self.channelPostFailure)
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
}

private struct ChannelReactionRequest: Encodable {
    let emoji: String
}

/// Rumpf von POST /channels/:id/posts. Ein Umfrage-Feld gibt es hier bewusst nicht.
private struct ChannelPostRequest: Encodable {
    let body: String
    let attachments: [String]
}

/// Antwort auf POST /channels/:id/posts. Der Inhalt wird nicht gebraucht, für den Erfolg zählt der Statuscode.
private struct ChannelPostCreatedResult: Decodable {}

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
