import Foundation

// In-App-Kauf (StoreKit 2) und dessen Prüfung am Server. Die Endpunkte und Fehlercodes stehen im Abo-Vertrag.
extension APIClient {
    /// GET /billing/apple/token: die UUID, die beim Kauf als appAccountToken mitgeht. Für dasselbe Konto immer dieselbe.
    func appleAccountToken(token: String) async throws -> UUID {
        let result = try await send("billing/apple/token",
                                    token: token,
                                    as: AppleTokenResult.self,
                                    mapFailure: Self.appleTokenFailure)
        guard let uuid = UUID(uuidString: result.appAccountToken) else {
            throw AppError.message(AppError.genericMessage)
        }
        return uuid
    }

    /// POST /billing/apple/verify: der Server holt die Transaktion selbst bei Apple. Der Client nennt nur die Id.
    /// Die Fehlercodes des Vertrags kommen als AppError.appleBilling an, alle anderen als allgemeiner Fehler.
    func verifyAppleTransaction(id: String, token: String) async throws -> AppleVerifyResult {
        try await send("billing/apple/verify",
                       method: "POST",
                       token: token,
                       body: AppleVerifyRequest(transactionId: id),
                       as: AppleVerifyResult.self,
                       mapFailureDetail: Self.appleVerifyFailure)
    }

    /// Codes werden unabhängig von der Schreibweise verglichen; der Vertrag nennt UPPER_SNAKE.
    private static func appleTokenFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code.uppercased()) {
        case (409, "APPLE_STRIPE_ACTIVE"):
            return .appleBilling(.stripeActive)
        case (503, "BILLING_NOT_CONFIGURED"):
            return .appleBilling(.notConfigured)
        default:
            return nil
        }
    }

    private static func appleVerifyFailure(status: Int, code: String, recorded: Bool?) -> AppError? {
        switch (status, code.uppercased()) {
        case (403, "APPLE_OTHER_ACCOUNT"):
            return .appleBilling(.otherAccount)
        case (409, "APPLE_STRIPE_ACTIVE"):
            return .appleBilling(.stripeActive)
        case (502, "APPLE_UNREACHABLE"):
            return .appleBilling(.unreachable)
        case (400, "APPLE_NOT_REDEEMABLE"):
            return .appleBilling(.notRedeemable(recorded: recorded == true))
        default:
            return nil
        }
    }
}

/// Die Fehlercodes aus dem Abo-Vertrag, die die App unterscheidet.
enum AppleBillingFailure: Equatable {
    /// 403 APPLE_OTHER_ACCOUNT: Das Abo gehört zu einem anderen Xyntal-Konto.
    case otherAccount
    /// 409 APPLE_STRIPE_ACTIVE: Auf diesem Konto läuft schon ein Abo über die Website.
    case stripeActive
    /// 502 APPLE_UNREACHABLE: Apple antwortet nicht. Die App darf es erneut versuchen.
    case unreachable
    /// 503 BILLING_NOT_CONFIGURED: der Server hat den Apple-Kauf nicht eingerichtet.
    case notConfigured
    /// 400 APPLE_NOT_REDEEMABLE: Dauerhaft nicht einlösbar. recorded == true heißt: der Server hat den Kauf vermerkt,
    /// die App darf die Transaktion dann abschließen.
    case notRedeemable(recorded: Bool)

    var text: String {
        switch self {
        case .otherAccount:
            return "Dieses Abo gehört zu einem anderen Xyntal-Konto. Melde dich mit diesem Konto an, um es zu nutzen."
        case .stripeActive:
            return "Auf deinem Konto läuft schon ein Abo über die Website. Dort verwaltest du es auch."
        case .unreachable:
            return "Apple antwortet gerade nicht. Versuch es gleich noch einmal."
        case .notConfigured:
            return "Abos sind in der App gerade nicht verfügbar."
        case .notRedeemable:
            return "Dieser Kauf lässt sich auf deinem Konto nicht einlösen. Wir haben ihn vermerkt – melde dich bei uns, dann klären wir die Erstattung."
        }
    }
}

/// Antwort von GET /billing/apple/token.
private struct AppleTokenResult: Decodable {
    let appAccountToken: String
}

/// Body für POST /billing/apple/verify.
private struct AppleVerifyRequest: Encodable {
    let transactionId: String
}

/// Antwort von POST /billing/apple/verify. Alle Felder optional; für den Erfolg zählt nur, dass die Antwort gelesen wird.
struct AppleVerifyResult: Decodable {
    var plan: String?
    var renewsAt: String?
    var source: String?
}
