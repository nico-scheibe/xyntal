import AVFoundation
import Observation

/// Ein Teilstück einer Aufnahme auf der Platte. Teile werden beim Pausieren nur angehängt, nie neu kodiert.
/// `buckets` ist die Lautstärke alle 0,25 s (Effektivwert, unnormiert). Sie entsteht im Hintergrund.
struct VoiceSegment: Identifiable {
    let id = UUID()
    let url: URL
    let seconds: TimeInterval
    var buckets: [Double]?
}

/// Auswertung der Teile ohne Kodieren: Lautstärke je 0,25 s und die Wellenform für die Anzeige.
enum VoiceAudioAnalysis {
    static let bucketSeconds = 0.25
    static let barCount = 40

    /// Lautstärke je 0,25 s aus der Datei. Nur dekodieren, nichts schreiben. nil, wenn die Datei nicht lesbar ist.
    nonisolated static func rmsBuckets(of url: URL) async -> [Double]? {
        await Task.detached(priority: .utility) {
            guard let file = try? AVAudioFile(forReading: url) else { return nil }
            let format = file.processingFormat
            let perBucket = max(1, Int(format.sampleRate * bucketSeconds))
            let channels = Int(format.channelCount)
            guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 32_768) else { return nil }
            var result: [Double] = []
            var sum = 0.0
            var count = 0
            while true {
                do {
                    try file.read(into: buffer, frameCount: buffer.frameCapacity)
                } catch {
                    return nil
                }
                let frames = Int(buffer.frameLength)
                if frames == 0 { break }
                guard let data = buffer.floatChannelData else { return nil }
                for frame in 0..<frames {
                    var squares = 0.0
                    for channel in 0..<channels {
                        let value = Double(data[channel][frame])
                        squares += value * value
                    }
                    sum += squares / Double(channels)
                    count += 1
                    if count == perBucket {
                        result.append((sum / Double(count)).squareRoot())
                        sum = 0
                        count = 0
                    }
                }
            }
            if count > 0 {
                result.append((sum / Double(count)).squareRoot())
            }
            return result
        }.value
    }

    /// Wellenform aus allen Teilen, auf `barCount` Balken gemittelt und auf 0...1 normiert.
    /// nil, solange ein Teil noch nicht ausgewertet ist, oder wenn alles still ist.
    static func bars(from segments: [VoiceSegment]) -> [Double]? {
        var all: [Double] = []
        for segment in segments {
            guard let buckets = segment.buckets else { return nil }
            all += buckets
        }
        guard !all.isEmpty else { return nil }
        var result: [Double] = []
        for bar in 0..<barCount {
            let lower = bar * all.count / barCount
            let upper = min(all.count, max(lower + 1, (bar + 1) * all.count / barCount))
            let slice = all[lower..<upper]
            result.append(slice.reduce(0, +) / Double(slice.count))
        }
        guard let peak = result.max(), peak > 0 else { return nil }
        return result.map { $0 / peak }
    }
}

/// Vorhören eines Entwurfs aus seinen Teilen. Spielt die Teile der Reihe nach von der Platte, ohne sie
/// zusammenzufügen. Gleiche Oberfläche wie VoicePlayer, daher dieselbe Sprachblase.
@MainActor
@Observable
final class VoiceDraftPlayer: VoicePlayback {
    /// Nichts zu laden: die Teile liegen schon auf der Platte.
    static let noLoad: () async throws -> Data = { throw CancellationError() }

    private(set) var isPlaying = false
    /// Position im ganzen Entwurf, in Sekunden.
    private(set) var currentTime: TimeInterval = 0
    /// Summe der Teillängen.
    private(set) var displayDuration: TimeInterval = 0
    private(set) var waveform: [Double]?
    private(set) var rate: Float = 1

    private var segments: [VoiceSegment] = []
    /// Start jedes Teils im ganzen Entwurf.
    private var offsets: [TimeInterval] = []
    private var index = 0
    private var player: AVAudioPlayer?
    private var ticker: Task<Void, Never>?

    var isLoaded: Bool { !segments.isEmpty }
    var isLoading: Bool { false }
    var loadFailed: Bool { false }

    var rateLabel: String {
        switch rate {
        case 1.5: return "1,5×"
        case 2: return "2×"
        default: return "1×"
        }
    }

    /// Setzt die Teile. Nur nach einem Stopp aufrufen, wenn sich die Reihenfolge ändert. Anhängen ist sicher.
    func setSegments(_ new: [VoiceSegment]) {
        segments = new
        offsets = []
        var sum: TimeInterval = 0
        for segment in new {
            offsets.append(sum)
            sum += segment.seconds
        }
        displayDuration = sum
        currentTime = min(currentTime, sum)
        waveform = VoiceAudioAnalysis.bars(from: new)
    }

    func togglePlayback(loadData: () async throws -> Data) async {
        if isPlaying {
            pause()
        } else {
            start()
        }
    }

    /// Hält an und merkt sich die Position. Ohne Wiedergabe passiert nichts.
    func pause() {
        guard isPlaying else { return }
        if let player, index < offsets.count {
            currentTime = offsets[index] + player.currentTime
        }
        player?.stop()
        player = nil
        ticker?.cancel()
        ticker = nil
        isPlaying = false
    }

    func seek(to seconds: TimeInterval) {
        let target = min(max(seconds, 0), displayDuration)
        let wasPlaying = isPlaying
        pause()
        currentTime = target
        if wasPlaying { start() }
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

    // MARK: - Intern

    private func start() {
        guard !segments.isEmpty else { return }
        if currentTime >= displayDuration { currentTime = 0 }
        let (position, local) = locate(currentTime)
        guard let next = makePlayer(position) else { return }
        next.currentTime = local
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio)
        try? session.setActive(true)
        VoicePlaybackCoordinator.shared.activate(self)
        next.play()
        player = next
        index = position
        isPlaying = true
        startTicker()
    }

    private func makePlayer(_ position: Int) -> AVAudioPlayer? {
        guard let player = try? AVAudioPlayer(contentsOf: segments[position].url) else { return nil }
        player.enableRate = true
        player.rate = rate
        player.prepareToPlay()
        return player
    }

    /// Teil und Position darin zu einer Stelle im ganzen Entwurf.
    private func locate(_ time: TimeInterval) -> (Int, TimeInterval) {
        var position = 0
        while position + 1 < offsets.count, offsets[position + 1] <= time {
            position += 1
        }
        return (position, time - offsets[position])
    }

    private func startTicker() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(100))
                guard let self, self.tick() else { return }
            }
        }
    }

    /// Ein Schritt der Anzeige. false, sobald nicht mehr gespielt wird.
    private func tick() -> Bool {
        guard let current = player else { return false }
        if current.isPlaying {
            currentTime = offsets[index] + current.currentTime
            return true
        }
        // Teil zu Ende, aber nicht unterbrochen: mit dem nächsten Teil weiter.
        if current.currentTime >= current.duration - 0.05 {
            if index + 1 < segments.count, let next = makePlayer(index + 1) {
                index += 1
                player = next
                next.play()
                currentTime = offsets[index]
                return true
            }
            // Ganz zu Ende: zurück an den Anfang, Symbol zeigt wieder Abspielen.
            player = nil
            isPlaying = false
            currentTime = 0
            ticker = nil
            return false
        }
        // Unterbrochen, etwa durch einen Anruf: anhalten, Position bleibt.
        pause()
        return false
    }
}
