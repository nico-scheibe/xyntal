import Foundation
import Observation

/// Was eine Runde Live-Ereignisse bewirkt. Reines Ergebnis von ConversationsStore.apply(events:), ohne Seiteneffekte.
struct RealtimeChanges: Equatable {
    struct Typing: Equatable {
        let conversationId: String
        let userId: String
        let name: String?
    }

    /// Mindestens ein Ereignis betrifft die Gesprächsliste (neue Nachricht).
    var conversationsChanged = false
    /// Gespräche mit neuen Nachrichten, in Reihenfolge der Ereignisse, ohne Dubletten.
    var messageConversationIds: [String] = []
    var typing: [Typing] = []
    /// Neue Anwesenheitswerte je Nutzer-ID.
    var presence: [String: PresenceStatus] = [:]
}

/// Gesprächsliste, Profil-Cache, Anwesenheit und der Long-Poll für Live-Ereignisse.
/// Der Poll läuft nur, solange die App angemeldet und im Vordergrund ist (siehe update(isSceneActive:)).
@MainActor
@Observable
final class ConversationsStore {
    private(set) var conversations: [Conversation] = []
    /// Profile nach Nutzer-ID, vor allem für die Namen der DM-Partner.
    private(set) var profiles: [String: Profile] = [:]
    private(set) var presence: [String: PresenceStatus] = [:]
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var loadError: String?
    /// Eigene Nutzer-ID, um eigene Tipp-Ereignisse zu ignorieren.
    private(set) var currentUserId: String?
    /// Zähler je Gespräch. Erhöht sich bei jedem message-Ereignis; die offene ChatView lädt dann nach.
    private(set) var messageEvents: [String: Int] = [:]
    /// Wer gerade schreibt, je Gespräch: Nutzer-ID → Ablauf des Hinweises.
    private var typingEntries: [String: [String: TypingEntry]] = [:]

    private struct TypingEntry {
        let name: String?
        let expires: Date
    }

    private let session: SessionStore
    /// Stabile Kennung dieses App-Starts für den Poll-Endpunkt.
    private let clientId = UUID().uuidString
    private var pollTask: Task<Void, Never>?
    /// Zählt jeden Poll-Start; eine endende Schleife räumt pollTask nur ab, wenn sie noch die aktuelle ist.
    private var pollGeneration = 0
    private var reloadTask: Task<Void, Never>?
    private var typingCleanupTask: Task<Void, Never>?
    private var loadGeneration = 0
    private var isSceneActive = false

    static let initialBackoff: Duration = .seconds(1)
    static let maxBackoff: Duration = .seconds(30)
    static let reloadDebounce: Duration = .milliseconds(300)
    static let typingDuration: TimeInterval = 5

    init(session: SessionStore) {
        self.session = session
    }

    // MARK: - Abgeleitete Werte

    /// Summe der ungelesenen Nachrichten in nicht archivierten Gesprächen (für das Tab-Badge).
    /// Jeder Summand und die Summe sind auf 0...1_000_000 geklemmt, damit Serverdaten keinen Überlauf auslösen.
    var unreadTotal: Int {
        conversations.filter { !$0.isArchived }.reduce(0) { clampedCount($0 + clampedCount($1.unreadCount)) }
    }

    /// Anzeigename: bei DMs der Partner aus dem Profil-Cache, sonst der Titel des Gesprächs.
    func title(for conversation: Conversation) -> String {
        if conversation.isDirect, let partnerId = conversation.partnerId, let profile = profiles[partnerId] {
            return profile.name
        }
        return conversation.fallbackTitle
    }

    /// Avatar-String (data-URL): bei DMs vom Partner, sonst vom Gespräch. AvatarView prüft und dekodiert ihn.
    func avatar(for conversation: Conversation) -> String? {
        if conversation.isDirect, let partnerId = conversation.partnerId, let profile = profiles[partnerId] {
            return profile.avatar
        }
        return conversation.avatar
    }

    func isPartnerOnline(_ conversation: Conversation) -> Bool {
        guard conversation.isDirect, let partnerId = conversation.partnerId else { return false }
        return presence[partnerId]?.isOnline == true
    }

    /// Aktuelle Fassung eines Gesprächs aus der Liste, falls vorhanden.
    func conversation(withId id: String) -> Conversation? {
        conversations.first { $0.id == id }
    }

    /// Namen der Personen, die gerade in diesem Gespräch schreiben.
    func typingNames(in conversationId: String) -> [String] {
        let now = Date()
        return (typingEntries[conversationId] ?? [:])
            .filter { $0.value.expires > now }
            .map { profiles[$0.key]?.name ?? $0.value.name.nonEmptyText ?? "Jemand" }
            .sorted()
    }

    // MARK: - Lebenszyklus

    /// Startet oder stoppt den Poll je nach Anmeldung und Vordergrund. Beim Abmelden werden alle Daten verworfen.
    func update(isSceneActive: Bool) {
        self.isSceneActive = isSceneActive
        guard session.state == .signedIn else {
            stopPolling()
            clear()
            return
        }
        if isSceneActive {
            startPolling()
        } else {
            stopPolling()
        }
    }

    private func startPolling() {
        guard pollTask == nil else { return }
        pollGeneration += 1
        let generation = pollGeneration
        pollTask = Task { [weak self] in
            await self?.runPollLoop(generation: generation)
        }
        // Nach dem Hintergrund können Ereignisse verpasst worden sein.
        if hasLoaded {
            scheduleReload()
        }
    }

    private func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
        reloadTask?.cancel()
        reloadTask = nil
    }

    private func clear() {
        loadGeneration += 1
        conversations = []
        profiles = [:]
        presence = [:]
        typingEntries = [:]
        messageEvents = [:]
        currentUserId = nil
        hasLoaded = false
        isLoading = false
        loadError = nil
        typingCleanupTask?.cancel()
        typingCleanupTask = nil
        AvatarImage.clearCache()
    }

    // MARK: - Laden

    /// Lädt die Gesprächsliste neu, danach fehlende Profile und die Anwesenheit.
    func load() async {
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        defer {
            if generation == loadGeneration { isLoading = false }
        }
        do {
            if currentUserId == nil {
                let me = try await session.withAccess { token in try await session.api.me(token: token) }
                guard generation == loadGeneration else { return }
                currentUserId = me.id
            }
            let list = try await session.withAccess { token in try await session.api.conversations(token: token) }
            guard generation == loadGeneration else { return }
            conversations = Self.sorted(list)
            hasLoaded = true
            loadError = nil
            await loadMissingProfiles(generation: generation)
            await refreshPresence(generation: generation)
        } catch is CancellationError {
            return
        } catch AppError.unauthorized {
            return
        } catch {
            guard generation == loadGeneration else { return }
            loadError = AppError.displayText(for: error)
            hasLoaded = true
        }
    }

    /// Neueste Aktivität zuerst; Gespräche ohne Zeitstempel ans Ende.
    static func sorted(_ list: [Conversation]) -> [Conversation] {
        list.sorted { lhs, rhs in
            let left = lhs.updatedDate ?? .distantPast
            let right = rhs.updatedDate ?? .distantPast
            if left != right { return left > right }
            return lhs.id < rhs.id
        }
    }

    /// Holt Profile der DM-Partner, die noch nicht im Cache sind. Fehler einzelner Profile werden ignoriert.
    private func loadMissingProfiles(generation: Int) async {
        let missing = Set(conversations.compactMap { $0.isDirect ? $0.partnerId : nil })
            .filter { profiles[$0] == nil }
        guard !missing.isEmpty else { return }
        let loaded = await withTaskGroup(of: Profile?.self, returning: [Profile].self) { group in
            for id in missing {
                group.addTask { [session] in
                    try? await session.withAccess { token in try await session.api.profile(id: id, token: token) }
                }
            }
            var result: [Profile] = []
            for await profile in group {
                if let profile { result.append(profile) }
            }
            return result
        }
        guard generation == loadGeneration else { return }
        for profile in loaded {
            profiles[profile.id] = profile
        }
    }

    /// Anwesenheit aller DM-Partner, in Blöcken zu 100.
    private func refreshPresence(generation: Int) async {
        let ids = Array(Set(conversations.compactMap { $0.isDirect ? $0.partnerId : nil }))
        guard !ids.isEmpty else { return }
        var merged: [String: PresenceStatus] = [:]
        for start in stride(from: 0, to: ids.count, by: 100) {
            let chunk = Array(ids[start..<min(start + 100, ids.count)])
            let statuses = (try? await session.withAccess { token in
                try await session.api.presence(ids: chunk, token: token)
            }) ?? [:]
            merged.merge(statuses) { _, new in new }
        }
        guard generation == loadGeneration else { return }
        presence.merge(merged) { _, new in new }
    }

    /// Merkt ein neues oder geändertes Gespräch lokal vor, bis die Liste neu geladen ist.
    func upsert(_ conversation: Conversation) {
        if let index = conversations.firstIndex(where: { $0.id == conversation.id }) {
            conversations[index] = conversation
        } else {
            conversations = Self.sorted(conversations + [conversation])
        }
        Task { await loadMissingProfilesNow() }
    }

    private func loadMissingProfilesNow() async {
        await loadMissingProfiles(generation: loadGeneration)
    }

    /// Setzt den Ungelesen-Zähler lokal auf 0, nachdem das Gespräch als gelesen gemeldet wurde.
    func markedRead(conversationId: String) {
        guard let index = conversations.firstIndex(where: { $0.id == conversationId }) else { return }
        conversations[index].unread = 0
        conversations[index].mentions = 0
    }

    /// Profil in den Cache übernehmen, z. B. aus der Suche.
    func cache(_ profile: Profile) {
        profiles[profile.id] = profile
    }

    // MARK: - Long-Polling

    /// Nächste Wartezeit nach einem Fehler: verdoppeln bis höchstens 30 s.
    static func nextBackoff(after current: Duration) -> Duration {
        min(current * 2, maxBackoff)
    }

    /// Fasst Ereignisse zu Änderungen zusammen. Unbekannte Typen werden ignoriert.
    static func apply(events: [RealtimeEvent]) -> RealtimeChanges {
        var changes = RealtimeChanges()
        for event in events {
            switch event.type {
            case "message":
                changes.conversationsChanged = true
                if let id = event.conversationId.nonEmptyText, !changes.messageConversationIds.contains(id) {
                    changes.messageConversationIds.append(id)
                }
            case "typing":
                if let conversationId = event.conversationId.nonEmptyText, let userId = event.userId.nonEmptyText {
                    changes.typing.append(.init(conversationId: conversationId, userId: userId, name: event.name))
                }
            case "presence":
                if let userId = event.userId.nonEmptyText, let status = event.resolvedStatus {
                    changes.presence[userId] = status
                }
            case "presence.snapshot":
                for (userId, status) in event.statuses ?? [:] {
                    changes.presence[userId] = status
                }
            default:
                break
            }
        }
        return changes
    }

    /// Pause nach einer erfolgreichen Antwort, damit ein sofort antwortender Server keine Dauerschleife auslöst:
    /// Jede Runde dauert mindestens 1 s; ab 5 leeren Antworten in Folge mindestens 2 s.
    static func pauseAfterPoll(elapsed: Duration, consecutiveEmpty: Int) -> Duration {
        let minimum: Duration = consecutiveEmpty >= emptyPollsBeforeSlowdown ? slowPollPause : minPollInterval
        return elapsed >= minimum ? .zero : minimum - elapsed
    }

    static let minPollInterval: Duration = .seconds(1)
    static let slowPollPause: Duration = .seconds(2)
    static let emptyPollsBeforeSlowdown = 5

    /// generation ist der Wert von pollGeneration beim Start dieser Schleife (wird vom Aufrufer übergeben,
    /// damit eine spät anlaufende Task nicht die Nummer eines neueren Starts liest).
    private func runPollLoop(generation: Int) async {
        defer {
            // Nur die eigene Task austragen; ein inzwischen gestarteter neuer Poll bleibt stehen.
            if pollGeneration == generation { pollTask = nil }
        }
        var backoff = Self.initialBackoff
        var consecutiveEmpty = 0
        let clock = ContinuousClock()
        while !Task.isCancelled {
            let started = clock.now
            do {
                let events = try await session.withAccess { token in
                    try await session.api.pollRealtime(client: clientId, token: token)
                }
                backoff = Self.initialBackoff
                consecutiveEmpty = events.isEmpty ? consecutiveEmpty + 1 : 0
                handle(Self.apply(events: events))
                let pause = Self.pauseAfterPoll(elapsed: clock.now - started, consecutiveEmpty: consecutiveEmpty)
                if pause > .zero {
                    try? await Task.sleep(for: pause)
                }
            } catch is CancellationError {
                return
            } catch AppError.unauthorized {
                // Sitzung beendet; update(isSceneActive:) räumt auf.
                return
            } catch {
                try? await Task.sleep(for: backoff)
                backoff = Self.nextBackoff(after: backoff)
            }
        }
    }

    private func handle(_ changes: RealtimeChanges) {
        if changes.conversationsChanged {
            scheduleReload()
        }
        for id in changes.messageConversationIds {
            messageEvents[id, default: 0] += 1
            // Wer eine Nachricht geschickt hat, schreibt gerade nicht mehr.
            typingEntries[id] = nil
        }
        if !changes.presence.isEmpty {
            presence.merge(changes.presence) { _, new in new }
        }
        let now = Date()
        for typing in changes.typing where typing.userId != currentUserId {
            typingEntries[typing.conversationId, default: [:]][typing.userId] =
                TypingEntry(name: typing.name, expires: now.addingTimeInterval(Self.typingDuration))
        }
        if !changes.typing.isEmpty {
            scheduleTypingCleanup()
        }
    }

    /// Lädt die Liste nach 300 ms neu; weitere Ereignisse in dieser Zeit verlängern die Wartezeit nicht.
    private func scheduleReload() {
        guard reloadTask == nil else { return }
        reloadTask = Task { [weak self] in
            try? await Task.sleep(for: Self.reloadDebounce)
            guard let self, !Task.isCancelled else { return }
            self.reloadTask = nil
            await self.load()
        }
    }

    /// Entfernt abgelaufene Tipp-Hinweise, damit die Anzeige nach 5 s verschwindet.
    private func scheduleTypingCleanup() {
        typingCleanupTask?.cancel()
        typingCleanupTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.typingDuration + 0.2))
            guard let self, !Task.isCancelled else { return }
            self.pruneTyping()
        }
    }

    private func pruneTyping() {
        let now = Date()
        var remaining: [String: [String: TypingEntry]] = [:]
        for (conversationId, entries) in typingEntries {
            let active = entries.filter { $0.value.expires > now }
            if !active.isEmpty { remaining[conversationId] = active }
        }
        typingEntries = remaining
        if !remaining.isEmpty {
            scheduleTypingCleanup()
        }
    }
}
