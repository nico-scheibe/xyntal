import Foundation

// Matching-Profil: Vokabular, Entwurf und Server-Formen. Der Server speichert englische Werte
// (damit deutsch- und englischsprachige Mitglieder zueinander passen), die App zeigt deutsche Bezeichnungen.
// Die Logik hier ist frei von SwiftUI und testbar.

/// Tag-Felder des Matching-Profils in der Reihenfolge der Anzeige.
enum TagKind: String, CaseIterable, Identifiable {
    case goals
    case skills
    case techStack
    case interests
    case languages

    var id: String { rawValue }

    var title: String {
        switch self {
        case .goals: return "Ziele"
        case .skills: return "Skills"
        case .techStack: return "Tech-Stack"
        case .interests: return "Interessen"
        case .languages: return "Sprachen"
        }
    }

    var addPlaceholder: String {
        switch self {
        case .goals: return "Ziel hinzufügen"
        case .skills: return "Skill hinzufügen"
        case .techStack: return "Technologie hinzufügen"
        case .interests: return "Interesse hinzufügen"
        case .languages: return "Sprache hinzufügen"
        }
    }

    /// Höchstzahl an Einträgen, wie im Web-Client und auf dem Server.
    var limit: Int {
        switch self {
        case .goals: return 8
        case .languages: return 12
        case .skills, .techStack, .interests: return 20
        }
    }
}

/// Bekannte Werte je Feld. `value` ist der gespeicherte (englische) Wert, `german` die Anzeige; nil heißt: Wert unverändert zeigen.
struct TagEntry: Hashable {
    let value: String
    let german: String?

    init(_ value: String, _ german: String? = nil) {
        self.value = value
        self.german = german
    }

    var label: String { german ?? value }
}

enum TagVocabulary {
    /// Höchstlänge eines Eintrags in UTF-16-Einheiten, so wie der Server zählt.
    static let maxLength = 40

    /// Vorschläge, die als Chips angeboten werden.
    static func options(for kind: TagKind) -> [TagEntry] {
        switch kind {
        case .skills: return skillOptions
        case .techStack: return techStackOptions
        case .interests: return interestOptions
        case .goals: return goalOptions
        case .languages: return languageOptions
        }
    }

    /// Weitere bekannte Werte des Servers. Sie werden nicht vorgeschlagen, aber bei freier Eingabe erkannt und übersetzt.
    static func extras(for kind: TagKind) -> [TagEntry] {
        switch kind {
        case .skills: return skillExtras
        case .techStack: return []
        case .interests: return interestExtras
        case .goals: return goalExtras
        case .languages: return languageExtras
        }
    }

    /// Eingabe säubern: trimmen, Mehrfachleerzeichen zusammenziehen, auf 40 Zeichen kürzen. Leer → nil.
    static func normalize(_ raw: String) -> String? {
        let collapsed = raw
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        let cut = collapsed.truncatedToUTF16(maxLength).trimmingCharacters(in: .whitespaces)
        return cut.isEmpty ? nil : cut
    }

    /// Eingabe (deutsch oder englisch, Groß/Klein egal) → gespeicherter Wert. Unbekannte Eingaben bleiben wie eingegeben.
    static func canonical(_ raw: String, kind: TagKind) -> String? {
        guard let value = normalize(raw) else { return nil }
        let key = value.lowercased()
        for entry in options(for: kind) + extras(for: kind) {
            if entry.value.lowercased() == key { return entry.value }
            if let german = entry.german, german.lowercased() == key { return entry.value }
        }
        return value
    }

    /// Deutsche Bezeichnung eines gespeicherten Werts, sonst der Wert selbst.
    static func label(_ value: String, kind: TagKind) -> String {
        let key = value.lowercased()
        for entry in options(for: kind) + extras(for: kind) where entry.value.lowercased() == key {
            return entry.label
        }
        return value
    }

    // MARK: Listen

    private static let skillOptions: [TagEntry] = [
        TagEntry("Qt"), TagEntry("QML"), TagEntry("C++"), TagEntry("TypeScript"), TagEntry("JavaScript"), TagEntry("Python"),
        TagEntry("Rust"), TagEntry("Go"), TagEntry("React"), TagEntry("Node.js"), TagEntry("Product", "Produkt"), TagEntry("Design"),
        TagEntry("UI/UX"), TagEntry("Marketing"), TagEntry("Sales", "Vertrieb"), TagEntry("Data", "Daten"), TagEntry("DevOps"),
        TagEntry("AI/ML", "KI/ML"), TagEntry("Fundraising"), TagEntry("Strategy", "Strategie"), TagEntry("Mobile"),
        TagEntry("Backend"), TagEntry("Frontend")
    ]

    private static let skillExtras: [TagEntry] = [
        TagEntry("Software Development", "Softwareentwicklung"), TagEntry("Product Management", "Produktmanagement"),
        TagEntry("UX Design", "UX-Design"), TagEntry("Graphic Design", "Grafikdesign"),
        TagEntry("Business Development", "Geschäftsentwicklung"), TagEntry("Project Management", "Projektmanagement")
    ]

    private static let techStackOptions: [TagEntry] = [
        TagEntry("Qt 6"), TagEntry("React"), TagEntry("Next.js"), TagEntry("Node.js"), TagEntry("Fastify"), TagEntry("PostgreSQL"),
        TagEntry("SQLite"), TagEntry("Docker"), TagEntry("Kubernetes"), TagEntry("AWS"), TagEntry("Azure"), TagEntry("Figma"),
        TagEntry("TensorFlow"), TagEntry("PyTorch"), TagEntry("Unity"), TagEntry("Swift"), TagEntry("Kotlin"), TagEntry("Flutter"),
        TagEntry(".NET"), TagEntry("Tailwind")
    ]

    private static let interestOptions: [TagEntry] = [
        TagEntry("Developer Tools", "Entwickler-Tools"), TagEntry("AI", "KI"), TagEntry("Robotics", "Robotik"), TagEntry("Fintech"),
        TagEntry("Health", "Gesundheit"), TagEntry("Climate", "Klima"), TagEntry("Gaming"), TagEntry("Education", "Bildung"),
        TagEntry("E-commerce"), TagEntry("Open Source"), TagEntry("Hardware"), TagEntry("SaaS"),
        TagEntry("Productivity", "Produktivität"), TagEntry("Security", "Sicherheit"), TagEntry("Creator Economy")
    ]

    private static let interestExtras: [TagEntry] = [
        TagEntry("Artificial Intelligence", "Künstliche Intelligenz"), TagEntry("Climate Tech", "Klimatechnologie"),
        TagEntry("Sustainability", "Nachhaltigkeit"), TagEntry("Health Tech", "Gesundheitstechnologie"),
        TagEntry("Mobility", "Mobilität"), TagEntry("Energy", "Energie"), TagEntry("Agriculture", "Landwirtschaft"),
        TagEntry("Crafts", "Handwerk"), TagEntry("Music", "Musik"), TagEntry("Media", "Medien"), TagEntry("Social Impact", "Soziales"),
        TagEntry("Space", "Raumfahrt"), TagEntry("Travel", "Reisen"), TagEntry("Food", "Essen & Ernährung"), TagEntry("Sports", "Sport"),
        TagEntry("Real Estate", "Immobilien"), TagEntry("Public Sector", "Öffentlicher Sektor")
    ]

    private static let goalOptions: [TagEntry] = [
        TagEntry("Find a cofounder", "Mitgründer:in finden"), TagEntry("Join a startup", "Bei einem Startup einsteigen"),
        TagEntry("Hire builders", "Leute fürs Team finden"), TagEntry("Find a mentor", "Mentor:in finden"),
        TagEntry("Mentor others", "Mentoring geben"), TagEntry("Find collaborators", "Mitstreiter:innen finden"),
        TagEntry("Raise funding", "Finanzierung finden"), TagEntry("Learn & grow", "Lernen & wachsen"),
        TagEntry("Ship a side project", "Nebenprojekt fertigstellen"), TagEntry("Freelance work", "Freelance-Aufträge")
    ]

    private static let goalExtras: [TagEntry] = [
        TagEntry("Find a co-founder", "Mitgründer:in finden"), TagEntry("Join a team", "Einem Team beitreten"),
        TagEntry("Build a team", "Ein Team aufbauen"), TagEntry("Start a company", "Startup gründen"),
        TagEntry("Build an MVP", "MVP bauen"), TagEntry("Side project", "Nebenprojekt"), TagEntry("Find customers", "Kunden finden"),
        TagEntry("Find investors", "Investoren finden"), TagEntry("Learn", "Lernen"), TagEntry("Networking", "Netzwerken"),
        TagEntry("Validate an idea", "Idee validieren")
    ]

    private static let languageOptions: [TagEntry] = [
        TagEntry("English", "Englisch"), TagEntry("German", "Deutsch"), TagEntry("French", "Französisch"),
        TagEntry("Spanish", "Spanisch"), TagEntry("Portuguese", "Portugiesisch"), TagEntry("Italian", "Italienisch"),
        TagEntry("Dutch", "Niederländisch"), TagEntry("Polish", "Polnisch"), TagEntry("Turkish", "Türkisch"),
        TagEntry("Arabic", "Arabisch"), TagEntry("Hindi"), TagEntry("Mandarin"), TagEntry("Japanese", "Japanisch"),
        TagEntry("Korean", "Koreanisch")
    ]

    private static let languageExtras: [TagEntry] = [
        TagEntry("Russian", "Russisch"), TagEntry("Ukrainian", "Ukrainisch"), TagEntry("Chinese", "Chinesisch"),
        TagEntry("Swedish", "Schwedisch"), TagEntry("Danish", "Dänisch"), TagEntry("Norwegian", "Norwegisch"),
        TagEntry("Finnish", "Finnisch"), TagEntry("Czech", "Tschechisch"), TagEntry("Greek", "Griechisch"),
        TagEntry("Romanian", "Rumänisch"), TagEntry("Hungarian", "Ungarisch"), TagEntry("Croatian", "Kroatisch"),
        TagEntry("Serbian", "Serbisch"), TagEntry("Persian", "Persisch"), TagEntry("Vietnamese", "Vietnamesisch")
    ]
}

// MARK: - Auswahlfelder (eine Option)

/// Eine Option eines Auswahlfelds. `hint` nur bei der Sichtbarkeit.
struct ChoiceOption<Value: Hashable>: Identifiable, Hashable {
    let value: Value
    let label: String
    var hint: String? = nil

    var id: Value { value }
}

enum ProfileChoices {
    static let collaborationIntent: [ChoiceOption<String>] = [
        ChoiceOption(value: "", label: "Nicht gesetzt"),
        ChoiceOption(value: "cofounder", label: "Mitgründer:in"),
        ChoiceOption(value: "teammate", label: "Team beitreten"),
        ChoiceOption(value: "contribute", label: "An Projekten mitwirken"),
        ChoiceOption(value: "mentor", label: "Andere mentorieren"),
        ChoiceOption(value: "mentee", label: "Mentor finden"),
        ChoiceOption(value: "community", label: "Community & Netzwerk"),
        ChoiceOption(value: "shortterm", label: "Kurzfristige Hilfe"),
        ChoiceOption(value: "longterm", label: "Langfristiger Partner")
    ]

    static let availability: [ChoiceOption<String>] = [
        ChoiceOption(value: "", label: "Nicht gesetzt"),
        ChoiceOption(value: "open", label: "Offen für Zusammenarbeit"),
        ChoiceOption(value: "limited", label: "Begrenzt"),
        ChoiceOption(value: "busy", label: "Fokussiert")
    ]

    static let weeklyHours: [ChoiceOption<Int>] = [
        ChoiceOption(value: 0, label: "Nicht gesetzt"),
        ChoiceOption(value: 4, label: "< 5 Std."),
        ChoiceOption(value: 8, label: "5–10 Std."),
        ChoiceOption(value: 15, label: "10–20 Std."),
        ChoiceOption(value: 25, label: "20–30 Std."),
        ChoiceOption(value: 35, label: "30+ Std.")
    ]

    static let visibility: [ChoiceOption<String>] = [
        ChoiceOption(value: "public", label: "Öffentlich", hint: "Alle auf Xyntal"),
        ChoiceOption(value: "team", label: "Nur Team", hint: "Leute, die einen Arbeitsbereich mit dir teilen"),
        ChoiceOption(value: "private", label: "Privat", hint: "Nur du")
    ]
}

/// Bezeichnungen des Arbeitsstil-Tests.
enum WorkStyleVocabulary {
    /// Dimensionen in Anzeigereihenfolge: Schlüssel in `scores` und deutsche Bezeichnung.
    static let dimensions: [(key: String, label: String)] = [
        ("d", "Antrieb"), ("i", "Einfluss"), ("s", "Beständigkeit"), ("g", "Struktur")
    ]

    static func typeName(_ code: String?) -> String? {
        guard let code = code.nonEmptyText else { return nil }
        switch code.uppercased() {
        case "D": return "Treiber"
        case "I": return "Connector"
        case "S": return "Anker"
        case "G": return "Architekt"
        default: return code
        }
    }
}

// MARK: - Server-Formen

/// Eigenes Profil aus GET /users/:myId mit den Matching-Feldern. Alles außer id wird tolerant gelesen.
struct MatchingProfile: Decodable, Hashable {
    let id: String
    var skills: [String]
    var techStack: [String]
    var interests: [String]
    var goals: [String]
    var languages: [String]
    var collaborationIntent: String?
    var availability: String?
    var weeklyHours: Int?
    var visibility: String?
    var timezone: String?

    private enum CodingKeys: String, CodingKey {
        case id, skills, techStack, interests, goals, languages, collaborationIntent, availability, weeklyHours, visibility, timezone
    }

    init(id: String,
         skills: [String] = [],
         techStack: [String] = [],
         interests: [String] = [],
         goals: [String] = [],
         languages: [String] = [],
         collaborationIntent: String? = nil,
         availability: String? = nil,
         weeklyHours: Int? = nil,
         visibility: String? = nil,
         timezone: String? = nil) {
        self.id = id
        self.skills = skills
        self.techStack = techStack
        self.interests = interests
        self.goals = goals
        self.languages = languages
        self.collaborationIntent = collaborationIntent
        self.availability = availability
        self.weeklyHours = weeklyHours
        self.visibility = visibility
        self.timezone = timezone
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIdentifier(forKey: .id)
        skills = container.lenient(LossyArray<String>.self, .skills)?.elements ?? []
        techStack = container.lenient(LossyArray<String>.self, .techStack)?.elements ?? []
        interests = container.lenient(LossyArray<String>.self, .interests)?.elements ?? []
        goals = container.lenient(LossyArray<String>.self, .goals)?.elements ?? []
        languages = container.lenient(LossyArray<String>.self, .languages)?.elements ?? []
        collaborationIntent = container.lenient(String.self, .collaborationIntent)
        availability = container.lenient(String.self, .availability)
        weeklyHours = Self.lenientInt(container, .weeklyHours)
        visibility = container.lenient(String.self, .visibility)
        timezone = container.lenient(String.self, .timezone)
    }

    /// Zahl als Int, Double oder Text (wie Number() im Web-Client). Unsinnige Werte → nil.
    private static func lenientInt(_ container: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Int? {
        if let value = container.lenient(Int.self, key) { return value }
        if let value = container.lenient(Double.self, key), value.isFinite, abs(value) < 1_000_000 { return Int(value) }
        if let text = container.lenient(String.self, key), let value = Int(text.trimmingCharacters(in: .whitespaces)) { return value }
        return nil
    }
}

/// Antwort von GET /profile/assessment. status fehlt, solange der Test nicht gemacht wurde.
/// questionnaire, instruction und cooldownDays braucht nur der Test selbst.
struct WorkStyleAssessment: Decodable, Hashable {
    var status: WorkStyleStatus?
    var questionnaire: [WorkStyleBlock]
    var instruction: String?
    var cooldownDays: Int?

    private enum CodingKeys: String, CodingKey {
        case status, questionnaire, instruction, cooldownDays
    }

    init(status: WorkStyleStatus? = nil,
         questionnaire: [WorkStyleBlock] = [],
         instruction: String? = nil,
         cooldownDays: Int? = nil) {
        self.status = status
        self.questionnaire = questionnaire
        self.instruction = instruction
        self.cooldownDays = cooldownDays
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = container.lenient(WorkStyleStatus.self, .status)
        questionnaire = container.lenient([WorkStyleBlock].self, .questionnaire) ?? []
        instruction = container.lenient(String.self, .instruction)
        cooldownDays = container.lenient(Int.self, .cooldownDays)
    }
}

struct WorkStyleStatus: Decodable, Hashable {
    var primaryType: String?
    var secondaryType: String?
    var scores: [String: Double]
    var completedAt: String?
    var nextAvailableAt: String?

    private enum CodingKeys: String, CodingKey {
        case primaryType, secondaryType, scores, completedAt, nextAvailableAt
    }

    init(primaryType: String? = nil,
         secondaryType: String? = nil,
         scores: [String: Double] = [:],
         completedAt: String? = nil,
         nextAvailableAt: String? = nil) {
        self.primaryType = primaryType
        self.secondaryType = secondaryType
        self.scores = scores
        self.completedAt = completedAt
        self.nextAvailableAt = nextAvailableAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        primaryType = container.lenient(String.self, .primaryType)
        secondaryType = container.lenient(String.self, .secondaryType)
        scores = container.lenient([String: Double].self, .scores) ?? [:]
        completedAt = container.lenient(String.self, .completedAt)
        nextAvailableAt = container.lenient(String.self, .nextAvailableAt)
    }

    /// Wert 0–100 einer Dimension, begrenzt; nil wenn nicht vorhanden.
    func score(for key: String) -> Int? {
        guard let value = scores[key], value.isFinite else { return nil }
        return Int(min(100, max(0, value.rounded())))
    }

    var completedDate: Date? { ISODate.parse(completedAt) }
    var nextAvailableDate: Date? { ISODate.parse(nextAvailableAt) }
}

/// Körper von PATCH /profile. Alle Felder werden immer mitgeschickt, wie im Web-Client.
struct ProfilePatchBody: Encodable, Equatable {
    let skills: [String]
    let techStack: [String]
    let interests: [String]
    let goals: [String]
    let languages: [String]
    let collaborationIntent: String
    let availability: String
    let weeklyHours: Int
    let visibility: String
    let timezone: String
}

// MARK: - Entwurf

/// Bearbeitbarer Stand des Matching-Profils. Gleichheit mit dem geladenen Stand bedeutet „keine Änderungen“.
struct MatchingProfileDraft: Equatable {
    var goals: [String] = []
    var skills: [String] = []
    var techStack: [String] = []
    var interests: [String] = []
    var languages: [String] = []
    var collaborationIntent = ""
    var availability = ""
    var weeklyHours = 0
    var visibility = "public"
    var timezone = ""

    /// Bereiche, die der Fortschritt zählt: Ziele, Skills, Interessen, Sprachen, Verfügbarkeit + Stunden, Was ich suche.
    static let sectionCount = 6

    /// Höchstlänge der Zeitzone in UTF-16-Einheiten. IANA-Kennungen sind deutlich kürzer.
    static let timezoneMaxLength = 64
    /// Hinweis, wenn die Zeitzone keine bekannte Kennung ist. Speichern ist dann blockiert.
    static let invalidTimezoneMessage = "Unbekannte Zeitzone – nutze „Erkennen“."

    init() {}

    init(profile: MatchingProfile) {
        goals = Self.deduplicated(profile.goals)
        skills = Self.deduplicated(profile.skills)
        techStack = Self.deduplicated(profile.techStack)
        interests = Self.deduplicated(profile.interests)
        languages = Self.deduplicated(profile.languages)
        collaborationIntent = profile.collaborationIntent ?? ""
        availability = profile.availability ?? ""
        weeklyHours = max(0, profile.weeklyHours ?? 0)
        visibility = profile.visibility.nonEmptyText ?? "public"
        timezone = Self.normalizedTimezone(profile.timezone ?? "")
    }

    /// Zeitzone getrimmt und auf 64 UTF-16-Einheiten gekürzt.
    static func normalizedTimezone(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines).truncatedToUTF16(timezoneMaxLength)
    }

    /// Zeitzone, wie sie gespeichert würde.
    var normalizedTimezone: String { Self.normalizedTimezone(timezone) }

    /// true, wenn die Zeitzone leer oder eine bekannte Kennung ist (TimeZone(identifier:) kennt sie).
    var isTimezoneValid: Bool {
        let value = normalizedTimezone
        return value.isEmpty || TimeZone(identifier: value) != nil
    }

    func tags(for kind: TagKind) -> [String] {
        switch kind {
        case .goals: return goals
        case .skills: return skills
        case .techStack: return techStack
        case .interests: return interests
        case .languages: return languages
        }
    }

    mutating func setTags(_ values: [String], for kind: TagKind) {
        switch kind {
        case .goals: goals = values
        case .skills: skills = values
        case .techStack: techStack = values
        case .interests: interests = values
        case .languages: languages = values
        }
    }

    /// Fügt eine Eingabe hinzu; Kommas trennen mehrere Einträge. Dubletten (Groß/Klein egal) und Einträge über dem Maximum
    /// werden übergangen. Gibt true zurück, wenn mindestens ein Eintrag dazukam.
    @discardableResult
    mutating func add(_ raw: String, to kind: TagKind) -> Bool {
        var list = tags(for: kind)
        var added = false
        for part in raw.split(separator: ",") {
            guard list.count < kind.limit else { break }
            guard let value = TagVocabulary.canonical(String(part), kind: kind) else { continue }
            let key = value.lowercased()
            guard !list.contains(where: { $0.lowercased() == key }) else { continue }
            list.append(value)
            added = true
        }
        if added {
            setTags(list, for: kind)
        }
        return added
    }

    mutating func remove(_ value: String, from kind: TagKind) {
        setTags(tags(for: kind).filter { $0 != value }, for: kind)
    }

    func isFull(_ kind: TagKind) -> Bool {
        tags(for: kind).count >= kind.limit
    }

    /// Vorschläge, die noch nicht gewählt sind.
    func openSuggestions(for kind: TagKind) -> [TagEntry] {
        let chosen = Set(tags(for: kind).map { $0.lowercased() })
        return TagVocabulary.options(for: kind).filter { !chosen.contains($0.value.lowercased()) }
    }

    var hasAvailabilitySection: Bool { !availability.isEmpty && weeklyHours > 0 }

    var completedSections: Int {
        [!goals.isEmpty,
         !skills.isEmpty,
         !interests.isEmpty,
         !languages.isEmpty,
         hasAvailabilitySection,
         !collaborationIntent.isEmpty].filter { $0 }.count
    }

    var patchBody: ProfilePatchBody {
        ProfilePatchBody(skills: skills,
                         techStack: techStack,
                         interests: interests,
                         goals: goals,
                         languages: languages,
                         collaborationIntent: collaborationIntent,
                         availability: availability,
                         weeklyHours: weeklyHours,
                         visibility: visibility,
                         timezone: normalizedTimezone)
    }

    /// Leere Einträge raus, Dubletten (Groß/Klein egal) nur einmal, Reihenfolge bleibt.
    private static func deduplicated(_ values: [String]) -> [String] {
        var seen: Set<String> = []
        var result: [String] = []
        for value in values {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, seen.insert(trimmed.lowercased()).inserted else { continue }
            result.append(trimmed)
        }
        return result
    }
}
