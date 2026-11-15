import Foundation
import CoreGraphics

/// Reine Hilfen für Anhänge und GIFs: Texte, Symbole, Größen. Ohne UI, daher ohne Views testbar.
enum MediaFormat {
    /// Dauer als m:ss (z. B. "0:42", "12:05"). Leer, wenn der Server keine Dauer schickt.
    static func duration(ms: Int?) -> String {
        guard let ms, ms > 0 else { return "" }
        return clock(TimeInterval(ms) / 1000)
    }

    /// Sekunden als m:ss, abgerundet.
    static func clock(_ seconds: TimeInterval) -> String {
        let total = max(Int(seconds), 0)
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    /// Dateigröße in der Schreibweise des Geräts, z. B. "2,4 MB".
    static func size(_ bytes: Int?) -> String? {
        guard let bytes, bytes >= 0 else { return nil }
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    /// Dateigröße zum Vorlesen, z. B. "2,4 Megabyte".
    static func spokenSize(_ bytes: Int?) -> String? {
        guard let bytes, bytes >= 0 else { return nil }
        let unit: UnitInformationStorage
        if bytes >= 1_000_000_000 {
            unit = .gigabytes
        } else if bytes >= 1_000_000 {
            unit = .megabytes
        } else {
            unit = .kilobytes
        }
        let measurement = Measurement(value: Double(bytes), unit: UnitInformationStorage.bytes).converted(to: unit)
        let formatter = MeasurementFormatter()
        formatter.unitStyle = .long
        formatter.unitOptions = .providedUnit
        formatter.numberFormatter.maximumFractionDigits = 1
        return formatter.string(from: measurement)
    }

    /// Dateityp als Kürzel für Anzeige und Vorlesen, z. B. "PDF". "Datei", wenn es keine Endung gibt.
    static func typeLabel(for attachment: Attachment) -> String {
        let ext = fileExtension(attachment.name)
        return ext.isEmpty ? "Datei" : ext.uppercased()
    }

    /// Symbol für den Dateityp. Erst die Endung, dann der MIME-Typ, sonst ein allgemeines Dokument.
    static func fileSymbol(for attachment: Attachment) -> String {
        let ext = fileExtension(attachment.name)
        switch ext {
        case "pdf": return "doc.richtext"
        case "txt", "md", "rtf": return "doc.text"
        case "xls", "xlsx", "numbers", "csv": return "tablecells"
        case "ppt", "pptx", "key": return "rectangle.on.rectangle"
        case "zip", "rar", "7z", "gz", "tar": return "doc.zipper"
        case "mp4", "mov", "m4v", "webm", "avi", "mkv": return "film"
        case "mp3", "m4a", "wav", "aac", "ogg", "flac", "opus": return "waveform"
        default: break
        }
        let mime = attachment.mimeType?.lowercased() ?? ""
        if mime == "application/pdf" { return "doc.richtext" }
        if mime.hasPrefix("text/") { return "doc.text" }
        if mime.hasPrefix("video/") { return "film" }
        if mime.hasPrefix("audio/") { return "waveform" }
        return "doc"
    }

    /// Kleingeschriebene Endung ohne Punkt, leer wenn keine da ist.
    static func fileExtension(_ name: String?) -> String {
        guard let name, let dot = name.lastIndex(of: "."), dot != name.startIndex else { return "" }
        return String(name[name.index(after: dot)...]).lowercased()
    }

    /// Kürzt einen Dateinamen in der Mitte, damit die Endung sichtbar bleibt: "Angebots-…-final.pdf".
    /// Kürzt nur, wenn der Name länger als `limit` Zeichen ist.
    static func middleTruncated(_ name: String, limit: Int) -> String {
        guard name.count > limit, limit > 3 else { return name }
        let ext = fileExtension(name)
        let suffix = ext.isEmpty ? "" : "." + ext
        // Endung höchstens halb so lang wie das Limit, sonst kürzt man am Ende statt in der Mitte.
        guard suffix.count < limit / 2 else {
            return String(name.prefix(limit - 1)) + "…"
        }
        let keepFront = (limit - 1 - suffix.count) / 2
        let keepBack = limit - 1 - keepFront - suffix.count
        let stem = String(name.dropLast(suffix.count))
        let front = String(stem.prefix(keepFront))
        let back = String(stem.suffix(keepBack))
        return front + "…" + back + suffix
    }

    /// Größe eines Bildes in der Bubble: so breit wie möglich bis `maxWidth`, höchstens `maxHeight` hoch,
    /// Seitenverhältnis erhalten. Ohne bekannte Maße gilt 4:3.
    static func fittedSize(width: Int?, height: Int?, maxWidth: CGFloat = 240, maxHeight: CGFloat = 320) -> CGSize {
        let ratio: CGFloat
        if let width, let height, width > 0, height > 0 {
            ratio = CGFloat(width) / CGFloat(height)
        } else {
            ratio = 4.0 / 3.0
        }
        let w = min(maxWidth, maxHeight * ratio)
        return CGSize(width: w, height: w / ratio)
    }
}
