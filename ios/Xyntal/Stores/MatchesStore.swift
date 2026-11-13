import Foundation
import Observation

/// Vorschläge und gespeicherte Personen unter „Für dich“ plus die Aktionen Speichern, Entfernen, Ausblenden.
/// Ein Zähler verwirft Antworten überholter Ladevorgänge; je Person läuft höchstens eine Aktion gleichzeitig.
@MainActor
@Observable
final class MatchesStore {
    enum Segment: Hashable, CaseIterable {
        case suggestions
        case saved

        var title: String {
            switch self {
            case .suggestions: return "Vorschläge"
            case .saved: return "Gespeichert"
            }
        }
    }

    private(set) var suggestions: [MatchPerson] = []
    private(set) var saved: [MatchPerson] = []
    private(set) var isLoading = false
    /// Segmente, die mindestens einmal (erfolgreich oder nicht) geladen wurden.
    private(set) var loadedSegments: Set<Segment> = []
    /// Letzter Ladefehler je Segment, damit ein Fehler der Vorschläge nicht unter den Gespeicherten erscheint.
    private(set) var loadErrors: [Segment: String] = [:]
    /// Hinweise zu fehlenden eigenen Angaben, leer wenn alles da ist oder der Abruf scheiterte.
    private(set) var noticeLines: [String] = []
    /// „Später“ blendet den Hinweis für diese Sitzung aus.
    var isNoticeDismissed = false
    /// Personen, für die gerade eine Aktion läuft. Buttons sind so lange deaktiviert.
    private(set) var busyIds: Set<String> = []
    /// Letzter Fehler je Person, als kurze Meldung unter der Karte.
    private(set) var actionErrors: [String: String] = [:]
    /// Gespeichert-Zustand nach einer Aktion, bis die Liste neu geladen ist. Überstimmt das Flag vom Server.
    private var savedOverrides: [String: Bool] = [:]
    /// true, nachdem etwas gespeichert wurde; die Gespeichert-Liste wird dann beim nächsten Anzeigen neu geladen.
    private var savedListStale = false

    private let session: SessionStore
    private var loadGeneration = 0
    private var noticeRequested = false

    static let pageLimit = 30

    init(session: SessionStore) {
        self.session = session
    }

    // MARK: - Abgeleitete Werte

    func people(in segment: Segment) -> [MatchPerson] {
        switch segment {
        case .suggestions: return suggestions
        case .saved: return saved
        }
    }

    func hasLoaded(_ segment: Segment) -> Bool {
        loadedSegments.contains(segment)
    }

    func loadError(for segment: Segment) -> String? {
        loadErrors[segment]
    }

    func isBusy(_ id: String) -> Bool {
        busyIds.contains(id)
    }

    func actionError(for id: String) -> String? {
        actionErrors[id]
    }

    /// Gespeichert-Zustand: eigene Aktion vor Listen vor dem Flag der übergebenen Person.
    func isSaved(_ person: MatchPerson) -> Bool {
        if let override = savedOverrides[person.id] { return override }
        if saved.contains(where: { $0.id == person.id }) { return true }
        if let listed = suggestions.first(where: { $0.id == person.id }) { return listed.isSaved }
        return person.isSaved
    }

    // MARK: - Laden

    /// Lädt ein Segment neu. Ein neuer Aufruf verwirft die Antwort eines laufenden.
    func load(_ segment: Segment) async {
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        defer {
            if generation == loadGeneration { isLoading = false }
        }
        do {
            let people = try await session.withAccess { token -> [MatchPerson] in
                switch segment {
                case .suggestions:
                    return try await session.api.matches(limit: Self.pageLimit, token: token)
                case .saved:
                    return try await session.api.savedMatches(token: token)
                }
            }
            guard generation == loadGeneration else { return }
            switch segment {
            case .suggestions:
                suggestions = people
            case .saved:
                // Die Liste der gespeicherten Personen gilt als gespeichert, auch wenn das Flag fehlt.
                saved = people.map { person in
                    var copy = person
                    copy.saved = true
                    return copy
                }
                savedListStale = false
            }
            savedOverrides = [:]
            loadedSegments.insert(segment)
            loadErrors[segment] = nil
        } catch is CancellationError {
            return
        } catch AppError.unauthorized {
            return
        } catch {
            guard generation == loadGeneration else { return }
            loadErrors[segment] = AppError.displayText(for: error)
            loadedSegments.insert(segment)
        }
    }

    /// Lädt beim Wechsel des Segments, falls es noch nicht geladen ist oder sich etwas geändert hat.
    func loadIfNeeded(_ segment: Segment) async {
        if hasLoaded(segment), !(segment == .saved && savedListStale) { return }
        await load(segment)
    }

    /// Holt das eigene Profil und leitet daraus den Hinweis ab. Läuft nur einmal; Fehler bleiben still.
    func loadNoticeIfNeeded() async {
        guard !noticeRequested else { return }
        noticeRequested = true
        do {
            let profile = try await session.withAccess { token -> Profile in
                let me = try await session.api.me(token: token)
                return try await session.api.profile(id: me.id, token: token)
            }
            noticeLines = Self.noticeLines(for: profile)
        } catch {
            // Ohne Hinweis geht es weiter; beim nächsten Start wird erneut geprüft.
            noticeRequested = false
        }
    }

    /// Hinweise wie im Web-Client: fehlende Angaben und der Arbeitsstil-Test, nur als Text.
    static func noticeLines(for profile: Profile) -> [String] {
        var missing: [String] = []
        if profile.goals.isEmpty { missing.append("Ziele") }
        if profile.interests.isEmpty { missing.append("Interessen") }
        if profile.skills.isEmpty && profile.techStack.isEmpty { missing.append("Skills") }
        if profile.languages.isEmpty { missing.append("Sprachen") }
        var lines: [String] = []
        if !missing.isEmpty {
            lines.append("Für genauere Vorschläge fehlen noch: \(missing.joined(separator: ", ")).")
        }
        if !profile.hasWorkStyle {
            lines.append("Mit dem Arbeitsstil-Test passt Xyntal auch eure Arbeitsweise zusammen.")
        }
        return lines
    }

    // MARK: - Aktionen

    /// Speichert oder nimmt das Speichern zurück, je nach aktuellem Zustand.
    func toggleSaved(_ person: MatchPerson) async {
        guard beginAction(person.id) else { return }
        defer { endAction(person.id) }
        let willSave = !isSaved(person)
        do {
            try await session.withAccess { token in
                try await session.api.recordMatchInteraction(targetId: person.id,
                                                             action: willSave ? .saved : .unsaved,
                                                             token: token)
            }
            savedOverrides[person.id] = willSave
            if let index = suggestions.firstIndex(where: { $0.id == person.id }) {
                suggestions[index].saved = willSave
            }
            if willSave {
                if !saved.contains(where: { $0.id == person.id }) {
                    var copy = person
                    copy.saved = true
                    saved.insert(copy, at: 0)
                }
                savedListStale = true
            } else {
                saved.removeAll { $0.id == person.id }
            }
        } catch is CancellationError {
            return
        } catch {
            actionErrors[person.id] = AppError.displayText(for: error)
        }
    }

    /// Blendet die Person aus. Bei Erfolg verschwindet sie aus beiden Listen; gibt true zurück.
    @discardableResult
    func dismiss(_ person: MatchPerson, reason: DismissReason?, note: String?) async -> Bool {
        guard beginAction(person.id) else { return false }
        defer { endAction(person.id) }
        do {
            try await session.withAccess { token in
                try await session.api.recordMatchInteraction(targetId: person.id,
                                                             action: .dismissed,
                                                             reason: reason,
                                                             note: reason == .other ? note : nil,
                                                             token: token)
            }
            suggestions.removeAll { $0.id == person.id }
            saved.removeAll { $0.id == person.id }
            savedOverrides[person.id] = nil
            return true
        } catch is CancellationError {
            return false
        } catch {
            actionErrors[person.id] = AppError.displayText(for: error)
            return false
        }
    }

    func clearActionError(for id: String) {
        actionErrors[id] = nil
    }

    /// Markiert den Beginn einer Aktion. false, wenn für diese Person schon eine läuft (Doppel-Tap).
    private func beginAction(_ id: String) -> Bool {
        guard !busyIds.contains(id) else { return false }
        busyIds.insert(id)
        actionErrors[id] = nil
        return true
    }

    private func endAction(_ id: String) {
        busyIds.remove(id)
    }
}
