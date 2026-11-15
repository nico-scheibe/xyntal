import AVFoundation
import Observation

/// Was die Sprachblase zum Abspielen braucht. Erfüllt von VoicePlayer (Nachrichten vom Server) und von
/// VoiceDraftPlayer (Vorhören vor dem Senden, ohne fertige Datei).
@MainActor
protocol VoicePlayback: AnyObject {
    var isPlaying: Bool { get }
    var isLoaded: Bool { get }
    var isLoading: Bool { get }
    var loadFailed: Bool { get }
    var currentTime: TimeInterval { get }
    var displayDuration: TimeInterval { get }
    var waveform: [Double]? { get }
    var rateLabel: String { get }
    func togglePlayback(loadData: () async throws -> Data) async
    func pause()
    func seek(to seconds: TimeInterval)
    func seek(by delta: TimeInterval)
    func cycleRate()
}

/// Hält nur die zuletzt gestartete Sprachnachricht. Beginnt eine andere, pausiert die bisherige.
@MainActor
final class VoicePlaybackCoordinator {
    static let shared = VoicePlaybackCoordinator()

    private weak var active: (any VoicePlayback)?

    func activate(_ player: any VoicePlayback) {
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
final class VoicePlayer: VoicePlayback {
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
    /// Echte Wellenform, sobald die Aufnahme geladen und dekodiert ist. Vorher nil.
    private(set) var waveform: [Double]?

    private let attachmentId: String
    private var player: AVAudioPlayer?
    private var ticker: Task<Void, Never>?

    init(attachmentId: String, durationMs: Int?) {
        self.attachmentId = attachmentId
        duration = TimeInterval(max(durationMs ?? 0, 0)) / 1000
        waveform = WaveformCache.shared.cached(attachmentId)
    }

    var isPlaying: Bool { state == .playing }
    var isLoaded: Bool { player != nil }
    var isLoading: Bool { state == .loading }

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
                if waveform == nil {
                    let id = attachmentId
                    let bars = await Task.detached(priority: .utility) {
                        Waveform.bars(fromAudioData: data, id: id)
                    }.value
                    if let bars {
                        waveform = bars
                        WaveformCache.shared.store(bars, for: id)
                    }
                }
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

/// Wellenform aus der echten Audiodatei: 40 Eimer, je Eimer der Effektivwert (RMS), auf 0…1 normiert.
/// Läuft abseits des Hauptthreads und einmal pro Datei; das Ergebnis liegt im WaveformCache.
enum Waveform {
    static let barCount = 40

    /// nil, wenn die Datei nicht dekodiert werden kann oder stumm ist. Dann bleiben die gleichmäßigen Balken.
    static func bars(fromAudioData data: Data, id: String) -> [Double]? {
        let folder = FileManager.default.temporaryDirectory.appending(path: "Xyntal-Wellenform", directoryHint: .isDirectory)
        let safeId = String(id.map { $0.isLetter || $0.isNumber || $0 == "-" ? $0 : "_" })
        let url = folder.appending(path: safeId + ".m4a")
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
            defer { try? FileManager.default.removeItem(at: url) }

            let file = try AVAudioFile(forReading: url)
            let format = file.processingFormat
            let total = file.length
            guard total > 0 else { return nil }
            let channels = Int(format.channelCount)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 32_768) else { return nil }

            var sums = [Double](repeating: 0, count: barCount)
            var counts = [Double](repeating: 0, count: barCount)
            var position: AVAudioFramePosition = 0
            while position < total {
                try file.read(into: buffer, frameCount: buffer.frameCapacity)
                let frames = Int(buffer.frameLength)
                if frames == 0 { break }
                guard let channelData = buffer.floatChannelData else { return nil }
                for frame in 0..<frames {
                    let absolute = position + AVAudioFramePosition(frame)
                    let bucket = min(barCount - 1, Int(absolute * AVAudioFramePosition(barCount) / total))
                    var squares = 0.0
                    for channel in 0..<channels {
                        let value = Double(channelData[channel][frame])
                        squares += value * value
                    }
                    sums[bucket] += squares / Double(channels)
                    counts[bucket] += 1
                }
                position += AVAudioFramePosition(frames)
            }

            let rms = (0..<barCount).map { counts[$0] > 0 ? (sums[$0] / counts[$0]).squareRoot() : 0 }
            guard let peak = rms.max(), peak > 0 else { return nil }
            return rms.map { $0 / peak }
        } catch {
            return nil
        }
    }
}

/// Wellenformen je Anhang-ID, damit eine Nachricht sie nach dem ersten Laden sofort zeigt.
@MainActor
final class WaveformCache {
    static let shared = WaveformCache()

    private var bars: [String: [Double]] = [:]

    func cached(_ id: String) -> [Double]? { bars[id] }

    func store(_ value: [Double], for id: String) { bars[id] = value }
}
