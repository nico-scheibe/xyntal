import SwiftUI

/// Bereich "Kurz vorgestellt" auf dem Mitglieds-Bildschirm: die von der KI geschriebene Vorstellung der Person.
/// Scheitert der Abruf so, dass nichts zu holen ist, verschwindet der Bereich. Das Profil funktioniert ohne ihn.
struct MemberBriefSection: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let userId: String

    @State private var store: MemberBriefStore?
    /// Pulsieren der Platzhalterbalken. Ruht bei "Bewegung reduzieren".
    @State private var pulse = false
    /// Höhe einer Textzeile; wächst mit der Systemschrift.
    @ScaledMetric(relativeTo: .body) private var lineHeight: CGFloat = 22

    private static let barSpacing: CGFloat = 8

    var body: some View {
        let phase = store?.phase ?? .loading
        Group {
            if phase == .hidden {
                EmptyView()
            } else {
                Section {
                    content(for: phase)
                        .animation(reduceMotion ? nil : .easeIn(duration: 0.25), value: phase)
                } header: {
                    Text("Kurz vorgestellt")
                } footer: {
                    if case .text = phase {
                        Text("Die KI kennt nur die Profilangaben. Wer jemand ist, zeigt erst ein Gespräch.")
                    }
                }
            }
        }
        .task {
            if store == nil {
                store = MemberBriefStore(userId: userId, session: session)
            }
            await store?.load()
        }
    }

    @ViewBuilder
    private func content(for phase: MemberBriefPhase) -> some View {
        switch phase {
        case .loading:
            loadingContent
        case .text(let text):
            briefContent(text)
        case .empty:
            Text("Zu dieser Person gibt es noch zu wenig Angaben für eine Vorstellung. Eine kurze Nachricht klärt mehr als jede Vermutung.")
                .foregroundStyle(.secondary)
                .transition(.opacity)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 8) {
                Text(message)
                    .foregroundStyle(.secondary)
                Button("Nochmal versuchen") {
                    Task { await store?.load() }
                }
                .frame(minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
            }
            .transition(.opacity)
        case .hidden:
            EmptyView()
        }
    }

    /// Herkunftszeile und Text als ein Element für VoiceOver.
    private func briefContent(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .foregroundStyle(Theme.accent)
                    .accessibilityHidden(true)
                Text("Von KI geschrieben")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Text(text)
                .font(.body)
                .lineSpacing(3)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Von KI geschrieben. \(text)")
        .transition(.opacity)
    }

    /// Drei graue Balken, die pulsieren. Ein Element für VoiceOver.
    private var loadingContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { proxy in
                VStack(alignment: .leading, spacing: Self.barSpacing) {
                    bar(width: proxy.size.width)
                    bar(width: proxy.size.width * 0.92)
                    bar(width: proxy.size.width * 0.6)
                }
            }
            .frame(height: 3 * lineHeight + 2 * Self.barSpacing)

            Text((store?.isSlow ?? false) ? "Das dauert gerade etwas länger …" : "Vorstellung wird geschrieben …")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Vorstellung wird geschrieben.")
        .transition(.opacity)
    }

    private func bar(width: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 6)
            .fill(Color.secondary.opacity(0.15))
            .frame(width: max(width, 0), height: lineHeight)
            .opacity(reduceMotion ? 1 : (pulse ? 1 : 0.5))
    }
}
