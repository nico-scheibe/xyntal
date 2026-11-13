import Foundation
import Observation

/// Antwort von GET /users/:id/ai-summary (der Inhalt von data).
struct MemberSummary: Decodable {
    /// Der KI-Text. Leer oder fehlend heißt: nichts anzeigen.
    let summary: String?
    /// true: zu wenig Angaben im Profil. Es gibt bewusst keinen Text.
    let empty: Bool

    /// Fehlertext für 502 (KI nicht erreichbar). Die Ansicht erkennt daran den Fall mit "Nochmal versuchen".
    static let upstreamErrorText = "Die Vorstellung konnte gerade nicht geladen werden."
}

/// Anzeigezustand der KI-Vorstellung auf dem Mitglieds-Bildschirm.
enum MemberBriefPhase: Equatable {
    case loading
    case text(String)
    /// Zu wenig Angaben im Profil.
    case empty
    /// Die Ansicht zeigt den Text und den Button "Nochmal versuchen".
    case failed(String)
    /// Nichts zu holen (404, 503, sonstiger Fehler): der ganze Bereich verschwindet.
    case hidden
}

/// Lädt die KI-Vorstellung eines Mitglieds. Es gibt keinen automatischen zweiten Versuch.
@MainActor
@Observable
final class MemberBriefStore {
    let userId: String
    private(set) var phase: MemberBriefPhase = .loading
    /// true, wenn das Laden länger als 8 Sekunden dauert.
    private(set) var isSlow = false

    private let session: SessionStore
    private var loadGeneration = 0

    static let slowAfter: Duration = .seconds(8)

    init(userId: String, session: SessionStore) {
        self.userId = userId
        self.session = session
    }

    /// Lädt die Vorstellung. Ein neuer Aufruf verwirft die Antwort eines laufenden.
    func load() async {
        loadGeneration += 1
        let generation = loadGeneration
        phase = .loading
        isSlow = false
        let slowTask = Task { [weak self] in
            try? await Task.sleep(for: Self.slowAfter)
            guard !Task.isCancelled else { return }
            self?.isSlow = true
        }
        defer { slowTask.cancel() }
        do {
            let summary = try await session.withAccess { token in
                try await session.api.aiSummary(userId: userId, token: token)
            }
            guard generation == loadGeneration else { return }
            phase = Self.phase(for: summary)
        } catch is CancellationError {
            return
        } catch AppError.unauthorized {
            return
        } catch AppError.network {
            guard generation == loadGeneration else { return }
            phase = .failed(AppError.displayText(for: AppError.network))
        } catch AppError.message(let text) where text == MemberSummary.upstreamErrorText {
            guard generation == loadGeneration else { return }
            phase = .failed(text)
        } catch {
            guard generation == loadGeneration else { return }
            phase = .hidden
        }
    }

    private static func phase(for summary: MemberSummary) -> MemberBriefPhase {
        if summary.empty { return .empty }
        if let text = summary.summary.nonEmptyText { return .text(text) }
        return .hidden
    }
}
