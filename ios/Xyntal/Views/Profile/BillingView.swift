import StoreKit
import SwiftUI

/// Tarif, Kauf über Apple und KI-Guthaben. Kaufen geht nur hier (Profil → Tarif), nirgends sonst in der App.
/// Preise kommen ausschließlich von Apple (product.displayPrice). Verwaltet wird bei Apple, nicht bei uns.
struct BillingView: View {
    @Environment(SessionStore.self) private var session
    @Environment(SubscriptionStore.self) private var subscription

    @State private var info: BillingInfo?
    @State private var loadError: String?
    /// Solange der Tarifstand neu geladen wird, sind die Kaufknöpfe gesperrt.
    @State private var isLoadingInfo = false
    @State private var interval: SubscriptionInterval = .monthly
    @State private var showManageSubscriptions = false

    private static let germanLocale = Locale(identifier: "de_DE")
    /// Links im Footer. Die Adressen stehen im Text als Markdown-Links.
    private static let termsLink = "[AGB](https://xyntal.de/agb)"
    private static let privacyLink = "[Datenschutzerklärung](https://xyntal.de/datenschutz)"

    var body: some View {
        List {
            if let info {
                planSection(info)
                if info.isManagedByApple {
                    appleManageSection
                } else if info.showsTierCards {
                    tierSections(info)
                } else if info.isManagedOnWeb {
                    webNoticeSection
                }
                aiSection(info)
                if info.showsRestore {
                    purchasesSection
                }
            } else if let loadError {
                Section {
                    Text(loadError)
                        .foregroundStyle(.secondary)
                    Button("Erneut versuchen") { Task { await load() } }
                }
            } else {
                Section {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .navigationTitle("Tarif & KI-Guthaben")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task {
            // Bei jedem Erscheinen frisch laden, bevor Kaufknöpfe freigegeben sind.
            await load()
        }
        .task {
            guard !subscription.productsLoaded else { return }
            await subscription.loadProducts()
        }
        .onChange(of: subscription.revision) { _, _ in
            Task { await load() }
        }
        .manageSubscriptionsSheet(isPresented: $showManageSubscriptions)
    }

    // MARK: - Abschnitte

    private func planSection(_ info: BillingInfo) -> some View {
        Section("Dein Tarif") {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    PlanPill(text: info.planName, tint: Theme.accent, foreground: Theme.ink)
                    if info.isLocked {
                        PlanPill(text: "Zahlung überfällig", tint: Color.red.opacity(0.15), foreground: .red)
                    }
                }
                Text(statusText(info))
                    .font(.subheadline)
                    .foregroundStyle(info.isLocked ? Color.red : Color.secondary)
            }
            .padding(.vertical, 2)
        }
    }

    /// Tarife zum Kauf: Auswahl der Laufzeit, dann je Tarif eine Karte mit Preis, Merkmalen und Button.
    @ViewBuilder
    private func tierSections(_ info: BillingInfo) -> some View {
        Section {
            if !subscription.productsLoaded {
                ProgressView()
                    .frame(maxWidth: .infinity)
            } else if subscription.productsUnavailable {
                // Netzfehler und "Apple liefert nichts" bekommen verschiedene Texte.
                noticeText(subscription.productsNotice ?? .productsUnavailable)
                Button("Erneut versuchen") {
                    Task { await subscription.loadProducts() }
                }
                .disabled(subscription.isBusy)
            } else {
                Picker("Laufzeit", selection: $interval) {
                    Text("Monatlich").tag(SubscriptionInterval.monthly)
                    Text("Jährlich").tag(SubscriptionInterval.yearly)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .disabled(subscription.isBusy || isLoadingInfo)
            }
        } header: {
            Text("Tarife")
        }

        if subscription.productsLoaded && !subscription.productsUnavailable {
            ForEach(SubscriptionTier.allCases) { tier in
                tierSection(tier, info: info)
            }
        }
    }

    @ViewBuilder
    private func tierSection(_ tier: SubscriptionTier, info: BillingInfo) -> some View {
        if let product = subscription.product(for: tier, interval: interval) {
            // Über die Kennung, nicht über den Anzeigenamen: `name` ist ein Text für
            // Menschen und wird übersetzt, `id` ist das feste Wort des Servers. Fiele die
            // Zuordnung aus, stünde eine Tarifkarte ohne Beschreibung neben einem Kaufknopf.
            let plan = info.plans.first { $0.id == tier.name } ?? info.plans.first { $0.name == tier.name }
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Text(tier.name)
                        .font(.headline)
                    priceRow(product)
                    if let blurb = plan?.blurb.nonEmptyText {
                        Text(blurb)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    if let features = plan?.features, !features.isEmpty {
                        ForEach(Array(features.enumerated()), id: \.offset) { _, feature in
                            Label(feature, systemImage: "checkmark")
                                .font(.subheadline)
                        }
                    }
                    if interval == .yearly {
                        yearlyNotes(tier, yearly: product)
                    }
                }
                .padding(.vertical, 2)
                purchaseButton(tier)
            } footer: {
                Text(footerText(tierName: tier.name, price: product.displayPrice, interval: interval))
                    .font(.footnote)
            }

            if let notice = subscription.notices[tier] {
                Section {
                    noticeText(notice) {
                        Task { await subscription.retryUnverified() }
                    }
                }
            }
        } else if subscription.productsLoaded {
            // Apple liefert diesen Tarif gerade nicht: ruhige Zeile statt einer Lücke.
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(tier.name)
                        .font(.headline)
                    Text("Dieser Tarif ist gerade nicht erhältlich.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 2)
            }
        }
    }

    /// Preis und Zeitraum als ein VoiceOver-Element. Bei großer Schrift untereinander statt abgeschnitten.
    private func priceRow(_ product: Product) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                priceText(product)
                periodText
            }
            VStack(alignment: .leading, spacing: 0) {
                priceText(product)
                periodText
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func priceText(_ product: Product) -> some View {
        Text(product.displayPrice)
            .font(.title2.weight(.bold))
            .monospacedDigit()
            .fixedSize(horizontal: false, vertical: true)
    }

    private var periodText: some View {
        Text(interval.periodText)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// Jährlich: der Preis je Monat, und "zwei Monate gratis" nur, wenn das Jahr wirklich das Zehnfache des Monats kostet.
    @ViewBuilder
    private func yearlyNotes(_ tier: SubscriptionTier, yearly: Product) -> some View {
        let monthly = subscription.product(for: tier, interval: .monthly)
        VStack(alignment: .leading, spacing: 2) {
            Text("Entspricht \((yearly.price / 12).formatted(yearly.priceFormatStyle)) im Monat.")
            if let monthly, yearly.price == monthly.price * 10 {
                Text("Jährlich zahlen: zwei Monate gratis.")
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private func purchaseButton(_ tier: SubscriptionTier) -> some View {
        let isBuying = subscription.purchasing?.tier == tier
        return Button {
            Task { await subscription.purchase(tier, interval: interval) }
        } label: {
            Text(isBuying ? "Wird gekauft …" : "\(tier.name) abonnieren")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .tint(Theme.accent)
        .foregroundStyle(Theme.ink)
        .disabled(subscription.isBusy || isLoadingInfo)
    }

    /// Pflichtangaben direkt unter dem Button. Der Preis stammt von Apple.
    private func footerText(tierName: String, price: String, interval: SubscriptionInterval) -> AttributedString {
        let renewal = interval == .monthly
            ? "Das Abo verlängert sich jeden Monat automatisch, bis du es kündigst."
            : "Das Abo verlängert sich jedes Jahr automatisch, bis du es kündigst."
        let period = interval == .monthly ? "Ende des laufenden Monats" : "Ende des laufenden Jahres"
        let text = "\(tierName) kostet \(price) \(interval.periodText). \(renewal) Bezahlt wird über deinen Apple-Account. Du kündigst jederzeit in den Einstellungen deines Apple-Accounts, spätestens 24 Stunden vor \(period). Es gelten unsere \(Self.termsLink) und die \(Self.privacyLink)."
        return (try? AttributedString(markdown: text)) ?? AttributedString(text)
    }

    private var appleManageSection: some View {
        Section {
            Button("Abo bei Apple verwalten") {
                showManageSubscriptions = true
            }
        } footer: {
            Text("Kündigen und den Tarif wechseln geht bei Apple, nicht bei uns. Nach einer Kündigung behältst du deinen Tarif bis zum Ende des bezahlten Zeitraums.")
                .font(.footnote)
        }
    }

    /// Abo über die Website oder In-App-Käufe gesperrt: reiner Text, ohne Link auf einen Kaufweg (App-Store-Regel 3.1.1).
    private var webNoticeSection: some View {
        Section {
            Text("Du zahlst über die Website. Dort verwaltest du dein Abo auch.")
                .foregroundStyle(.secondary)
        }
    }

    private var purchasesSection: some View {
        Section {
            Button(subscription.isRestoring ? "Wird wiederhergestellt …" : "Käufe wiederherstellen") {
                Task { await subscription.restore() }
            }
            .disabled(subscription.isBusy)
            if let notice = subscription.restoreNotice {
                noticeText(notice)
            }
        } header: {
            Text("Käufe")
        } footer: {
            Text("Hast du schon ein Abo über Apple, holst du es hier zurück.")
                .font(.footnote)
        }
    }

    @ViewBuilder
    private func aiSection(_ info: BillingInfo) -> some View {
        Section("Xyntal AI") {
            if !info.isAIAvailable {
                Text("Xyntal AI ist in deinem Tarif nicht enthalten.")
                    .foregroundStyle(.secondary)
            } else {
                if let fraction = info.includedUsageFraction, let percent = info.includedUsagePercent {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("Enthaltenes Monatsbudget")
                            Spacer()
                            Text("\(percent) % genutzt")
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                        ProgressView(value: fraction)
                            .tint(Theme.accent)
                    }
                    .accessibilityElement(children: .combine)
                }
                if info.ai != nil {
                    LabeledContent("Guthaben") {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(info.creditEuros.formatted(.currency(code: "EUR").locale(Self.germanLocale)))
                                .monospacedDigit()
                            if let requests = info.estimatedRequests {
                                Text("≈ \(requests.formatted(.number.locale(Self.germanLocale))) Anfragen")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                } else {
                    Text("Zu deinem KI-Guthaben liegen gerade keine Angaben vor.")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Texte und Laden

    /// Meldung als Text, nie als Alert. Fehler in Rot, Abbruch und Freigabe in Grau.
    @ViewBuilder
    private func noticeText(_ notice: SubscriptionNotice, retry: (() -> Void)? = nil) -> some View {
        Text(notice.text)
            .font(.subheadline)
            .foregroundStyle(notice.isError ? Color.red : Color.secondary)
        if notice.offersRetry, let retry {
            Button("Erneut versuchen", action: retry)
        }
    }

    private func statusText(_ info: BillingInfo) -> String {
        if info.isLocked {
            return "Die letzte Zahlung ist nicht durchgegangen."
        }
        if info.isFree {
            return "Kostenloser Tarif"
        }
        if let date = info.renewsDate {
            return "Aktiv bis \(date.formatted(.dateTime.day().month(.wide).year().locale(Self.germanLocale)))"
        }
        return "Aktiv"
    }

    private func load() async {
        isLoadingInfo = true
        defer { isLoadingInfo = false }
        do {
            info = try await session.withAccess { token in
                try await session.api.billing(token: token)
            }
            loadError = nil
        } catch is CancellationError {
            return
        } catch {
            loadError = AppError.displayText(for: error)
        }
    }
}

private struct PlanPill: View {
    let text: String
    let tint: Color
    let foreground: Color

    var body: some View {
        Text(text)
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .foregroundStyle(foreground)
            .background(tint, in: Capsule())
    }
}
