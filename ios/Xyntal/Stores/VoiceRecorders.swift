import AVFoundation
import Foundation

/// Die Sprachaufnahmen, je Gespräch eine. Ein Entwurf bleibt je Gespräch erhalten, solange die App läuft.
/// Beobachtet Unterbrechungen (Anruf, Siri, Kopfhörer abgezogen): Dann pausiert jede laufende Aufnahme.
@MainActor
final class VoiceRecorders {
    static let shared = VoiceRecorders()

    private var byConversation: [String: VoiceRecorder] = [:]

    private init() {
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
            MainActor.assumeIsolated { VoiceRecorders.shared.pauseAll(note: .interrupted) }
        }
        center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
            MainActor.assumeIsolated { VoiceRecorders.shared.pauseAll(note: .interrupted) }
        }
    }

    /// Die Aufnahme dieses Gesprächs. Dieselbe Instanz bei jedem Aufruf.
    func recorder(for conversationId: String) -> VoiceRecorder {
        if let existing = byConversation[conversationId] {
            return existing
        }
        let created = VoiceRecorder()
        byConversation[conversationId] = created
        return created
    }

    /// Hält jede laufende Aufnahme an und pausiert jedes Vorhören. Gesendet wird nichts.
    func pauseAll(note: VoiceNote? = nil) {
        for recorder in byConversation.values {
            recorder.pause(note: note)
        }
    }

    /// Die App ist wieder aktiv.
    func appBecameActive() {
        for recorder in byConversation.values {
            recorder.appBecameActive()
        }
    }
}
