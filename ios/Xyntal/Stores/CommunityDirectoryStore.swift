import Foundation
import Observation

/// Alle Communitys für angemeldete Nutzer: Laden und Beitreten. Braucht ein Konto.
/// Gäste sehen den öffentlichen Feed (CommunityStore), nicht diese Liste.
@MainActor
@Observable
final class CommunityDirectoryStore {
    private(set) var communities: [DiscoverCommunity] = []
    /// true nach dem ersten abgeschlossenen Ladeversuch, auch wenn er fehlschlug.
    private(set) var hasLoaded = false
    private(set) var loadError: String?
    /// ID der Community, für die gerade „Beitreten“ läuft.
    private(set) var joiningId: String?
    /// Fehler des letzten Beitritt-Versuchs und die Community, zu der er gehört.
    private(set) var joinError: String?
    private(set) var joinErrorId: String?
    /// true, wenn der letzte Beitritt am fehlenden Arbeitsstil-Test scheiterte. Die Ansicht bietet dann den Test an.
    private(set) var joinNeedsAssessment = false

    private let session: SessionStore
    /// Erhöht sich bei jedem Laden. Antworten eines älteren Ladens werden verworfen.
    private var loadGeneration = 0

    init(session: SessionStore) {
        self.session = session
    }

    func community(id: String) -> DiscoverCommunity? {
        communities.first { $0.id == id }
    }

    /// Lädt die Liste neu und ersetzt sie. Die bisherige Liste bleibt bei einem Fehler stehen.
    func load() async {
        loadGeneration += 1
        let generation = loadGeneration
        do {
            let fresh = try await session.withAccess { token in
                try await self.session.api.discoverCommunities(token: token)
            }
            guard generation == loadGeneration else { return }
            communities = fresh
            loadError = nil
            hasLoaded = true
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            loadError = AppError.displayText(for: error)
            hasLoaded = true
        }
    }

    /// Tritt einer Community bei. Nach Erfolg steht sie in der Liste als Mitglied.
    func join(_ id: String) async {
        guard joiningId == nil else { return }
        joiningId = id
        joinError = nil
        joinErrorId = nil
        joinNeedsAssessment = false
        defer { joiningId = nil }
        do {
            try await session.withAccess { token in
                try await self.session.api.joinCommunity(id: id, token: token)
            }
            if let index = communities.firstIndex(where: { $0.id == id }) {
                communities[index].isMember = true
            }
        } catch is CancellationError {
            return
        } catch {
            joinError = AppError.displayText(for: error)
            joinErrorId = id
            if let appError = error as? AppError, case .assessmentRequired = appError {
                joinNeedsAssessment = true
            }
        }
    }

    /// Nach dem Arbeitsstil-Test: der Hinweis zum fehlenden Test ist überholt, „Beitreten“ ist wieder frei.
    func assessmentCompleted() {
        joinError = nil
        joinErrorId = nil
        joinNeedsAssessment = false
    }
}
