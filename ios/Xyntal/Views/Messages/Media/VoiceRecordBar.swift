import SwiftUI

/// Aufnahmeleiste. Ersetzt die Eingabezeile, solange eine Aufnahme läuft oder pausiert ist.
/// Von links: Papierkorb · Kapsel (Aufnahme oder Vorhören) · Pause oder Weiter · Senden.
/// Nichts wird von selbst gesendet. Der Pegel ist Information und bleibt immer an.
struct VoiceRecordBar: View {
    let recorder: VoiceRecorder
    let onDiscard: () -> Void
    let onPauseOrResume: () -> Void
    let onSend: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    private var elapsed: TimeInterval { recorder.elapsed }
    private var canSend: Bool { VoiceRules.canSend(seconds: elapsed) && !recorder.isMerging }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 8) {
                discardButton
                capsule
                pauseOrResumeButton
                sendButton
            }
            if let note = recorder.note {
                Text(VoiceRules.noteText(note))
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .padding(.leading, 52)
            }
            if let errorText = recorder.errorText {
                Text(errorText)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
        .onAppear {
            if !reduceMotion { pulse = true }
        }
    }

    // MARK: - Knöpfe

    private var discardButton: some View {
        Button(action: onDiscard) {
            Image(systemName: "trash")
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(.red)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Aufnahme verwerfen")
    }

    private var pauseOrResumeButton: some View {
        let recording = recorder.phase == .recording
        return Button(action: onPauseOrResume) {
            Image(systemName: recording ? "pause.circle.fill" : "record.circle")
                .font(.system(size: 32))
                .foregroundStyle(.primary)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(recording ? "Aufnahme pausieren" : VoiceRules.resumeLabel)
    }

    private var sendButton: some View {
        Button(action: onSend) {
            Image(systemName: "arrow.up.circle.fill")
                .font(.system(size: 32))
                .foregroundStyle(Theme.accent)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .opacity(canSend ? 1 : 0.35)
        .disabled(!canSend)
        .accessibilityLabel("Sprachnachricht senden")
    }

    // MARK: - Kapsel

    /// Form und Fläche wie das Textfeld. Aufnahme oder Vorhören, je nach Zustand.
    @ViewBuilder
    private var capsule: some View {
        Group {
            if recorder.phase == .paused {
                playback
            } else {
                recording
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(minHeight: 36)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
    }

    private var recording: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Color.red)
                .frame(width: 10, height: 10)
                .opacity(pulse ? 0.3 : 1)
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: pulse)
                .accessibilityHidden(true)
            Text(VoiceRules.timeText(elapsed: elapsed))
                .font(.body.monospacedDigit())
                .foregroundStyle(VoiceRules.isWarning(elapsed) ? Color.orange : Color.primary)
                .lineLimit(1)
                .fixedSize()
            LevelBars(levels: recorder.levels)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Aufnahme")
        .accessibilityValue(VoiceRules.timeText(elapsed: elapsed))
    }

    @ViewBuilder
    private var playback: some View {
        if let draft = recorder.draft, let preview = recorder.preview {
            VStack(alignment: .leading, spacing: 0) {
                Text(VoiceRules.pausedLabel)
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
                    .padding(.leading, 12)
                    .padding(.top, 6)
                VoiceMessageView(player: preview,
                                 foreground: .primary,
                                 loadData: { try Data(contentsOf: draft.url) },
                                 showsRate: false)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Vorhören")
            .accessibilityValue("\(Int(preview.displayDuration)) Sekunden")
            .accessibilityHint("Doppeltippen zum Abspielen")
            .accessibilityAction(.default) {
                Task { await preview.togglePlayback { try Data(contentsOf: draft.url) } }
            }
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: preview.seek(by: 10)
                case .decrement: preview.seek(by: -10)
                @unknown default: break
                }
            }
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: 36)
        }
    }
}

/// Pegel als rollende Balken. Neu rechts, älteste links. Die Balken teilen sich die Breite der Kapsel.
private struct LevelBars: View {
    let levels: [Double]

    var body: some View {
        let padded = Array(repeating: 0.0, count: max(0, VoiceRules.levelCount - levels.count)) + levels
        HStack(spacing: 2) {
            ForEach(Array(padded.enumerated()), id: \.offset) { _, value in
                Capsule()
                    .fill(Color.primary.opacity(0.6))
                    .frame(maxWidth: .infinity)
                    .frame(height: 24 * max(value, 0.12))
            }
        }
        .frame(maxWidth: .infinity, minHeight: 24, maxHeight: 24)
        .accessibilityHidden(true)
    }
}
