import SwiftUI

// Nativer Teil der Anrufe: Vollbild, Knöpfe, Rückkehr-Leiste, eingehende Karte, Beitreten-Leiste und die Zeile im Verlauf.
// Die Anruf-Seite liefert nur das Bild (CallPageView). Alles andere zeichnet die App.

/// Anrufbildschirm. Immer dunkel. Oben Name und Status, unten vier Knöpfe, oben links das Minimieren.
struct CallScreenView: View {
    @Environment(CallStore.self) private var calls

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let page = calls.page {
                CallPageView(host: page)
                    .ignoresSafeArea()
            }
            VStack(spacing: 0) {
                header
                Spacer(minLength: 0)
                notices
                controls
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
        }
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        HStack(alignment: .top) {
            Button {
                calls.minimize()
            } label: {
                Image(systemName: "chevron.down")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Minimieren")

            Spacer(minLength: 8)

            VStack(spacing: 4) {
                Text(calls.active?.title ?? "")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(statusText(now: context.date))
                        .font(.subheadline)
                        .monospacedDigit()
                        .foregroundStyle(.white.opacity(0.8))
                }
            }

            Spacer(minLength: 8)

            // Gleich breit wie der Minimieren-Knopf, damit der Titel mittig bleibt.
            Color.clear.frame(width: 44, height: 44)
        }
    }

    /// „Verbinde …“, „Klingelt …“ (nur der Anrufer, solange niemand dazugekommen ist), sonst die Dauer.
    private func statusText(now: Date) -> String {
        guard let active = calls.active else { return "" }
        if calls.snapshot?.status == "lost" { return "Verbindung wird wiederhergestellt …" }
        guard calls.snapshot?.status == "live" else { return "Verbinde …" }
        let peers = calls.snapshot?.peers ?? []
        if active.startedByMe && peers.isEmpty { return "Klingelt …" }
        guard let since = calls.liveSince else { return "Verbinde …" }
        return Self.elapsed(from: since, to: now)
    }

    private static func elapsed(from start: Date, to now: Date) -> String {
        let total = max(0, Int(now.timeIntervalSince(start)))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%02d:%02d", minutes, seconds)
    }

    /// Hinweise: wer nicht angerufen wurde (nur mit dem Grund, den der Server nennt), Moderation, Fehler.
    private var notices: some View {
        VStack(spacing: 6) {
            if let snapshot = calls.snapshot, snapshot.me.serverMuted {
                Text("Ein Moderator hat dein Mikrofon stummgeschaltet.")
            }
            ForEach(calls.held, id: \.userId) { note in
                Text(Self.heldText(note))
            }
            if let errorText = calls.errorText {
                Text(errorText)
            }
        }
        .font(.callout)
        .foregroundStyle(.white.opacity(0.9))
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.bottom, 12)
    }

    /// Nur, was der Server nennt. Ohne Grund steht nur da, dass es nicht geklingelt hat.
    private static func heldText(_ note: CallHoldNote) -> String {
        let name = note.name.nonEmptyText ?? "Jemand"
        let reason: String?
        switch note.reason {
        case "busy": reason = "gerade beschäftigt"
        case "dnd": reason = "Nicht stören ist an"
        case "focus": reason = "Fokus ist an"
        case "quiet_hours": reason = "Ruhezeit"
        default: reason = nil
        }
        if let reason {
            return "Bei \(name) hat es nicht geklingelt: \(reason)."
        }
        return "Bei \(name) hat es nicht geklingelt."
    }

    private var controls: some View {
        let snapshot = calls.snapshot
        let muted = snapshot?.me.muted ?? false
        let camera = snapshot?.me.camera ?? false
        return HStack(spacing: 18) {
            CallControlButton(systemImage: camera ? "video.fill" : "video.slash.fill",
                              label: camera ? "Kamera an" : "Kamera aus",
                              isOn: camera) {
                calls.setCamera(!camera)
            }
            CallControlButton(systemImage: muted ? "mic.slash.fill" : "mic.fill",
                              label: muted ? "Mikrofon aus" : "Mikrofon an",
                              isOn: !muted,
                              isDisabled: snapshot?.me.serverMuted ?? false) {
                calls.setMuted(!muted)
            }
            hangUpButton
        }
        .frame(maxWidth: .infinity)
    }

    private var hangUpButton: some View {
        VStack(spacing: 6) {
            Button {
                Task { await calls.hangUp() }
            } label: {
                Image(systemName: "phone.down.fill")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(Color(hex: 0xD93025)))
            }
            .accessibilityLabel("Auflegen")
            Text("Auflegen")
                .font(.caption)
                .foregroundStyle(.white)
        }
    }
}

/// Runder Knopf 56×56. Ein ausgeschalteter Zustand ändert Symbol und Wort, nicht nur die Farbe.
private struct CallControlButton: View {
    let systemImage: String
    let label: String
    let isOn: Bool
    var isDisabled = false
    let action: () -> Void

    var body: some View {
        VStack(spacing: 6) {
            Button(action: action) {
                Image(systemName: systemImage)
                    .font(.title3)
                    .foregroundStyle(isOn ? Color.white : Color.black)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(isOn ? Color.white.opacity(0.22) : Color.white))
                    .opacity(isDisabled ? 0.4 : 1)
            }
            .disabled(isDisabled)
            .accessibilityLabel(label)
            Text(label)
                .font(.caption)
                .foregroundStyle(.white)
                .opacity(isDisabled ? 0.4 : 1)
        }
        .frame(minWidth: 64)
    }
}

/// Leiste oben, wenn der Anruf minimiert ist. Der Anruf läuft im Hintergrund der App weiter.
struct CallMinimizedBar: View {
    @Environment(CallStore.self) private var calls

    var body: some View {
        if let active = calls.active, calls.isMinimized {
            HStack(spacing: 10) {
                Image(systemName: active.kind == "video" ? "video.fill" : "phone.fill")
                    .foregroundStyle(Theme.accentText)
                VStack(alignment: .leading, spacing: 1) {
                    Text(active.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text("Anruf läuft")
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 8)
                Button {
                    calls.restore()
                } label: {
                    Text("Zurück")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .background(Capsule().fill(Theme.accent))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(Color(.secondarySystemGroupedBackground))
        }
    }
}

/// Karte für einen eingehenden Anruf. Kommt von oben herein und nimmt nicht den ganzen Bildschirm ein.
struct IncomingCallCard: View {
    @Environment(CallStore.self) private var calls
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if let incoming = calls.incoming {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Image(systemName: incoming.kind == "video" ? "video.fill" : "phone.fill")
                        .font(.title3)
                        .foregroundStyle(Theme.accentText)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(incoming.callerName)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        Text(incoming.kind == "video" ? "Videoanruf" : "Sprachanruf")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                        if !incoming.callerHeadline.isEmpty {
                            Text(incoming.callerHeadline)
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                HStack(spacing: 12) {
                    Button {
                        Task { await calls.declineIncoming() }
                    } label: {
                        Text("Ablehnen")
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(Capsule().fill(Color(.tertiarySystemFill)))
                    }
                    Button {
                        Task { await calls.acceptIncoming() }
                    } label: {
                        Text("Annehmen")
                            .font(.headline)
                            .foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(Capsule().fill(Theme.accent))
                    }
                }
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(.secondarySystemGroupedBackground)))
            .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
        }
    }
}

/// Beitreten-Leiste im Gespräch, solange dort ein Anruf läuft und ich nicht dabei bin.
struct RunningCallBar: View {
    @Environment(CallStore.self) private var calls
    let conversationId: String
    let title: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "phone.fill")
                .foregroundStyle(Theme.accentText)
            Text("Anruf läuft")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
            Spacer(minLength: 8)
            Button {
                Task { await calls.joinRunningCall(conversationId: conversationId, title: title) }
            } label: {
                Text("Beitreten")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(Theme.accent))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(Color(.secondarySystemGroupedBackground))
    }
}

/// Anrufzeile im Verlauf, wie die Systemnachrichten zentriert und klein.
struct CallMessageRow: View {
    let call: CallInfo

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(Theme.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 2)
    }

    private var text: String {
        let kind = call.isVideo ? "Videoanruf" : "Sprachanruf"
        if call.isActive {
            return "\(kind) läuft"
        }
        guard let start = ISODate.parse(call.startedAt),
              let end = ISODate.parse(call.endedAt), end > start else {
            return "\(kind) beendet"
        }
        let minutes = max(1, Int((end.timeIntervalSince(start) / 60).rounded()))
        return "\(kind) beendet · \(minutes) Min."
    }
}
