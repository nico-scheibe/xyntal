import Foundation

// Modelle für alle Communitys (GET /communities/discover, mit Konto).
// Felder außer der ID werden tolerant gelesen, damit ein fehlendes Feld nicht die ganze Liste kippt.

/// Eine Community aus GET /communities/discover.
struct DiscoverCommunity: Decodable, Identifiable, Hashable {
    let id: String
    var name: String?
    var description: String?
    var category: String?
    var tags: [String]
    /// Die offizielle Xyntal-Community. Sie öffnet den öffentlichen Feed statt der Detailansicht.
    var official: Bool
    /// data:image-Base64-String oder leer. AvatarView prüft und dekodiert ihn.
    var avatar: String?
    /// Mitglieder, die du in der Liste siehst (der Server zählt nur die, die für dich sichtbar sind).
    var memberCount: Int
    var channelCount: Int
    /// true, wenn du schon Mitglied bist. Die offizielle Community meldet der Server immer als true.
    var isMember: Bool
    var pinned: Bool

    private enum CodingKeys: String, CodingKey {
        case id, name, description, category, tags, official, avatar, memberCount, channelCount, isMember, pinned
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = container.lenient(String.self, .name)
        description = container.lenient(String.self, .description)
        category = container.lenient(String.self, .category)
        tags = container.lenient(LossyArray<String>.self, .tags)?.elements ?? []
        official = container.lenient(Bool.self, .official) ?? false
        avatar = container.lenient(String.self, .avatar)
        memberCount = max(0, container.lenient(Int.self, .memberCount) ?? 0)
        channelCount = max(0, container.lenient(Int.self, .channelCount) ?? 0)
        isMember = container.lenient(Bool.self, .isMember) ?? false
        pinned = container.lenient(Bool.self, .pinned) ?? official
    }
}

/// Antwort von GET /communities/discover: { communities: [...] }.
struct CommunityDiscovery: Decodable {
    let communities: [DiscoverCommunity]

    private enum CodingKeys: String, CodingKey {
        case communities
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        communities = container.lenient(LossyArray<DiscoverCommunity>.self, .communities)?.elements ?? []
    }
}

/// Antwort von POST /communities/:id/join: { joined: true }.
struct CommunityJoinResult: Decodable {
    let joined: Bool?
}
