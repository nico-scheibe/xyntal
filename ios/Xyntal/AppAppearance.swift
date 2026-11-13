import SwiftUI

/// Darstellungsmodus. System folgt den Einstellungen des iPhones.
enum AppearanceMode: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    /// Name in der Auswahl.
    var name: String {
        switch self {
        case .system: return "System"
        case .light: return "Hell"
        case .dark: return "Dunkel"
        }
    }

    /// nil heißt: dem System folgen.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

/// Modus und Akzentfarbe der App. Nicht sensibel, daher in UserDefaults.
@Observable
final class AppAppearance {
    static let shared = AppAppearance()

    private static let modeKey = "appearance.mode"
    private static let accentKey = "appearance.accent"

    var mode: AppearanceMode {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: Self.modeKey) }
    }

    var accent: AccentColor {
        didSet { UserDefaults.standard.set(accent.rawValue, forKey: Self.accentKey) }
    }

    private init() {
        let defaults = UserDefaults.standard
        mode = AppearanceMode(rawValue: defaults.string(forKey: Self.modeKey) ?? "") ?? .system
        accent = AccentColor(rawValue: defaults.string(forKey: Self.accentKey) ?? "") ?? .xyntalBlue
    }
}

/// Wendet Modus und Akzentfarbe auf die ganze App an.
struct AppearanceModifier: ViewModifier {
    func body(content: Content) -> some View {
        let appearance = AppAppearance.shared
        content
            .preferredColorScheme(appearance.mode.colorScheme)
            .tint(Theme.accent)
    }
}
