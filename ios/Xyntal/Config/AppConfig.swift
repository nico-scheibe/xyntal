import Foundation

enum AppConfig {
    /// Vorschlag für die Bundle-ID. Auch als PRODUCT_BUNDLE_IDENTIFIER im Xcode-Projekt gesetzt.
    /// Bitte bei Bedarf in Xcode unter Target > Signing & Capabilities ändern (und hier anpassen).
    static let bundleIdentifier = "de.xyntal.app"

    /// Eigener Server (derselbe, den auch die Desktop-App nutzt). Hier keine Zugangsdaten eintragen.
    static let apiBaseURL = URL(string: "https://api.xyntal.de")!
}
