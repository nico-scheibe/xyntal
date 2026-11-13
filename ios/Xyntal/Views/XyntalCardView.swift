import SwiftUI

/// Xyntal-Karte eines Mitglieds, nach dem Vorbild der Windows- und Mac-App (QML XyntalCard.qml).
///
/// Die Zahlen (Radien, Abstände, Schriftgrößen, Höhen, Füllungen) stammen aus
/// qml/components/XyntalCard.qml und müssen mit dem Desktop gleich bleiben. Ändert sich dort
/// etwas, muss es hier mit. Anders als der Desktop ist die Karte nicht auf 380 pt festgenagelt:
/// sie nimmt die verfügbare Breite des Bildschirms.
///
/// Bilder laden nur über CardMedia.url. Ohne Bild steht die Initiale, ein Ladefehler lässt sie stehen.
/// Die Schrift hat feste Punktgrößen wie im Desktop und wächst deshalb mit Dynamic Type nicht mit.
/// Das Limit unten bleibt trotzdem, damit die Karte nie breiter als nötig wird, falls einzelne Texte
/// später Textstile bekommen.
struct XyntalCardView: View {
    let card: WebsiteCard
    /// Name aus der Mitgliederliste, falls die Karte keinen Namen hat.
    let fallbackName: String?

    /// Erfahrungsstufen wie im Desktop. Andere Werte gelten als nicht gesetzt.
    private static let levels = ["Einsteiger", "Fortgeschritten", "Profi"]

    private var design: CardDesign { card.design }
    private var centered: Bool { design.isCentered }

    /// Schrift auf dem Avatar und dem Premium-Abzeichen: auf dem Thema "mono" dunkel, sonst weiß.
    private var onAccent: Color { design.themeName == "mono" ? Color(hex: 0x111111) : .white }

    private var name: String {
        card.name.nonEmptyText ?? fallbackName.nonEmptyText ?? "Unbekannt"
    }

    /// Erster Buchstabe des Namens für den Avatar, sonst "?".
    private var initial: String {
        (card.name.nonEmptyText ?? fallbackName.nonEmptyText)
            .flatMap { $0.first }
            .map { String($0).uppercased() } ?? "?"
    }

    /// Erfahrungsstufe. Nur eine der drei bekannten Stufen gilt, wie im Desktop.
    private var level: String? {
        guard let level = card.level, Self.levels.contains(level) else { return nil }
        return level
    }

    private var levelIndex: Int {
        level.flatMap { Self.levels.firstIndex(of: $0) } ?? -1
    }

    private var roleLine: String {
        [card.role.nonEmptyText, level].compactMap { $0 }.joined(separator: " · ")
    }

    private var place: String {
        [card.city.nonEmptyText, card.mode.nonEmptyText].compactMap { $0 }.joined(separator: " · ")
    }

    private var hours: Int { max(0, card.hours ?? 0) }

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

    /// Bildadressen laufen ausschließlich über CardMedia. Ohne Pfad oder gültige Adresse gibt es kein Bild.
    private var avatarURL: URL? {
        CardMedia.url(kind: "avatar", userID: card.userId, path: card.avatarPath)
    }

    private var bannerURL: URL? {
        CardMedia.url(kind: "banner", userID: card.userId, path: card.bannerPath)
    }

    private var bannerID: String {
        design.bannerID(isPremium: card.isPremium, hasBannerImage: bannerURL != nil)
    }

    /// Blöcke in der Reihenfolge des Mitglieds, ohne die, die nichts zu zeigen haben.
    /// Zeit und Erfahrung stehen immer da, wie im Desktop.
    private var shownBlocks: [String] {
        design.blocks.filter { block in
            switch block {
            case "place": return !place.isEmpty
            case "pitch": return card.pitch.nonEmptyText != nil
            case "skills": return !card.skills.isEmpty
            case "looking": return card.looking.nonEmptyText != nil
            case "stats": return true
            default: return false
            }
        }
    }

    /// Verlauf für den Text "Sucht": wie background-clip:text im Desktop, Ende bei 60 % der Höhe.
    private var themeTextGradient: LinearGradient {
        LinearGradient(stops: design.gradientStops, startPoint: .topLeading, endPoint: UnitPoint(x: 1, y: 0.6))
    }

    /// Ring des Admin-Abzeichens: Blau über Violett nach Lila.
    private var adminRing: LinearGradient {
        LinearGradient(
            stops: [
                Gradient.Stop(color: Color(hex: 0x8FD0FF), location: 0),
                Gradient.Stop(color: Color(hex: 0x6D7BFF), location: 0.55),
                Gradient.Stop(color: Color(hex: 0xB07CFF), location: 1)
            ],
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    /// Avatar-Radius als Anteil der Breite: 0,5 ist der Kreis, 0,28 das abgerundete Quadrat.
    private var avatarRatio: CGFloat { design.isRoundedAvatar ? 0.28 : 0.5 }

    var body: some View {
        surface
            .padding(1.5)
            .background {
                // Der Verlauf bleibt als 1,5 pt breiter Rand rund um die Kartenfläche stehen.
                CardThemeFill(design: design)
                    .clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .dynamicTypeSize(...DynamicTypeSize.accessibility2)
    }

    /// Die Kartenfläche: Kopfbereich und Inhalt, senkrecht background1 nach background2.
    /// Der Avatar liegt darüber und ragt 40 pt in den Kopfbereich.
    private var surface: some View {
        VStack(alignment: .leading, spacing: 0) {
            cover
            details
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [design.background1, design.background2], startPoint: .top, endPoint: .bottom)
        )
        .clipShape(RoundedRectangle(cornerRadius: 28.5, style: .continuous))
        .overlay(alignment: .topLeading) {
            avatar
                .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
                .padding(.horizontal, 24)
                .padding(.top, 56)
        }
    }

    /// Kopfbereich, 96 pt hoch: Verlauf, Schleier, Muster, darüber die Abzeichen.
    private var cover: some View {
        ZStack(alignment: .top) {
            CardThemeFill(design: design)
            LinearGradient(colors: design.coverVeil, startPoint: .top, endPoint: .bottom)
            CardBannerView(bannerID: bannerID, design: design)
            badges
                .padding(.leading, 16.5)
                .padding(.trailing, 16.5)
                .padding(.top, 14.5)
        }
        .frame(height: 96)
        .clipShape(
            UnevenRoundedRectangle(topLeadingRadius: 28.5, bottomLeadingRadius: 0,
                                   bottomTrailingRadius: 0, topTrailingRadius: 28.5, style: .continuous)
        )
    }

    /// Abzeichen oben im Kopfbereich. Admin links, Beta-Tester (nur ohne Admin) und Premium rechts,
    /// rechtsbündig und mit Umbruch nach unten, wenn es nicht passt.
    private var badges: some View {
        HStack(alignment: .top, spacing: 10) {
            if card.isAdmin {
                adminBadge
            }
            ChipFlow(spacing: 6, alignment: .trailing) {
                if card.isBetaTester && !card.isAdmin {
                    betaBadge
                }
                if !card.isAdmin {
                    roleBadge
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    /// Admin wie auf der Website: dunkles Glas in einem Ring aus Blau nach Violett, mit Schild.
    private var adminBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: "shield.fill")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(adminRing)
            Text("Admin")
                .font(.system(size: 11, weight: .bold))
                .tracking(1.05)
                .textCase(.uppercase)
                .foregroundStyle(.white)
        }
        .padding(.leading, 8)
        .padding(.trailing, 13)
        .frame(minHeight: 25)
        .background(Capsule().fill(Color(hex: 0x0A0C16).opacity(0.74)))
        .overlay(Capsule().strokeBorder(adminRing, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    /// Beta-Tester: helle Schrift auf einem blau-violetten Glas, wie der Desktop.
    private var betaBadge: some View {
        Text("Beta-Tester")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Color(hex: 0xF2FAFF))
            .padding(.horizontal, 11)
            .frame(minHeight: 24)
            .background(
                LinearGradient(
                    colors: [Color(red: 30 / 255, green: 154 / 255, blue: 1).opacity(0.36),
                             Color(red: 120 / 255, green: 76 / 255, blue: 1).opacity(0.34)],
                    startPoint: .leading,
                    endPoint: .trailing
                ),
                in: Capsule()
            )
            .overlay(Capsule().stroke(Color(red: 119 / 255, green: 210 / 255, blue: 1).opacity(0.42), lineWidth: 1))
            .accessibilityElement(children: .combine)
    }

    /// Das allererste Mitglied. Der Desktop erkennt es an einer festen Kennung oder am
    /// Handle "maxim" (XyntalCard.qml Zeile 52–53). Fest verdrahtet ist hässlich, aber
    /// solange der Server es nicht mitliefert, ist Abweichen schlimmer als Nachbauen.
    private static let firstUserID = "be172112-15cd-49de-af85-e7f71dfeac47"
    private static let firstUserHandle = "maxim"

    /// Bewusst NUR die Kennung. Der Desktop prüft zusätzlich den Handle "maxim", aber
    /// Handles sind frei wählbar und werden nach einer Löschung wieder frei: Wer sich
    /// den Namen sichert, bekäme das Abzeichen "01 First User" geschenkt. In einem Club,
    /// der von Vertrauen lebt, ist ein erschlichenes Abzeichen schlimmer als ein fehlendes.
    private var isFirstUser: Bool {
        card.userId == Self.firstUserID
    }

    /// Steht beim Desktop immer rechts oben, solange die Person kein Admin ist:
    /// "01 First User" für das erste Mitglied, sonst "Early Access". Ein Premium-Abzeichen
    /// gibt es dort nicht – wer eines einbaut, erfindet eine Rangfolge, die es nicht geben soll.
    private var roleBadge: some View {
        Text(isFirstUser ? "01  First User" : "Early Access")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 11)
            .frame(minHeight: 24)
            .background {
                if isFirstUser {
                    LinearGradient(
                        colors: [Color(red: 145 / 255, green: 72 / 255, blue: 1).opacity(0.92),
                                 Color(red: 49 / 255, green: 170 / 255, blue: 1).opacity(0.88)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .clipShape(Capsule())
                } else {
                    Capsule().fill(Color.black.opacity(0.32))
                }
            }
            .overlay {
                if isFirstUser {
                    Capsule().stroke(Color.white.opacity(0.52), lineWidth: 1)
                }
            }
            .accessibilityElement(children: .combine)
    }

    /// Avatar 88 pt in drei Schichten, wie im Desktop: außen der Verlauf, darin eine Fläche in
    /// background1 mit 3 pt Abstand, darin wieder der Verlauf mit weiteren 3 pt. Das Bild liegt darauf.
    private var avatar: some View {
        ZStack {
            CardThemeFill(design: design)
                .clipShape(RoundedRectangle(cornerRadius: 88 * avatarRatio, style: .continuous))
            RoundedRectangle(cornerRadius: 82 * avatarRatio, style: .continuous)
                .fill(design.background1)
                .frame(width: 82, height: 82)
            CardThemeFill(design: design)
                .clipShape(RoundedRectangle(cornerRadius: 76 * avatarRatio, style: .continuous))
                .frame(width: 76, height: 76)
            avatarFace
                .frame(width: 76, height: 76)
                .clipShape(RoundedRectangle(cornerRadius: 76 * avatarRatio, style: .continuous))
        }
        .frame(width: 88, height: 88)
        .accessibilityHidden(true)
    }

    /// Das Profilbild über CardMedia. Solange es lädt oder fehlt, steht die Initiale.
    /// Ein Fehler beim Laden lässt die Initiale stehen.
    @ViewBuilder
    private var avatarFace: some View {
        if let avatarURL {
            AsyncImage(url: avatarURL) { phase in
                if case .success(let image) = phase {
                    image
                        .resizable()
                        .scaledToFill()
                } else {
                    initialLetter
                }
            }
        } else {
            initialLetter
        }
    }

    private var initialLetter: some View {
        Text(verbatim: initial)
            .font(.system(size: 34, weight: .bold))
            .foregroundStyle(onAccent)
    }

    /// Name, verifiziert-Haken und Rolle. Die Rollenzeile bleibt auch leer stehen, damit die Höhe gleich bleibt.
    private var identityBlock: some View {
        VStack(alignment: centered ? .center : .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 5) {
                Text(name)
                    .font(.system(size: 26, weight: .bold))
                    .tracking(-0.78)
                    .foregroundStyle(design.text1)
                    .multilineTextAlignment(centered ? .center : .leading)
                    .fixedSize(horizontal: false, vertical: true)
                if card.isVerified {
                    verifiedMark
                }
            }
            Text(verbatim: roleLine.isEmpty ? " " : roleLine)
                .font(.system(size: 15))
                .foregroundStyle(design.text2)
                .multilineTextAlignment(centered ? .center : .leading)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityHidden(roleLine.isEmpty)
        }
        .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
    }

    /// 18 pt Kreis im Verlauf #4CB7FF nach #6E6CFF mit weißem Haken und blauem Schein, wie im Desktop.
    private var verifiedMark: some View {
        Image(systemName: "checkmark")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 18, height: 18)
            .background(
                LinearGradient(colors: [Color(hex: 0x4CB7FF), Color(hex: 0x6E6CFF)],
                               startPoint: .topLeading, endPoint: .bottomTrailing),
                in: Circle()
            )
            .shadow(color: Color(hex: 0x4CB7FF).opacity(0.42), radius: 5)
            .accessibilityLabel("Verifiziert")
    }

    /// Inhalt unter dem Avatar: Name, Blöcke, Trennlinie und Fußbereich.
    /// 24 pt Seitenabstand, 14 pt zwischen den Blöcken. Oben 62 pt, weil der Avatar 48 pt unter den Kopfbereich ragt.
    private var details: some View {
        VStack(alignment: centered ? .center : .leading, spacing: 14) {
            identityBlock
            ForEach(shownBlocks, id: \.self) { block in
                blockView(block)
            }
            divider
            footer
        }
        .padding(.horizontal, 24)
        .padding(.top, 62)
        .padding(.bottom, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func blockView(_ block: String) -> some View {
        switch block {
        case "place":
            placeLine
        case "pitch":
            if let pitch = card.pitch.nonEmptyText {
                pitchText(pitch)
            }
        case "skills":
            skillChips
        case "stats":
            statTiles
        case "looking":
            if let looking = card.looking.nonEmptyText {
                lookingPill(looking)
            }
        default:
            EmptyView()
        }
    }

    private var placeLine: some View {
        Label(place, systemImage: "mappin.and.ellipse")
            .font(.system(size: 14))
            .foregroundStyle(design.text3)
            .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
    }

    /// 17 pt halbfett, Buchstabenabstand −0,25, Zeilenhöhe 1,4 (als Zeilenabstand umgesetzt).
    private func pitchText(_ pitch: String) -> some View {
        Text(pitch)
            .font(.system(size: 17, weight: .semibold))
            .tracking(-0.25)
            .lineSpacing(17 * 0.4)
            .foregroundStyle(design.text1)
            .multilineTextAlignment(centered ? .center : .leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
    }

    /// Chips mit Höhe 28 und Radius 14, Innenabstand 12 links und rechts, Abstand 6.
    /// Gedeckelt, weil die Liste aus einem fremden Profil kommt: Die Website begrenzt auf
    /// vier, aber darauf verlassen wir uns nicht, wenn die Daten über zwei Server laufen.
    private var skillChips: some View {
        ChipFlow(spacing: 6, alignment: centered ? .center : .leading) {
            ForEach(Array(card.skills.prefix(20).enumerated()), id: \.offset) { _, skill in
                Text(verbatim: skill)
                    .font(.system(size: 13))
                    .foregroundStyle(design.text1)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 28)
                    .background(design.chip, in: Capsule())
            }
        }
    }

    /// Zwei Kacheln nebeneinander, Abstand 8. Ohne Erfahrungsstufe bleibt die Zeit-Kachel halb breit.
    private var statTiles: some View {
        HStack(alignment: .top, spacing: 8) {
            statTile(title: "Zeit", value: "\(hours) Std./Woche") {
                progressBar(min(1, CGFloat(hours) / 20))
            }
            if let level {
                statTile(title: "Erfahrung", value: level) {
                    levelBar
                }
            } else {
                Color.clear
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(maxWidth: .infinity)
    }

    /// Kachel mit 16 pt Radius, Innenabstand oben 11, links und rechts 12, unten 12.
    /// Die Kachel fasst ihre Teile zu einem Element zusammen, damit VoiceOver "Zeit, 12 Std./Woche" liest.
    private func statTile<Bar: View>(title: String, value: String, @ViewBuilder bar: () -> Bar) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(verbatim: title)
                .font(.system(size: 12))
                .foregroundStyle(design.text3)
            Text(verbatim: value)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(design.text1)
                .fixedSize(horizontal: false, vertical: true)
            bar()
                .padding(.top, 5)
        }
        .padding(.top, 11)
        .padding(.leading, 12)
        .padding(.trailing, 12)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(design.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    /// Balken 4 pt hoch mit Radius 2: Spur, darüber der Verlauf bis zum Füllstand.
    private func progressBar(_ fraction: CGFloat) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(design.track)
                CardThemeFill(design: design)
                    .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
                    .frame(width: geo.size.width * fraction)
            }
        }
        .frame(height: 4)
    }

    /// Drei Stufen wie im Desktop: bis zur erreichten Stufe im Verlauf, der Rest in der Spurfarbe.
    private var levelBar: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                ZStack {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(design.track)
                    if index <= levelIndex {
                        CardThemeFill(design: design)
                            .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 4)
            }
        }
    }

    /// "Sucht" und der Wert im Verlauf. Die Pille hat Höhe 30 und ist so breit wie nötig.
    private func lookingPill(_ looking: String) -> some View {
        HStack(spacing: 6) {
            Text(verbatim: "Sucht")
                .font(.system(size: 13))
                .foregroundStyle(design.text3)
            Text(verbatim: looking)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(themeTextGradient)
        }
        .padding(.horizontal, 13)
        .frame(minHeight: 30)
        .background(design.chip, in: Capsule())
        .accessibilityElement(children: .combine)
        .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
    }

    private var divider: some View {
        Rectangle()
            .fill(design.line)
            .frame(height: 1)
    }

    /// Fußbereich: Link-Button links, "xyntal.de/handle" rechtsbündig.
    private var footer: some View {
        HStack(spacing: 10) {
            linkButton
            if let handle = card.handle.nonEmptyText {
                Text(verbatim: "xyntal.de/\(handle)")
                    .font(.system(size: 13))
                    .foregroundStyle(design.text3)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .frame(maxWidth: .infinity)
    }

    /// Button mit 1 pt Rand, Höhe 44. Nur für einen https-Link.
    @ViewBuilder
    private var linkButton: some View {
        if let link {
            Link(destination: link) {
                Text(verbatim: "\(linkTitle) ↗")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(design.text1)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .overlay(Capsule().stroke(design.text2, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(linkTitle) öffnen")
        }
    }
}

/// Füllung im 120°-Verlauf des Themas, so wie `linear-gradient(120deg, …)` auf der Website und im Desktop.
/// Die Endpunkte werden aus der Größe der Fläche berechnet, damit der Winkel bei jeder Breite stimmt.
private struct CardThemeFill: View {
    let design: CardDesign

    var body: some View {
        GeometryReader { geo in
            let width = max(geo.size.width, 1)
            let height = max(geo.size.height, 1)
            // Länge der Verlaufslinie bei 120°: Breite · sin(120°) + Höhe · |cos(120°)|.
            let length = width * 0.866 + height * 0.5
            LinearGradient(
                stops: design.gradientStops,
                startPoint: UnitPoint(x: (width / 2 - 0.433 * length) / width,
                                      y: (height / 2 - 0.25 * length) / height),
                endPoint: UnitPoint(x: (width / 2 + 0.433 * length) / width,
                                    y: (height / 2 + 0.25 * length) / height)
            )
        }
    }
}

/// Ausrichtung der Zeilen in ChipFlow.
private enum ChipFlowAlignment {
    case leading, center, trailing
}

/// Legt Teile nebeneinander und bricht in die nächste Zeile um, wenn der Platz nicht reicht.
/// Jede Zeile richtet sich nach `alignment` aus. Rechtsbündig füllt die Fläche die volle Breite,
/// damit die Abzeichen am rechten Rand der Karte bleiben.
private struct ChipFlow: Layout {
    var spacing: CGFloat = 6
    var alignment: ChipFlowAlignment = .leading

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
        let width = alignment == .trailing && maxWidth.isFinite ? maxWidth : min(usedWidth, maxWidth)
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        // Erst die Zeilen bilden, dann jede Zeile nach der Ausrichtung verschieben.
        var rows: [(items: [(subview: LayoutSubview, size: CGSize)], width: CGFloat)] = []
        var items: [(subview: LayoutSubview, size: CGSize)] = []
        var rowWidth: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if !items.isEmpty && rowWidth + spacing + size.width > bounds.width {
                rows.append((items: items, width: rowWidth))
                items = []
                rowWidth = 0
            }
            rowWidth += (items.isEmpty ? 0 : spacing) + size.width
            items.append((subview: subview, size: size))
        }
        if !items.isEmpty {
            rows.append((items: items, width: rowWidth))
        }

        var y = bounds.minY
        for row in rows {
            let rowHeight = row.items.map { $0.size.height }.max() ?? 0
            let free = bounds.width - row.width
            let offset: CGFloat
            switch alignment {
            case .leading: offset = 0
            case .center: offset = free / 2
            case .trailing: offset = free
            }
            var x = bounds.minX + offset
            for item in row.items {
                item.subview.place(at: CGPoint(x: x, y: y), anchor: .topLeading,
                                   proposal: ProposedViewSize(item.size))
                x += item.size.width + spacing
            }
            y += rowHeight + spacing
        }
    }
}

#if DEBUG
/// Beispielkarten für die Vorschau: die Karte wird aus demselben JSON gelesen, das der Server schickt.
private enum XyntalCardPreviewData {
    static func card(_ json: String) -> WebsiteCard {
        try! JSONDecoder().decode(WebsiteCard.self, from: Data(json.utf8))
    }
}

#Preview("Karte – aurora, dunkel") {
    XyntalCardView(
        card: XyntalCardPreviewData.card("""
        {"user_id":"11111111-2222-3333-4444-555555555555","handle":"anna","name":"Anna Berg",
         "role":"Gründerin","level":"Profi","skills":["Swift","Vertrieb","Fundraising"],"hours":12,
         "mode":"Remote","city":"Berlin","looking":"Mitgründer",
         "pitch":"Ich baue eine Plattform für Handwerksbetriebe und suche Menschen, die Vertrieb können.",
         "link":"https://www.linkedin.com/in/anna","banner_path":null,"avatar_path":null,
         "is_verified":true,"is_admin":false,"is_beta_tester":true,"is_premium":true,
         "design":{"theme":"aurora","surface":"dark","order":["looking","stats","pitch","place","skills"]}}
        """),
        fallbackName: "Anna Berg"
    )
    .padding()
}

#Preview("Karte – mono, hell, zentriert") {
    XyntalCardView(
        card: XyntalCardPreviewData.card("""
        {"user_id":"11111111-2222-3333-4444-666666666666","handle":"max","name":"Max Weber",
         "role":"Unternehmer","level":"Einsteiger","skills":["Marketing","Recruiting"],"hours":4,
         "mode":"Vor Ort","city":"Hamburg","looking":"Kunden","pitch":"Ich verkaufe Software an Mittelständler.",
         "link":"https://example.com","banner_path":null,"avatar_path":null,
         "is_verified":false,"is_admin":true,"is_beta_tester":false,"is_premium":false,
         "design":{"theme":"mono","surface":"light","layout":"center","shape":"rounded"}}
        """),
        fallbackName: nil
    )
    .padding()
}
#endif
