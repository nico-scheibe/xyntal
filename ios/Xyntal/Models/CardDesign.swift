import SwiftUI

/// Das Aussehen einer Xyntal-Karte, so wie die Windows- und Mac-App es auflöst
/// (qml/components/CardDesign.qml). Grundlage ist das Feld `design` der Karte, das
/// der Server unverändert von der Website durchreicht.
///
/// Diese Datei ist die gemeinsame Grundlage: XyntalCardView zeichnet die Karte daraus,
/// CardBannerView nur das Muster im Kopfbereich. Beide müssen dasselbe Ergebnis
/// liefern wie der Desktop, darum stehen die Zahlen hier an einer Stelle.
struct CardDesign: Decodable, Hashable {
    /// "aurora", "sunset", "ocean", "mono" oder "custom". Unbekanntes wird zu "aurora".
    let theme: String?
    /// Eigene Farben, nur bei theme == "custom" und nur als #rrggbb.
    let c1: String?
    let c2: String?
    let banner: String?
    /// "light" oder "dark" (alles andere gilt als dunkel).
    let surface: String?
    /// "center" rückt Avatar, Name und Texte in die Mitte.
    let layout: String?
    /// "circle" oder "rounded" für den Avatar.
    let shape: String?
    /// Reihenfolge der Blöcke. Leer oder fehlend heißt: Standardreihenfolge.
    let order: [String]?
    /// Blöcke, die ausgeblendet sind.
    let off: [String]?

    static let empty = CardDesign(theme: nil, c1: nil, c2: nil, banner: nil, surface: nil,
                                  layout: nil, shape: nil, order: nil, off: nil)

    // MARK: - Farben

    /// Die festen Themenfarben, Wert für Wert wie in CardDesign.qml.
    static let themes: [String: [UInt32]] = [
        "aurora": [0xB95CFF, 0xFF5FD2, 0x5B8CFF, 0x3FD8FF],
        "sunset": [0xFFB547, 0xFF6A5C, 0xFF3D8B, 0xB95CFF],
        "ocean": [0x34D399, 0x3FD8FF, 0x5B8CFF, 0x6D5BFF],
        "mono": [0xFFFFFF, 0xC9C9D1, 0x7A7A86, 0xE4E4E7]
    ]

    private static func hexValue(_ text: String?) -> UInt32? {
        guard let text, text.count == 7, text.hasPrefix("#") else { return nil }
        let digits = text.dropFirst()
        guard digits.allSatisfy({ $0.isHexDigit }) else { return nil }
        return UInt32(digits, radix: 16)
    }

    /// "custom" nur mit zwei gültigen Farben, sonst das benannte Thema, sonst "aurora".
    var themeName: String {
        if theme == "custom", Self.hexValue(c1) != nil, Self.hexValue(c2) != nil { return "custom" }
        if let theme, Self.themes[theme] != nil { return theme }
        return "aurora"
    }

    /// Zwei Farben bei "custom", sonst vier.
    private var colorValues: [UInt32] {
        if themeName == "custom", let a = Self.hexValue(c1), let b = Self.hexValue(c2) { return [a, b] }
        return Self.themes[themeName] ?? Self.themes["aurora"]!
    }

    /// Immer vier Verlaufsstopps: zwei Farben wiederholen ihre Enden, damit die Mitte
    /// eine harte Kante bekommt statt eines Zwischentons.
    var gradientStops: [Gradient.Stop] {
        let cols = colorValues
        let values = cols.count == 2 ? [cols[0], cols[0], cols[1], cols[1]] : cols
        let positions: [CGFloat] = cols.count == 2 ? [0, 0, 1, 1] : [0, 1.0 / 3.0, 2.0 / 3.0, 1]
        return zip(values, positions).map { Gradient.Stop(color: Color(hex: $0), location: $1) }
    }

    /// Erste Themenfarbe. Trägt Schein, Banner "glow" und "solid".
    var accent: Color { Color(hex: colorValues[0]) }

    var isLight: Bool { surface == "light" }
    var isCentered: Bool { layout == "center" }
    var isRoundedAvatar: Bool { shape == "rounded" }

    // MARK: - Flächen und Text, abhängig von hell oder dunkel

    var background1: Color { Color(hex: isLight ? 0xFFFFFF : 0x1A1A23) }
    var background2: Color { Color(hex: isLight ? 0xF3F3F7 : 0x121219) }
    var text1: Color { Color(hex: isLight ? 0x121218 : 0xF5F5F7) }
    var text2: Color { Color(hex: isLight ? 0x3F3F4A : 0xC4C4CC) }
    var text3: Color { Color(hex: isLight ? 0x71717F : 0x8A8A95) }
    var chip: Color { isLight ? Color.black.opacity(0.06) : Color.white.opacity(0.08) }
    var panel: Color { isLight ? Color.black.opacity(0.04) : Color.white.opacity(0.045) }
    var line: Color { isLight ? Color.black.opacity(0.09) : Color.white.opacity(0.09) }
    var track: Color { isLight ? Color.black.opacity(0.09) : Color.white.opacity(0.10) }

    /// Der Schleier über dem Verlauf im Kopfbereich, von oben nach unten.
    var coverVeil: [Color] {
        isLight
            ? [Color.white.opacity(0), Color.white.opacity(0.35)]
            : [Color(hex: 0x0A0A10).opacity(0.02), Color(hex: 0x1A1A23).opacity(0.60)]
    }

    // MARK: - Blöcke

    static let defaultOrder = ["place", "pitch", "skills", "stats", "looking"]

    /// Die Blöcke in der Reihenfolge der Karte, ohne die ausgeblendeten.
    /// Unbekannte Namen fallen weg, fehlende werden hinten ergänzt – so kann eine
    /// künftige Website-Version nichts verschlucken.
    /// Entdoppelt wird bewusst: "order" kommt aus dem Profil eines fremden Mitglieds.
    /// Ohne das Entdoppeln legt eine Karte mit ["pitch", "pitch", ... 50.000-mal] die App
    /// jeder Person lahm, die sie zu sehen bekommt – in der Mitgliederliste wie im Stapel.
    /// Das Ergebnis kann so nie mehr Einträge haben als es Blöcke gibt.
    var blocks: [String] {
        let hidden = Set(off ?? [])
        var seen = Set<String>()
        let wanted = (order ?? []).filter { Self.defaultOrder.contains($0) && seen.insert($0).inserted }
        let rest = Self.defaultOrder.filter { !seen.contains($0) }
        return (wanted + rest).filter { !hidden.contains($0) }
    }

    // MARK: - Banner

    static let banners = ["theme", "mesh", "grid", "dots", "waves", "stripes", "glow",
                          "solid", "flow", "stars", "pulse", "scan", "image"]
    /// Diese Muster und das eigene Bild gibt es nur mit bezahltem Tarif.
    static let paidBanners = ["flow", "stars", "pulse", "scan", "image"]
    /// Bewegte Muster. Die App zeichnet sie noch nicht und fällt auf den Verlauf zurück.
    static let animatedBanners = ["flow", "stars", "pulse", "scan"]

    /// Welches Muster tatsächlich gezeichnet wird. Dieselbe Abstufung wie auf dem Desktop:
    /// bezahlte Muster nur mit Premium, ein eigenes Bild nur mit Pfad – sonst der Verlauf.
    func bannerID(isPremium: Bool, hasBannerImage: Bool) -> String {
        let wanted = Self.banners.contains(banner ?? "") ? banner! : "theme"
        if Self.paidBanners.contains(wanted) && !isPremium { return "theme" }
        if wanted == "image" && !hasBannerImage { return "theme" }
        if Self.animatedBanners.contains(wanted) { return "theme" }
        return wanted
    }
}

/// Adressen der Bilder einer Karte am App-Server. Die Route liefert nur Medien, die eine
/// öffentliche Karte ohnehin zeigt, und braucht keine Anmeldung (server/src/supabase/cardMedia.ts).
/// Der Dateiname fährt als ?v= mit: jeder neue Upload ist eine neue Adresse und nie das alte
/// Bild aus dem Zwischenspeicher.
enum CardMedia {
    private static let pathPattern = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{3,4}$/

    /// Nur Standbilder. Bewegte Dateien lässt die App vorerst aus.
    private static let stillImages = ["jpg", "png", "webp"]

    static func url(kind: String, userID: String?, path: String?) -> URL? {
        // Die Kennung wird geprüft, nicht nur der Pfad: Sie geht in den Pfad der Adresse,
        // und ein Wert wie "../../etwas" würde daraus eine Anfrage auf einen ganz anderen
        // Pfad des eigenen Servers machen. Der Host bliebe zwar unser eigener, aber die
        // Anfrage wäre nicht die, die wir stellen wollten.
        guard let userID, UUID(uuidString: userID) != nil,
              let path, (try? pathPattern.wholeMatch(in: path)) != nil,
              let fileExtension = path.split(separator: ".").last.map(String.init),
              stillImages.contains(fileExtension.lowercased()),
              let file = path.split(separator: "/").last.map(String.init),
              var components = URLComponents(url: AppConfig.apiBaseURL, resolvingAgainstBaseURL: false)
        else { return nil }
        components.path = "/website-card/\(kind)/\(userID)"
        components.queryItems = [URLQueryItem(name: "v", value: file)]
        guard let url = components.url, url.scheme?.lowercased() == "https" else { return nil }
        return url
    }
}
