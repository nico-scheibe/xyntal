import SwiftUI

/// Blatt zum Gründen einer Community: Name (Pflicht), Kategorie, Beschreibung und Schlagwörter.
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

    @State private var name = ""
    @State private var category = ""
    @State private var descriptionText = ""
    @State private var tags: [String] = []
    @State private var newTag = ""
    @State private var isSaving = false
    @State private var errorText: String?
    /// true, wenn der Server den Arbeitsstil-Test verlangt. Dann bietet das Blatt den Test an.
    @State private var needsAssessment = false

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var pendingTag: String {
        newTag.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canAddTag: Bool {
        !pendingTag.isEmpty && tags.count < Self.maxTags
    }

    /// Schlagwörter zum Senden. Ein noch nicht übernommenes Schlagwort im Feld zählt mit, wenn es Platz gibt.
    private var tagsToSend: [String] {
        canAddTag ? tags + [pendingTag] : tags
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
                    Text("Pflicht. Höchstens \(Self.nameLimit) Zeichen.")
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
                    Text("Höchstens \(Self.categoryLimit) Zeichen.")
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
                    Text("Optional. Höchstens \(Self.descriptionLimit) Zeichen.")
                }

                Section {
                    ForEach(tags.indices, id: \.self) { index in
                        Text(verbatim: "#\(tags[index])")
                    }
                    .onDelete { tags.remove(atOffsets: $0) }

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
                            .disabled(!canAddTag)
                        }
                    }
                } header: {
                    Text("Schlagwörter")
                } footer: {
                    Text("\(tags.count) von \(Self.maxTags). Je höchstens \(Self.tagLimit) Zeichen.")
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
    }

    private func addPendingTag() {
        guard canAddTag else { return }
        tags.append(pendingTag)
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
