import Foundation

/// Tarif und KI-Guthaben aus GET /billing. Nur Anzeige: keine Preise, kein Kauf (App-Store-Regel 3.1.1).
/// Alles wird tolerant gelesen; die Liste `plans` wird nicht ausgewertet.
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

    var plan: String?
    var locked: Bool?
    var configured: Bool?
    var renewsAt: String?
    /// entitlements.ai: false heißt, Xyntal AI ist im Tarif nicht enthalten.
    var aiEntitled: Bool?
    var ai: AIBudget?

    private enum CodingKeys: String, CodingKey {
        case plan, locked, configured, renewsAt, entitlements, ai
    }

    private struct Entitlements: Decodable {
        var ai: Bool?

        private enum CodingKeys: String, CodingKey {
            case ai
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            ai = container.lenient(Bool.self, .ai)
        }
    }

    init(plan: String? = nil,
         locked: Bool? = nil,
         configured: Bool? = nil,
         renewsAt: String? = nil,
         aiEntitled: Bool? = nil,
         ai: AIBudget? = nil) {
        self.plan = plan
        self.locked = locked
        self.configured = configured
        self.renewsAt = renewsAt
        self.aiEntitled = aiEntitled
        self.ai = ai
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        plan = container.lenient(String.self, .plan)
        locked = container.lenient(Bool.self, .locked)
        configured = container.lenient(Bool.self, .configured)
        renewsAt = container.lenient(String.self, .renewsAt)
        aiEntitled = container.lenient(Entitlements.self, .entitlements)?.ai
        ai = container.lenient(AIBudget.self, .ai)
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
