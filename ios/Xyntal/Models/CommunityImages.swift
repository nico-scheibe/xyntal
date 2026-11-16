import CoreGraphics
import Foundation
import ImageIO

// Logo und Banner einer Community: Foto vorbereiten, bevor es an den Server geht. Ohne UI und ohne Netz.

/// Welches Bild der Community gesetzt wird.
enum CommunityImageKind: Equatable {
    case logo
    case banner
}

/// Fehler beim Setzen oder Entfernen von Logo oder Banner. Jeder Fall hat einen Text für den Abschnitt im Blatt.
enum CommunityImageError: Error, Equatable {
    /// Das Foto lässt sich nicht als Bild lesen.
    case badFormat
    /// Auch nach Verkleinern und stärkstem Komprimieren passt es nicht unter die Serverobergrenze.
    case tooLarge
    /// 403: du bist nicht Eigentümer. Die App lädt danach die Rechte neu.
    case forbidden
    /// Keine Verbindung zum Server.
    case network
    /// Alles andere. Unbekannte Fehler bekommen keinen Servertext, sondern diesen.
    case failed

    /// Initiale Zuordnung eines Fehlers aus dem Netz- oder Vorbereitungsweg.
    static func from(_ error: Error) -> CommunityImageError {
        if let imageError = error as? CommunityImageError { return imageError }
        switch error as? AppError {
        case .stale?:
            return .forbidden
        case .network?:
            return .network
        case .message(let text)?:
            return text == tooLargeText ? .tooLarge : .failed
        default:
            return .failed
        }
    }

    static let tooLargeText = "Das Bild ist zu groß. Wähle ein kleineres."
    static let badFormatText = "Dieses Format geht nicht. Nimm ein Foto als JPEG oder PNG."
    static let forbiddenText = "Nur die Eigentümerin oder der Eigentümer darf das ändern."
    static let networkText = "Keine Verbindung. Prüfe dein Netz und versuche es noch einmal."
    static let failedText = "Das hat nicht geklappt. Versuche es noch einmal."
    static let removeFailedText = "Entfernen hat nicht geklappt. Versuche es noch einmal."

    /// Text unter dem Abschnitt. Beim Entfernen gibt es für Netz- und sonstige Fehler einen eigenen Text.
    func text(removing: Bool) -> String {
        switch self {
        case .badFormat: return Self.badFormatText
        case .tooLarge: return Self.tooLargeText
        case .forbidden: return Self.forbiddenText
        case .network: return removing ? Self.removeFailedText : Self.networkText
        case .failed: return removing ? Self.removeFailedText : Self.failedText
        }
    }
}

/// Bereitet ein Foto für Logo oder Banner vor: mittig auf das Zielverhältnis zuschneiden, verkleinern, als JPEG
/// ohne Metadaten kodieren und die Länge der fertigen data-URL messen, bevor sie gesendet wird.
enum CommunityImagePreparation {
    /// Längste Kante, mit der ImageIO die Quelle zum Zuschneiden liest. Gleich der Obergrenze für Chat-Fotos.
    static let sourceMaxEdge = AttachmentFiles.maxImageEdge
    /// Qualität: Die Suche beginnt bei 0,85 und geht nie unter 0,3. Gemessen mit echter Kodierung auf dem Mac:
    /// Fotos landen alle bei 0,85, also ohne Absenkung. Die fertige Zeichenkette belegt dabei beim Logo 24 bis 39 %
    /// und beim Banner 11 bis 14 % der Grenze. Das schwerste Testbild (reines Rauschen, nicht typisch) landet bei
    /// 79 % (Logo) und 72 % (Banner). Die Absenkung ist also für Ausnahmen da, nicht für den Normalfall.
    static let qualityCeiling = 0.85
    static let qualityFloor = 0.3
    /// Anteil der Serverobergrenze, den die fertige Zeichenkette höchstens belegt. Der Rest ist Abstand.
    static let budgetShare = 0.95

    /// Ergebnis mit den Werten, die man beim Prüfen braucht.
    struct Prepared {
        let dataURL: String
        let quality: Double
        let width: Int
        let height: Int
        /// Länge der fertigen Zeichenkette in Zeichen (die data-URL ist reines ASCII).
        var length: Int { dataURL.utf8.count }
    }

    private struct Spec {
        /// Breite geteilt durch Höhe.
        let ratio: CGFloat
        /// Zielbreite in Pixeln. Kleinere Quellen werden nicht hochgerechnet.
        let width: Int
        /// Untergrenze der Breite, falls die Qualität allein nicht reicht.
        let minWidth: Int
        /// Obergrenze des Servers in Zeichen der fertigen data-URL.
        let serverLimit: Int
    }

    /// Logo: 512 × 512 px. Angezeigt wird es höchstens mit 64 pt; bei 3-fachem Scale sind das 192 px, 512 lässt Luft.
    /// Banner: 1.200 × 400 px. Die Breite ist die volle Zeilenbreite auf dem größten iPhone (rund 400 pt) mal 3.
    /// Die Untergrenzen (256 bzw. 600 px) gelten nur, wenn selbst die niedrigste Qualität nicht reicht.
    private static func spec(for kind: CommunityImageKind) -> Spec {
        switch kind {
        case .logo: return Spec(ratio: 1, width: 512, minWidth: 256, serverLimit: 200_000)
        case .banner: return Spec(ratio: 3, width: 1_200, minWidth: 600, serverLimit: 600_000)
        }
    }

    private static let prefix = "data:image/jpeg;base64,"

    /// Die fertige data-URL für den Server. Wirft CommunityImageError.badFormat oder .tooLarge.
    static func dataURL(from data: Data, kind: CommunityImageKind) throws -> String {
        try prepare(from: data, kind: kind).dataURL
    }

    /// Wie dataURL, gibt aber auch Qualität, Maße und Länge zurück.
    static func prepare(from data: Data, kind: CommunityImageKind) throws -> Prepared {
        let spec = spec(for: kind)
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0 else { throw CommunityImageError.badFormat }
        // Der Thumbnail-Weg dreht nach der Ausrichtung (EXIF) und liest das Foto nur so groß, wie es gebraucht wird.
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: sourceMaxEdge
        ]
        guard let full = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw CommunityImageError.badFormat
        }
        let cropped = centerCrop(full, ratio: spec.ratio)
        let budget = Int(Double(spec.serverLimit) * budgetShare)

        var width = min(spec.width, cropped.width)
        while true {
            let height = max(1, Int((CGFloat(width) / spec.ratio).rounded()))
            if let image = render(cropped, width: width, height: height),
               let fitting = fittingJPEG(image, budget: budget) {
                return Prepared(dataURL: fitting.dataURL, quality: fitting.quality, width: width, height: height)
            }
            guard width > spec.minWidth else { break }
            // Um 20 % kleiner, nie unter die Untergrenze.
            width = max(spec.minWidth, Int(Double(width) * 0.8))
        }
        throw CommunityImageError.tooLarge
    }

    /// Schneidet mittig auf das Verhältnis zu. Das Bild bleibt, wie es ist, wenn es schon passt.
    private static func centerCrop(_ image: CGImage, ratio: CGFloat) -> CGImage {
        let w = CGFloat(image.width)
        let h = CGFloat(image.height)
        let rect: CGRect
        if w / h > ratio {
            let cropWidth = (h * ratio).rounded(.down)
            rect = CGRect(x: ((w - cropWidth) / 2).rounded(.down), y: 0, width: cropWidth, height: h)
        } else {
            let cropHeight = (w / ratio).rounded(.down)
            rect = CGRect(x: 0, y: ((h - cropHeight) / 2).rounded(.down), width: w, height: cropHeight)
        }
        return image.cropping(to: rect) ?? image
    }

    /// Zeichnet auf eine weiße Fläche in der Zielgröße. Weiß statt Schwarz, falls das Foto transparente Ränder hat.
    private static func render(_ image: CGImage, width: Int, height: Int) -> CGImage? {
        guard let context = CGContext(data: nil,
                                      width: width,
                                      height: height,
                                      bitsPerComponent: 8,
                                      bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        context.setFillColor(gray: 1, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.interpolationQuality = .high
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return context.makeImage()
    }

    /// Die höchste Qualität, deren fertige Zeichenkette in das Budget passt. Erst oben prüfen, sonst binär suchen.
    /// nil, wenn selbst der Boden zu groß ist.
    private static func fittingJPEG(_ image: CGImage, budget: Int) -> (dataURL: String, quality: Double)? {
        func encode(_ quality: Double) -> String? {
            guard let jpeg = AttachmentFiles.jpegData(image, quality: quality) else { return nil }
            return prefix + jpeg.base64EncodedString()
        }

        if let top = encode(qualityCeiling), top.utf8.count <= budget {
            return (top, qualityCeiling)
        }
        guard let lowest = encode(qualityFloor), lowest.utf8.count <= budget else { return nil }

        var best = (dataURL: lowest, quality: qualityFloor)
        var low = qualityFloor
        var high = qualityCeiling
        // Sieben Schritte reichen: Die Spanne 0,3 bis 0,85 wird auf etwa 0,004 genau eingegrenzt.
        for _ in 0..<7 {
            let middle = (low + high) / 2
            guard let candidate = encode(middle) else { break }
            if candidate.utf8.count <= budget {
                best = (candidate, middle)
                low = middle
            } else {
                high = middle
            }
        }
        return best
    }
}
