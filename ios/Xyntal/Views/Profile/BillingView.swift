import SwiftUI

/// Tarif und KI-Guthaben, nur zur Anzeige. Keine Preise, kein Kauf, kein Upgrade (App-Store-Regel 3.1.1);
/// verwaltet wird im Web.
struct BillingView: View {
    @Environment(SessionStore.self) private var session

    @State private var info: BillingInfo?
    @State private var loadError: String?
    @State private var hasLoaded = false

    private static let manageURL = URL(string: "https://xyntal.de/tarif")
    private static let germanLocale = Locale(identifier: "de_DE")

    var body: some View {
        List {
            if let info {
                planSection(info)
                aiSection(info)
                webSection
            } else if let loadError {
                Section {
                    Text(loadError)
                        .foregroundStyle(.secondary)
                    Button("Erneut versuchen") { Task { await load() } }
                }
                webSection
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
            guard !hasLoaded else { return }
            await load()
        }
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

    private var webSection: some View {
        Section {
            if let url = Self.manageURL {
                Link("xyntal.de/tarif", destination: url)
            }
        } footer: {
            Text("Deinen Tarif verwaltest du im Web.")
        }
    }

    // MARK: - Texte und Laden

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
        hasLoaded = true
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
