import SwiftUI

/// „Warum passt es?“: Erklärung der Passung mit Dimensionen, Signalen und Risiken plus Aktionen.
struct MatchDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ConversationsStore.self) private var conversations
    @Environment(\.dismiss) private var dismiss

    let person: MatchPerson
    let store: MatchesStore

    @State private var detail: MatchDetail?
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var isStartingChat = false
    @State private var chatError: String?
    @State private var dismissTarget: MatchPerson?
    /// Nach „Nachricht schreiben“: öffnet den Chat.
    @State private var openConversation: Conversation?

    /// Aktuelle Person: das target der Erklärung, sonst die übergebene Karte.
    private var current: MatchPerson {
        guard var target = detail?.target else { return person }
        if target.id != person.id { return person }
        if target.displayName.nonEmptyText == nil { target.displayName = person.displayName }
        if target.headline.nonEmptyText == nil { target.headline = person.headline }
        if target.avatar.nonEmptyText == nil { target.avatar = person.avatar }
        return target
    }

    private var score: Int { detail?.score ?? person.score }
    private var isBusy: Bool { store.isBusy(person.id) || isStartingChat }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                if let detail {
                    explanation(detail)
                } else if isLoading {
                    ProgressView("Passung wird berechnet …")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                } else if let loadError {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(loadError)
                            .foregroundStyle(.red)
                        Button("Erneut versuchen") { Task { await load() } }
                    }
                }
                actions
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(person.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .dismissMatchFlow(target: $dismissTarget) { target, reason, note in
            Task {
                if await store.dismiss(target, reason: reason, note: note) {
                    dismiss()
                }
            }
        }
        .navigationDestination(item: $openConversation) { conversation in
            ChatView(conversation: conversation)
        }
    }

    // MARK: - Teile

    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            ScoreRing(score: score, size: 88)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 10) {
                    AvatarView(name: current.displayName, avatar: current.avatar, size: 44)
                    Text(current.name)
                        .font(.title2.bold())
                        .lineLimit(2)
                }
                if let headline = current.headline.nonEmptyText {
                    Text(headline)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private func explanation(_ detail: MatchDetail) -> some View {
        if let summary = detail.summary.nonEmptyText {
            Text(summary)
                .font(.body)
        }

        if detail.lowData == true {
            hint("Noch wenige Angaben – je mehr ihr beide ausfüllt, desto genauer wird die Passung.")
        }

        let dimensions = detail.sortedDimensions
        if !dimensions.isEmpty {
            card("Wie sich die Passung zusammensetzt") {
                ForEach(Array(dimensions.enumerated()), id: \.offset) { index, dimension in
                    if index > 0 { Divider() }
                    DimensionRow(dimension: dimension)
                }
            }
        }

        if !detail.boosts.isEmpty || !detail.penalties.isEmpty {
            card("Signale") {
                ForEach(Array(detail.boosts.enumerated()), id: \.offset) { _, signal in
                    SignalRow(signal: signal, isBoost: true)
                }
                ForEach(Array(detail.penalties.enumerated()), id: \.offset) { _, signal in
                    SignalRow(signal: signal, isBoost: false)
                }
            }
        }

        if !detail.riskFactors.isEmpty {
            hint("Achte auf: \(detail.riskFactors.joined(separator: " · "))")
        }
    }

    private var actions: some View {
        VStack(spacing: 10) {
            Button {
                Task { await startChat() }
            } label: {
                HStack {
                    Spacer()
                    if isStartingChat {
                        ProgressView()
                    } else {
                        Label("Nachricht schreiben", systemImage: "bubble.left.and.bubble.right")
                            .fontWeight(.semibold)
                    }
                    Spacer()
                }
                .padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent)
            .foregroundStyle(Theme.ink)
            .disabled(isBusy)

            HStack(spacing: 10) {
                Button {
                    Task { await store.toggleSaved(current) }
                } label: {
                    HStack {
                        Spacer()
                        Text(store.isSaved(current) ? "Gespeichert ✓" : "Speichern")
                        Spacer()
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.bordered)
                .disabled(isBusy)
                .accessibilityLabel(store.isSaved(current) ? "Gespeichert, tippen zum Entfernen" : "Speichern")

                Button {
                    dismissTarget = current
                } label: {
                    HStack {
                        Spacer()
                        Text("Passt nicht")
                        Spacer()
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.bordered)
                .disabled(isBusy)
            }

            if store.isBusy(person.id) {
                ProgressView()
                    .controlSize(.small)
            }

            if let message = chatError ?? store.actionError(for: person.id) {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.top, 8)
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.accent.opacity(0.18), in: RoundedRectangle(cornerRadius: 12))
    }

    private func card<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Laden und Aktionen

    private func load() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            detail = try await session.withAccess { token in
                try await session.api.matchDetail(id: person.id, token: token)
            }
        } catch is CancellationError {
            return
        } catch {
            loadError = AppError.displayText(for: error)
        }
    }

    /// Legt die Direktnachricht an (oder holt die bestehende) und öffnet den Chat. Gleiches Muster wie MemberDetailView.
    private func startChat() async {
        guard !isStartingChat else { return }
        isStartingChat = true
        chatError = nil
        defer { isStartingChat = false }
        do {
            var conversation = try await session.withAccess { token in
                try await session.api.createDirectConversation(userId: person.id, token: token)
            }
            // Der Partner ist bekannt, auch wenn die Antwort ihn nicht nennt; so stimmt der Titel sofort.
            if !conversation.isDirect {
                conversation.kind = "dm"
                conversation.partnerId = person.id
            }
            conversations.cache(Profile(id: person.id,
                                        displayName: current.displayName,
                                        handle: current.handle,
                                        headline: current.headline,
                                        avatar: current.avatar))
            conversations.upsert(conversation)
            openConversation = conversation
        } catch is CancellationError {
            return
        } catch {
            chatError = AppError.displayText(for: error)
        }
    }
}

// MARK: - Bausteine

private struct DimensionRow: View {
    let dimension: MatchDimension

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(dimension.label)
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(dimension.percent)")
                    .font(.subheadline.weight(.bold))
                    .monospacedDigit()
            }
            ProgressView(value: Double(dimension.percent), total: 100)
                .tint(ScoreRing.color(for: dimension.percent))
            if let detail = dimension.detail.nonEmptyText {
                Text(detail)
                    .font(.footnote)
            }
            if let about = dimension.about.nonEmptyText {
                Text(about)
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(dimension.label): \(dimension.percent) von 100")
    }
}

private struct SignalRow: View {
    let signal: MatchSignal
    let isBoost: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: isBoost ? "plus.circle.fill" : "minus.circle.fill")
                .foregroundStyle(isBoost ? .green : .red)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(signal.label)
                    .font(.subheadline.weight(.semibold))
                if let detail = signal.detail.nonEmptyText {
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            Text(signal.deltaText)
                .font(.subheadline.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(isBoost ? .green : .red)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(isBoost ? "Plus" : "Minus"): \(signal.label), \(signal.deltaText)")
    }
}
