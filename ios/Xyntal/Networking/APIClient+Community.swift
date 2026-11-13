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
