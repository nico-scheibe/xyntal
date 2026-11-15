import AVFoundation
import Observation

/// Hält nur die zuletzt gestartete Sprachnachricht. Beginnt eine andere, pausiert die bisherige.
@MainActor
final class VoicePlaybackCoordinator {
    static let shared = VoicePlaybackCoordinator()

    private weak var active: VoicePlayer?

    func activate(_ player: VoicePlayer) {
        if let active, active !== player {
            active.pause()
        }
        active = player
    }
}

/// Wiedergabe einer Sprachnachricht. Läuft auch bei stummgeschaltetem iPhone (Kategorie playback).
/// Kein Hintergrund-Audio: Die Ansicht ruft pause() auf, sobald die App nicht mehr aktiv ist.
@MainActor
@Observable
final class VoicePlayer {
    enum State: Equatable {
        case idle
        case loading
        case paused
        case playing
    }

    private(set) var state: State = .idle
    /// Aktuelle Position in Sekunden.
    private(set) var currentTime: TimeInterval = 0
    /// Dauer aus dem Server, bis die Aufnahme geladen ist.
    private(set) var duration: TimeInterval
    private(set) var loadFailed = false
    /// Wiedergabegeschwindigkeit: 1, 1.5 oder 2.
    private(set) var rate: Float = 1

    private var player: AVAudioPlayer?
    private var ticker: Task<Void, Never>?

    init(durationMs: Int?) {
        duration = TimeInterval(max(durationMs ?? 0, 0)) / 1000
    }

    var isPlaying: Bool { state == .playing }
    var isLoaded: Bool { player != nil }

    /// Zeigt die Geschwindigkeit, z. B. "1×", "1,5×", "2×".
    var rateLabel: String {
        switch rate {
        case 1.5: return "1,5×"
        case 2: return "2×"
        default: return "1×"
        }
    }

    /// Länge für die Anzeige: die geladene Aufnahme, sonst der Wert vom Server.
    var displayDuration: TimeInterval {
        if let player, player.duration > 0 { return player.duration }
        return duration
    }

    /// Abspielen oder Pausieren. Lädt die Aufnahme beim ersten Abspielen über loadData.
    func togglePlayback(loadData: () async throws -> Data) async {
        if isPlaying {
            pause()
            return
        }
        // Während des Ladens läuft schon ein Versuch; ein zweiter Tipp startet keinen weiteren.
        guard state != .loading else { return }
        if player == nil {
            state = .loading
            loadFailed = false
            do {
                let data = try await loadData()
                let newPlayer = try AVAudioPlayer(data: data)
                newPlayer.enableRate = true
                newPlayer.prepareToPlay()
                player = newPlayer
                duration = newPlayer.duration
            } catch is CancellationError {
                state = .idle
                return
            } catch {
                state = .idle
                loadFailed = true
                return
            }
        }
        start()
    }

    func pause() {
        guard isPlaying, let player else { return }
        player.pause()
        ticker?.cancel()
        ticker = nil
        state = .paused
    }

    /// Springt auf eine Position. Ohne geladene Aufnahme passiert nichts.
    func seek(to seconds: TimeInterval) {
        guard let player else { return }
        let target = min(max(seconds, 0), player.duration)
        player.currentTime = target
        currentTime = target
    }

    func seek(by delta: TimeInterval) {
        seek(to: currentTime + delta)
    }

    /// Geschwindigkeit: 1× → 1,5× → 2× → 1×.
    func cycleRate() {
        switch rate {
        case 1: rate = 1.5
        case 1.5: rate = 2
        default: rate = 1
        }
        player?.rate = rate
    }

    private func start() {
        guard let player else { return }
        VoicePlaybackCoordinator.shared.activate(self)
        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setCategory(.playback, mode: .spokenAudio)
        try? audioSession.setActive(true)
        player.rate = rate
        player.currentTime = currentTime
        player.play()
        state = .playing
        startTicker()
    }

    private func startTicker() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self, let player = self.player else { return }
                if player.isPlaying {
                    self.currentTime = player.currentTime
                } else {
                    // Zu Ende gespielt: zurück an den Anfang, Symbol zeigt wieder Abspielen.
                    player.currentTime = 0
                    self.currentTime = 0
                    self.state = .paused
                    self.ticker = nil
                    return
                }
            }
        }
    }
}

/// Feste Balkenhöhen für die Wellenform. Der Server liefert keine Amplituden, daher ist das Muster
/// aus der Anhang-ID abgeleitet: Es ist je Nachricht stabil, aber keine echte Aufnahme.
enum WaveformPattern {
    static func bars(seed: String, count: Int = 40) -> [Double] {
        var state: UInt64 = 0xcbf29ce484222325
        for byte in seed.utf8 {
            state = (state ^ UInt64(byte)) &* 0x100000001b3
        }
        return (0..<count).map { _ in
            state = state &* 6364136223846793005 &+ 1442695040888963407
            let unit = Double(state >> 33) / Double(1 << 31)
            return 0.25 + unit * 0.75
        }
    }
}
