import SwiftUI
import UIKit

/// Design-Tokens der App. Farben sind fest hinterlegt (kein Asset-Katalog nötig).
/// Jede Farbe wird je nach Modus (Hell/Dunkel) dynamisch aufgelöst. Der Akzent folgt der Auswahl in den Einstellungen.
enum Theme {
    /// Text auf Akzentflächen (Abzeichen, gewählte Chips, eigene Nachrichten). Dunkles Anthrazit, bzw. Weiß,
    /// wenn Anthrazit auf dem gewählten Akzent schlechter liest.
    static var ink: Color {
        let accent = AppAppearance.shared.accent
        return adaptive { dark in AccentContrast.textOnAccent(accent.appliedHex(dark: dark)) }
    }

    /// Papierfläche. Hell warmes Weiß, dunkel nahezu Schwarz.
    static var paper: Color {
        adaptive { dark in dark ? 0x0C0C0D : 0xECEAE4 }
    }

    /// Akzent für Buttons, Markierungen und Hervorhebungen. Folgt der gewählten Akzentfarbe.
    static var accent: Color {
        let accent = AppAppearance.shared.accent
        return adaptive { dark in accent.appliedHex(dark: dark) }
    }

    /// Grau für Sekundärtext. Mindestens 4,5:1 auf den Hintergründen beider Modi.
    static var muted: Color {
        adaptive { dark in dark ? 0x8F8B83 : 0x686868 }
    }

    /// Eine Farbe, die sich nach dem Modus der Umgebung richtet.
    private static func adaptive(_ hex: @escaping (_ dark: Bool) -> UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            UIColor(hex: hex(traits.userInterfaceStyle == .dark))
        })
    }
}

extension UIColor {
    /// Baut eine Farbe aus einem RGB-Hexwert (0xRRGGBB).
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255,
                  green: CGFloat((hex >> 8) & 0xFF) / 255,
                  blue: CGFloat(hex & 0xFF) / 255,
                  alpha: 1)
    }
}

extension Color {
    /// Eine feste Farbe aus einem RGB-Hexwert (0xRRGGBB).
    init(hex: UInt32) {
        self.init(uiColor: UIColor(hex: hex))
    }
}
