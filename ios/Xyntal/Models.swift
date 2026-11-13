import Foundation

/// Mitglied aus GET /discover/people. Nur die Felder, die die App zeigt.
struct Member: Decodable, Identifiable, Hashable {
    let id: String
    let displayName: String?
    let headline: String?
    let location: String?
    let country: String?
    let bio: String?
    let skills: [String]?
    let verified: Bool?
    /// Xyntal-Karte des Mitglieds. nil, wenn es keine Karte hat.
    let websiteCard: WebsiteCard?

    func matches(_ query: String) -> Bool {
        [displayName, headline, location].contains { ($0 ?? "").localizedStandardContains(query) }
            || (skills ?? []).contains { $0.localizedStandardContains(query) }
    }
}

/// Xyntal-Karte aus `websiteCard` in GET /discover/people. Der Server schickt snake_case, daher die CodingKeys.
/// Leere Texte bedeuten "nicht gesetzt". Ein fehlendes oder falsch typisiertes Feld wird wie fehlend behandelt.
struct WebsiteCard: Decodable, Hashable {
    let userId: String?
    let handle: String?
    let name: String?
    let role: String?
    let level: String?
    let skills: [String]
    let hours: Int?
    let mode: String?
    let city: String?
    let looking: String?
    let pitch: String?
    let link: String?
    let bannerPath: String?
    let avatarPath: String?
    let isVerified: Bool
    let isAdmin: Bool
    let isBetaTester: Bool
    let isPremium: Bool
    /// Aussehen der Karte (Farben, Banner, Reihenfolge). Fehlt oder ist es unlesbar,
    /// gilt die Standardgestaltung – eine Karte ohne design ist kein Fehler.
    let design: CardDesign

    private enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case handle, name, role, level, skills, hours, mode, city, looking, pitch, link, design
        case bannerPath = "banner_path"
        case avatarPath = "avatar_path"
        case isVerified = "is_verified"
        case isAdmin = "is_admin"
        case isBetaTester = "is_beta_tester"
        case isPremium = "is_premium"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        userId = container.lenient(String.self, .userId)
        handle = container.lenient(String.self, .handle)
        name = container.lenient(String.self, .name)
        role = container.lenient(String.self, .role)
        level = container.lenient(String.self, .level)
        skills = container.lenient(LossyArray<String>.self, .skills)?.elements ?? []
        hours = container.lenient(Int.self, .hours)
        mode = container.lenient(String.self, .mode)
        city = container.lenient(String.self, .city)
        looking = container.lenient(String.self, .looking)
        pitch = container.lenient(String.self, .pitch)
        link = container.lenient(String.self, .link)
        bannerPath = container.lenient(String.self, .bannerPath)
        avatarPath = container.lenient(String.self, .avatarPath)
        isVerified = container.lenient(Bool.self, .isVerified) ?? false
        isAdmin = container.lenient(Bool.self, .isAdmin) ?? false
        isBetaTester = container.lenient(Bool.self, .isBetaTester) ?? false
        isPremium = container.lenient(Bool.self, .isPremium) ?? false
        design = container.lenient(CardDesign.self, .design) ?? .empty
    }
}

/// Eintrag aus GET /users/blocks. Der Server liefert nur diese Felder, nicht das volle Mitglied.
struct BlockedMember: Decodable, Identifiable, Hashable {
    let id: String
    let displayName: String?
    let handle: String?
    let avatar: String?
    let blockedAt: String?
}

/// Eigenes Konto aus GET /auth/me.
struct CurrentUser: Decodable {
    let id: String
    let email: String
    let displayName: String
    let handle: String
}

/// Gründe für eine Meldung. Der Rohwert wird unverändert gesendet.
/// Der Server nimmt jeden Grund bis 200 Zeichen an. Die Werte entsprechen der Desktop-App (ReportDialog).
enum ReportReason: String, CaseIterable, Identifiable {
    case spam = "Spam"
    case harassment = "Harassment"
    case inappropriateContent = "Inappropriate content"
    case impersonation = "Impersonation"
    case other = "Other"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .spam: return "Spam"
        case .harassment: return "Belästigung"
        case .inappropriateContent: return "Unangemessene Inhalte"
        case .impersonation: return "Identitätsmissbrauch"
        case .other: return "Sonstiges"
        }
    }
}

/// Obergrenze für Zähler aus Serverdaten (Reaktionen, Stimmen, Ungelesen).
let maxServerCount = 1_000_000

/// Klemmt einen Zähler aus Serverdaten auf 0...1_000_000. nil zählt als 0.
/// Damit können Summen mehrerer Zähler nicht überlaufen, egal was der Server schickt.
func clampedCount(_ value: Int?) -> Int {
    min(max(value ?? 0, 0), maxServerCount)
}

extension String {
    /// Kürzt auf höchstens `limit` UTF-16-Einheiten, so wie der Server (JavaScript) Längen zählt.
    /// Fällt der Schnitt in ein Surrogatpaar, bleibt der Text unverändert.
    func truncatedToUTF16(_ limit: Int) -> String {
        guard utf16.count > limit else { return self }
        return String(utf16.prefix(limit)) ?? self
    }
}

extension Optional where Wrapped == String {
    /// Text ohne leere Werte. Gibt nil zurück, wenn nichts anzuzeigen ist.
    var nonEmptyText: String? {
        switch self {
        case .some(let value) where !value.isEmpty:
            return value
        default:
            return nil
        }
    }
}
