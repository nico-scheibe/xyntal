import Foundation

/// Die sechs Akzentfarben wie in der Windows-App. Je Modus (Hell/Dunkel) gibt es einen eigenen Wert.
enum AccentColor: String, CaseIterable, Identifiable {
    case xyntalBlue
    case violet
    case cyan
    case green
    case orange
    case red

    var id: String { rawValue }

    /// Name in der Auswahl.
    var name: String {
        switch self {
        case .xyntalBlue: return "Xyntal Blue"
        case .violet: return "Violett"
        case .cyan: return "Cyan"
        case .green: return "Grün"
        case .orange: return "Orange"
        case .red: return "Rot"
        }
    }

    /// Der Farbwert des Modus, so wie er im Farbfleck der Auswahl steht.
    func rawHex(dark: Bool) -> UInt32 {
        switch self {
        case .xyntalBlue: return dark ? 0x4C8DFF : 0x1F6FD6
        case .violet: return dark ? 0x8B6CFF : 0x6A49E0
        case .cyan: return dark ? 0x2FB9D8 : 0x12849F
        case .green: return 0x22C55E
        case .orange: return 0xF97316
        case .red: return dark ? 0xFF4D6A : 0xE11D48
        }
    }

    /// Der Akzent, wie er in der App wirkt: auf allen Hintergründen des Modus mindestens 3:1.
    func appliedHex(dark: Bool) -> UInt32 {
        AccentContrast.readable(rawHex(dark: dark),
                                on: AccentContrast.grounds(dark: dark),
                                dark: dark,
                                minimum: AccentContrast.minAccent)
    }
}

/// Kontrastregeln wie in der Windows-App (Theme.qml: readable, minAccentContrast).
enum AccentContrast {
    /// Mindestkontrast eines Akzents gegen den Hintergrund (UI-Komponenten, WCAG 3:1).
    static let minAccent = 3.0
    /// Mindestkontrast von Text auf einer Akzentfläche (WCAG AA).
    static let minText = 4.5

    static let ink: UInt32 = 0x1C1C1C
    static let white: UInt32 = 0xFFFFFF

    /// Hintergründe, auf denen der Akzent steht: Papier, Gruppenhintergrund und Zeilen/Karten.
    static func grounds(dark: Bool) -> [UInt32] {
        dark ? [0x0C0C0D, 0x000000, 0x1C1C1E] : [0xECEAE4, 0xF2F2F7, 0xFFFFFF]
    }

    /// WCAG-Relativleuchtdichte eines RGB-Werts.
    static func luminance(_ hex: UInt32) -> Double {
        func channel(_ value: UInt32) -> Double {
            let v = Double(value) / 255
            return v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
        }
        let r = channel((hex >> 16) & 0xFF)
        let g = channel((hex >> 8) & 0xFF)
        let b = channel(hex & 0xFF)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    /// WCAG-Kontrastverhältnis zweier Farben.
    static func contrast(_ a: UInt32, _ b: UInt32) -> Double {
        let la = luminance(a)
        let lb = luminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    /// Das schlechteste Verhältnis über alle Hintergründe.
    static func worstContrast(_ fg: UInt32, on grounds: [UInt32]) -> Double {
        grounds.map { contrast(fg, $0) }.min() ?? 21
    }

    /// `fg`, wenn er auf allen Hintergründen `minimum` erreicht. Sonst wird er in 10-%-Schritten
    /// Richtung Schwarz (heller Modus) bzw. Weiß (dunkler Modus) angehoben, bis er passt.
    static func readable(_ fg: UInt32, on grounds: [UInt32], dark: Bool, minimum: Double) -> UInt32 {
        if worstContrast(fg, on: grounds) >= minimum { return fg }
        let target: UInt32 = dark ? white : 0x000000
        for step in 1...10 {
            let candidate = mix(fg, toward: target, fraction: Double(step) / 10)
            if worstContrast(candidate, on: grounds) >= minimum { return candidate }
        }
        return target
    }

    /// Text auf einer Akzentfläche: dunkle Schrift, solange sie 4,5:1 erreicht oder besser als Weiß liest.
    static func textOnAccent(_ accent: UInt32) -> UInt32 {
        let inkContrast = contrast(ink, accent)
        return (inkContrast >= minText || inkContrast >= contrast(white, accent)) ? ink : white
    }

    /// Mischt `fg` mit `target` (Anteil `fraction`), kanalweise in sRGB.
    private static func mix(_ fg: UInt32, toward target: UInt32, fraction: Double) -> UInt32 {
        func channel(_ shift: UInt32) -> UInt32 {
            let c = Double((fg >> shift) & 0xFF)
            let t = Double((target >> shift) & 0xFF)
            return UInt32((c * (1 - fraction) + t * fraction + 0.5).rounded(.down))
        }
        return (channel(16) << 16) | (channel(8) << 8) | channel(0)
    }
}
