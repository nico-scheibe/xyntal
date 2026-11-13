import Foundation
import Observation

/// Öffentliche Community: Feed, Kanalfilter, Laden und Auto-Refresh. Braucht kein Konto.
/// Der Auto-Refresh läuft nur, solange die View sichtbar ist (runAutoRefresh in .task der View).
@MainActor
@Observable
final class CommunityStore {
    private(set) var feed: CommunityFeed?
    private(set) var isLoading = false
    /// true nach dem ersten abgeschlossenen Ladeversuch, auch wenn er fehlschlug.
    private(set) var hasLoaded = false
    private(set) var loadError: String?
    /// nil = alle Kanäle.
    private(set) var selectedChannel: String?
    /// Beiträge, die seit dem zuletzt gesehenen Stand hinzugekommen sind.
    private(set) var newPostIds: Set<String> = []
    private(set) var lastSuccess: Date?

    private let api: APIClient
    /// IDs aller Beiträge, die der Nutzer schon einmal zu sehen bekam.
    private var knownPostIds: Set<String> = []
    private var loadTask: Task<Void, Never>?
    private var loadGeneration = 0

    static let refreshInterval: Duration = .seconds(30)
    static let staleAfter: TimeInterval = 30

    init(api: APIClient) {
        self.api = api
    }

    // MARK: - Abgeleitete Werte

    var channels: [String] { feed?.channels ?? [] }

    var communityAvatar: String? { feed?.community.avatar }

    /// Beiträge im gewählten Kanal, neueste zuerst.
    var visiblePosts: [CommunityPost] {
        let posts = feed?.posts ?? []
        guard let selectedChannel else { return posts }
        return posts.filter { $0.channel == selectedChannel }
    }

    func isNew(_ post: CommunityPost) -> Bool {
        newPostIds.contains(post.id)
    }

    // MARK: - Filter

    func select(channel: String?) {
        guard channel == nil || channels.contains(channel ?? "") else {
            selectedChannel = nil
            return
        }
        selectedChannel = channel
    }

    /// Die „neu“-Markierungen gelten als gesehen, z. B. wenn die Ansicht verlassen wird.
    func acknowledgeNewPosts() {
        newPostIds = []
    }

    // MARK: - Laden

    /// Lädt, wenn noch nichts da ist oder der letzte Erfolg älter als 30 s ist.
    func refreshIfStale(now: Date = Date()) async {
        if let lastSuccess, feed != nil, now.timeIntervalSince(lastSuccess) < Self.staleAfter { return }
        await load()
    }

    /// Lädt den Feed neu. Ein noch laufender Ladevorgang wird abgebrochen; nur das Ergebnis des jüngsten zählt.
    /// Wird der Aufrufer abgebrochen (z. B. View verschwindet), bricht auch die Anfrage ab.
    func load() async {
        loadTask?.cancel()
        loadGeneration += 1
        let generation = loadGeneration
        let task = Task { await self.performLoad(generation: generation) }
        loadTask = task
        await withTaskCancellationHandler {
            await task.value
        } onCancel: {
            task.cancel()
        }
    }

    /// Alle 30 s neu laden, bis die Task abgebrochen wird oder `shouldContinue` false liefert (z. B. App nicht mehr
    /// im Vordergrund). Für .task(id: scenePhase) der View gedacht.
    func runAutoRefresh(while shouldContinue: @escaping @MainActor () -> Bool = { true }) async {
        while !Task.isCancelled, shouldContinue() {
            try? await Task.sleep(for: Self.refreshInterval)
            guard !Task.isCancelled, shouldContinue() else { return }
            await load()
        }
    }

    private func performLoad(generation: Int) async {
        isLoading = true
        defer {
            if generation == loadGeneration {
                isLoading = false
                loadTask = nil
            }
        }
        do {
            let fresh = try await api.publicCommunity()
            guard generation == loadGeneration, !Task.isCancelled else { return }
            apply(fresh)
            loadError = nil
            lastSuccess = Date()
            hasLoaded = true
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            loadError = AppError.displayText(for: error)
            hasLoaded = true
        }
    }

    /// Übernimmt einen neuen Stand und markiert, was seit dem letzten Stand hinzukam.
    /// Unveränderte Antworten lösen keine Änderung am Feed aus.
    private func apply(_ fresh: CommunityFeed) {
        let ids = Set(fresh.posts.map(\.id))
        if feed != nil {
            let incoming = ids.subtracting(knownPostIds)
            if !incoming.isEmpty {
                newPostIds = incoming
            }
        }
        knownPostIds.formUnion(ids)
        if feed != fresh {
            feed = fresh
        }
        if let selectedChannel, !fresh.channels.contains(selectedChannel) {
            self.selectedChannel = nil
        }
    }
}
