import SwiftUI

/// Blatt zum Erstellen einer Umfrage in einem Kanal: Frage und 2 bis 8 Antworten.
/// Die Umfrage geht als eigener Beitrag ohne Text und ohne Anhänge raus. Die Regeln entsprechen dem Server,
/// damit man den Fehler sieht, bevor man sendet, und nicht erst als Ablehnung.
struct PollCreateSheet: View {
    @Environment(\.dismiss) private var dismiss

    let store: MemberCommunityStore
    let channelId: String

    static let questionLimit = 300
    static let optionLimit = 120
    static let minOptions = 2
    static let maxOptions = 8

    /// Eine Antwortzeile. Die Id hält die Zeile stabil, auch wenn eine andere Zeile entfernt wird.
    private struct OptionDraft: Identifiable {
        let id = UUID()
        var text = ""
    }

    @State private var question = ""
    @State private var options = [OptionDraft(), OptionDraft()]
    @State private var isSending = false
    @State private var errorText: String?

    private var trimmedQuestion: String {
        question.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Antworten, so wie der Server sie übernimmt: getrimmt, leere fallen weg.
    private var cleanedOptions: [String] {
        options
            .map { $0.text.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    /// Der Grund, warum Senden noch nicht geht. nil, wenn alles passt.
    private var problem: String? {
        if trimmedQuestion.isEmpty {
            return "Schreib zuerst die Frage."
        }
        if cleanedOptions.count < Self.minOptions {
            return "Du brauchst mindestens zwei Antworten."
        }
        // Groß- und Kleinschreibung zählt nicht als Unterschied, so wie der Server es prüft.
        if Set(cleanedOptions.map { $0.lowercased() }).count != cleanedOptions.count {
            return "Zwei Antworten sind gleich. Groß- und Kleinschreibung macht sie nicht verschieden."
        }
        return nil
    }

    private var canSend: Bool {
        problem == nil && !isSending
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Frage", text: $question, axis: .vertical)
                        .lineLimit(1...4)
                        .onChange(of: question) { _, value in
                            if value.utf16.count > Self.questionLimit {
                                question = value.truncatedToUTF16(Self.questionLimit)
                            }
                        }
                } header: {
                    Text("Frage")
                } footer: {
                    Text("Höchstens \(Self.questionLimit) Zeichen.")
                }

                Section {
                    ForEach($options) { $option in
                        HStack(spacing: 10) {
                            TextField("Antwort", text: $option.text)
                                .onChange(of: option.text) { _, value in
                                    if value.utf16.count > Self.optionLimit {
                                        $option.text.wrappedValue = value.truncatedToUTF16(Self.optionLimit)
                                    }
                                }
                            if options.count > Self.minOptions {
                                Button {
                                    options.removeAll { $0.id == option.id }
                                } label: {
                                    Image(systemName: "minus.circle.fill")
                                        .foregroundStyle(.red)
                                        .frame(width: 44, height: 44)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Antwort entfernen")
                            }
                        }
                    }
                    if options.count < Self.maxOptions {
                        Button {
                            options.append(OptionDraft())
                        } label: {
                            Label("Antwort hinzufügen", systemImage: "plus")
                        }
                    }
                } header: {
                    Text("Antworten")
                } footer: {
                    Text("Mindestens \(Self.minOptions), höchstens \(Self.maxOptions). Jede Antwort muss anders sein.")
                }

                if let problem {
                    Section {
                        Text(verbatim: problem)
                            .foregroundStyle(.secondary)
                    }
                }

                if let errorText {
                    Section {
                        Text(verbatim: errorText)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Umfrage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") {
                        dismiss()
                    }
                    .disabled(isSending)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Senden") {
                        Task { await send() }
                    }
                    .disabled(!canSend)
                }
            }
            .interactiveDismissDisabled(isSending)
        }
    }

    private func send() async {
        guard canSend else { return }
        isSending = true
        errorText = nil
        defer { isSending = false }
        do {
            try await store.createPoll(channelId: channelId, question: trimmedQuestion, options: cleanedOptions)
            dismiss()
        } catch is CancellationError {
            return
        } catch {
            errorText = AppError.displayText(for: error)
        }
    }
}
