import Foundation
import Observation

/// Verlauf eines einzelnen Gesprächs. Jede ChatView hat ihre eigene Instanz, Ergebnisse können so nie
/// in ein anderes Gespräch geraten. Zusätzlich verwirft ein Zähler Antworten überholter Ladevorgänge.
@MainActor
@Observable
final class ChatStore {
    let conversationId: String
    /// Eigene Nutzer-ID als Rückfall, falls der Server kein mine-Flag schickt.
    let currentUserId: String?

    /// Aufsteigend nach Zeit sortiert.
    private(set) var messages: [Message] = []
    private(set) var hasMore = false
    private(set) var isLoading = false
    private(set) var isLoadingOlder = false
    private(set) var isSending = false
    private(set) var hasLoaded = false
    private(set) var loadError: String?
    private(set) var actionError: String?

    private let session: SessionStore
    private var loadGeneration = 0
    private var lastTypingSent: Date?
    private var isRefreshing = false
    private var refreshRequested = false

    static let pageSize = 50
    static let refreshLimit = 200
    static let typingInterval: TimeInterval = 3
    /// Erlaubte Reaktionen, in der Reihenfolge des Menüs.
    static let allowedReactions = ["👍", "❤️", "😂", "🎉", "🙏", "👀"]

    init(conversationId: String, currentUserId: String?, session: SessionStore) {
        self.conversationId = conversationId
        self.currentUserId = currentUserId
        self.session = session
    }

    func isMine(_ message: Message) -> Bool {
        if let mine = message.mine { return mine }
        guard let currentUserId, let authorId = message.authorId else { return false }
        return currentUserId == authorId
    }

    func message(withId id: String?) -> Message? {
        guard let id else { return nil }
        return messages.first { $0.id == id }
    }

    // MARK: - Laden

    /// Erste Seite. Ersetzt den Verlauf.
    func loadInitial() async {
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        defer {
            if generation == loadGeneration { isLoading = false }
        }
        do {
            let page = try await session.withAccess { token in
                try await session.api.messages(conversationId: conversationId, limit: Self.pageSize, token: token)
            }
            guard generation == loadGeneration else { return }
            messages = Self.sorted(page.messages)
            hasMore = page.hasMore
            hasLoaded = true
            loadError = nil
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            loadError = AppError.displayText(for: error)
            hasLoaded = true
        }
    }

    /// Ältere Nachrichten vor der ältesten geladenen anhängen.
    func loadOlder() async {
        guard hasMore, !isLoadingOlder, !isLoading, let oldest = messages.first, let ts = oldest.ts else { return }
        isLoadingOlder = true
        let generation = loadGeneration
        defer { isLoadingOlder = false }
        do {
            let page = try await session.withAccess { token in
                try await session.api.messages(conversationId: conversationId,
                                               limit: Self.pageSize,
                                               before: (ts: ts, id: oldest.id),
                                               token: token)
            }
            guard generation == loadGeneration else { return }
            messages = Self.merge(messages, with: page.messages)
            hasMore = page.hasMore
            actionError = nil
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            actionError = AppError.displayText(for: error)
        }
    }

    /// Holt alles ab der ältesten geladenen Nachricht neu: neue Nachrichten, Änderungen, Reaktionen.
    /// Läuft höchstens einmal gleichzeitig: Weitere Aufrufe werden vorgemerkt und danach genau einmal nachgeholt,
    /// damit eine ältere Antwort nie eine neuere überschreibt.
    func refresh() async {
        if isRefreshing {
            refreshRequested = true
            return
        }
        isRefreshing = true
        defer { isRefreshing = false }
        repeat {
            refreshRequested = false
            await performRefresh()
        } while refreshRequested && !Task.isCancelled
    }

    private func performRefresh() async {
        guard let anchor = messages.first, let ts = anchor.ts else {
            await loadInitial()
            return
        }
        let generation = loadGeneration
        do {
            let page = try await session.withAccess { token in
                try await session.api.messages(conversationId: conversationId,
                                               limit: Self.refreshLimit,
                                               since: (ts: ts, id: anchor.id),
                                               token: token)
            }
            guard generation == loadGeneration else { return }
            messages = Self.applyRefresh(existing: messages,
                                         incoming: page.messages,
                                         anchor: anchor,
                                         windowComplete: page.messages.count < Self.refreshLimit)
            loadError = nil
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            actionError = AppError.displayText(for: error)
        }
    }

    // MARK: - Aktionen

    /// Sendet und lädt danach den Verlauf nach. Gibt true zurück, wenn der Entwurf geleert werden kann.
    func send(body: String, replyToId: String?) async -> Bool {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return false }
        isSending = true
        actionError = nil
        defer { isSending = false }
        do {
            try await session.withAccess { token in
                try await session.api.sendMessage(conversationId: conversationId, body: text, replyToId: replyToId, token: token)
            }
            await refresh()
            return true
        } catch is CancellationError {
            return false
        } catch {
            actionError = AppError.displayText(for: error)
            return false
        }
    }

    func edit(_ message: Message, body: String) async -> Bool {
        let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isSending else { return false }
        isSending = true
        actionError = nil
        defer { isSending = false }
        do {
            try await session.withAccess { token in
                try await session.api.editMessage(id: message.id, body: text, token: token)
            }
            await refresh()
            return true
        } catch is CancellationError {
            return false
        } catch {
            actionError = AppError.displayText(for: error)
            return false
        }
    }

    func delete(_ message: Message) async {
        actionError = nil
        do {
            try await session.withAccess { token in
                try await session.api.deleteMessage(id: message.id, token: token)
            }
            messages.removeAll { $0.id == message.id }
            await refresh()
        } catch is CancellationError {
            return
        } catch {
            actionError = AppError.displayText(for: error)
        }
    }

    func toggleReaction(_ message: Message, emoji: String) async {
        guard Self.allowedReactions.contains(emoji) else { return }
        actionError = nil
        do {
            try await session.withAccess { token in
                try await session.api.toggleReaction(messageId: message.id, emoji: emoji, token: token)
            }
            await refresh()
        } catch is CancellationError {
            return
        } catch {
            actionError = AppError.displayText(for: error)
        }
    }

    /// Meldet das Gespräch als gelesen. Fehler werden still ignoriert, der Zähler gleicht sich beim nächsten Laden an.
    func markRead() async {
        _ = try? await session.withAccess { token in
            try await session.api.markRead(conversationId: conversationId, token: token)
        }
    }

    /// Tipp-Hinweis, höchstens alle 3 s. Fehler werden ignoriert.
    func sendTyping() async {
        let now = Date()
        if let last = lastTypingSent, now.timeIntervalSince(last) < Self.typingInterval { return }
        lastTypingSent = now
        _ = try? await session.withAccess { token in
            try await session.api.sendTyping(conversationId: conversationId, token: token)
        }
    }

    func clearActionError() {
        actionError = nil
    }

    // MARK: - Reine Hilfen (ohne UI testbar)

    /// Aufsteigend nach Zeit, bei gleicher Zeit nach ID.
    static func sorted(_ list: [Message]) -> [Message] {
        list.sorted { lhs, rhs in
            if lhs.date != rhs.date { return lhs.date < rhs.date }
            return lhs.id < rhs.id
        }
    }

    /// Vereinigt zwei Listen; bei gleicher ID gewinnt die neue Fassung.
    static func merge(_ existing: [Message], with incoming: [Message]) -> [Message] {
        var byId: [String: Message] = [:]
        for message in existing { byId[message.id] = message }
        for message in incoming { byId[message.id] = message }
        return sorted(Array(byId.values))
    }

    /// Ergebnis eines since-Aufrufs einarbeiten. Ist das Fenster vollständig (weniger Treffer als das Limit),
    /// ersetzen die Treffer alles ab dem Anker; so verschwinden auch gelöschte Nachrichten.
    /// Sonst werden die Treffer nur ergänzt.
    static func applyRefresh(existing: [Message], incoming: [Message], anchor: Message, windowComplete: Bool) -> [Message] {
        guard windowComplete else { return merge(existing, with: incoming) }
        let anchorDate = anchor.date
        let older = existing.filter { $0.id != anchor.id && $0.date < anchorDate }
        // Der Anker selbst bleibt stehen, falls der Server ihn als "since" ausschließt.
        let keptAnchor = incoming.contains { $0.id == anchor.id } ? [] : [anchor]
        return merge(older + keptAnchor, with: incoming)
    }

    /// Nachrichten eines Kalendertags, für die Tagestrenner.
    struct DayGroup: Identifiable, Equatable {
        let day: Date
        var messages: [Message]

        var id: Date { day }
    }

    /// Nachrichten nach Kalendertag gruppiert. Erwartet eine aufsteigend sortierte Liste.
    static func groupedByDay(_ list: [Message], calendar: Calendar = .current) -> [DayGroup] {
        var groups: [DayGroup] = []
        for message in list {
            let day = calendar.startOfDay(for: message.date)
            if let last = groups.indices.last, groups[last].day == day {
                groups[last].messages.append(message)
            } else {
                groups.append(DayGroup(day: day, messages: [message]))
            }
        }
        return groups
    }
}
