import SwiftUI

/// Blatt für den Moment, in dem sich zwei Leute gegenseitig angenommen haben. Bewusst ruhig gehalten:
/// Der Nutzer schreibt die erste Nachricht, ohne Jubel. Gesendet wird über onSend, geschlossen wird vom Aufrufer.
struct MatchFoundSheet: View {
    let personName: String
    /// Wie bei AvatarView.
    let personAvatar: String?
    let ownName: String?
    let ownAvatar: String?
    /// Z. B. "Mitgründer:in". Darf nil sein.
    let looking: String?
    /// Erster Skill der Person. Darf nil sein.
    let topSkill: String?
    /// Eine Zeile Begründung vom Server. Darf nil sein.
    let reason: String?
    /// Sendet die Nachricht. true = gesendet, false = fehlgeschlagen.
    let onSend: (String) async -> Bool
    let onLater: () -> Void

    @State private var text = ""
    @State private var isSending = false
    @State private var sendFailed = false

    /// Vorname = erstes Wort von personName.
    private var firstName: String {
        personName.split(whereSeparator: { $0.isWhitespace }).first.map(String.init) ?? personName
    }

    /// Höchstens drei Vorschläge, in fester Reihenfolge.
    private var suggestions: [String] {
        var list: [String] = []
        if let looking = trimmed(looking) {
            list.append("Hallo \(firstName), du suchst \(looking). Erzähl mir mehr dazu?")
        }
        if let topSkill = trimmed(topSkill) {
            list.append("Hallo \(firstName), du kennst dich mit \(topSkill) aus. Wie bist du dazu gekommen?")
        }
        list.append("Hallo \(firstName), schön, dass wir uns gefunden haben. Woran arbeitest du gerade?")
        list.append("Hallo \(firstName), was möchtest du in diesem Jahr erreichen?")
        return Array(list.prefix(3))
    }

    private var canSend: Bool {
        !isSending && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 28) {
                    avatars

                    VStack(spacing: 8) {
                        Text("Es passt.")
                            .font(.largeTitle.bold())
                        Text("Du und \(firstName) wollt euch beide kennenlernen.")
                            .font(.body)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isHeader)

                    if let reason = trimmed(reason) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Das verbindet euch:")
                                .font(.subheadline)
                                .foregroundStyle(Theme.muted)
                            Text(reason)
                                .font(.body)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(suggestions, id: \.self) { suggestion in
                            Button {
                                text = suggestion
                            } label: {
                                Text(suggestion)
                                    .font(.subheadline)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 10)
                                    .background(Color(.secondarySystemBackground), in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint("Setzt diesen Text in das Nachrichtenfeld ein")
                        }
                    }

                    TextField("Schreib \(firstName) eine erste Nachricht", text: $text, axis: .vertical)
                        .lineLimit(1...4)
                        .padding(12)
                        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
                }
                .padding(.horizontal, 24)
                .padding(.top, 32)
                .padding(.bottom, 16)
            }

            VStack(spacing: 12) {
                if sendFailed {
                    Text("Die Nachricht ist nicht angekommen. Versuch es noch mal.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                PrimaryButton(title: "Nachricht senden", isBusy: isSending, action: send)
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(Theme.ink)
                    .disabled(!canSend)

                Button("Später schreiben", action: onLater)
                    .font(.subheadline)
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
            .padding(.bottom, 16)
        }
        .background(Color(.systemBackground))
    }

    private var avatars: some View {
        HStack(spacing: -16) {
            AvatarView(name: ownName, avatar: ownAvatar, size: 72)
                .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 3))
            AvatarView(name: personName, avatar: personAvatar, size: 72)
                .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 3))
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    /// Getrimmter Text oder nil, wenn nichts übrig bleibt.
    private func trimmed(_ value: String?) -> String? {
        let cleaned: String? = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.nonEmptyText
    }

    private func send() {
        let message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canSend, !message.isEmpty else { return }
        isSending = true
        sendFailed = false
        Task {
            let ok = await onSend(message)
            isSending = false
            sendFailed = !ok
        }
    }
}

#Preview("Mit Suche, Skill und Begründung") {
    MatchFoundSheet(
        personName: "Anna Berg",
        personAvatar: nil,
        ownName: "Nico Keller",
        ownAvatar: nil,
        looking: "Mitgründer:in",
        topSkill: "Swift",
        reason: "Ihr baut beide an einem Produkt für kleine Teams.",
        onSend: { _ in true },
        onLater: {}
    )
}

#Preview("Ohne alles") {
    MatchFoundSheet(
        personName: "Anna Berg",
        personAvatar: nil,
        ownName: nil,
        ownAvatar: nil,
        looking: nil,
        topSkill: nil,
        reason: nil,
        onSend: { _ in false },
        onLater: {}
    )
}
