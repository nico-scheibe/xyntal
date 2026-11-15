import AVFoundation
import Foundation

/// Hinweis unter der Aufnahmeleiste.
enum VoiceNote: Equatable {
    /// Anruf, Siri, Wecker, Kopfhörer abgezogen, App im Hintergrund.
    case interrupted
    /// Die App ist wieder vorn, die Aufnahme ist da.
    case returned
    /// 15 Minuten erreicht.
    case maxReached
}

/// Regeln für Sprachnachrichten: Grenzen, Aufnahmeformat, Anzeige und Meldungstexte. Ohne UI, daher prüfbar.
enum VoiceRules {
    /// Längste Aufnahme. Bei dieser Länge stoppt die Aufnahme. Sie sendet nicht von selbst.
    static let maxSeconds: TimeInterval = 15 * 60
    /// Ab hier wird die Zeit orange und zeigt die Restzeit.
    static let warnSeconds: TimeInterval = 14 * 60
    /// Darunter ist Senden ausgegraut.
    static let minSeconds: TimeInterval = 1
    /// Darunter löscht der Papierkorb sofort, ohne Rückfrage.
    static let quickDiscardSeconds: TimeInterval = 10
    /// Freier Speicher, der mindestens da sein muss, damit eine Aufnahme startet.
    static let minFreeBytes: Int64 = 50 * 1024 * 1024
    /// Anzahl der Pegelbalken in der Aufnahmeleiste.
    static let levelCount = 30

    static let mimeType = "audio/mp4"
    static let fileExtension = "m4a"
    /// Name der Datei, wie sie beim Server ankommt.
    static let fileName = "Sprachnachricht.m4a"

    /// M4A/AAC, mono, 44,1 kHz. Spielt überall, und AVAudioPlayer kann es lesen.
    static let recordingSettings: [String: Any] = [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: 44_100,
        AVNumberOfChannelsKey: 1,
        AVEncoderBitRateKey: 64_000,
        AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
    ]

    static func canSend(seconds: TimeInterval) -> Bool {
        seconds >= minSeconds
    }

    static func isWarning(_ elapsed: TimeInterval) -> Bool {
        elapsed >= warnSeconds
    }

    /// Anzeige der Zeit. Ab 14:00 die Restzeit, aufgerundet, damit bei 14:00 "Noch 1:00" steht.
    static func timeText(elapsed: TimeInterval) -> String {
        if isWarning(elapsed) {
            let remaining = max(0, maxSeconds - elapsed).rounded(.up)
            return "Noch " + MediaFormat.clock(remaining)
        }
        return MediaFormat.clock(elapsed)
    }

    /// Pegel aus Dezibel (etwa -50 ... 0) auf 0...1.
    static func level(fromDecibels db: Float) -> Double {
        min(1, max(0, Double(db + 50) / 50))
    }

    // MARK: - Texte (wörtlich nach Vorgabe)

    static let deniedTitle = "Mikrofon ist aus"
    static let deniedText = "Xyntal braucht das Mikrofon für Sprachnachrichten. Du kannst es in den Einstellungen erlauben."
    static let failedText = "Aufnahme fehlgeschlagen. Versuch es noch mal."
    static let storageText = "Auf deinem iPhone ist zu wenig Speicher frei."
    static let discardTitle = "Aufnahme verwerfen?"
    static let discardLabel = "Verwerfen"
    static let resumeLabel = "Weiter aufnehmen"
    static let pausedLabel = "Pausiert"

    static func noteText(_ note: VoiceNote) -> String {
        switch note {
        case .interrupted: return "Aufnahme pausiert, weil etwas dazwischengekommen ist."
        case .returned: return "Deine Aufnahme ist noch da."
        case .maxReached: return "Maximale Länge erreicht: 15 Minuten."
        }
    }

    /// Ansage beim Pausieren, z. B. "Aufnahme pausiert, 7 Sekunden".
    static func pausedAnnouncement(seconds: Int) -> String {
        "Aufnahme pausiert, \(seconds) \(seconds == 1 ? "Sekunde" : "Sekunden")"
    }
}
