import AVFoundation
import Observation
import UIKit

/// Ein fertiger Entwurf: eine M4A-Datei, die beim Senden in den Versand geht.
struct VoiceDraft: Equatable {
    let url: URL
    let durationMs: Int
    /// Id für Wellenform-Cache und Vorhören.
    let id: String
}

/// Ergebnis des Startens oder Fortsetzens.
enum VoiceStart: Equatable {
    case started
    case micDenied
    case failed
}

private enum VoiceError: Error {
    case failed
}

/// Sprachaufnahme eines Gesprächs. Nimmt nur auf, solange sie läuft. Eine Pause hält die Aufnahme als Entwurf,
/// der beim Weiteraufnehmen verlängert wird. Gesendet wird nur auf ausdrücklichen Befehl.
@MainActor
@Observable
final class VoiceRecorder {
    enum Phase: Equatable {
        case idle
        case recording
        case paused
    }

    private(set) var phase: Phase = .idle
    /// Gesamtlänge bisher in Sekunden. Läuft während der Aufnahme mit.
    private(set) var elapsed: TimeInterval = 0
    /// Pegel der letzten Momente, 0...1, älteste zuerst. Nur während der Aufnahme gefüllt.
    private(set) var levels: [Double] = []
    /// Entwurf, sobald die Teile zusammengefügt sind. nil, solange das noch läuft.
    private(set) var draft: VoiceDraft?
    /// Vorhören des Entwurfs.
    private(set) var preview: VoicePlayer?
    private(set) var note: VoiceNote?
    private(set) var isMerging = false
    /// Meldung in der Leiste, z. B. Speicher voll.
    var errorText: String?

    private var recorder: AVAudioRecorder?
    private var currentURL: URL?
    /// Fertige Teile in Reihenfolge. Nach dem Zusammenfügen liegt nur noch eine Datei darin.
    private var segments: [URL] = []
    /// Länge aller fertigen Teile in Sekunden.
    private var baseSeconds: TimeInterval = 0
    private var ticker: Task<Void, Never>?
    private var merging: Task<Void, Never>?
    private var isStarting = false
    /// Steigt bei Verwerfen. Ein laufendes Zusammenfügen merkt das und räumt seine Datei weg.
    private var generation = 0

    // MARK: - Starten und Pausieren

    /// Startet die Aufnahme oder setzt eine pausierte fort. Fragt beim ersten Mal nach dem Mikrofon.
    func startOrResume() async -> VoiceStart {
        guard phase != .recording, !isStarting else { return .started }
        isStarting = true
        defer { isStarting = false }
        preview?.pause()
        await merging?.value
        guard await Self.microphoneAllowed() else { return .micDenied }
        guard hasFreeSpace else {
            errorText = VoiceRules.storageText
            return .failed
        }

        let url = AttachmentFiles.newFileURL(ext: VoiceRules.fileExtension)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
            try session.setActive(true)
            let rec = try AVAudioRecorder(url: url, settings: VoiceRules.recordingSettings)
            rec.isMeteringEnabled = true
            guard rec.prepareToRecord(), rec.record() else { throw VoiceError.failed }
            recorder = rec
            currentURL = url
        } catch {
            AttachmentFiles.remove(url)
            errorText = VoiceRules.failedText
            return .failed
        }

        phase = .recording
        errorText = nil
        note = nil
        draft = nil
        preview = nil
        elapsed = baseSeconds
        levels = []
        startTicker()
        UIAccessibility.post(notification: .announcement, argument: "Aufnahme gestartet")
        return .started
    }

    /// Hält die Aufnahme an und das Vorhören mit. Der Entwurf bleibt erhalten, gesendet wird nichts.
    func pause(note reason: VoiceNote? = nil) {
        preview?.pause()
        stopRecording(note: reason, announce: true)
    }

    // MARK: - Senden und Verwerfen

    /// Vor dem Senden: Aufnahme anhalten und den Entwurf fertigstellen. nil, wenn das misslingt.
    func prepareSend() async -> VoiceDraft? {
        stopRecording(note: nil, announce: false)
        await merging?.value
        if draft == nil, !segments.isEmpty {
            scheduleMerge()
            await merging?.value
        }
        return draft
    }

    /// Der Entwurf ist angenommen. Die Datei gehört jetzt dem Versand, der sie danach löscht.
    func didSend() {
        reset(removingFiles: false)
    }

    /// Verwirft die Aufnahme. Alle Teile sind danach weg.
    func discard() {
        reset(removingFiles: true)
    }

    /// Holt eine abgebrochene Sprachnachricht zurück in den Entwurf. Nur, wenn gerade nichts läuft.
    func restore(url: URL, durationMs: Int) async -> Bool {
        let id = UUID().uuidString
        let bars = await Self.analyze(url)
        guard phase == .idle else { return false }
        if let bars {
            WaveformCache.shared.store(bars, for: id)
        }
        segments = [url]
        baseSeconds = TimeInterval(durationMs) / 1000
        elapsed = baseSeconds
        draft = VoiceDraft(url: url, durationMs: durationMs, id: id)
        preview = VoicePlayer(attachmentId: id, durationMs: durationMs)
        note = nil
        errorText = nil
        phase = .paused
        return true
    }

    /// Die App ist wieder vorn. Nach einer Unterbrechung steht dann da, dass die Aufnahme noch da ist.
    func appBecameActive() {
        if note == .interrupted {
            note = .returned
        }
    }

    // MARK: - Intern

    private func stopRecording(note reason: VoiceNote?, announce: Bool) {
        guard phase == .recording, let rec = recorder, let url = currentURL else { return }
        let length = rec.currentTime
        rec.stop()
        recorder = nil
        currentURL = nil
        ticker?.cancel()
        ticker = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        levels = []
        note = reason
        if length >= 0.2 {
            segments.append(url)
            baseSeconds += length
        } else {
            AttachmentFiles.remove(url)
        }
        elapsed = baseSeconds
        guard !segments.isEmpty else {
            phase = .idle
            return
        }
        phase = .paused
        if announce {
            UIAccessibility.post(notification: .announcement,
                                 argument: VoiceRules.pausedAnnouncement(seconds: Int(baseSeconds)))
        }
        scheduleMerge()
    }

    /// Fügt alle Teile zu einer Datei zusammen, im Hintergrund. Danach gibt es einen Entwurf mit Vorhören.
    private func scheduleMerge() {
        let inputs = segments
        let target = AttachmentFiles.newFileURL(ext: VoiceRules.fileExtension)
        let gen = generation
        isMerging = true
        merging = Task { [weak self] in
            let seconds = try? await Self.join(inputs, into: target)
            var bars: [Double]?
            if seconds != nil {
                bars = await Self.analyze(target)
            }
            guard let self, gen == self.generation else {
                AttachmentFiles.remove(target)
                return
            }
            self.isMerging = false
            self.merging = nil
            guard let seconds else {
                AttachmentFiles.remove(target)
                self.errorText = self.hasFreeSpace ? VoiceRules.failedText : VoiceRules.storageText
                return
            }
            inputs.forEach { AttachmentFiles.remove($0) }
            let id = UUID().uuidString
            let ms = Int((seconds * 1000).rounded())
            self.segments = [target]
            self.baseSeconds = seconds
            self.elapsed = seconds
            if let bars {
                WaveformCache.shared.store(bars, for: id)
            }
            self.draft = VoiceDraft(url: target, durationMs: ms, id: id)
            self.preview = VoicePlayer(attachmentId: id, durationMs: ms)
        }
    }

    private func reset(removingFiles: Bool) {
        generation += 1
        merging = nil
        isMerging = false
        ticker?.cancel()
        ticker = nil
        recorder?.stop()
        recorder = nil
        if let currentURL {
            AttachmentFiles.remove(currentURL)
        }
        currentURL = nil
        preview?.pause()
        if removingFiles {
            segments.forEach { AttachmentFiles.remove($0) }
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        segments = []
        baseSeconds = 0
        elapsed = 0
        levels = []
        draft = nil
        preview = nil
        note = nil
        errorText = nil
        phase = .idle
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

    /// Ein Schritt der Anzeige. false, sobald die Aufnahme nicht mehr läuft.
    private func tick() -> Bool {
        guard phase == .recording, let rec = recorder else { return false }
        guard rec.isRecording else {
            // Vom System gestoppt, etwa bei vollem Speicher. Was schon aufgenommen ist, bleibt erhalten.
            stopRecording(note: nil, announce: true)
            errorText = hasFreeSpace ? VoiceRules.failedText : VoiceRules.storageText
            return false
        }
        rec.updateMeters()
        elapsed = baseSeconds + rec.currentTime
        levels.append(VoiceRules.level(fromDecibels: rec.averagePower(forChannel: 0)))
        if levels.count > VoiceRules.levelCount {
            levels.removeFirst(levels.count - VoiceRules.levelCount)
        }
        if elapsed >= VoiceRules.maxSeconds {
            stopRecording(note: .maxReached, announce: true)
            return false
        }
        return true
    }

    private var hasFreeSpace: Bool {
        let free = try? FileManager.default.temporaryDirectory
            .resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            .volumeAvailableCapacityForImportantUsage
        return (free ?? VoiceRules.minFreeBytes) >= VoiceRules.minFreeBytes
    }

    private static func microphoneAllowed() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return true
        case .denied: return false
        case .undetermined: return await AVAudioApplication.requestRecordPermission()
        @unknown default: return false
        }
    }

    /// Fügt die Teile hintereinander in eine M4A-Datei. Gibt die Länge in Sekunden zurück.
    nonisolated private static func join(_ inputs: [URL], into target: URL) async throws -> TimeInterval {
        let composition = AVMutableComposition()
        guard let track = composition.addMutableTrack(withMediaType: .audio,
                                                      preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw VoiceError.failed
        }
        var cursor = CMTime.zero
        for url in inputs {
            let asset = AVURLAsset(url: url)
            let length = try await asset.load(.duration)
            guard let source = try await asset.loadTracks(withMediaType: .audio).first else {
                throw VoiceError.failed
            }
            try track.insertTimeRange(CMTimeRange(start: .zero, duration: length), of: source, at: cursor)
            cursor = cursor + length
        }
        guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetAppleM4A) else {
            throw VoiceError.failed
        }
        export.outputURL = target
        export.outputFileType = .m4a
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            export.exportAsynchronously {
                if export.status == .completed {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: export.error ?? VoiceError.failed)
                }
            }
        }
        return cursor.seconds
    }

    /// Wellenform der Datei, im Hintergrund. nil, wenn sie sich nicht lesen lässt.
    nonisolated private static func analyze(_ url: URL) async -> [Double]? {
        await Task.detached(priority: .utility) {
            guard let data = try? Data(contentsOf: url) else { return nil }
            return Waveform.bars(fromAudioData: data, id: url.deletingPathExtension().lastPathComponent)
        }.value
    }
}
