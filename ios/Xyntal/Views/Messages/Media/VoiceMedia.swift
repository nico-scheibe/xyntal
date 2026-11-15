import SwiftUI

/// Sprachnachricht: Wiedergabe-Kreis, Wellenform mit Fortschritt, Dauer und Geschwindigkeit.
/// Die Bubble liefert die VoiceOver-Beschriftung; hier ist alles für Sehende.
struct VoiceMessageView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .body) private var buttonSize: CGFloat = 40

    let attachment: Attachment
    let player: VoicePlayer
    let foreground: Color

    private static let barCount = 40

    private var progress: Double {
        let total = player.displayDuration
        guard total > 0 else { return 0 }
        return min(max(player.currentTime / total, 0), 1)
    }

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        playButton
                        waveform
                    }
                    HStack {
                        durationText
                        Spacer()
                        rateChip
                    }
                }
            } else {
                HStack(spacing: 10) {
                    playButton
                    waveform
                    durationText
                    rateChip
                }
            }
            if player.loadFailed {
                Button {
                    Task {
                        await player.togglePlayback {
                            try await MediaLoader.shared.fileData(for: attachment, session: session)
                        }
                    }
                } label: {
                    RetryHintText()
                        .foregroundStyle(foreground)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(minWidth: 240, alignment: .leading)
    }

    private var playButton: some View {
        Button {
            Task {
                await player.togglePlayback {
                    try await MediaLoader.shared.fileData(for: attachment, session: session)
                }
            }
        } label: {
            ZStack {
                Circle()
                    .fill(foreground.opacity(0.18))
                if player.state == .loading {
                    ProgressView()
                } else {
                    Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: buttonSize * 0.4, weight: .bold))
                        .foregroundStyle(foreground)
                }
            }
            .frame(width: buttonSize, height: buttonSize)
        }
        .buttonStyle(.plain)
        .accessibilityHidden(true)
    }

    /// 40 Balken. Abgespielter Teil in voller Farbe, Rest mit 60 % Deckkraft. Der Punkt markiert die Position,
    /// damit der Fortschritt auch ohne Farbunterschied zu erkennen ist.
    private var waveform: some View {
        // Vor dem Laden gleich hohe Balken als Platzhalter; danach die echte Wellenform.
        let bars = player.waveform ?? Array(repeating: 0.4, count: Self.barCount)
        return GeometryReader { proxy in
            ZStack(alignment: .leading) {
                HStack(spacing: 1) {
                    ForEach(bars.indices, id: \.self) { index in
                        let played = (Double(index) + 0.5) / Double(bars.count) <= progress
                        Capsule()
                            .fill(foreground.opacity(played ? 1 : 0.6))
                            .frame(maxWidth: .infinity)
                            .frame(height: 28 * max(bars[index], 0.12))
                    }
                }
                .frame(maxHeight: .infinity)
                Circle()
                    .fill(foreground)
                    .frame(width: 10, height: 10)
                    .offset(x: max(0, min(progress * proxy.size.width - 5, proxy.size.width - 10)))
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        guard proxy.size.width > 0, player.isLoaded else { return }
                        let fraction = min(max(value.location.x / proxy.size.width, 0), 1)
                        player.seek(to: fraction * player.displayDuration)
                    }
            )
        }
        .frame(height: 28)
        .frame(minWidth: 80, maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    private var durationText: some View {
        Text(MediaFormat.clock(player.displayDuration))
            .font(.caption.monospacedDigit())
            .foregroundStyle(foreground.opacity(0.85))
            .accessibilityHidden(true)
    }

    private var rateChip: some View {
        Button {
            player.cycleRate()
        } label: {
            Text(player.rateLabel)
                .font(.caption.bold())
                .foregroundStyle(foreground)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(foreground.opacity(0.15), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityHidden(true)
    }
}

/// Fehlertext für Sprache und Dateien, der das Wiederholen anbietet.
struct RetryHintText: View {
    var body: some View {
        Text("Lässt sich nicht laden. Tippen zum Wiederholen.")
            .font(.caption)
    }
}
