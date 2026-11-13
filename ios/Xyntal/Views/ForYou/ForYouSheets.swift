import SwiftUI

/// Erklärung des Stapels. Erscheint einmalig beim ersten Öffnen, danach über „So funktioniert’s“.
struct ForYouIntroSheet: View {
    let onDone: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Wische nach rechts, wenn du jemanden kennenlernen willst.")
                .font(.title2.bold())
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text("Nach links heißt „Passt nicht“. Niemand sieht, wie du entscheidest. Nur wenn ihr beide wollt, geht es los.")
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
            Button("Verstanden", action: onDone)
                .buttonStyle(.borderedProminent)
                .tint(Theme.accent)
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .presentationDetents([.medium])
    }
}

/// Grund für „Passt nicht“. Freiwillig und nachträglich: erscheint über „Grund angeben“ in der Kapsel.
/// Solange das Blatt offen ist, pausiert die Frist der Kapsel.
struct DismissReasonSheet: View {
    let onPick: (DismissReason) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Warum passt es nicht?")
                    .font(.title3.bold())
                    .accessibilityAddTraits(.isHeader)
                Text("Das hilft uns, dir bessere Vorschläge zu machen. Die Person erfährt nichts davon.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(DismissReason.allCases) { reason in
                    Button(reason.title) { onPick(reason) }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .presentationDetents([.medium])
    }
}
