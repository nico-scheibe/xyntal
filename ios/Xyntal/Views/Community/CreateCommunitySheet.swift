import SwiftUI

/// Blatt zum Gründen einer Community: Name (Pflicht), Beschreibung, Kategorie und Schlagwörter.
/// Die Beschreibung prägt den ersten Eindruck, deshalb steht sie vor der Kategorie.
/// Die Grenzen des Servers gelten schon beim Tippen, damit man sie sieht, bevor man sendet.
struct CreateCommunitySheet: View {
    @Environment(\.dismiss) private var dismiss

    let store: CommunityDirectoryStore
    /// Wird nach Erfolg mit dem Eintrag der neuen Community aufgerufen. Das Blatt schließt sich vorher.
    let onCreated: (DiscoverCommunity) -> Void

    static let nameLimit = 120
    static let categoryLimit = 60
    static let descriptionLimit = 2000
    static let tagLimit = 40
    static let maxTags = 12

    /// Größe des Entfernen-Kreuzes im Schlagwort. Skaliert mit der Schrift, das Tipp-Ziel bleibt 44 pt.
    @ScaledMetric(relativeTo: .footnote) private var xmarkSize: CGFloat = 12

    @State private var name = ""
    @State private var category = ""
    @State private var descriptionText = ""
    /// Ein übernommenes Schlagwort. Die Id ist stabil: Entfernen geschieht nach Id, nie nach Position.
    /// So löscht ein schnelles Doppeltippen nie das falsche Schlagwort und nie über das Ende der Liste hinaus.
    private struct TagDraft: Identifiable {
        let id = UUID()
        let text: String
    }

    @State private var tags: [TagDraft] = []
    @State private var newTag = ""
    @State private var isSaving = false
    @State private var errorText: String?
    /// true, wenn der Server den Arbeitsstil-Test verlangt. Dann bietet das Blatt den Test an.
    @State private var needsAssessment = false

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Das Schlagwort aus dem Feld, ohne führendes „#“. Das Zeichen setzt die Anzeige, nicht der Nutzer.
    private var pendingTag: String {
        tagLabel(newTag)
    }

    private var canAddTag: Bool {
        !pendingTag.isEmpty && tags.count < Self.maxTags
    }

    /// Schlagwörter zum Senden. Ein noch nicht übernommenes Schlagwort im Feld zählt mit, wenn es Platz gibt.
    private var tagsToSend: [String] {
        (canAddTag ? tags + [TagDraft(text: pendingTag)] : tags).map(\.text)
    }

    private var canSave: Bool {
        !trimmedName.isEmpty && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name der Community", text: $name)
                        .onChange(of: name) { _, value in
                            if value.utf16.count > Self.nameLimit {
                                name = value.truncatedToUTF16(Self.nameLimit)
                            }
                        }
                } header: {
                    Text("Name")
                } footer: {
                    // Keine Fußzeile, außer der Zähler wird knapp. Dann zeigt er sich rechts unter dem Feld.
                    CharacterLimitNote(used: name.utf16.count, limit: Self.nameLimit)
                }

                Section {
                    TextField("Worum geht es?", text: $descriptionText, axis: .vertical)
                        .lineLimit(3...8)
                        .onChange(of: descriptionText) { _, value in
                            if value.utf16.count > Self.descriptionLimit {
                                descriptionText = value.truncatedToUTF16(Self.descriptionLimit)
                            }
                        }
                } header: {
                    Text("Beschreibung")
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Ein bis zwei Sätze: Für wen ist die Community, und was passiert hier? Das sehen alle, bevor sie beitreten.")
                        CharacterLimitNote(used: descriptionText.utf16.count, limit: Self.descriptionLimit)
                    }
                }

                Section {
                    TextField("Zum Beispiel Technik", text: $category)
                        .onChange(of: category) { _, value in
                            if value.utf16.count > Self.categoryLimit {
                                category = value.truncatedToUTF16(Self.categoryLimit)
                            }
                        }
                } header: {
                    Text("Kategorie")
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Hilft beim Finden.")
                        CharacterLimitNote(used: category.utf16.count, limit: Self.categoryLimit)
                    }
                }

                Section {
                    // Schlagwörter als Kapseln. Jede hat ein eigenes Kreuz zum Entfernen.
                    if !tags.isEmpty {
                        ChipFlow(spacing: 8) {
                            ForEach(tags) { tag in
                                tagChip(tag)
                            }
                        }
                    }

                    if tags.count < Self.maxTags {
                        HStack {
                            TextField("Schlagwort", text: $newTag)
                                .onChange(of: newTag) { _, value in
                                    if value.utf16.count > Self.tagLimit {
                                        newTag = value.truncatedToUTF16(Self.tagLimit)
                                    }
                                }
                                .onSubmit { addPendingTag() }
                            Button("Hinzufügen") {
                                addPendingTag()
                            }
                            // Textknopf in .primary, nicht in Akzent (Regel R1). Tipp-Ziel mindestens 44 pt (R4).
                            .foregroundStyle(.primary)
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                            .disabled(!canAddTag)
                        }
                    }
                } header: {
                    Text("Schlagwörter")
                } footer: {
                    Text("Bis zu \(Self.maxTags) Themen, damit dich die Richtigen finden.")
                }

                if errorText != nil {
                    Section {
                        Text(verbatim: errorText ?? "")
                            .foregroundStyle(.red)
                        if needsAssessment {
                            NavigationLink("Arbeitsstil-Test machen") {
                                WorkStyleTestView { _ in
                                    errorText = nil
                                    needsAssessment = false
                                }
                            }
                        }
                    }
                }
            }
            // Auf dem Blatt scrollt man zum Schreiben, die Tastatur soll dabei mitgehen und sich wegziehen lassen.
            .scrollDismissesKeyboard(.interactively)
            // Kurzer Titel, weil daneben „Abbrechen“ und „Gründen“ stehen: „Community gründen“
            // wird in der schmalen Leiste abgeschnitten, und ein Titel mit „…“ sieht nach Fehler aus.
            .navigationTitle("Neue Community")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                    .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Gründen") {
                        Task { await save() }
                    }
                    .disabled(!canSave)
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
        // Werkzeugleisten-Knöpfe als Text: Akzent, aber auf 4,5:1 abgesichert (Theme.accentText).
        .tint(Theme.accentText)
    }

    /// Eine Schlagwort-Kapsel: „#Tag“ und daneben das Kreuz. Das Kreuz hat 44 pt Tipp-Ziel, die Kapsel 44 pt Höhe.
    private func tagChip(_ tag: TagDraft) -> some View {
        HStack(spacing: 0) {
            Text(verbatim: "#\(tag.text)")
                .font(.footnote)
                .foregroundStyle(.primary)
                .padding(.leading, 12)
            Button {
                // Nach Id entfernen: trifft immer genau dieses Schlagwort, auch bei schnellem Doppeltippen.
                tags.removeAll { $0.id == tag.id }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: xmarkSize, weight: .semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Schlagwort \(tag.text) entfernen")
        }
        .frame(minHeight: 44)
        // Schwarz-Weiß-Fläche in 8 % Deckkraft: die einzige Fläche in diesem Blatt, Text darauf in .primary.
        .background(Color.primary.opacity(0.08), in: Capsule())
    }

    private func addPendingTag() {
        guard canAddTag else { return }
        tags.append(TagDraft(text: pendingTag))
        newTag = ""
    }

    private func save() async {
        guard canSave else { return }
        isSaving = true
        errorText = nil
        needsAssessment = false
        defer { isSaving = false }
        do {
            let description = descriptionText.trimmingCharacters(in: .whitespacesAndNewlines)
            let created = try await store.createCommunity(
                name: trimmedName,
                description: description,
                category: category.trimmingCharacters(in: .whitespacesAndNewlines),
                tags: tagsToSend
            )
            let entry = DiscoverCommunity(justCreated: created, description: description)
            dismiss()
            onCreated(entry)
        } catch is CancellationError {
            return
        } catch {
            errorText = AppError.displayText(for: error)
            if let appError = error as? AppError, case .assessmentRequired = appError {
                needsAssessment = true
            }
        }
    }
}

/// Zeichenzähler „1.850 / 2.000“. Er erscheint erst, wenn weniger als 20 % übrig sind. Vorher bleibt das Feld ruhig.
/// Gemeinsam für Community- und Umfrage-Blatt, damit beide gleich schwellen.
struct CharacterLimitNote: View {
    let used: Int
    let limit: Int

    /// Unter 20 % Rest. Der Anteil ist die Schwelle, nicht eine feste Zahl, damit große Limits gleich reagieren.
    static func isNear(used: Int, limit: Int) -> Bool {
        Double(limit - used) < Double(limit) * 0.2
    }

    var body: some View {
        if Self.isNear(used: used, limit: limit) {
            Text(verbatim: "\(used.formatted(.number)) / \(limit.formatted(.number))")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
    }
}
