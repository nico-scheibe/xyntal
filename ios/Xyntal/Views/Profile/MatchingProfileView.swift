import SwiftUI

/// Matching-Profil: Ziele, Skills, Verfügbarkeit, Sprachen, Sichtbarkeit, Zeitzone, Arbeitsstil.
/// Alles ist optional und einzeln speicherbar; der Fortschritt oben zeigt, wie viel schon da ist.
struct MatchingProfileView: View {
    @Environment(SessionStore.self) private var session

    @State private var store: MatchingProfileStore?

    var body: some View {
        Group {
            if let store {
                MatchingProfileContent(store: store)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Matching-Profil")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if store == nil {
                store = MatchingProfileStore(session: session)
            }
            guard let store, !store.hasLoaded else { return }
            await store.load()
        }
    }
}

private struct MatchingProfileContent: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var store: MatchingProfileStore

    /// Noch nicht übernommene Eingaben der Tag-Felder. Sie werden beim Speichern mitgenommen.
    @State private var pendingInputs: [TagKind: String] = [:]
    @State private var showDiscardDialog = false

    private var hasPendingInput: Bool {
        pendingInputs.values.contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private var canSave: Bool {
        store.hasLoaded && store.loadError == nil && store.draft.isTimezoneValid && (store.hasChanges || hasPendingInput)
    }

    var body: some View {
        Group {
            if !store.hasLoaded {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let loadError = store.loadError, store.original == nil {
                ContentUnavailableView {
                    Label("Profil nicht geladen", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Erneut versuchen") { Task { await store.load() } }
                }
            } else {
                form
            }
        }
        .navigationBarBackButtonHidden(store.hasChanges)
        .toolbar {
            if store.hasChanges {
                ToolbarItem(placement: .navigation) {
                    Button {
                        showDiscardDialog = true
                    } label: {
                        Label("Zurück", systemImage: "chevron.backward")
                            .labelStyle(.titleAndIcon)
                    }
                }
            }
        }
        .confirmationDialog("Änderungen verwerfen?", isPresented: $showDiscardDialog, titleVisibility: .visible) {
            Button("Verwerfen", role: .destructive) {
                store.discardChanges()
                dismiss()
            }
            Button("Weiter bearbeiten", role: .cancel) {}
        } message: {
            Text("Deine Änderungen sind noch nicht gespeichert.")
        }
    }

    private var form: some View {
        Form {
            progressSection
            tagSection(.goals)
            availabilitySection
            hoursSection
            intentSection
            tagSection(.skills)
            tagSection(.techStack)
            tagSection(.interests)
            tagSection(.languages)
            visibilitySection
            timezoneSection
            workStyleSection
            saveSection
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await store.load() }
    }

    // MARK: - Abschnitte

    private var progressSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                let done = store.draft.completedSections
                let total = MatchingProfileDraft.sectionCount
                Text("\(done) von \(total) Bereichen")
                    .font(.headline)
                ProgressView(value: Double(done), total: Double(total))
                    .tint(Theme.accent)
                Text(done == total
                     ? "Alles da. Je aktueller deine Angaben, desto besser passen die Vorschläge."
                     : "Alles ist optional. Jede Angabe macht deine Vorschläge unter „Für dich“ treffender.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func tagSection(_ kind: TagKind) -> some View {
        Section {
            TagEditor(kind: kind,
                      draft: $store.draft,
                      input: Binding(
                        get: { pendingInputs[kind] ?? "" },
                        set: { pendingInputs[kind] = $0 }
                      ))
        } header: {
            HStack {
                Text(kind.title)
                Spacer()
                Text("\(store.draft.tags(for: kind).count)/\(kind.limit)")
                    .monospacedDigit()
            }
        }
    }

    private var availabilitySection: some View {
        Section("Verfügbarkeit") {
            ChoiceChips(options: ProfileChoices.availability, selection: $store.draft.availability)
        }
    }

    private var hoursSection: some View {
        Section("Stunden pro Woche") {
            ChoiceChips(options: ProfileChoices.weeklyHours, selection: $store.draft.weeklyHours)
        }
    }

    private var intentSection: some View {
        Section("Was ich suche") {
            ChoiceChips(options: ProfileChoices.collaborationIntent, selection: $store.draft.collaborationIntent)
        }
    }

    private var visibilitySection: some View {
        Section {
            ForEach(ProfileChoices.visibility) { option in
                Button {
                    store.draft.visibility = option.value
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(option.label)
                                .foregroundStyle(.primary)
                            if let hint = option.hint {
                                Text(hint)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        if store.draft.visibility == option.value {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.tint)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(store.draft.visibility == option.value ? .isSelected : [])
            }
        } header: {
            Text("Sichtbarkeit")
        } footer: {
            Text("Wer dein Matching-Profil sehen und dir vorgeschlagen bekommen kann.")
        }
    }

    private var timezoneSection: some View {
        Section {
            HStack {
                TextField("z. B. Europe/Berlin", text: $store.draft.timezone)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onChange(of: store.draft.timezone) { _, newValue in
                        // Länger als eine Zeitzonen-Kennung sein kann: direkt kürzen.
                        let limited = newValue.truncatedToUTF16(MatchingProfileDraft.timezoneMaxLength)
                        if limited != newValue {
                            store.draft.timezone = limited
                        }
                    }
                let detected = TimeZone.current.identifier
                if store.draft.normalizedTimezone != detected {
                    Button("Erkennen") {
                        store.draft.timezone = detected
                    }
                    .buttonStyle(.borderless)
                    .accessibilityHint("Übernimmt \(detected)")
                }
            }
        } header: {
            Text("Zeitzone")
        } footer: {
            if !store.draft.isTimezoneValid {
                Text(MatchingProfileDraft.invalidTimezoneMessage)
                    .foregroundStyle(.red)
            }
        }
    }

    @ViewBuilder
    private var workStyleSection: some View {
        Section {
            if let status = store.assessment {
                let primary = WorkStyleVocabulary.typeName(status.primaryType)
                let secondary = WorkStyleVocabulary.typeName(status.secondaryType)
                if let primary {
                    Text(secondary.map { "\(primary) · \($0)" } ?? primary)
                        .font(.headline)
                }
                ForEach(WorkStyleVocabulary.dimensions, id: \.key) { dimension in
                    if let score = status.score(for: dimension.key) {
                        HStack(spacing: 12) {
                            Text(dimension.label)
                                .frame(width: 110, alignment: .leading)
                            ProgressView(value: Double(score), total: 100)
                                .tint(Theme.accent)
                            Text("\(score)")
                                .monospacedDigit()
                                .frame(width: 32, alignment: .trailing)
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(dimension.label): \(score) von 100")
                    }
                }
                if let date = status.completedDate {
                    Text("Gemacht am \(Self.formatted(date))")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                retakeRow(status)
            } else if store.assessmentFailed {
                Text("Dein Arbeitsstil konnte gerade nicht geladen werden.")
                    .foregroundStyle(.secondary)
            } else {
                Text("Noch kein Arbeitsstil-Test. Er dauert etwa 8 Minuten – das Ergebnis fließt in deine Passung ein.")
                    .foregroundStyle(.secondary)
                NavigationLink("Arbeitsstil-Test machen") {
                    WorkStyleTestView { status in
                        store.assessmentCompleted(status)
                    }
                }
            }
        } header: {
            Text("Arbeitsstil")
        }
    }

    /// Wiederholen erst nach Ablauf der Sperrfrist. Davor steht nur das Datum, ab dem es geht.
    @ViewBuilder
    private func retakeRow(_ status: WorkStyleStatus) -> some View {
        if let next = status.nextAvailableDate, next > Date() {
            Text("Wiederholen ist ab dem \(Self.formatted(next)) möglich.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else {
            NavigationLink("Test wiederholen") {
                WorkStyleTestView { status in
                    store.assessmentCompleted(status)
                }
            }
        }
    }

    private var saveSection: some View {
        Section {
            PrimaryButton(title: "Speichern", isBusy: store.isSaving) {
                Task { await save() }
            }
            .disabled(!canSave)
            if store.showsSavedConfirmation {
                Label("Gespeichert", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.subheadline)
                    .transition(.opacity)
            }
            if let saveError = store.saveError {
                Text(saveError)
                    .font(.subheadline)
                    .foregroundStyle(.red)
            }
        } footer: {
            Text("Gilt ab sofort auch auf xyntal.de.")
        }
        .animation(.default, value: store.showsSavedConfirmation)
    }

    // MARK: - Aktionen

    private func save() async {
        // Noch nicht übernommene Eingaben in den Tag-Feldern mitnehmen, wie im Web-Client.
        for kind in TagKind.allCases {
            if let input = pendingInputs[kind], !input.isEmpty {
                store.draft.add(input, to: kind)
                pendingInputs[kind] = ""
            }
        }
        await store.save()
    }

    private static func formatted(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.wide).year().locale(Locale(identifier: "de_DE")))
    }
}

// MARK: - Tag-Feld

/// Gewählte Chips mit ×, Eingabefeld und Vorschläge mit +. Return oder Komma übernimmt die Eingabe.
private struct TagEditor: View {
    let kind: TagKind
    @Binding var draft: MatchingProfileDraft
    @Binding var input: String

    @FocusState private var isFocused: Bool

    private var chosen: [String] { draft.tags(for: kind) }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if chosen.isEmpty {
                Text("Noch nichts ausgewählt")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                FlowLayout(spacing: 8) {
                    ForEach(chosen, id: \.self) { value in
                        Chip(text: TagVocabulary.label(value, kind: kind), symbol: .remove, isSelected: true) {
                            withAnimation(.easeInOut(duration: 0.15)) {
                                draft.remove(value, from: kind)
                            }
                        }
                        .accessibilityLabel("\(TagVocabulary.label(value, kind: kind)) entfernen")
                    }
                }
            }

            if draft.isFull(kind) {
                Text("Maximum erreicht – entferne erst einen Eintrag.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                HStack {
                    TextField(kind.addPlaceholder, text: $input)
                        .focused($isFocused)
                        .submitLabel(.done)
                        .onSubmit(commit)
                        .onChange(of: input) { _, newValue in
                            if newValue.contains(",") { commit() }
                        }
                    if !input.trimmingCharacters(in: .whitespaces).isEmpty {
                        Button("Hinzufügen", action: commit)
                            .buttonStyle(.borderless)
                            .font(.subheadline.weight(.semibold))
                    }
                }

                let suggestions = draft.openSuggestions(for: kind)
                if !suggestions.isEmpty {
                    FlowLayout(spacing: 8) {
                        ForEach(suggestions, id: \.value) { entry in
                            Chip(text: entry.label, symbol: .add, isSelected: false) {
                                withAnimation(.easeInOut(duration: 0.15)) {
                                    _ = draft.add(entry.value, to: kind)
                                }
                            }
                            .accessibilityLabel("\(entry.label) hinzufügen")
                        }
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func commit() {
        let raw = input
        input = ""
        draft.add(raw, to: kind)
        if draft.isFull(kind) {
            isFocused = false
        }
    }
}

// MARK: - Auswahl-Chips

private struct ChoiceChips<Value: Hashable>: View {
    let options: [ChoiceOption<Value>]
    @Binding var selection: Value

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(options) { option in
                Chip(text: option.label, symbol: nil, isSelected: selection == option.value) {
                    selection = option.value
                }
                .accessibilityAddTraits(selection == option.value ? .isSelected : [])
            }
        }
        .padding(.vertical, 4)
    }
}

private struct Chip: View {
    enum Symbol {
        case add
        case remove
    }

    let text: String
    let symbol: Symbol?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if symbol == .add {
                    Image(systemName: "plus")
                        .font(.caption.weight(.semibold))
                }
                Text(text)
                    .font(.subheadline)
                    .lineLimit(1)
                if symbol == .remove {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.semibold))
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .foregroundStyle(isSelected ? Theme.ink : .primary)
            .background(isSelected ? Theme.accent : Color(.tertiarySystemFill), in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Umbrechendes Layout

/// Ordnet Kinder zeilenweise an und bricht um, wenn die Breite nicht reicht.
private struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var usedWidth: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            usedWidth = max(usedWidth, x - spacing)
        }
        return CGSize(width: maxWidth.isFinite ? maxWidth : usedWidth, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
