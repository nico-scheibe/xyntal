import AVFoundation
import Observation
import UIKit

/// Ein fertiger Versandentwurf: eine M4A-Datei, die beim Senden in den Versand geht.
struct VoiceDraft: Equatable {
    let url: URL
    let durationMs: Int
    /// Id, damit der Entwurf eindeutig bleibt.
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

/// Sprachaufnahme eines Gesprächs. Jede Aufnahme liegt als Teile auf der Platte. Eine Pause fügt nichts zusammen
/// und kodiert nichts neu. Zusammengefügt und kodiert wird einmal, beim Senden.
@MainActor
@Observable
final class VoiceRecorder {
    enum Phase: Equatable {
        case idle
        case recording
        case paused
    }

    private(set) var phase: Phase = .idle
    /// Gesamtlänge bisher in Sekunden. Summe der Teile, während der Aufnahme plus laufendes Teil.
    private(set) var elapsed: TimeInterval = 0
    /// Pegel der letzten Momente, 0...1, älteste zuerst. Nur während der Aufnahme gefüllt.
    private(set) var levels: [Double] = []
    /// Teile in Reihenfolge. Leer heißt: kein Entwurf.
    private(set) var segments: [VoiceSegment] = []
    /// Vorhören des Entwurfs, direkt aus den Teilen.
    let preview = VoiceDraftPlayer()
    private(set) var note: VoiceNote?
    private(set) var isMerging = false
    /// Meldung in der Leiste, z. B. Speicher voll.
    var errorText: String?

    private var recorder: AVAudioRecorder?
    private var currentURL: URL?
    /// Länge aller fertigen Teile in Sekunden.
    private var baseSeconds: TimeInterval = 0
    private var ticker: Task<Void, Never>?
    private var isStarting = false
    /// Der einmal zusammengefügte Entwurf zum Senden. Bleibt erhalten, bis sich die Teile ändern.
    private var sendDraft: VoiceDraft?
    /// Steigt bei Verwerfen und Ende. Laufende Zusammenfügungen merken das und räumen ihre Datei weg.
    private var generation = 0

    // MARK: - Starten und Pausieren

    /// Startet die Aufnahme oder setzt eine pausierte fort. Fragt beim ersten Mal nach dem Mikrofon.
    func startOrResume() async -> VoiceStart {
        guard phase != .recording, !isStarting, !isMerging else { return .started }
        isStarting = true
        defer { isStarting = false }
        preview.pause()
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
        elapsed = baseSeconds
        levels = []
        startTicker()
        UIAccessibility.post(notification: .announcement, argument: "Aufnahme gestartet")
        return .started
    }

    /// Hält die Aufnahme an und das Vorhören mit. Nichts wird zusammengefügt, der Entwurf bleibt.
    func pause(note reason: VoiceNote? = nil) {
        preview.pause()
        stopRecording(note: reason, announce: true)
    }

    // MARK: - Senden und Verwerfen

    /// Vor dem Senden: Aufnahme anhalten und die Teile einmal zu einer Datei zusammenfügen. nil, wenn das misslingt.
    /// Ein erneuter Aufruf ohne Änderung nimmt den fertigen Entwurf, ohne neu zu kodieren.
    func prepareSend() async -> VoiceDraft? {
        stopRecording(note: nil, announce: false)
        if let sendDraft { return sendDraft }
        guard !segments.isEmpty, !isMerging else { return nil }
        let target = AttachmentFiles.newFileURL(ext: VoiceRules.fileExtension)
        let inputs = segments.map(\.url)
        let gen = generation
        isMerging = true
        let seconds = try? await Self.join(inputs, into: target)
        guard gen == generation else {
            AttachmentFiles.remove(target)
            return nil
        }
        isMerging = false
        guard let seconds else {
            AttachmentFiles.remove(target)
            errorText = hasFreeSpace ? VoiceRules.failedText : VoiceRules.storageText
            return nil
        }
        let draft = VoiceDraft(url: target,
                               durationMs: Int((seconds * 1000).rounded()),
                               id: UUID().uuidString)
        sendDraft = draft
        return draft
    }

    /// Der Entwurf ist angenommen. Die Teile gehören nicht mehr dem Recorder. Die gesendete Datei
    /// gehört dem Versand, der sie danach löscht.
    func didSend(_ sent: VoiceDraft) {
        for segment in segments where segment.url != sent.url {
            AttachmentFiles.remove(segment.url)
        }
        sendDraft = nil
        reset(removingFiles: false)
    }

    /// Verwirft die Aufnahme. Alle Teile sind danach weg.
    func discard() {
        reset(removingFiles: true)
    }

    /// Holt eine abgebrochene Sprachnachricht zurück in den Entwurf. Nur, wenn gerade nichts läuft.
    func restore(url: URL, durationMs: Int) async -> Bool {
        let seconds = TimeInterval(durationMs) / 1000
        let buckets = await VoiceAudioAnalysis.rmsBuckets(of: url)
        guard phase == .idle else { return false }
        preview.pause()
        segments = [VoiceSegment(url: url, seconds: seconds, buckets: buckets)]
        preview.setSegments(segments)
        // Die zurückgeholte Datei ist schon zusammengefügt: nichts neu kodieren.
        sendDraft = VoiceDraft(url: url, durationMs: durationMs, id: UUID().uuidString)
        baseSeconds = seconds
        elapsed = seconds
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
        // Die Länge kommt aus dem Recorder selbst. Gelesen wird vor dem Stopp.
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
            invalidateSendDraft()
            let segment = VoiceSegment(url: url, seconds: length, buckets: nil)
            segments.append(segment)
            baseSeconds += length
            analyze(segment.id)
        } else {
            AttachmentFiles.remove(url)
        }
        elapsed = baseSeconds
        preview.setSegments(segments)
        guard !segments.isEmpty else {
            phase = .idle
            return
        }
        phase = .paused
        if announce {
            UIAccessibility.post(notification: .announcement,
                                 argument: VoiceRules.pausedAnnouncement(seconds: Int(baseSeconds)))
        }
    }

    /// Lautstärke des neuen Teils im Hintergrund auswerten. Die Wellenform steht danach da.
    private func analyze(_ id: UUID) {
        guard let url = segments.first(where: { $0.id == id })?.url else { return }
        let gen = generation
        Task { [weak self] in
            let buckets = await VoiceAudioAnalysis.rmsBuckets(of: url)
            guard let self, gen == self.generation,
                  let index = self.segments.firstIndex(where: { $0.id == id }) else { return }
            // Ließ sich nichts auswerten, bleibt eine gleichmäßige Linie statt einer leeren Anzeige.
            let fallback = Array(repeating: 0.5, count: Int(self.segments[index].seconds / VoiceAudioAnalysis.bucketSeconds))
            self.segments[index].buckets = buckets ?? fallback
            self.preview.setSegments(self.segments)
        }
    }

    /// Ein fertig zusammengefügter Entwurf passt nicht mehr, wenn sich die Teile ändern.
    private func invalidateSendDraft() {
        guard let draft = sendDraft else { return }
        sendDraft = nil
        if !segments.contains(where: { $0.url == draft.url }) {
            AttachmentFiles.remove(draft.url)
        }
    }

    private func reset(removingFiles: Bool) {
        generation += 1
        ticker?.cancel()
        ticker = nil
        recorder?.stop()
        recorder = nil
        if let currentURL {
            AttachmentFiles.remove(currentURL)
        }
        currentURL = nil
        preview.pause()
        if removingFiles {
            segments.forEach { AttachmentFiles.remove($0.url) }
            if let sendDraft { AttachmentFiles.remove(sendDraft.url) }
        }
        sendDraft = nil
        segments = []
        preview.setSegments([])
        baseSeconds = 0
        elapsed = 0
        levels = []
        note = nil
        errorText = nil
        isMerging = false
        phase = .idle
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
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

    /// Fügt die Teile hintereinander in eine M4A-Datei. Einmal beim Senden. Gibt die Länge in Sekunden zurück.
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
}
