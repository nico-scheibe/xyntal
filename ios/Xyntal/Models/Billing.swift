import Foundation

/// Tarif und KI-Guthaben aus GET /billing. Keine Preise: die kommen von Apple (StoreKit, siehe SubscriptionStore).
/// Alles wird tolerant gelesen; fehlen die neuen Felder source, canPurchaseInApp und plans, bleibt die Ansicht brauchbar.
struct BillingInfo: Decodable, Hashable {
    struct AIBudget: Decodable, Hashable {
        var callCents: Double?
        var includedCents: Double?
        var includedUsedCents: Double?
        var creditCents: Double?
        var reminderShare: Double?

        private enum CodingKeys: String, CodingKey {
            case callCents, includedCents, includedUsedCents, creditCents, reminderShare
        }

        init(callCents: Double? = nil,
             includedCents: Double? = nil,
             includedUsedCents: Double? = nil,
             creditCents: Double? = nil,
             reminderShare: Double? = nil) {
            self.callCents = callCents
            self.includedCents = includedCents
            self.includedUsedCents = includedUsedCents
            self.creditCents = creditCents
            self.reminderShare = reminderShare
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            callCents = container.lenient(Double.self, .callCents)
            includedCents = container.lenient(Double.self, .includedCents)
            includedUsedCents = container.lenient(Double.self, .includedUsedCents)
            creditCents = container.lenient(Double.self, .creditCents)
            reminderShare = container.lenient(Double.self, .reminderShare)
        }
    }

    /// Ein Tarif aus der Liste `plans`. Nur Anzeigetexte; Preise kommen von Apple, nicht vom Server.
    struct Plan: Decodable, Hashable {
        /// Die feste Kennung des Tarifs („Plus“, „Pro“, „Ultra“). Sie ist das stabile Wort
        /// im Server: `name` ist ein Anzeigetext und darf sich ändern oder übersetzt werden.
        var id: String?
        var name: String?
        var blurb: String?
        var features: [String]

        private enum CodingKeys: String, CodingKey {
            case id, name, blurb, features
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = container.lenient(String.self, .id)
            name = container.lenient(String.self, .name)
            blurb = container.lenient(String.self, .blurb)
            features = container.lenient(LossyArray<String>.self, .features)?.elements ?? []
        }
    }

    var plan: String?
    var locked: Bool?
    var configured: Bool?
    var renewsAt: String?
    /// entitlements.ai: false heißt, Xyntal AI ist im Tarif nicht enthalten.
    var aiEntitled: Bool?
    /// entitlements.maxUploadBytes: größte Datei, die der Tarif erlaubt. nil heißt unbegrenzt oder unbekannt.
    var maxUploadBytes: Int?
    /// entitlements.storageBytes: Speicher des Kontos insgesamt. nil heißt unbegrenzt oder unbekannt.
    var storageBytes: Int?
    var ai: AIBudget?
    /// Woher das aktive Abo kommt: "stripe", "apple", "grant" oder nil (Free). Fehlt der Wert, gilt nil.
    var source: String?
    /// true, wenn das Konto über Apple kaufen darf. Fehlt der Wert, gilt false (kein Kaufknopf).
    var canPurchaseInApp: Bool?
    var plans: [Plan]

    private enum CodingKeys: String, CodingKey {
        case plan, locked, configured, renewsAt, entitlements, ai, source, canPurchaseInApp, plans
    }

    private struct Entitlements: Decodable {
        var ai: Bool?
        var maxUploadBytes: Int?
        var storageBytes: Int?

        private enum CodingKeys: String, CodingKey {
            case ai, maxUploadBytes, storageBytes
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            ai = container.lenient(Bool.self, .ai)
            maxUploadBytes = container.lenient(Int.self, .maxUploadBytes)
            storageBytes = container.lenient(Int.self, .storageBytes)
        }
    }

    init(plan: String? = nil,
         locked: Bool? = nil,
         configured: Bool? = nil,
         renewsAt: String? = nil,
         aiEntitled: Bool? = nil,
         ai: AIBudget? = nil,
         source: String? = nil,
         canPurchaseInApp: Bool? = nil,
         plans: [Plan] = []) {
        self.plan = plan
        self.locked = locked
        self.configured = configured
        self.renewsAt = renewsAt
        self.aiEntitled = aiEntitled
        self.ai = ai
        self.source = source
        self.canPurchaseInApp = canPurchaseInApp
        self.plans = plans
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        plan = container.lenient(String.self, .plan)
        locked = container.lenient(Bool.self, .locked)
        configured = container.lenient(Bool.self, .configured)
        renewsAt = container.lenient(String.self, .renewsAt)
        let entitlements = container.lenient(Entitlements.self, .entitlements)
        aiEntitled = entitlements?.ai
        maxUploadBytes = entitlements?.maxUploadBytes
        storageBytes = entitlements?.storageBytes
        ai = container.lenient(AIBudget.self, .ai)
        source = container.lenient(String.self, .source)
        canPurchaseInApp = container.lenient(Bool.self, .canPurchaseInApp)
        plans = container.lenient(LossyArray<Plan>.self, .plans)?.elements ?? []
    }

    // MARK: - Abgeleitete Werte

    /// Anzeigename wie im Web-Client: „Start“ heißt „Free“. Ohne Angabe gilt der kostenlose Tarif.
    var planName: String {
        guard let plan = plan.nonEmptyText else { return "Free" }
        return plan == "Start" ? "Free" : plan
    }

    var isLocked: Bool { locked == true }

    var isFree: Bool {
        guard let plan = plan.nonEmptyText else { return true }
        return plan == "Free" || plan == "Start"
    }

    var renewsDate: Date? { ISODate.parse(renewsAt) }

    /// Tarifkarten zum Kauf: nur im kostenlosen Tarif, nur wenn der Server ausdrücklich Käufe in der App erlaubt.
    /// Fehlt canPurchaseInApp, weiß der Server nichts von Apple-Käufen, also kein Kaufknopf.
    var showsTierCards: Bool {
        isFree && source != "apple" && source != "stripe" && canPurchaseInApp == true
    }

    /// Käufe wiederherstellen: nur wenn der Server ausdrücklich Käufe in der App erlaubt und kein Website-Abo läuft.
    var showsRestore: Bool {
        source != "stripe" && canPurchaseInApp == true
    }

    /// Abo über Apple: verwaltet wird bei Apple.
    var isManagedByApple: Bool { source == "apple" }

    /// Abo über die Website: nur dann der Hinweis, dass man dort zahlt. Kauf-Erlaubnis allein sagt nichts über den Tarif.
    var isManagedOnWeb: Bool { source == "stripe" }

    /// false nur, wenn der Server es ausdrücklich verneint.
    var isAIAvailable: Bool { aiEntitled != false }

    /// Anteil des verbrauchten Monatsbudgets 0…1; nil, wenn es kein Budget gibt.
    var includedUsageFraction: Double? {
        guard let included = ai?.includedCents, included.isFinite, included > 0 else { return nil }
        let used = ai?.includedUsedCents ?? 0
        guard used.isFinite else { return nil }
        return min(1, max(0, min(used, included) / included))
    }

    var includedUsagePercent: Int? {
        includedUsageFraction.map { Int(($0 * 100).rounded()) }
    }

    /// Guthaben in Euro, nie negativ.
    var creditEuros: Double {
        guard let cents = ai?.creditCents, cents.isFinite else { return 0 }
        return max(0, cents) / 100
    }

    /// Ungefähre Zahl an Anfragen, die das Guthaben reicht; nil ohne Preis je Anfrage.
    var estimatedRequests: Int? {
        guard let call = ai?.callCents, call.isFinite, call > 0,
              let credit = ai?.creditCents, credit.isFinite, credit > 0 else { return nil }
        // Erst als Double begrenzen, dann wandeln: Int(1e300) würde abstürzen.
        return Int(min(1_000_000_000, (credit / call).rounded(.down)))
    }
}
