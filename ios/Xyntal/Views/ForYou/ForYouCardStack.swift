import SwiftUI

// Bausteine des Stapels „Für dich“: Karte mit Stempel, Aktionsleiste, Rücknahme-Kapsel und Platzhalter.

/// Zahlen der Wischgeste, an einer Stelle.
enum DeckSwipe {
    static let cornerRadius: CGFloat = 30

    /// Ab dieser Verschiebung gilt die Geste als Entscheidung: 40 % der Kartenbreite.
    static func threshold(cardWidth: CGFloat) -> CGFloat {
        cardWidth * 0.4
    }
}

/// Höhe der obersten Karte in ihrer natürlichen Größe. Nur die oberste Karte meldet sie.
struct DeckCardHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    /// Bewusst das Maximum und nicht der letzte Wert: Im Baum liegt neben der Messkopie
    /// auch der Stapel selbst, und der steuert den Standardwert 0 bei. Mit "value = nextValue()"
    /// gewinnt dieser 0-Wert, je nachdem in welcher Reihenfolge SwiftUI zusammenfasst –
    /// dann bleibt die gemessene Höhe für immer 0 und die Karte bekommt die volle Höhe.
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// Unsichtbare Messkopie der obersten Karte. Sie hat die Breite der Karte, aber keine Höhenvorgabe,
/// und meldet so die natürliche Inhaltshöhe. Nicht sichtbar, nicht für VoiceOver, keine Berührungen.
/// Equatable, damit sie nicht bei jedem Schritt der Geste neu berechnet wird, nur bei neuer Karte oder Breite.
struct DeckCardHeightProbe: View, Equatable {
    let card: WebsiteCard
    let fallbackName: String?
    let width: CGFloat

    var body: some View {
        XyntalCardView(card: card, fallbackName: fallbackName)
            .frame(width: width)
            .fixedSize(horizontal: false, vertical: true)
            .background {
                GeometryReader { geo in
                    Color.clear.preference(key: DeckCardHeightKey.self, value: geo.size.height)
                }
            }
            .opacity(0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// Eine Karte im Stapel mit ihrer Tiefe. 0 ist die oberste Karte.
struct DeckSlot: Identifiable {
    let depth: Int
    let person: MatchPerson

    var id: String { person.id }
}

/// Eine Karte des Stapels. Die oberste Karte folgt der Geste, die Karten darunter sind nur Dekoration.
struct DeckCard: View {
    let person: MatchPerson
    /// 0 = oberste Karte, 1 und 2 darunter.
    let depth: Int
    let size: CGSize
    /// Verschiebung und Neigung gelten nur für die oberste Karte.
    let drag: CGSize
    let tilt: Double
    /// true, solange eine waagerechte Geste läuft. Dann scrollt die Karte nicht.
    let swipeActive: Bool
    let threshold: CGFloat
    let canUndo: Bool
    let onAccept: () -> Void
    let onPass: () -> Void
    let onUndo: () -> Void

    private var isTop: Bool { depth == 0 }

    private var scale: CGFloat {
        switch depth {
        case 0: return 1
        case 1: return 0.95
        default: return 0.90
        }
    }

    private var baseOffset: CGFloat {
        switch depth {
        case 0: return 0
        case 1: return 12
        default: return 24
        }
    }

    private var dim: Double {
        switch depth {
        case 0: return 0
        case 1: return 0.35
        default: return 0.55
        }
    }

    /// Wie weit der Stempel ist: 0 bei 20 pt Verschiebung, 1 an der Schwelle.
    private var stampProgress: Double {
        let distance = abs(drag.width)
        guard distance > 20 else { return 0 }
        return min(1, Double((distance - 20) / max(1, threshold - 20)))
    }

    private var isAccept: Bool { drag.width > 0 }

    var body: some View {
        ScrollView {
            XyntalCardView(card: person.deckCard, fallbackName: person.displayName)
        }
        .scrollDisabled(!isTop || swipeActive)
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: DeckSwipe.cornerRadius, style: .continuous))
        .shadow(color: .black.opacity(depth == 0 ? 0.14 : 0.08), radius: 12, y: 6)
        .overlay {
            if isTop {
                swipeTint
            }
        }
        .overlay {
            Color.black.opacity(dim)
                .clipShape(RoundedRectangle(cornerRadius: DeckSwipe.cornerRadius, style: .continuous))
                .allowsHitTesting(false)
        }
        .overlay(alignment: isAccept ? .topLeading : .topTrailing) {
            if isTop {
                stamp
            }
        }
        .scaleEffect(scale)
        .offset(x: isTop ? drag.width : 0, y: (isTop ? drag.height : 0) + baseOffset)
        .rotationEffect(.degrees(isTop ? tilt : 0), anchor: .bottom)
        .accessibilityHidden(!isTop)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.spokenLabel(for: person))
        .accessibilityActions {
            Button("Kennenlernen", action: onAccept)
            Button("Passt nicht", action: onPass)
            if canUndo {
                Button("Letzte Entscheidung zurücknehmen", action: onUndo)
            }
        }
    }

    /// Farbton nach links oder rechts. Rechts Akzentfarbe, links neutral grau, jeweils bis 25 %.
    @ViewBuilder
    private var swipeTint: some View {
        RoundedRectangle(cornerRadius: DeckSwipe.cornerRadius, style: .continuous)
            .fill(isAccept ? Theme.accent : Color(.systemGray))
            .opacity(0.25 * stampProgress)
            .allowsHitTesting(false)
    }

    /// Stempel im oberen Drittel, 8° gegen die Ziehrichtung gedreht, auf deckender Kapsel.
    @ViewBuilder
    private var stamp: some View {
        if drag.width != 0 {
            HStack(spacing: 6) {
                Image(systemName: isAccept ? "person.badge.plus" : "xmark")
                Text(isAccept ? "KENNENLERNEN" : "PASST NICHT")
            }
            .font(.title3.weight(.heavy))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .foregroundStyle(isAccept ? Theme.ink : Color(.systemBackground))
            .background(isAccept ? Theme.accent : Color(.label), in: Capsule())
            .rotationEffect(.degrees(isAccept ? -8 : 8))
            .opacity(stampProgress)
            .padding(.horizontal, 20)
            .padding(.top, size.height * 0.12)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    /// Ein Satz für VoiceOver: Name, Rolle und Erfahrung, Ort, Pitch, Sucht, Skills, Zeit, dann die Begründung. Abzeichen fehlen.
    static func spokenLabel(for person: MatchPerson) -> String {
        let card = person.deckCard
        var parts: [String] = [card.name.nonEmptyText ?? person.name]
        let roleLine = [card.role.nonEmptyText, card.level.nonEmptyText].compactMap { $0 }.joined(separator: ", ")
        if !roleLine.isEmpty { parts.append(roleLine) }
        let place = [card.city.nonEmptyText, card.mode.nonEmptyText].compactMap { $0 }.joined(separator: ", ")
        if !place.isEmpty { parts.append(place) }
        if let pitch = card.pitch.nonEmptyText { parts.append(pitch) }
        if let looking = card.looking.nonEmptyText { parts.append("Sucht: \(looking)") }
        if !card.skills.isEmpty { parts.append("Skills: \(card.skills.joined(separator: ", "))") }
        if let hours = card.hours, hours > 0 { parts.append("Zeit: \(hours) Std. pro Woche") }
        if let reason = person.reason.nonEmptyText { parts.append(reason) }
        return parts.joined(separator: ". ")
    }
}

// Die beiden sichtbaren Knöpfe unter dem Stapel gibt es bewusst nicht mehr: Entschieden wird
// allein durch Wischen. Der Weg für Hilfstechnologien bleibt erhalten – die oberste Karte trägt
// „Kennenlernen" und „Passt nicht" als eigene Bedienhilfen-Aktionen (siehe accessibilityActions
// weiter oben). Ohne die wäre der Bildschirm für alle unbedienbar, die nicht wischen können.

/// Eine Aktion in der Kapsel.
struct DeckNoticeAction: Identifiable {
    let id: String
    let title: String
    let perform: () -> Void
}

/// Kapsel über der Aktionsleiste mit einer dünn ablaufenden Linie. Die Zeit läuft der Aufrufer.
struct DeckNoticeCapsule: View {
    let text: String
    /// Anteil der Zeit, die noch bleibt (1 bis 0).
    let remaining: Double
    let showsLine: Bool
    let actions: [DeckNoticeAction]

    var body: some View {
        HStack(spacing: 12) {
            Text(text)
                .font(.subheadline)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            ForEach(actions) { action in
                Button(action.title, action: action.perform)
                    .font(.subheadline.weight(.semibold))
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.accent)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .frame(minHeight: 44)
        .background(Color(.secondarySystemGroupedBackground), in: Capsule())
        .overlay(Capsule().stroke(Color(.separator).opacity(0.5), lineWidth: 0.5))
        .overlay(alignment: .bottom) {
            if showsLine {
                GeometryReader { geo in
                    Capsule()
                        .fill(Theme.accent)
                        .frame(width: max(0, geo.size.width * remaining), height: 2)
                }
                .frame(height: 2)
                .padding(.horizontal, 16)
                .padding(.bottom, 1)
                .accessibilityHidden(true)
            }
        }
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.12), radius: 10, y: 4)
    }
}

/// Platzhalter beim Laden: Karte mit Rundung 30 und langsamem Schimmern. Ohne Bewegung bei „Bewegung reduzieren“.
struct DeckPlaceholderCard: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shift: CGFloat = -1

    var body: some View {
        RoundedRectangle(cornerRadius: DeckSwipe.cornerRadius, style: .continuous)
            .fill(Color(.secondarySystemGroupedBackground))
            .overlay {
                GeometryReader { geo in
                    LinearGradient(colors: [.clear, Color(.systemBackground).opacity(0.7), .clear],
                                   startPoint: .leading, endPoint: .trailing)
                        .frame(width: geo.size.width * 0.6)
                        .offset(x: shift * geo.size.width)
                }
                .clipShape(RoundedRectangle(cornerRadius: DeckSwipe.cornerRadius, style: .continuous))
            }
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) {
                    shift = 1.2
                }
            }
            .accessibilityHidden(true)
    }
}
