import CryptoKit
import ImageIO
import SwiftUI

/// Zeile mit Titel und Wert. Wird nicht angezeigt, wenn der Wert leer ist.
struct DetailRow: View {
    let title: String
    let value: String?

    var body: some View {
        if let value = value.nonEmptyText {
            LabeledContent {
                Text(value)
            } label: {
                Text(title)
            }
        }
    }
}

/// Hinweis, wenn ein Neuladen fehlschlägt. Die bisherige Liste bleibt darunter stehen.
struct ReloadErrorBanner: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.red)
            // Eigenständiger Knopf, kein Fließtext: Akzent als Text, aber auf 4,5:1 abgesichert (Theme.accentText).
            Button("Erneut versuchen", action: retry)
                .foregroundStyle(Theme.accentText)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.regularMaterial)
    }
}

/// Verifizierungs-Haken neben dem Namen.
struct VerifiedBadge: View {
    var body: some View {
        Image(systemName: "checkmark.seal.fill")
            .foregroundStyle(.tint)
            .accessibilityLabel("Verifiziert")
    }
}

/// Hauptaktion eines Formulars: volle Breite, zeigt während der Arbeit einen Spinner statt des Titels.
/// Solange isBusy gilt, ist der Button deaktiviert; weitere Bedingungen hängt der Aufrufer per .disabled an.
struct PrimaryButton: View {
    let title: String
    let isBusy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Spacer()
                if isBusy {
                    ProgressView()
                } else {
                    Text(title)
                        .fontWeight(.semibold)
                }
                Spacer()
            }
        }
        .disabled(isBusy)
        .accessibilityLabel(title)
    }
}

/// Form des Avatars: Kreis für Personen, abgerundetes Quadrat für Gruppen und Communitys.
enum AvatarShape {
    case circle
    case roundedSquare
}

/// Farbe des Avatars ohne Bild. `accent` ist voll gefüllt und laut, `calm` ist eine leise Tönung für viele Avatare untereinander.
enum AvatarTone {
    case accent
    case calm
}

/// Runder Avatar. Der Server liefert Bilder als data:image/(jpeg|png);base64-String, der hier dekodiert wird.
/// Es wird nichts aus dem Netz geladen. Ohne gültiges Bild: Emoji (falls übergeben), sonst Initialen auf Akzentfarbe.
/// shape und tone haben Standardwerte, damit alle bestehenden Aufrufer unverändert bleiben.
struct AvatarView: View {
    let name: String?
    let avatar: String?
    var size: CGFloat = 40
    /// Ersatzzeichen vor den Initialen, z. B. das Emoji einer Gruppe.
    var emoji: String? = nil
    var shape: AvatarShape = .circle
    var tone: AvatarTone = .accent

    /// Die Form als Clip und Hintergrund. Radius 0,28 wie der abgerundete Avatar der Karte in XyntalCardView.
    private var clip: AnyShape {
        switch shape {
        case .circle:
            AnyShape(Circle())
        case .roundedSquare:
            AnyShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
        }
    }

    /// Ruhig heißt: nur eine leichte Tönung, damit der Avatar hinter dem Namen zurücktritt.
    private var fill: Color {
        switch tone {
        case .accent: Theme.accent
        case .calm: Theme.accent.opacity(0.16)
        }
    }

    var body: some View {
        ZStack {
            clip
                .fill(fill)
            if let image = AvatarImage.image(from: avatar) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(clip)
            } else if let emoji = emoji.nonEmptyText {
                Text(emoji)
                    .font(.system(size: size * 0.5))
            } else {
                // Auf der ruhigen Tönung ist der Akzent als Textfarbe zu hell (Regel R1), dort steht Primärfarbe.
                Text(Self.initials(from: name))
                    .font(.system(size: size * 0.4, weight: .semibold, design: .rounded))
                    .foregroundStyle(tone == .calm ? Color.primary : Theme.ink)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    /// Erste Buchstaben von bis zu zwei Wörtern, z. B. "Anna Berg" → "AB". Leerer Name → "?".
    static func initials(from name: String?) -> String {
        let words = (name ?? "")
            .split(whereSeparator: { $0.isWhitespace })
            .prefix(2)
        let letters = words.compactMap { $0.first }.map { String($0).uppercased() }
        return letters.isEmpty ? "?" : letters.joined()
    }
}

/// Dekodiert data-URLs (data:image/(jpeg|png);base64) ohne UIImage(data:): ImageIO liest erst die Bildmaße und erzeugt dann
/// nur ein kleines Thumbnail, sodass ein riesiges PNG nie als voller Bitmap im Speicher landet.
/// Nur JPEG und PNG (Präfix und Magic Bytes müssen zusammenpassen), höchstens 2 MB Rohdaten.
/// Zielgröße und Obergrenze für die Quellpixel bestimmt der Aufrufer. Die Prüfungen gelten für alle Arten von Bildern gleich.
enum DataURLImage {
    static let maxBytes = 2 * 1024 * 1024

    private struct Format {
        let prefix: String
        let magic: [UInt8]
    }

    private static let formats = [
        Format(prefix: "data:image/jpeg;base64,", magic: [0xFF, 0xD8, 0xFF]),
        Format(prefix: "data:image/png;base64,", magic: [0x89, 0x50, 0x4E, 0x47])
    ]

    /// Rohdaten des Bildes, wenn Präfix, Größe und Magic Bytes stimmen.
    static func decode(_ string: String?) -> Data? {
        guard let string = string.nonEmptyText,
              let format = formats.first(where: { string.hasPrefix($0.prefix) }) else { return nil }
        let payload = string.dropFirst(format.prefix.count)
        // Base64 bläht um 4/3 auf; wer schon als Text zu groß ist, wird gar nicht erst dekodiert.
        guard payload.utf8.count <= maxBytes / 3 * 4 + 4 else { return nil }
        guard let data = Data(base64Encoded: String(payload), options: .ignoreUnknownCharacters),
              data.count > format.magic.count,
              data.count <= maxBytes,
              data.prefix(format.magic.count).elementsEqual(format.magic) else { return nil }
        return data
    }

    /// Thumbnail über ImageIO, längste Kante höchstens maxPixels. nil, wenn das Bild unlesbar oder eine Seite
    /// länger als maxSourcePixels ist. Die Prüfung kommt vor dem Dekodieren, damit ein großes Bild nie voll entpackt wird.
    static func thumbnail(from data: Data, maxPixels: Int, maxSourcePixels: Int) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions),
              CGImageSourceGetCount(source) >= 1,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, sourceOptions) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width > 0, height > 0,
              width <= maxSourcePixels, height <= maxSourcePixels else { return nil }
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

/// Speicher für dekodierte Bilder mit fester Zielgröße und Obergrenze der Quellpixel. Merkt sich auch Fehlschläge,
/// damit ungültige Daten nicht bei jedem Zeichnen neu geprüft werden. Kosten sind Breite × Höhe × 4.
final class DataURLImageCache {
    /// NSCache braucht ein Objekt. Ein Eintrag mit image == nil merkt sich einen Fehlschlag.
    private final class Entry {
        let image: UIImage?
        init(image: UIImage?) { self.image = image }
    }

    private let maxPixels: Int
    private let maxSourcePixels: Int
    private let cache = NSCache<NSString, Entry>()

    init(maxPixels: Int, maxSourcePixels: Int, totalCostLimit: Int, countLimit: Int) {
        self.maxPixels = maxPixels
        self.maxSourcePixels = maxSourcePixels
        cache.totalCostLimit = totalCostLimit
        cache.countLimit = countLimit
    }

    /// Dekodiert im Aufrufer-Thread. Für Ansichten nicht aus body aufrufen, sondern einmal außerhalb des Haupt-Threads.
    func image(from string: String?) -> UIImage? {
        guard let string = string.nonEmptyText else { return nil }
        let key = cacheKey(for: string)
        if let cached = cache.object(forKey: key) { return cached.image }
        let image = DataURLImage.decode(string).flatMap {
            DataURLImage.thumbnail(from: $0, maxPixels: maxPixels, maxSourcePixels: maxSourcePixels)
        }
        let cost = max(1, (image?.cgImage?.width ?? 0) * (image?.cgImage?.height ?? 0) * 4)
        cache.setObject(Entry(image: image), forKey: key, cost: cost)
        return image
    }

    func removeAll() {
        cache.removeAllObjects()
    }

    /// Schlüssel: die beiden Größen plus SHA-256 des Strings. So kann ein Eintrag nie für eine andere Größe gelten.
    private func cacheKey(for string: String) -> NSString {
        let hash = SHA256.hash(data: Data(string.utf8)).map { String(format: "%02x", $0) }.joined()
        return "\(maxPixels)/\(maxSourcePixels)/\(hash)" as NSString
    }
}

/// Avatare, höchstens 256 px auf der längsten Kante. Das reicht für die größte Avatar-Fläche der App (64 pt)
/// bei 4-fachem Scale und ist klein genug, dass der Speicher bei vielen Avataren nicht wächst.
/// Quellen bis 4.096 px je Seite, wie bisher.
enum AvatarImage {
    static let thumbnailMaxPixels = 256
    static let maxSourcePixels = 4_096

    private static let cache = DataURLImageCache(maxPixels: AvatarImage.thumbnailMaxPixels,
                                                 maxSourcePixels: AvatarImage.maxSourcePixels,
                                                 totalCostLimit: 20 * 1024 * 1024,
                                                 countLimit: 200)

    static func image(from string: String?) -> UIImage? {
        cache.image(from: string)
    }

    static func clearCache() {
        cache.removeAll()
    }
}

/// Banner einer Community, höchstens 1.200 px breit. Ein Banner ist die volle Zeilenbreite (auf einem iPhone bis
/// gut 400 pt) mal 3 für die Pixel, also etwa 1.200 px. Bei 256 px würde es verwaschen aussehen.
/// Der Upload erzeugt genau diese Größe (CommunityImagePreparation). Die Quelle darf höchstens 2.048 px je Seite haben:
/// Das ist knapp das Doppelte des Uploads, also Luft für Bilder anderer Herkunft, und begrenzt den Entpack-Spitzenwert
/// auf etwa 16 MB (2.048² × 4 Byte). 4.096 px wären 67 MB für ein einziges Bild, das nur auf 1.200 px verkleinert wird.
/// Der Server nimmt Banner bis 600.000 Zeichen von jedem Client an, deshalb gilt die Grenze für alle Quellen.
enum CommunityBannerImage {
    static let maxPixels = 1_200
    static let maxSourcePixels = 2_048

    private static let cache = DataURLImageCache(maxPixels: CommunityBannerImage.maxPixels,
                                                 maxSourcePixels: CommunityBannerImage.maxSourcePixels,
                                                 totalCostLimit: 40 * 1024 * 1024,
                                                 countLimit: 20)

    static func image(from string: String?) -> UIImage? {
        cache.image(from: string)
    }

    static func clearCache() {
        cache.removeAll()
    }
}
