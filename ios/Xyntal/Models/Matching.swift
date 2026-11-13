import Foundation

// Modelle für die Matching-Vorschläge („Für dich“). Wie bei den Nachrichten werden alle Felder außer id
// tolerant gelesen: Ein falsch typisiertes Feld verwirft nur dieses Feld, ein unlesbares Listenelement nur dieses Element.

/// Passung als ganze Prozentzahl 0–100. Fehlende oder unsinnige Werte werden zu 0 bzw. begrenzt.
enum MatchScore {
    static func percent(_ value: Double?) -> Int {
        guard let value, value.isFinite else { return 0 }
        // Erst als Double begrenzen, dann wandeln: Int(1e300) würde abstürzen.
        return Int(min(100, max(0, value.rounded())))
    }
}

/// Ein Faktor, der die Passung besonders trägt (topFactors). Der Server liefert den Text schon auf Deutsch.
struct MatchFactor: Decodable, Hashable {
    var label: String
}

/// Person aus GET /matches/people, GET /matches/interactions?action=saved und als target in MatchDetail.
struct MatchPerson: Decodable, Identifiable, Hashable {
    let id: String
    var displayName: String?
    var headline: String?
    var avatar: String?
    /// Passung 0–100.
    var overall: Double?
    /// Kurze Erklärung, warum die Person vorgeschlagen wird.
    var reason: String?
    var saved: Bool?
    var lowData: Bool?
    /// Arbeitsstil-Test gemacht.
    var hasDna: Bool?
    var topFactors: [MatchFactor]
    var websiteId: String?
    var handle: String?
    /// Xyntal-Karte der Person (wie in GET /discover/people). Fehlt sie, zeigt der Stapel eine Notkarte.
    var websiteCard: WebsiteCard?

    private enum CodingKeys: String, CodingKey {
        case id, displayName, headline, avatar, overall, reason, saved, lowData, hasDna, topFactors, websiteId, handle, websiteCard
    }

    init(id: String,
         displayName: String? = nil,
         headline: String? = nil,
         avatar: String? = nil,
         overall: Double? = nil,
         reason: String? = nil,
         saved: Bool? = nil,
         lowData: Bool? = nil,
         hasDna: Bool? = nil,
         topFactors: [MatchFactor] = [],
         websiteId: String? = nil,
         handle: String? = nil,
         websiteCard: WebsiteCard? = nil) {
        self.id = id
        self.displayName = displayName
        self.headline = headline
        self.avatar = avatar
        self.overall = overall
        self.reason = reason
        self.saved = saved
        self.lowData = lowData
        self.hasDna = hasDna
        self.topFactors = topFactors
        self.websiteId = websiteId
        self.handle = handle
        self.websiteCard = websiteCard
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIdentifier(forKey: .id)
        displayName = container.lenient(String.self, .displayName)
        headline = container.lenient(String.self, .headline)
        avatar = container.lenient(String.self, .avatar)
        overall = container.lenient(Double.self, .overall)
        reason = container.lenient(String.self, .reason)
        saved = container.lenient(Bool.self, .saved)
        lowData = container.lenient(Bool.self, .lowData)
        hasDna = container.lenient(Bool.self, .hasDna)
        topFactors = container.lenient(LossyArray<MatchFactor>.self, .topFactors)?.elements ?? []
        websiteId = container.lenient(String.self, .websiteId)
        handle = container.lenient(String.self, .handle)
        websiteCard = container.lenient(WebsiteCard.self, .websiteCard)
    }

    var name: String { displayName.nonEmptyText ?? "Unbekannt" }
    var score: Int { MatchScore.percent(overall) }
    var isSaved: Bool { saved == true }

    /// Karte für den Stapel. Ohne websiteCard eine Karte nur mit Kennung, Name und Handle.
    var deckCard: WebsiteCard {
        if let websiteCard { return websiteCard }
        var fields: [String: String] = ["user_id": id]
        if let displayName = displayName.nonEmptyText { fields["name"] = displayName }
        if let handle = handle.nonEmptyText { fields["handle"] = handle }
        guard let data = try? JSONSerialization.data(withJSONObject: fields),
              let card = try? JSONDecoder().decode(WebsiteCard.self, from: data) else {
            return MatchPerson.emptyCard
        }
        return card
    }

    /// Leere Karte für den Notfall. Alle Felder von WebsiteCard sind tolerant, daher ist das Dekodieren von "{}" sicher.
    private static let emptyCard: WebsiteCard = {
        guard let card = try? JSONDecoder().decode(WebsiteCard.self, from: Data("{}".utf8)) else {
            preconditionFailure("WebsiteCard muss aus {} lesbar sein")
        }
        return card
    }()

    /// Höchstens zwei Faktoren mit Text, für die Pills auf der Karte.
    var visibleFactors: [String] {
        topFactors.map(\.label).filter { !$0.isEmpty }.prefix(2).map { $0 }
    }
}

/// Eine Dimension der Passung, z. B. Ziele oder Skills.
struct MatchDimension: Decodable, Hashable {
    var label: String
    var score: Double
    var weight: Double?
    /// false, wenn die Dimension für dieses Paar nicht bewertet werden kann; sie wird dann nicht gezeigt.
    var applicable: Bool?
    var detail: String?
    var about: String?

    private enum CodingKeys: String, CodingKey {
        case label, score, weight, applicable, detail, about
    }

    init(label: String, score: Double, weight: Double? = nil, applicable: Bool? = nil, detail: String? = nil, about: String? = nil) {
        self.label = label
        self.score = score
        self.weight = weight
        self.applicable = applicable
        self.detail = detail
        self.about = about
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        label = try container.decode(String.self, forKey: .label)
        score = try container.decode(Double.self, forKey: .score)
        weight = container.lenient(Double.self, .weight)
        applicable = container.lenient(Bool.self, .applicable)
        detail = container.lenient(String.self, .detail)
        about = container.lenient(String.self, .about)
    }

    var percent: Int { MatchScore.percent(score) }
    var isApplicable: Bool { applicable != false }
}

/// Zu- oder Abschlag auf die Passung (boosts und penalties).
struct MatchSignal: Decodable, Hashable {
    var label: String
    var detail: String?
    var delta: Double

    private enum CodingKeys: String, CodingKey {
        case label, detail, delta
    }

    init(label: String, detail: String? = nil, delta: Double) {
        self.label = label
        self.detail = detail
        self.delta = delta
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        label = try container.decode(String.self, forKey: .label)
        detail = container.lenient(String.self, .detail)
        delta = container.lenient(Double.self, .delta) ?? 0
    }

    /// Vorzeichen wie im Web-Client: positive Werte bekommen ein Plus, negative bringen ihr Minus mit.
    var deltaText: String {
        let number = delta.formatted(.number.precision(.fractionLength(0...1)))
        return delta > 0 ? "+\(number)" : number
    }
}

/// Erklärung der Passung aus GET /matches/people/:id.
struct MatchDetail: Decodable, Hashable {
    var overall: Double?
    var saved: Bool?
    var lowData: Bool?
    var target: MatchPerson?
    var summary: String?
    var dimensions: [MatchDimension]
    var boosts: [MatchSignal]
    var penalties: [MatchSignal]
    var riskFactors: [String]

    private enum CodingKeys: String, CodingKey {
        case overall, saved, lowData, target, explanation, dimensions, boosts, penalties, riskFactors
    }

    private struct Explanation: Decodable {
        var summary: String?

        private enum CodingKeys: String, CodingKey {
            case summary
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            summary = container.lenient(String.self, .summary)
        }
    }

    init(overall: Double? = nil,
         saved: Bool? = nil,
         lowData: Bool? = nil,
         target: MatchPerson? = nil,
         summary: String? = nil,
         dimensions: [MatchDimension] = [],
         boosts: [MatchSignal] = [],
         penalties: [MatchSignal] = [],
         riskFactors: [String] = []) {
        self.overall = overall
        self.saved = saved
        self.lowData = lowData
        self.target = target
        self.summary = summary
        self.dimensions = dimensions
        self.boosts = boosts
        self.penalties = penalties
        self.riskFactors = riskFactors
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        overall = container.lenient(Double.self, .overall)
        saved = container.lenient(Bool.self, .saved)
        lowData = container.lenient(Bool.self, .lowData)
        target = container.lenient(MatchPerson.self, .target)
        summary = container.lenient(Explanation.self, .explanation)?.summary
        dimensions = container.lenient(LossyArray<MatchDimension>.self, .dimensions)?.elements ?? []
        boosts = container.lenient(LossyArray<MatchSignal>.self, .boosts)?.elements ?? []
        penalties = container.lenient(LossyArray<MatchSignal>.self, .penalties)?.elements ?? []
        riskFactors = (container.lenient(LossyArray<String>.self, .riskFactors)?.elements ?? []).filter { !$0.isEmpty }
    }

    var score: Int { MatchScore.percent(overall) }

    /// Nur bewertbare Dimensionen, schwerste zuerst, bei gleichem Gewicht die bessere zuerst.
    var sortedDimensions: [MatchDimension] {
        dimensions
            .filter(\.isApplicable)
            .sorted { lhs, rhs in
                let left = lhs.weight ?? 0
                let right = rhs.weight ?? 0
                if left != right { return left > right }
                return lhs.score > rhs.score
            }
    }
}

/// Was mit einem Vorschlag passiert. Der Rohwert ist der Server-Code für POST /matches/interactions.
enum MatchAction: String {
    case saved
    /// Annahme aus dem Web-Client (fuer-dich.js): Speichern wird mit "unsaved" zurückgenommen.
    case unsaved
    case dismissed
}

/// Grund für „Passt nicht“. Der Rohwert ist der Server-Code, der Titel der deutsche Text.
enum DismissReason: String, CaseIterable, Identifiable {
    case notRelevant = "NOT_RELEVANT"
    case wrongSkills = "WRONG_SKILLS"
    case wrongGoal = "WRONG_GOAL"
    case notInterested = "NOT_INTERESTED"
    case alreadyKnown = "ALREADY_KNOWN"
    case lowTrust = "LOW_TRUST"
    case other = "OTHER"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .notRelevant: return "Nicht relevant"
        case .wrongSkills: return "Falsche Skills"
        case .wrongGoal: return "Anderes Ziel"
        case .notInterested: return "Kein Interesse"
        case .alreadyKnown: return "Kenne ich schon"
        case .lowTrust: return "Wenig Vertrauen"
        case .other: return "Anderes …"
        }
    }

    /// Höchstens so viele Zeichen nimmt der Server als Notiz bei „Anderes …“ an.
    static let noteLimit = 200
}
