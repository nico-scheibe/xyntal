import SwiftUI

/// Arbeitsstil-Test: Anleitung, je Block vier Aussagen in eine Rangfolge bringen, am Ende absenden.
/// Bedienung: Man tippt die Aussagen in der Reihenfolge an, die am besten passt. Die Ziffer zeigt den Rang.
/// Das funktioniert mit dem Finger und mit VoiceOver (Doppeltippen) gleich gut, ohne Ziehen.
struct WorkStyleTestView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    /// Wird mit dem neuen Ergebnis aufgerufen, sobald der Test gespeichert ist.
    let onCompleted: (WorkStyleStatus) -> Void

    @State private var store: WorkStyleTestStore?

    init(onCompleted: @escaping (WorkStyleStatus) -> Void) {
        self.onCompleted = onCompleted
    }

    var body: some View {
        Group {
            if let store {
                WorkStyleTestContent(store: store, onCompleted: onCompleted) {
                    dismiss()
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Arbeitsstil-Test")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if store == nil {
                store = WorkStyleTestStore(session: session)
            }
            guard let store, !store.hasLoaded else { return }
            await store.load()
        }
    }
}

private struct WorkStyleTestContent: View {
    @Bindable var store: WorkStyleTestStore
    let onCompleted: (WorkStyleStatus) -> Void
    let onFinish: () -> Void

    @State private var showSubmitConfirmation = false

    var body: some View {
        Group {
            if !store.hasLoaded {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.isFinished {
                finishedForm
            } else if let loadError = store.loadError {
                ContentUnavailableView {
                    Label("Test nicht geladen", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Erneut versuchen") { Task { await store.load() } }
                }
            } else if let until = store.cooldownUntil {
                cooldownForm(until: until)
            } else if !store.hasStarted {
                introForm
            } else {
                questionForm
            }
        }
        .confirmationDialog("Test jetzt absenden?", isPresented: $showSubmitConfirmation, titleVisibility: .visible) {
            Button("Absenden") {
                Task { await submit() }
            }
            Button("Weiter bearbeiten", role: .cancel) {}
        } message: {
            Text(submitWarning)
        }
    }

    private var submitWarning: String {
        if let days = store.cooldownDays {
            return "Danach kannst du den Test erst nach \(days) Tagen wiederholen."
        }
        return "Danach kannst du den Test erst später wiederholen."
    }

    // MARK: - Ansichten

    private var introForm: some View {
        Form {
            Section {
                if let instruction = store.instruction {
                    Text(instruction)
                }
                Text("Du ordnest in jedem Block vier Aussagen. Tippe zuerst die Aussage an, die am besten zu dir passt, dann die nächste, bis alle vier eine Ziffer haben.")
                    .foregroundStyle(Theme.muted)
            } header: {
                Text("So funktioniert es")
            }

            Section {
                PrimaryButton(title: "Test starten", isBusy: false) {
                    store.start()
                }
            }
        }
    }

    private func cooldownForm(until: Date) -> some View {
        Form {
            Section {
                Label("Test schon gemacht", systemImage: "checkmark.circle")
                Text("Den Test kannst du ab dem \(Self.formatted(until)) wiederholen.")
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    private var finishedForm: some View {
        Form {
            Section {
                Label("Test gespeichert", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Dein Arbeitsstil fließt ab jetzt in deine Passung ein.")
                    .foregroundStyle(Theme.muted)
            }
            Section {
                PrimaryButton(title: "Fertig", isBusy: false) {
                    onFinish()
                }
            }
        }
    }

    private var questionForm: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Block \(store.currentBlock + 1) von \(store.blocks.count)")
                        .font(.headline)
                    ProgressView(value: Double(store.currentBlock + 1), total: Double(store.blocks.count))
                        .tint(Theme.accent)
                }
                .accessibilityElement(children: .combine)
            }

            Section {
                ForEach(Array(store.currentStatements.enumerated()), id: \.offset) { index, text in
                    StatementRow(text: text, rank: store.rank(of: index)) {
                        store.toggle(index)
                    }
                }
            } header: {
                Text("Am besten passend zuerst")
            } footer: {
                Text("Tippe eine Aussage an, um ihr den nächsten Rang zu geben. Tippst du eine eingeordnete Aussage an, verliert sie ihren Rang.")
            }

            Section {
                Button("Letzte Einordnung zurücknehmen") {
                    store.undo()
                }
                .disabled(store.currentOrder.isEmpty)

                if store.currentBlock > 0 {
                    Button("Vorheriger Block") {
                        store.goToPreviousBlock()
                    }
                }

                if store.isLastBlock {
                    PrimaryButton(title: "Absenden", isBusy: store.isSubmitting) {
                        showSubmitConfirmation = true
                    }
                    .disabled(!store.allBlocksComplete)
                } else {
                    PrimaryButton(title: "Weiter", isBusy: false) {
                        store.goToNextBlock()
                    }
                    .disabled(!store.isCurrentBlockComplete)
                }

                if let submitError = store.submitError {
                    Text(submitError)
                        .font(.subheadline)
                        .foregroundStyle(.red)
                }
            }
        }
    }

    // MARK: - Aktionen

    private func submit() async {
        await store.submit()
        if let result = store.result {
            onCompleted(result)
        }
    }

    private static func formatted(_ date: Date) -> String {
        date.formatted(.dateTime.day().month(.wide).year().locale(Locale(identifier: "de_DE")))
    }
}

/// Eine Aussage als großer Antippbereich mit Rangziffer. Ohne Rang ist der Kreis leer.
private struct StatementRow: View {
    let text: String
    let rank: Int?
    let action: () -> Void

    @ScaledMetric(relativeTo: .body) private var badgeSize: CGFloat = 32

    var body: some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                ZStack {
                    if let rank {
                        Circle()
                            .fill(Theme.accent)
                        Text("\(rank)")
                            .font(.subheadline.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(Theme.ink)
                    } else {
                        Circle()
                            .strokeBorder(Theme.muted, lineWidth: 1.5)
                    }
                }
                .frame(width: badgeSize, height: badgeSize)

                Text(text)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(text)
        .accessibilityValue(rank.map { "Rang \($0)" } ?? "Noch nicht eingeordnet")
        .accessibilityHint(rank == nil ? "Antippen, um den nächsten Rang zu vergeben" : "Antippen, um den Rang zurückzunehmen")
    }
}
