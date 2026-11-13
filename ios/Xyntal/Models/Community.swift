import Foundation

// Modelle für die öffentliche Xyntal-Community (GET /public/community, ohne Konto).
// Alle Felder außer der Beitrags-ID sind optional und werden tolerant gelesen (siehe Messaging.swift).

/// Antwort von GET /public/community: Kopfdaten der Community, Kanäle und die neuesten Beiträge.
struct CommunityFeed: Decodable, Equatable {
    struct Info: Decodable, Equatable {
        var name: String?
        var description: String?
        /// data:image-Base64-String oder leer. AvatarView prüft und dekodiert ihn.
        var avatar: String?

        private enum CodingKeys: String, CodingKey {
            case name, description, avatar
        }

        init(name: String? = nil, description: String? = nil, avatar: String? = nil) {
            self.name = name
            self.description = description
            self.avatar = avatar
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            name = container.lenient(String.self, .name)
            description = container.lenient(String.self, .description)
            avatar = container.lenient(String.self, .avatar)
        }
    }

    var community: Info
    /// Kanalnamen ohne „#“, z. B. "updates". Leere Namen und Dubletten sind entfernt.
    var channels: [String]
    /// Beiträge, neueste zuerst.
    var posts: [CommunityPost]

    private enum CodingKeys: String, CodingKey {
        case community, channels, posts
    }

    init(community: Info = Info(), channels: [String] = [], posts: [CommunityPost] = []) {
        self.community = community
        self.channels = Self.cleanedChannels(channels)
        self.posts = Self.sorted(posts)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        community = container.lenient(Info.self, .community) ?? Info()
        channels = Self.cleanedChannels(container.lenient(LossyArray<String>.self, .channels)?.elements ?? [])
        posts = Self.sorted(container.lenient(LossyArray<CommunityPost>.self, .posts)?.elements ?? [])
    }

    /// Leere Namen raus, Reihenfolge des Servers behalten, jeden Namen nur einmal.
    static func cleanedChannels(_ list: [String]) -> [String] {
        var seen: Set<String> = []
        return list.compactMap { name in
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, seen.insert(trimmed).inserted else { return nil }
            return trimmed
        }
    }

    /// Neueste zuerst; Beiträge ohne Zeitstempel ans Ende. Jede ID nur einmal.
    static func sorted(_ list: [CommunityPost]) -> [CommunityPost] {
        var seen: Set<String> = []
        let unique = list.filter { seen.insert($0.id).inserted }
        return unique.sorted { lhs, rhs in
            let left = lhs.date ?? .distantPast
            let right = rhs.date ?? .distantPast
            if left != right { return left > right }
            return lhs.id < rhs.id
        }
    }
}

/// Reaktion unter einem Community-Beitrag (nur Zähler, ohne Namen).
struct CommunityReaction: Decodable, Hashable {
    var emoji: String
    var count: Int

    private enum CodingKeys: String, CodingKey {
        case emoji, count
    }

    init(emoji: String, count: Int) {
        self.emoji = emoji
        self.count = clampedCount(count)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        emoji = try container.decode(String.self, forKey: .emoji)
        count = clampedCount(container.lenient(Int.self, .count))
    }

    /// Je Emoji genau ein Eintrag (dient als ForEach-ID). Leere Emojis und Nullzähler fallen weg.
    /// Summen bleiben geklemmt, damit viele Dubletten nicht überlaufen.
    static func deduplicated(_ list: [CommunityReaction]) -> [CommunityReaction] {
        var result: [CommunityReaction] = []
        var indexByEmoji: [String: Int] = [:]
        for reaction in list where !reaction.emoji.isEmpty {
            if let index = indexByEmoji[reaction.emoji] {
                result[index].count = clampedCount(result[index].count + clampedCount(reaction.count))
            } else {
                indexByEmoji[reaction.emoji] = result.count
                result.append(reaction)
            }
        }
        return result.filter { $0.count > 0 }
    }
}

/// Eine Antwortmöglichkeit einer Umfrage.
struct PollOption: Decodable, Hashable {
    var label: String
    var votes: Int

    private enum CodingKeys: String, CodingKey {
        case label, votes
    }

    init(label: String, votes: Int) {
        self.label = label
        self.votes = clampedCount(votes)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        label = container.lenient(String.self, .label) ?? ""
        votes = clampedCount(container.lenient(Int.self, .votes))
    }
}

/// Umfrage in einem Beitrag. Abstimmen geht nur in der Desktop-App; hier wird nur das Ergebnis gezeigt.
struct CommunityPoll: Decodable, Hashable {
    var question: String
    var totalVotes: Int?
    var closed: Bool
    var options: [PollOption]

    private enum CodingKeys: String, CodingKey {
        case question, totalVotes, closed, options
    }

    init(question: String, totalVotes: Int? = nil, closed: Bool = false, options: [PollOption]) {
        self.question = question
        self.totalVotes = totalVotes.map { clampedCount($0) }
        self.closed = closed
        self.options = options
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        question = container.lenient(String.self, .question) ?? ""
        totalVotes = container.lenient(Int.self, .totalVotes).map { clampedCount($0) }
        closed = container.lenient(Bool.self, .closed) ?? false
        options = container.lenient(LossyArray<PollOption>.self, .options)?.elements ?? []
    }

    /// Stimmen insgesamt: vom Server, sonst Summe der Optionen. Die Summe bleibt geklemmt (kein Überlauf).
    var voteCount: Int {
        totalVotes ?? options.reduce(0) { clampedCount($0 + clampedCount($1.votes)) }
    }

    /// Anteil einer Option in Prozent (0–100), gerundet. Ohne Stimmen 0.
    func percent(for option: PollOption) -> Int {
        guard voteCount > 0 else { return 0 }
        return min(100, Int((Double(option.votes) / Double(voteCount) * 100).rounded()))
    }

    /// true für die Option(en) mit den meisten Stimmen, sobald überhaupt abgestimmt wurde.
    func isLeading(_ option: PollOption) -> Bool {
        guard voteCount > 0, let top = options.map(\.votes).max(), top > 0 else { return false }
        return option.votes == top
    }

    /// „1 Stimme“ / „n Stimmen“
    var voteCountText: String {
        voteCount == 1 ? "1 Stimme" : "\(voteCount) Stimmen"
    }

    var statusText: String {
        closed ? "Abstimmung beendet" : "Abstimmen in der App"
    }
}

/// Beitrag des Xyntal-Teams in einem der öffentlichen Kanäle.
struct CommunityPost: Decodable, Identifiable, Hashable {
    let id: String
    var channel: String?
    var author: String?
    var body: String?
    var createdAt: String?
    var reactions: [CommunityReaction]
    var attachmentCount: Int
    var poll: CommunityPoll?

    private enum CodingKeys: String, CodingKey {
        case id, channel, author, body, createdAt, reactions, attachmentCount, poll
    }

    init(id: String,
         channel: String? = nil,
         author: String? = nil,
         body: String? = nil,
         createdAt: String? = nil,
         reactions: [CommunityReaction] = [],
         attachmentCount: Int = 0,
         poll: CommunityPoll? = nil) {
        self.id = id
        self.channel = channel
        self.author = author
        self.body = body
        self.createdAt = createdAt
        self.reactions = CommunityReaction.deduplicated(reactions)
        self.attachmentCount = clampedCount(attachmentCount)
        self.poll = poll
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIdentifier(forKey: .id)
        channel = container.lenient(String.self, .channel)
        author = container.lenient(String.self, .author)
        body = container.lenient(String.self, .body)
        createdAt = container.lenient(String.self, .createdAt)
        reactions = CommunityReaction.deduplicated(container.lenient(LossyArray<CommunityReaction>.self, .reactions)?.elements ?? [])
        attachmentCount = clampedCount(container.lenient(Int.self, .attachmentCount))
        poll = container.lenient(CommunityPoll.self, .poll)
    }

    var date: Date? { ISODate.parse(createdAt) }
    var authorName: String { author.nonEmptyText ?? "Xyntal-Team" }
    var bodyText: String { body ?? "" }

    /// „1 Anhang in der App“ / „n Anhänge in der App“, nil ohne Anhänge.
    var attachmentText: String? {
        switch attachmentCount {
        case ..<1: return nil
        case 1: return "1 Anhang in der App"
        default: return "\(attachmentCount) Anhänge in der App"
        }
    }
}
