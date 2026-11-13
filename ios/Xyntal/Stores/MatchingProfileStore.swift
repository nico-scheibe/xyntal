import Foundation
import Observation

/// Lädt und speichert das eigene Matching-Profil. Der Entwurf wird mit dem geladenen Stand verglichen,
/// damit „Speichern“ nur bei echten Änderungen aktiv ist.
@MainActor
@Observable
final class MatchingProfileStore {
    /// Zuletzt geladener bzw. gespeicherter Stand; nil, solange nichts geladen ist.
    private(set) var original: MatchingProfileDraft?
    var draft = MatchingProfileDraft()
    /// Ergebnis des Arbeitsstil-Tests; nil ohne Test oder wenn der Abruf scheiterte (siehe assessmentFailed).
    private(set) var assessment: WorkStyleStatus?
    private(set) var assessmentFailed = false

    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var loadError: String?
    private(set) var isSaving = false
    private(set) var saveError: String?
    /// Kurz true nach erfolgreichem Speichern, für den Hinweis „Gespeichert“.
    private(set) var showsSavedConfirmation = false

    private let session: SessionStore
    private var loadGeneration = 0
    private var confirmationTask: Task<Void, Never>?

    private static let confirmationDuration: Duration = .seconds(2.5)

    init(session: SessionStore) {
        self.session = session
    }

    var hasChanges: Bool {
        guard let original else { return false }
        return original != draft
    }

    // MARK: - Laden

    /// Lädt Profil und Arbeitsstil. Ein neuer Aufruf verwirft die Antwort eines laufenden. Ein offener Entwurf bleibt erhalten.
    func load() async {
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        defer {
            if generation == loadGeneration { isLoading = false }
        }
        do {
            let (profile, status, statusFailed) = try await session.withAccess { token -> (MatchingProfile, WorkStyleStatus?, Bool) in
                let me = try await session.api.me(token: token)
                let profile = try await session.api.matchingProfile(userId: me.id, token: token)
                // Der Arbeitsstil ist Beiwerk: Scheitert er, bleibt das Profil trotzdem bearbeitbar.
                do {
                    let assessment = try await session.api.workStyleAssessment(token: token)
                    return (profile, assessment.status, false)
                } catch AppError.unauthorized {
                    throw AppError.unauthorized
                } catch {
                    return (profile, nil, true)
                }
            }
            guard generation == loadGeneration else { return }
            let fresh = MatchingProfileDraft(profile: profile)
            let keepDraft = hasChanges
            original = fresh
            if !keepDraft {
                draft = fresh
            }
            assessment = status
            assessmentFailed = statusFailed
            loadError = nil
            hasLoaded = true
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

    // MARK: - Speichern

    /// Schickt den Entwurf an den Server. Danach gilt die Antwort des Servers als neuer Stand.
    /// Eine unbekannte Zeitzone wird nicht gesendet; der Hinweis erscheint unter dem Speichern-Button.
    func save() async {
        guard !isSaving, hasChanges else { return }
        guard draft.isTimezoneValid else {
            saveError = MatchingProfileDraft.invalidTimezoneMessage
            return
        }
        isSaving = true
        saveError = nil
        let body = draft.patchBody
        defer { isSaving = false }
        do {
            let profile = try await session.withAccess { token in
                try await session.api.updateMatchingProfile(body, token: token)
            }
            let fresh = MatchingProfileDraft(profile: profile)
            original = fresh
            draft = fresh
            showSavedConfirmation()
        } catch is CancellationError {
            return
        } catch AppError.unauthorized {
            return
        } catch {
            saveError = AppError.displayText(for: error)
        }
    }

    func discardChanges() {
        guard let original else { return }
        draft = original
        saveError = nil
    }

    /// Übernimmt das Ergebnis eines eben gespeicherten Arbeitsstil-Tests, ohne das Profil neu zu laden.
    func assessmentCompleted(_ status: WorkStyleStatus) {
        assessment = status
        assessmentFailed = false
    }

    private func showSavedConfirmation() {
        confirmationTask?.cancel()
        showsSavedConfirmation = true
        confirmationTask = Task { [weak self] in
            try? await Task.sleep(for: Self.confirmationDuration)
            guard !Task.isCancelled else { return }
            self?.showsSavedConfirmation = false
        }
    }
}
