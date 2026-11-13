import Foundation

/// Matching-Aktionen für den Stapel „Für dich“. Liegen hier, weil APIClient.swift anderen Paketen gehört.
extension APIClient {
    /// POST /matches/interactions mit action "saved" (Kennenlernen). Gibt zurück, ob es gegenseitig passt.
    /// Fehlt das Feld connected in der Antwort, gilt es als false.
    func saveMatch(targetId: String, token: String) async throws -> Bool {
        let userId = try Self.validatedUserId(targetId)
        let result = try await send("matches/interactions",
                                    method: "POST",
                                    token: token,
                                    body: DeckSaveRequest(targetType: "user",
                                                          targetId: userId,
                                                          action: MatchAction.saved.rawValue),
                                    as: DeckSaveReply.self)
        return result.connected
    }
}

/// Körper für "saved" im Stapel. Ohne Grund und Notiz.
private struct DeckSaveRequest: Encodable {
    let targetType: String
    let targetId: String
    let action: String

    private enum CodingKeys: String, CodingKey {
        case targetType, targetId, action
    }
}

/// Antwort auf "saved": connected ist true, wenn beide Seiten Interesse haben.
private struct DeckSaveReply: Decodable {
    let connected: Bool

    private enum CodingKeys: String, CodingKey {
        case connected
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        connected = (try? container.decodeIfPresent(Bool.self, forKey: .connected)) ?? false
    }
}
