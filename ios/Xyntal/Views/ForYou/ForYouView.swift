import SwiftUI

/// Tab „Für dich“: der Stapel zum Wischen. Erstellt den MatchesStore für die Dauer der Anmeldung.
/// Die Erklärung erscheint einmalig und ist danach über „So funktioniert’s“ erreichbar.
/// „Deine Auswahl“ öffnet die gespeicherten Vorschläge in einem Blatt.
struct ForYouView: View {
    @Environment(SessionStore.self) private var session
    @AppStorage("forYou.introSeen") private var introSeen = false

    @State private var store: MatchesStore?
    @State private var showsIntro = false
    @State private var showsSaved = false

    var body: some View {
        NavigationStack {
            Group {
                if let store {
                    ForYouDeckView(store: store, onShowSaved: { showsSaved = true })
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Für dich")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showsIntro = true
                    } label: {
                        Label("So funktioniert’s", systemImage: "questionmark.circle")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showsSaved = true
                    } label: {
                        Label("Deine Auswahl", systemImage: "bookmark")
                    }
                }
            }
            .task {
                if store == nil {
                    store = MatchesStore(session: session)
                }
                guard let store else { return }
                await store.loadIfNeeded(.suggestions)
                await store.loadNoticeIfNeeded()
            }
            .task {
                if !introSeen {
                    showsIntro = true
                }
            }
            .sheet(isPresented: $showsIntro, onDismiss: { introSeen = true }) {
                ForYouIntroSheet(onDone: { showsIntro = false })
            }
            .sheet(isPresented: $showsSaved) {
                if let store {
                    SavedMatchesSheet(store: store)
                }
            }
        }
    }
}

/// „Deine Auswahl“: die gespeicherten Vorschläge in einem Blatt.
private struct SavedMatchesSheet: View {
    @Environment(\.dismiss) private var dismiss

    let store: MatchesStore

    var body: some View {
        NavigationStack {
            SavedMatchesView(store: store)
                .navigationTitle("Deine Auswahl")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Fertig") { dismiss() }
                    }
                }
        }
    }
}

/// Liste der gespeicherten Vorschläge. Das „Passt nicht“ hier bleibt wie bisher mit Grund-Dialog.
private struct SavedMatchesView: View {
    let store: MatchesStore

    @State private var dismissTarget: MatchPerson?

    private var people: [MatchPerson] { store.people(in: .saved) }

    var body: some View {
        Group {
            if people.isEmpty && !store.hasLoaded(.saved) {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if people.isEmpty, let loadError = store.loadError(for: .saved) {
                ContentUnavailableView {
                    Label("Vorschläge nicht geladen", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Erneut versuchen") { Task { await store.load(.saved) } }
                }
            } else if people.isEmpty {
                ContentUnavailableView {
                    Label("Noch nichts gespeichert", systemImage: "bookmark")
                } description: {
                    Text("Gespeicherte Vorschläge findest du hier wieder.")
                }
            } else {
                List {
                    ForEach(people) { person in
                        MatchCard(person: person,
                                  isSaved: store.isSaved(person),
                                  isBusy: store.isBusy(person.id),
                                  error: store.actionError(for: person.id),
                                  showsReason: false,
                                  onToggleSaved: { Task { await store.toggleSaved(person) } },
                                  onDismiss: { dismissTarget = person },
                                  onClearError: { store.clearActionError(for: person.id) })
                            .listRowSeparator(.hidden)
                            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    }
                }
                .listStyle(.plain)
                .animation(.default, value: people.map(\.id))
            }
        }
        .navigationDestination(for: MatchPerson.self) { person in
            MatchDetailView(person: person, store: store)
        }
        .dismissMatchFlow(target: $dismissTarget) { person, reason, note in
            Task { await store.dismiss(person, reason: reason, note: note) }
        }
        .refreshable { await store.load(.saved) }
        .task { await store.loadIfNeeded(.saved) }
    }
}

/// Karte einer vorgeschlagenen Person mit Passung, Pills, Begründung und Aktionen.
private struct MatchCard: View {
    let person: MatchPerson
    let isSaved: Bool
    let isBusy: Bool
    let error: String?
    let showsReason: Bool
    let onToggleSaved: () -> Void
    let onDismiss: () -> Void
    let onClearError: () -> Void

    private var pills: [String] {
        var result: [String] = []
        if person.lowData == true { result.append("Wenige Angaben") }
        if person.hasDna == true { result.append("Arbeitsstil-Test gemacht") }
        result += person.visibleFactors
        return result
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                ScoreRing(score: person.score, size: 56)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 10) {
                        AvatarView(name: person.displayName, avatar: person.avatar, size: 36)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(person.name)
                                .font(.headline)
                                .lineLimit(1)
                            if let headline = person.headline.nonEmptyText {
                                Text(headline)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                    }
                    if !pills.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(Array(pills.enumerated()), id: \.offset) { _, pill in
                                    Pill(text: pill)
                                }
                            }
                        }
                    }
                }
            }

            if showsReason, let reason = person.reason.nonEmptyText {
                Text(reason)
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }

            HStack(spacing: 8) {
                NavigationLink(value: person) {
                    Text("Warum passt es?")
                        .font(.subheadline.weight(.semibold))
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .foregroundStyle(Theme.ink)

                Button(isSaved ? "Gespeichert ✓" : "Speichern", action: onToggleSaved)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(isBusy)
                    .accessibilityLabel(isSaved ? "Gespeichert, tippen zum Entfernen" : "Speichern")

                Button("Passt nicht", action: onDismiss)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(isBusy)

                if isBusy {
                    ProgressView()
                        .controlSize(.small)
                }
                Spacer(minLength: 0)
            }
            .font(.subheadline)

            if let error {
                HStack(alignment: .firstTextBaseline) {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                    Spacer()
                    Button(action: onClearError) {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Fehler ausblenden")
                }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(.separator).opacity(0.5), lineWidth: 0.5))
    }
}

private struct Pill: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color(.tertiarySystemFill), in: Capsule())
            .lineLimit(1)
    }
}

// MARK: - „Passt nicht“ mit Grund (Detailansicht und Gespeichert-Liste)

extension View {
    /// Fragt nach dem Grund (confirmationDialog mit allen Gründen plus „Ohne Grund ausblenden“).
    /// Bei „Anderes …“ folgt ein Sheet mit einer Notiz bis 200 Zeichen. Danach wird onChoice aufgerufen.
    func dismissMatchFlow(target: Binding<MatchPerson?>,
                          onChoice: @escaping (MatchPerson, DismissReason?, String?) -> Void) -> some View {
        modifier(DismissMatchFlow(target: target, onChoice: onChoice))
    }
}

private struct DismissMatchFlow: ViewModifier {
    @Binding var target: MatchPerson?
    let onChoice: (MatchPerson, DismissReason?, String?) -> Void

    @State private var noteTarget: MatchPerson?

    func body(content: Content) -> some View {
        content
            .confirmationDialog("Warum passt es nicht?",
                                isPresented: Binding(
                                    get: { target != nil },
                                    set: { if !$0 { target = nil } }
                                ),
                                titleVisibility: .visible,
                                presenting: target) { person in
                ForEach(DismissReason.allCases) { reason in
                    Button(reason.title) {
                        if reason == .other {
                            noteTarget = person
                        } else {
                            onChoice(person, reason, nil)
                        }
                    }
                }
                Button("Ohne Grund ausblenden") {
                    onChoice(person, nil, nil)
                }
                Button("Abbrechen", role: .cancel) {}
            } message: { _ in
                Text("Hilft, deine Vorschläge zu verbessern. Ähnliche Profile rücken etwas nach hinten.")
            }
            .sheet(item: $noteTarget) { person in
                DismissNoteSheet(person: person) { note in
                    onChoice(person, .other, note)
                }
            }
    }
}

/// Notiz zu „Anderes …“. Der Text wird nur an den Server geschickt, nicht gespeichert.
private struct DismissNoteSheet: View {
    @Environment(\.dismiss) private var dismiss

    let person: MatchPerson
    let onSubmit: (String?) -> Void

    @State private var note = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Was passt nicht? (optional)", text: $note, axis: .vertical)
                        .lineLimit(3...6)
                } footer: {
                    Text("\(note.utf16.count) / \(DismissReason.noteLimit)")
                }
            }
            .navigationTitle("Passt nicht")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Ausblenden") {
                        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
                        onSubmit(trimmed.isEmpty ? nil : trimmed)
                        dismiss()
                    }
                }
            }
            .onChange(of: note) { _, newValue in
                // In UTF-16 zählen wie der Server.
                if newValue.utf16.count > DismissReason.noteLimit {
                    note = newValue.truncatedToUTF16(DismissReason.noteLimit)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
