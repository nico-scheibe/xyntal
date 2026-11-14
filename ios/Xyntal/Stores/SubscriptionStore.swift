import Foundation
import Observation
import StoreKit
import UIKit

/// Die drei Tarife aus dem Abo-Vertrag. Alle liegen in einer Abo-Gruppe; Stufe 1 ist die höchste.
enum SubscriptionTier: String, CaseIterable, Identifiable {
    case plus, pro, ultra

    var id: String { rawValue }

    /// Name wie auf dem Server und in den Texten.
    var name: String {
        switch self {
        case .plus: return "Plus"
        case .pro: return "Pro"
        case .ultra: return "Ultra"
        }
    }

    func productId(for interval: SubscriptionInterval) -> String {
        switch (self, interval) {
        case (.plus, .monthly): return "de.xyntal.plus.monthly"
        case (.plus, .yearly): return "de.xyntal.plus.yearly"
        case (.pro, .monthly): return "de.xyntal.pro.monthly"
        case (.pro, .yearly): return "de.xyntal.pro.yearly"
        case (.ultra, .monthly): return "de.xyntal.ultra.monthly"
        case (.ultra, .yearly): return "de.xyntal.ultra.yearly"
        }
    }

    static let allProductIds: [String] = allCases.flatMap { tier in
        SubscriptionInterval.allCases.map { tier.productId(for: $0) }
    }

    static func tier(forProductId productId: String) -> SubscriptionTier? {
        allCases.first { tier in
            SubscriptionInterval.allCases.contains { tier.productId(for: $0) == productId }
        }
    }
}

enum SubscriptionInterval: String, CaseIterable, Identifiable {
    case monthly, yearly

    var id: String { rawValue }

    /// Zeitraum hinter dem Preis, z. B. "im Monat".
    var periodText: String {
        switch self {
        case .monthly: return "im Monat"
        case .yearly: return "im Jahr"
        }
    }
}

/// Ein laufender Kauf: Tarif und Laufzeit.
struct SubscriptionPurchase: Equatable {
    let tier: SubscriptionTier
    let interval: SubscriptionInterval
}

/// Ergebnis eines Kaufs oder Wiederherstellens in klarer Sprache. Wird als Text angezeigt, nie als Alert.
enum SubscriptionNotice: Equatable {
    case cancelled
    case pending(SubscriptionTier)
    case failed
    case offline
    case unverified(SubscriptionTier)
    case otherAccount
    case stripeActive
    case productsUnavailable
    case nothingToRestore
    case restoreFailed
    /// Der Server hat Apple-Abos nicht eingerichtet (503). Kein Fehler des Nutzers.
    case notAvailable
    /// Dauerhaft nicht einlösbar, vom Server vermerkt. Die Transaktion ist dann abgeschlossen.
    case notRedeemable

    var text: String {
        switch self {
        case .cancelled:
            return "Kauf abgebrochen. Es wurde nichts berechnet."
        case .pending(let tier):
            return "Dein Kauf wartet noch auf Freigabe. Sobald sie da ist, schalten wir \(tier.name) frei."
        case .failed:
            return "Der Kauf hat nicht geklappt. Versuch es gleich noch einmal. Hat Apple dir etwas berechnet, tippe auf „Käufe wiederherstellen“."
        case .offline:
            return "Keine Verbindung. Prüf dein Netz und versuch es noch einmal."
        case .unverified(let tier):
            return "Dein Kauf ist bei Apple angekommen, wir konnten \(tier.name) aber noch nicht freischalten. Tippe auf „Erneut versuchen“. Du zahlst nichts doppelt."
        case .otherAccount:
            return AppleBillingFailure.otherAccount.text
        case .stripeActive:
            return AppleBillingFailure.stripeActive.text
        case .productsUnavailable:
            return "Die Tarife sind gerade nicht abrufbar. Das liegt bei Apple, nicht an dir. Versuch es später noch einmal."
        case .nothingToRestore:
            return "Wir haben keinen Kauf gefunden. Prüf, ob du mit dem Apple-Account angemeldet bist, mit dem du gekauft hast."
        case .restoreFailed:
            return "Die Käufe konnten gerade nicht wiederhergestellt werden. Versuch es gleich noch einmal."
        case .notAvailable:
            return AppleBillingFailure.notConfigured.text
        case .notRedeemable:
            return AppleBillingFailure.notRedeemable(recorded: true).text
        }
    }

    /// Fehler werden rot dargestellt, Abbruch, Freigabe und "gerade nicht verfügbar" nicht.
    var isError: Bool {
        switch self {
        case .cancelled, .pending, .nothingToRestore, .notAvailable:
            return false
        default:
            return true
        }
    }

    /// Ob unter dem Text ein "Erneut versuchen" angeboten wird.
    var offersRetry: Bool {
        switch self {
        case .unverified, .productsUnavailable:
            return true
        default:
            return false
        }
    }
}

/// Kauf über StoreKit 2 und Freischaltung über den Server. Gekauft wird nur mit einem appAccountToken des Kontos.
/// Läuft nur, solange jemand angemeldet ist (siehe update(isSignedIn:)).
@MainActor
@Observable
final class SubscriptionStore {
    /// Kauf läuft gerade. Solange sind alle Kaufknöpfe gesperrt.
    private(set) var purchasing: SubscriptionPurchase?
    private(set) var isRestoring = false
    private(set) var isRetrying = false
    /// Geladene Produkte nach Produkt-Id. Fehlende Produkte fehlen einfach.
    private(set) var products: [String: Product] = [:]
    private(set) var productsLoaded = false
    /// Warum keine Produkte da sind: Netz (.offline) oder Apple liefert keine (.productsUnavailable). nil bei Erfolg.
    private(set) var productsNotice: SubscriptionNotice?
    /// Ergebnis je Tarif, als Text unter der Karte.
    private(set) var notices: [SubscriptionTier: SubscriptionNotice] = [:]
    /// Ergebnis von "Käufe wiederherstellen".
    private(set) var restoreNotice: SubscriptionNotice?
    /// Zählt erfolgreiche Freischaltungen. Die Ansichten laden den Tarif dann neu.
    private(set) var revision = 0

    private let session: SessionStore
    private var updatesTask: Task<Void, Never>?

    /// Ergebnis der Prüfung einer Transaktion am Server.
    private enum VerifyOutcome: Equatable {
        case granted
        case otherAccount
        case stripeActive
        case unverified
        /// Dauerhaft nicht einlösbar und vom Server vermerkt. Die Transaktion ist abgeschlossen.
        case notRedeemableRecorded

        func notice(for tier: SubscriptionTier) -> SubscriptionNotice? {
            switch self {
            case .granted: return nil
            case .otherAccount: return .otherAccount
            case .stripeActive: return .stripeActive
            case .unverified: return .unverified(tier)
            case .notRedeemableRecorded: return .notRedeemable
            }
        }
    }

    init(session: SessionStore) {
        self.session = session
    }

    var isBusy: Bool { purchasing != nil || isRestoring || isRetrying }

    /// Die Produkte liegen vor, aber Apple liefert keines. Dann zeigt die Ansicht den Hinweis statt der Karten.
    var productsUnavailable: Bool { productsLoaded && products.isEmpty }

    func product(for tier: SubscriptionTier, interval: SubscriptionInterval) -> Product? {
        products[tier.productId(for: interval)]
    }

    // MARK: - Lebenszyklus

    /// Beim Anmelden startet der Dauerbeobachter, beim Abmelden endet er.
    func update(isSignedIn: Bool) {
        if isSignedIn {
            startObserving()
        } else {
            stopObserving()
        }
    }

    private func startObserving() {
        guard updatesTask == nil else { return }
        // Verlängerungen, Käufe auf anderen Geräten und Familienfreigabe kommen über Transaction.updates.
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                await self.handleUpdate(result)
            }
        }
    }

    private func stopObserving() {
        updatesTask?.cancel()
        updatesTask = nil
        notices = [:]
        restoreNotice = nil
    }

    // MARK: - Produkte

    func loadProducts() async {
        do {
            let loaded = try await Product.products(for: SubscriptionTier.allProductIds)
            products = Dictionary(loaded.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
            productsNotice = products.isEmpty ? .productsUnavailable : nil
        } catch {
            // Kein Netz ist nicht Apples Schuld: eigener Text. Alles andere gilt als "Apple liefert gerade nichts".
            products = [:]
            productsNotice = Self.isNetworkError(error) ? .offline : .productsUnavailable
        }
        productsLoaded = true
    }

    // MARK: - Kauf

    func purchase(_ tier: SubscriptionTier, interval: SubscriptionInterval) async {
        guard !isBusy else { return }
        guard let product = product(for: tier, interval: interval) else {
            setNotice(.productsUnavailable, for: tier)
            return
        }

        purchasing = SubscriptionPurchase(tier: tier, interval: interval)
        setNotice(nil, for: tier)
        defer { purchasing = nil }

        // Vor dem Kauf: frischer Tarifstand. Veraltete Daten dürfen nicht zu einer Abbuchung führen.
        do {
            let fresh = try await session.withAccess { token in
                try await session.api.billing(token: token)
            }
            if let block = Self.purchaseBlock(for: fresh) {
                setNotice(block, for: tier)
                return
            }
        } catch is CancellationError {
            return
        } catch {
            setNotice(Self.notice(for: error), for: tier)
            return
        }

        // Ohne Token wird nicht gekauft: sonst lässt sich der Kauf keinem Xyntal-Konto zuordnen.
        // Der Server lehnt den Abruf bei einem aktiven Website-Abo ab (409), also auch hier vor dem Kauf.
        let accountToken: UUID
        do {
            accountToken = try await session.withAccess { token in
                try await session.api.appleAccountToken(token: token)
            }
        } catch is CancellationError {
            return
        } catch {
            setNotice(Self.tokenNotice(for: error), for: tier)
            return
        }

        do {
            switch try await product.purchase(options: [.appAccountToken(accountToken)]) {
            case .success(.verified(let transaction)):
                setNotice(await verifyAndFinish(transaction).notice(for: tier), for: tier)
            case .success(.unverified):
                setNotice(.failed, for: tier)
            case .pending:
                setNotice(.pending(tier), for: tier)
            case .userCancelled:
                setNotice(.cancelled, for: tier)
            @unknown default:
                setNotice(.failed, for: tier)
            }
        } catch {
            setNotice(Self.notice(for: error), for: tier)
        }
    }

    /// "Erneut versuchen": verarbeitet alle Käufe, die Apple geliefert hat und die noch nicht abgeschlossen sind.
    func retryUnverified() async {
        guard !isBusy else { return }
        isRetrying = true
        defer { isRetrying = false }

        var handled: Set<SubscriptionTier> = []
        for await result in Transaction.unfinished {
            guard case .verified(let transaction) = result,
                  let tier = SubscriptionTier.tier(forProductId: transaction.productID) else { continue }
            handled.insert(tier)
            setNotice(await verifyAndFinish(transaction).notice(for: tier), for: tier)
        }
        // Ein alter Hinweis gilt nicht mehr, wenn sein Kauf inzwischen nicht mehr offen ist.
        for tier in SubscriptionTier.allCases where !handled.contains(tier) && notices[tier] == .unverified(tier) {
            setNotice(nil, for: tier)
        }
    }

    // MARK: - Wiederherstellen

    /// "Käufe wiederherstellen": synchronisiert mit Apple und prüft alle aktiven Abos dieses Apple-Accounts.
    func restore() async {
        guard !isBusy else { return }
        isRestoring = true
        setRestoreNotice(nil)
        defer { isRestoring = false }

        do {
            try await AppStore.sync()
        } catch {
            setRestoreNotice(Self.isNetworkError(error) ? .offline : .restoreFailed)
            return
        }

        var outcomes: [VerifyOutcome] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  SubscriptionTier.tier(forProductId: transaction.productID) != nil else { continue }
            outcomes.append(await verifyAndFinish(transaction))
        }

        if outcomes.contains(.granted) {
            setRestoreNotice(nil)
        } else if outcomes.isEmpty {
            setRestoreNotice(.nothingToRestore)
        } else if outcomes.contains(.otherAccount) {
            setRestoreNotice(.otherAccount)
        } else if outcomes.contains(.stripeActive) {
            setRestoreNotice(.stripeActive)
        } else if outcomes.contains(.notRedeemableRecorded) {
            setRestoreNotice(.notRedeemable)
        } else {
            setRestoreNotice(.restoreFailed)
        }
    }

    // MARK: - Transaktionen

    private func handleUpdate(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result,
              let tier = SubscriptionTier.tier(forProductId: transaction.productID) else { return }
        setNotice(await verifyAndFinish(transaction).notice(for: tier), for: tier, announce: false)
    }

    /// Lässt den Server die Transaktion prüfen. Erst nach Erfolg wird finish() aufgerufen.
    /// Scheitert die Prüfung vorübergehend, bleibt der Kauf offen, damit Apple ihn erneut liefert.
    /// Bei APPLE_NOT_REDEEMABLE wird nur abgeschlossen, wenn der Server den Kauf vermerkt hat (recorded).
    private func verifyAndFinish(_ transaction: Transaction) async -> VerifyOutcome {
        do {
            _ = try await session.withAccess { token in
                try await session.api.verifyAppleTransaction(id: String(transaction.id), token: token)
            }
        } catch AppError.appleBilling(.otherAccount) {
            return .otherAccount
        } catch AppError.appleBilling(.stripeActive) {
            return .stripeActive
        } catch AppError.appleBilling(.notRedeemable(let recorded)) {
            guard recorded else { return .unverified }
            await transaction.finish()
            return .notRedeemableRecorded
        } catch {
            return .unverified
        }
        await transaction.finish()
        revision += 1
        return .granted
    }

    // MARK: - Hilfen

    private static func isNetworkError(_ error: Error) -> Bool {
        if let appError = error as? AppError, case .network = appError { return true }
        if let storeError = error as? StoreKitError, case .networkError = storeError { return true }
        return false
    }

    private static func notice(for error: Error) -> SubscriptionNotice {
        isNetworkError(error) ? .offline : .failed
    }

    /// Ergebnis der Tarifstand-Prüfung vor dem Kauf. nil heißt: kaufen erlaubt.
    /// Website-Abo (oder ausdrücklich gesperrt) zeigt den Text zum aktiven Abo; fehlt die Angabe, gilt sie als gesperrt.
    static func purchaseBlock(for info: BillingInfo) -> SubscriptionNotice? {
        if info.source == "stripe" || info.canPurchaseInApp == false {
            return .stripeActive
        }
        if info.canPurchaseInApp != true {
            return .notAvailable
        }
        return nil
    }

    /// Fehler beim Token-Abruf vor dem Kauf: 409 ist ein aktives Website-Abo, 503 ist fehlende Server-Konfiguration.
    private static func tokenNotice(for error: Error) -> SubscriptionNotice {
        if let appError = error as? AppError, case .appleBilling(let failure) = appError {
            switch failure {
            case .stripeActive: return .stripeActive
            case .notConfigured: return .notAvailable
            default: break
            }
        }
        return notice(for: error)
    }

    private func setNotice(_ notice: SubscriptionNotice?, for tier: SubscriptionTier, announce: Bool = true) {
        notices[tier] = notice
        if announce, let notice {
            UIAccessibility.post(notification: .announcement, argument: notice.text)
        }
    }

    private func setRestoreNotice(_ notice: SubscriptionNotice?) {
        restoreNotice = notice
        if let notice {
            UIAccessibility.post(notification: .announcement, argument: notice.text)
        }
    }
}
