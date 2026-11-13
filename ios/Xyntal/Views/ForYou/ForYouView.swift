import SwiftUI

/// Tab „Für dich“: Vorschläge und gespeicherte Personen. Erstellt den MatchesStore für die Dauer der Anmeldung.
struct ForYouView: View {
    @Environment(SessionStore.self) private var session

    @State private var store: MatchesStore?
    @State private var segment: MatchesStore.Segment = .suggestions

    var body: some View {
        NavigationStack {
            Group {
                if let store {
                    ForYouContent(store: store, segment: $segment)
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Für dich")
            .task {
                if store == nil {
                    store = MatchesStore(session: session)
                }
                guard let store else { return }
                await store.loadIfNeeded(segment)
                await store.loadNoticeIfNeeded()
            }
        }
    }
}

/// Segmentwahl, Hinweisbox und Liste. Bekommt einen fertigen Store.
private struct ForYouContent: View {
    let store: MatchesStore
    @Binding var segment: MatchesStore.Segment

    @State private var dismissTarget: MatchPerson?

    private var people: [MatchPerson] { store.people(in: segment) }

    var body: some View {
        list
            .safeAreaInset(edge: .top, spacing: 0) {
                VStack(spacing: 0) {
                    Picker("Ansicht", selection: $segment) {
                        ForEach(MatchesStore.Segment.allCases, id: \.self) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    if let loadError = store.loadError(for: segment), !people.isEmpty {
                        ReloadErrorBanner(message: loadError) { Task { await store.load(segment) } }
                    }
                }
                .background(.bar)
            }
            .navigationDestination(for: MatchPerson.self) { person in
                MatchDetailView(person: person, store: store)
            }
            .dismissMatchFlow(target: $dismissTarget) { person, reason, note in
                Task { await store.dismiss(person, reason: reason, note: note) }
            }
            .refreshable { await store.load(segment) }
            .onChange(of: segment) { _, newValue in
                Task { await store.loadIfNeeded(newValue) }
            }
    }

    @ViewBuilder
    private var list: some View {
        if people.isEmpty && !store.hasLoaded(segment) {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if people.isEmpty, let loadError = store.loadError(for: segment) {
            ContentUnavailableView {
                Label("Vorschläge nicht geladen", systemImage: "wifi.exclamationmark")
            } description: {
                Text(loadError)
            } actions: {
                Button("Erneut versuchen") { Task { await store.load(segment) } }
            }
        } else if people.isEmpty {
            emptyState
        } else {
            List {
                if segment == .suggestions, !store.noticeLines.isEmpty, !store.isNoticeDismissed {
                    ProfileNoticeBox(lines: store.noticeLines) {
                        withAnimation { store.isNoticeDismissed = true }
                    }
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))
                }
                ForEach(people) { person in
                    MatchCard(person: person,
                              isSaved: store.isSaved(person),
                              isBusy: store.isBusy(person.id),
                              error: store.actionError(for: person.id),
                              showsReason: segment == .suggestions,
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

    @ViewBuilder
    private var emptyState: some View {
        switch segment {
        case .suggestions:
            ContentUnavailableView {
                Label("Noch keine Vorschläge", systemImage: "sparkles")
            } description: {
                Text("Ergänze dein Profil, damit wir passende Personen für dich finden.")
            }
        case .saved:
            ContentUnavailableView {
                Label("Noch nichts gespeichert", systemImage: "bookmark")
            } description: {
                Text("Gespeicherte Vorschläge findest du hier wieder.")
            }
        }
    }
}

/// Hinweis zu fehlenden eigenen Angaben. Nur Text; „Später“ blendet ihn für die Sitzung aus.
private struct ProfileNoticeBox: View {
    let lines: [String]
    let onLater: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(lines, id: \.self) { line in
                Text(line)
                    .font(.subheadline)
            }
            Button("Später", action: onLater)
                .font(.subheadline.weight(.semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.accent.opacity(0.18), in: RoundedRectangle(cornerRadius: 12))
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

// MARK: - „Passt nicht“ mit Grund

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
