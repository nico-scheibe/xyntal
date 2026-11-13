import SwiftUI

/// Xyntal-Karte eines Mitglieds, nach dem Vorbild der Windows-App (QML XyntalCard): Abzeichen, Name mit Haken,
/// Rolle und Level, Ort, Pitch, Zeit und Erfahrung, Skills, "Sucht" und Link.
/// Bilder gibt es hier nicht: der Server liefert nur Pfade, und die App lädt nichts aus dem Netz. Der Avatar zeigt die Initialen.
/// Farben kommen aus den Theme-Tokens und dem System (Hell und Dunkel), die Schrift aus Textstilen (Dynamic Type).
struct XyntalCardView: View {
    let card: WebsiteCard
    /// Name aus der Mitgliederliste, falls die Karte keinen Namen hat.
    let fallbackName: String?

    @ScaledMetric(relativeTo: .title) private var avatarSize: CGFloat = 64

    private var name: String {
        card.name.nonEmptyText ?? fallbackName.nonEmptyText ?? "Unbekannt"
    }

    private var roleLine: String {
        [card.role, card.level].compactMap { $0.nonEmptyText }.joined(separator: " · ")
    }

    private var place: String {
        [card.city, card.mode].compactMap { $0.nonEmptyText }.joined(separator: " · ")
    }

    /// Nur https-Links. Ohne gültigen Link gibt es keine Schaltfläche.
    private var link: URL? {
        guard let text = card.link.nonEmptyText,
              let url = URL(string: text),
              url.scheme?.lowercased() == "https" else { return nil }
        return url
    }

    private var linkTitle: String {
        guard let host = link?.host?.lowercased() else { return "Website" }
        return host == "linkedin.com" || host.hasSuffix(".linkedin.com") ? "LinkedIn" : "Website"
    }

    /// Abzeichen wie auf der Website: Admin ersetzt Beta-Tester (wie dort), Premium steht daneben.
    /// Verifiziert zeigt der Haken neben dem Namen.
    private var badges: [(title: String, systemImage: String, isAdmin: Bool)] {
        var result: [(title: String, systemImage: String, isAdmin: Bool)] = []
        if card.isAdmin {
            result.append((title: "Admin", systemImage: "shield.fill", isAdmin: true))
        } else if card.isBetaTester {
            result.append((title: "Beta-Tester", systemImage: "flask.fill", isAdmin: false))
        }
        if card.isPremium {
            result.append((title: "Premium", systemImage: "star.fill", isAdmin: false))
        }
        return result
    }

    private var hasStats: Bool {
        (card.hours ?? 0) > 0 || card.level.nonEmptyText != nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !badges.isEmpty {
                ChipFlow {
                    ForEach(Array(badges.enumerated()), id: \.offset) { _, badge in
                        BadgeChip(title: badge.title, systemImage: badge.systemImage, isStrong: badge.isAdmin)
                    }
                }
            }

            HStack(alignment: .center, spacing: 14) {
                AvatarView(name: name, avatar: nil, size: avatarSize)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(name)
                            .font(.title2.bold())
                            .fixedSize(horizontal: false, vertical: true)
                        if card.isVerified {
                            VerifiedBadge()
                        }
                    }
                    if !roleLine.isEmpty {
                        Text(roleLine)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if let pitch = card.pitch.nonEmptyText {
                Text(pitch)
                    .font(.body.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !place.isEmpty {
                Label(place, systemImage: "mappin.and.ellipse")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if hasStats {
                HStack(alignment: .top, spacing: 8) {
                    if let hours = card.hours, hours > 0 {
                        statTile(title: "Zeit", value: "\(hours) Std./Woche")
                    }
                    if let level = card.level.nonEmptyText {
                        statTile(title: "Erfahrung", value: level)
                    }
                }
            }

            if !card.skills.isEmpty {
                ChipFlow {
                    ForEach(Array(card.skills.enumerated()), id: \.offset) { _, skill in
                        Text(skill)
                            .font(.footnote)
                            .foregroundStyle(.primary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(Theme.accent.opacity(0.18), in: Capsule())
                    }
                }
            }

            if let looking = card.looking.nonEmptyText {
                HStack(spacing: 6) {
                    Text("Sucht")
                        .foregroundStyle(.secondary)
                    Text(looking)
                        .fontWeight(.semibold)
                }
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Theme.accent.opacity(0.18), in: Capsule())
                .accessibilityElement(children: .combine)
            }

            Divider()

            HStack(spacing: 10) {
                if let link {
                    Link(destination: link) {
                        Label(linkTitle, systemImage: "arrow.up.right")
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("\(linkTitle) öffnen")
                }
                Spacer(minLength: 8)
                if let handle = card.handle.nonEmptyText {
                    Text(verbatim: "xyntal.de/\(handle)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 24))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Theme.accent, lineWidth: 1.5))
    }

    /// Kleine Kachel mit Titel und Wert, z. B. "Zeit" und "4 Std./Woche".
    private func statTile(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.accent.opacity(0.18), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

/// Abzeichen als Kapsel. Admin ist kräftig, Beta-Tester und Premium sind dezent.
private struct BadgeChip: View {
    let title: String
    let systemImage: String
    let isStrong: Bool

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(.caption.bold())
            .foregroundStyle(isStrong ? Theme.ink : .primary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(isStrong ? Theme.accent : Theme.accent.opacity(0.18), in: Capsule())
            .accessibilityElement(children: .combine)
    }
}

/// Legt Teile nebeneinander und bricht in die nächste Zeile um, wenn der Platz nicht reicht.
private struct ChipFlow: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var usedWidth: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: maxWidth, height: nil))
            if x > 0 && x + size.width > maxWidth {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            usedWidth = max(usedWidth, x - spacing)
        }
        return CGSize(width: min(usedWidth, maxWidth), height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
