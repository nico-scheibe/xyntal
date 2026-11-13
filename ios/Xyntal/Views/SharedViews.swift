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
            Button("Erneut versuchen", action: retry)
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

/// Runder Avatar. Der Server liefert Bilder als data:image/(jpeg|png);base64-String, der hier dekodiert wird.
/// Es wird nichts aus dem Netz geladen. Ohne gültiges Bild: Emoji (falls übergeben), sonst Initialen auf Akzentfarbe.
struct AvatarView: View {
    let name: String?
    let avatar: String?
    var size: CGFloat = 40
    /// Ersatzzeichen vor den Initialen, z. B. das Emoji einer Gruppe.
    var emoji: String? = nil

    var body: some View {
        ZStack {
            Circle()
                .fill(Theme.accent)
            if let image = AvatarImage.image(from: avatar) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipShape(Circle())
            } else if let emoji = emoji.nonEmptyText {
                Text(emoji)
                    .font(.system(size: size * 0.5))
            } else {
                Text(Self.initials(from: name))
                    .font(.system(size: size * 0.4, weight: .semibold, design: .rounded))
                    .foregroundStyle(Theme.ink)
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

/// Dekodiert Avatare aus data-URLs ohne UIImage(data:): ImageIO liest erst die Bildmaße und erzeugt dann nur ein
/// kleines Thumbnail, sodass ein riesiges PNG nie als voller Bitmap im Speicher landet.
/// Nur JPEG und PNG (Präfix und Magic Bytes müssen zusammenpassen), höchstens 2 MB Rohdaten und 4.096 px je Seite.
enum AvatarImage {
    static let maxBytes = 2 * 1024 * 1024
    /// Größere Quellbilder werden gar nicht erst dekodiert.
    static let maxSourcePixels = 4_096
    /// Reicht für alle Avatar-Größen der App mal Bildschirm-Scale.
    static let thumbnailMaxPixels = 256

    private struct Format {
        let prefix: String
        let magic: [UInt8]
    }

    private static let formats = [
        Format(prefix: "data:image/jpeg;base64,", magic: [0xFF, 0xD8, 0xFF]),
        Format(prefix: "data:image/png;base64,", magic: [0x89, 0x50, 0x4E, 0x47])
    ]

    /// Ergebnis je Avatar-String, auch Fehlschläge, damit ungültige Daten nicht bei jedem Zeichnen neu geprüft werden.
    private final class Entry {
        let image: UIImage?
        init(image: UIImage?) { self.image = image }
    }

    /// Schlüssel ist der SHA-256 des Strings; Kosten sind die Thumbnail-Bytes (Breite × Höhe × 4).
    private static let cache: NSCache<NSString, Entry> = {
        let cache = NSCache<NSString, Entry>()
        cache.totalCostLimit = 20 * 1024 * 1024
        cache.countLimit = 200
        return cache
    }()

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

    /// Kleines Thumbnail über ImageIO. nil, wenn das Bild unlesbar oder eine Seite länger als maxSourcePixels ist.
    static func thumbnail(from data: Data) -> UIImage? {
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
            kCGImageSourceThumbnailMaxPixelSize: thumbnailMaxPixels,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    static func image(from string: String?) -> UIImage? {
        guard let string = string.nonEmptyText else { return nil }
        let key = cacheKey(for: string)
        if let cached = cache.object(forKey: key) { return cached.image }
        let image = decode(string).flatMap(thumbnail(from:))
        let cost = max(1, (image?.cgImage?.width ?? 0) * (image?.cgImage?.height ?? 0) * 4)
        cache.setObject(Entry(image: image), forKey: key, cost: cost)
        return image
    }

    static func clearCache() {
        cache.removeAllObjects()
    }

    private static func cacheKey(for string: String) -> NSString {
        SHA256.hash(data: Data(string.utf8)).map { String(format: "%02x", $0) }.joined() as NSString
    }
}
