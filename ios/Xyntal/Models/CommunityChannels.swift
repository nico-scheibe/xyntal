import Foundation

// Modelle für eine Community, in der du Mitglied bist: GET /communities/:id (deine Rechte und Kanäle)
// und GET /channels/:id/posts (Beiträge). Felder außer den IDs werden tolerant gelesen (siehe Messaging.swift).

/// Antwort von GET /communities/:id für Mitglieder: ob du moderieren darfst und die Kanäle, die du lesen darfst.
struct MemberCommunity: Decodable {
    /// Ein Kanal ohne „#“. canPost gilt nur für diesen Kanal, nicht für die ganze Community.
    struct Channel: Decodable, Identifiable, Hashable {
        let id: String
        var name: String
        var canPost: Bool

        private enum CodingKeys: String, CodingKey {
            case id, name, canPost
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decodeIdentifier(forKey: .id)
            name = (container.lenient(String.self, .name) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            canPost = container.lenient(Bool.self, .canPost) ?? false
        }
    }

    /// Moderatoren und Eigentümer: dürfen fremde Beiträge löschen und Umfragen schließen.
    var canManage: Bool
    /// Darf Umfragen starten. Ein eigenes Recht, auch wenn der Server es heute gleich canManage setzt.
    var canPoll: Bool
    /// Kanäle in der Reihenfolge des Servers. Leere Namen fallen weg.
    var channels: [Channel]
    /// Logo als data:image-Base64-String, oder leer. Die Innenansicht zeigt damit das aktuelle Logo.
    var avatar: String?
    /// Banner als data:image-Base64-String, oder leer. Nur in dieser Antwort, das Verzeichnis liefert keines.
    var banner: String?
    /// true nur für den Eigentümer. Steuert das „…“-Menü für Logo und Banner. Der Server prüft es bei jeder Änderung noch einmal.
    var canEdit: Bool

    private enum CodingKeys: String, CodingKey {
        case community, channels
    }

    private struct Info: Decodable {
        let canManage: Bool?
        let canPoll: Bool?
        let avatar: String?
        let banner: String?
        let canEdit: Bool?

        private enum CodingKeys: String, CodingKey {
            case canManage, canPoll, avatar, banner, canEdit
        }

        // Jedes Feld einzeln tolerant: Ein unlesbares Feld kostet nicht die anderen.
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            canManage = container.lenient(Bool.self, .canManage)
            canPoll = container.lenient(Bool.self, .canPoll)
            avatar = container.lenient(String.self, .avatar)
            banner = container.lenient(String.self, .banner)
            canEdit = container.lenient(Bool.self, .canEdit)
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let info = container.lenient(Info.self, .community)
        canManage = info?.canManage ?? false
        canPoll = info?.canPoll ?? false
        avatar = info?.avatar
        banner = info?.banner
        canEdit = info?.canEdit ?? false
        channels = (container.lenient(LossyArray<Channel>.self, .channels)?.elements ?? [])
            .filter { !$0.name.isEmpty }
    }
}

/// Reaktion unter einem Beitrag. mine: ob du sie gesetzt hast. names: bis zu 12 Namen in der Reihenfolge der Reaktionen.
struct ChannelReaction: Decodable, Hashable {
    var emoji: String
    var count: Int
    var mine: Bool
    var names: [String]

    private enum CodingKeys: String, CodingKey {
        case emoji, count, mine, names
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        emoji = container.lenient(String.self, .emoji) ?? ""
        count = max(0, container.lenient(Int.self, .count) ?? 0)
        mine = container.lenient(Bool.self, .mine) ?? false
        names = container.lenient(LossyArray<String>.self, .names)?.elements ?? []
    }
}

/// Ein Beitrag in einem Kanal. poll ist nil, wenn der Beitrag keine Umfrage hat.
struct ChannelPost: Decodable, Identifiable, Equatable {
    /// Die einzige Reaktion, die die App anbietet.
    static let likeEmoji = "👍"

    let id: String
    var author: String?
    /// Id des Autors. Ohne sie gibt es keine Meldung (die geht an den Autor).
    var authorId: String?
    /// true, wenn der Autor zum Xyntal-Team gehört. Das Abzeichen „Team“ hängt daran.
    var authorIsTeam: Bool
    /// true, wenn du der Autor bist.
    var mine: Bool
    var body: String
    var createdAt: String?
    var reactions: [ChannelReaction]
    var attachments: [Attachment]
    var poll: CommunityPoll?

    private enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorIsTeam, mine, body, createdAt, reactions, attachments, poll
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIdentifier(forKey: .id)
        author = container.lenient(String.self, .author)
        authorId = container.lenient(String.self, .authorId)
        authorIsTeam = container.lenient(Bool.self, .authorIsTeam) ?? false
        mine = container.lenient(Bool.self, .mine) ?? false
        body = container.lenient(String.self, .body) ?? ""
        createdAt = container.lenient(String.self, .createdAt)
        reactions = container.lenient(LossyArray<ChannelReaction>.self, .reactions)?.elements ?? []
        attachments = container.lenient(LossyArray<Attachment>.self, .attachments)?.elements ?? []
        poll = container.lenient(CommunityPoll.self, .poll)
    }

    var authorName: String { author.nonEmptyText ?? "Mitglied" }
    var date: Date? { ISODate.parse(createdAt) }
    var images: [Attachment] { attachments.filter(\.isImage) }

    /// Alle Anhänge, die keine Bilder sind (Videos, Audio, PDFs). Videos stehen vorn, sonst in der Reihenfolge des Servers.
    var files: [Attachment] {
        let isVideo: (Attachment) -> Bool = { $0.mimeType?.lowercased().hasPrefix("video/") == true }
        let others = attachments.filter { !$0.isImage }
        return others.filter(isVideo) + others.filter { !isVideo($0) }
    }

    private var like: ChannelReaction? {
        reactions.first { $0.emoji == Self.likeEmoji && $0.count > 0 }
    }

    /// true, wenn du „Gefällt mir“ gesetzt hast.
    var likedByMe: Bool { like?.mine ?? false }

    /// Zeile unter dem Knopf, nur bei vorhandenen Reaktionen: „Gefällt Anna und 3 anderen“, „Gefällt dir und 2 anderen“.
    /// Ohne Reaktionen oder wenn nur du gefällt, nil. Die Zahl steht nie am Knopf, und es gibt keine Rangliste.
    var likeCaption: String? {
        guard let like else { return nil }
        if like.mine {
            let others = like.count - 1
            switch others {
            case ..<1: return nil
            case 1: return "Gefällt dir und einem anderen"
            default: return "Gefällt dir und \(others) anderen"
            }
        }
        let first = like.names.first ?? "Jemand"
        switch like.count {
        case 1: return "Gefällt \(first)"
        case 2: return "Gefällt \(first) und einem anderen"
        default: return "Gefällt \(first) und \(like.count - 1) anderen"
        }
    }
}

/// Antwort von GET /channels/:id/posts: { posts: [...] }.
struct ChannelPostsResult: Decodable {
    let posts: [ChannelPost]

    private enum CodingKeys: String, CodingKey {
        case posts
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        posts = container.lenient(LossyArray<ChannelPost>.self, .posts)?.elements ?? []
    }
}
