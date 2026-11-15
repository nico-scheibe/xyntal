import Foundation
import UniformTypeIdentifiers

/// Regeln für Anhänge im Chat: erlaubte Typen, Anzahl, Symbole und Meldungstexte. Ohne UI, daher testbar.
enum AttachmentRules {
    /// Höchstens so viele Anhänge pro Nachricht. Der Server nimmt nicht mehr an.
    static let maxPerMessage = 10
    /// Ab so vielen Anhängen zeigt die Leiste den Zähler "8 von 10".
    static let counterFrom = 8

    enum Kind: Equatable {
        case image
        case video
        case document
    }

    private static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "heic", "heif", "gif", "webp"]
    private static let videoExtensions: Set<String> = ["mov", "mp4", "m4v"]
    private static let documentExtensions: Set<String> = [
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "txt", "md", "csv", "rtf",
    ]

    /// Art einer Datei nach Endung. nil heißt: nicht erlaubt.
    static func kind(forName name: String) -> Kind? {
        let ext = MediaFormat.fileExtension(name)
        if imageExtensions.contains(ext) { return .image }
        if videoExtensions.contains(ext) { return .video }
        if documentExtensions.contains(ext) { return .document }
        return nil
    }

    /// MIME-Typ für den Server. Unbekannte Endungen gelten als Binärdaten.
    static func mimeType(forName name: String) -> String {
        UTType(filenameExtension: MediaFormat.fileExtension(name))?.preferredMIMEType ?? "application/octet-stream"
    }

    /// Symbol für eine Dateikachel. Gleiche Symbole wie im Verlauf, nur nach Endung statt nach Anhang.
    static func symbol(forName name: String) -> String {
        switch MediaFormat.fileExtension(name) {
        case "pdf": return "doc.richtext"
        case "txt", "md", "rtf": return "doc.text"
        case "xls", "xlsx", "csv": return "tablecells"
        case "ppt", "pptx": return "rectangle.on.rectangle"
        case "zip": return "doc.zipper"
        case "mov", "mp4", "m4v": return "film"
        default: return "doc"
        }
    }

    // MARK: - Grenzen

    /// Tarifgrenze in der Schreibweise des Servers: ganze MB oder GB, z. B. "10 MB", "5 GB".
    static func limitText(_ bytes: Int) -> String {
        let mib = 1024.0 * 1024.0
        let gib = 1024.0 * mib
        if Double(bytes) >= gib {
            return "\(Int((Double(bytes) / gib).rounded())) GB"
        }
        return "\(Int((Double(bytes) / mib).rounded())) MB"
    }

    // MARK: - Meldungen (wörtlich nach Vorgabe)

    static let offlineText = "Du bist offline. Verbinde dich mit dem Internet und sende dann noch mal."
    static let uploadFailedText = "Senden fehlgeschlagen. Prüfe deine Verbindung und versuch es noch mal."
    static let videoPreparationFailedText = "Dieses Video lässt sich gerade nicht vorbereiten. Versuch es noch mal."
    static let tooManyText = "Du kannst bis zu 10 Anhänge pro Nachricht senden."
    static let cameraDeniedTitle = "Kamera ist aus"
    static let cameraDeniedText = "Xyntal braucht die Kamera für Fotos. Du kannst sie in den Einstellungen erlauben."

    static func unsupportedText(name: String) -> String {
        "„\(name)“ wird nicht unterstützt. Erlaubt sind Bilder, Videos, PDF, Word, Excel, PowerPoint, ZIP und Text."
    }

    static func tooLargeText(name: String, limit: Int?) -> String {
        if let limit {
            return "„\(name)“ ist zu groß. In deinem Tarif sind bis zu \(limitText(limit)) pro Datei möglich."
        }
        return "„\(name)“ ist zu groß. Dein Tarif erlaubt keine so große Datei."
    }

    static func storageFullText(limit: Int?) -> String {
        if let limit {
            return "Dein Speicher ist voll. In deinem Tarif sind \(limitText(limit)) insgesamt möglich."
        }
        return "Dein Speicher ist voll."
    }
}
