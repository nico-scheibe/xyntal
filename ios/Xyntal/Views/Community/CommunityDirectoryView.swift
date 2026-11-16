import SwiftUI

// Regeln für alle Community-Ansichten. Sie gelten für den ganzen Community-Bereich, auch für Paket B.
// R1: Theme.accent ist nie Textfarbe. Er ist für Flächen (Text darauf in Theme.ink), Symbole und Linien da.
//     Warum: AccentContrast.minAccent liegt bei 3:1. Das reicht für Flächen und Symbole, aber nicht für kleine
//     Schrift, die 4,5:1 braucht. Der Akzent ist frei wählbar und kann als Textfarbe zu hell werden.
//     Daraus folgen ZWEI verschiedene Antworten, je nach Art der Stelle:
//     a) Wörter im Fließtext (etwa die „Gefällt mir“-Zeile oder #kanal) bleiben .primary bzw. Theme.muted.
//        Dort geht es nicht nur um Kontrast: Ein farbiges Wort mitten im Satz macht Unruhe.
//     b) Eigenständige Bedienelemente und Werkzeugleisten dürfen farbig sein, aber mit Theme.accentText.
//        Das ist derselbe Akzent, nur über AccentContrast.readable auf minText (4,5:1) gerechnet statt auf
//        minAccent. Bei dunklen Akzenten ändert sich nichts, helle werden so weit aufgehellt, bis es stimmt.
//     Gesperrte Bedienelemente sind ausgenommen: Sie sollen gedämpft aussehen, das ist die Information.
// R2: Theme.muted steht nur auf Schwarz, auf Theme.paper und auf secondarySystemGroupedBackground.
//     Auf allem Helleren (z. B. tertiarySystemGroupedBackground, Fortschrittsbalken) wird daraus .primary.

/// Tab „Community“ für angemeldete Nutzer: alle Communitys. Die offizielle Xyntal-Community öffnet den bestehenden Feed.
struct CommunityDirectoryView: View {
    @Environment(SessionStore.self) private var session

    @State private var store: CommunityDirectoryStore?
    /// Navigationspfad. Nach dem Gründen öffnet die App damit direkt die neue Community.
    @State private var path: [DiscoverCommunity] = []
    @State private var showCreate = false

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let store {
                    CommunityListContent(store: store) { showCreate = true }
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Community")
            // Großer Titel: Dieser Bildschirm hat keine Kanal-Kapseln, die der Titel verdecken könnte
            // (anders als die Feed-Ansicht in CommunityView.swift).
            .navigationBarTitleDisplayMode(.large)
            .navigationDestination(for: DiscoverCommunity.self) { community in
                if community.official {
                    CommunityFeedScreen()
                } else if let store {
                    CommunityDetailView(community: community, store: store)
                }
            }
            .toolbar {
                if store != nil {
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            showCreate = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Community gründen")
                    }
                }
            }
            .sheet(isPresented: $showCreate) {
                if let store {
                    CreateCommunitySheet(store: store) { created in
                        Task { await openCreatedCommunity(created, store: store) }
                    }
                }
            }
            .task {
                if store == nil {
                    store = CommunityDirectoryStore(session: session)
                }
                if let store, !store.hasLoaded {
                    await store.load()
                }
            }
        }
    }

    /// Lädt die Liste neu und öffnet die neue Community.
    /// Erste Wahl ist der Eintrag aus der frisch geladenen Liste, der hat die echten Werte. Fehlt er, springt die App
    /// mit dem Eintrag aus der Antwort des Servers. Der Grund: GET /communities/discover liefert höchstens 50 Einträge,
    /// sortiert nach Mitgliederzahl. Eine neue Community mit einem Mitglied steht ganz hinten und fehlt dann.
    private func openCreatedCommunity(_ created: DiscoverCommunity, store: CommunityDirectoryStore) async {
        await store.load()
        path = [store.community(id: created.id) ?? created]
    }
}

/// „1 Mitglied“ oder „1.280 Mitglieder“. Die Zahl steht so da, wie sie ist, ohne Beschönigung.
private func memberCountText(_ count: Int) -> String {
    count == 1 ? "1 Mitglied" : "\(count.formatted()) Mitglieder"
}

/// „1 Kanal“ oder „3 Kanäle“.
private func channelCountText(_ count: Int) -> String {
    count == 1 ? "1 Kanal" : "\(count.formatted()) Kanäle"
}

/// Inhalt des Verzeichnisses mit Lade-, Fehler- und Leerzustand.
private struct CommunityListContent: View {
    let store: CommunityDirectoryStore
    let onCreate: () -> Void

    /// Deine Communitys: die offizielle zuerst, sonst die Reihenfolge des Servers.
    /// Die Trennung per Filter statt sort(), weil sort() die Reihenfolge innerhalb der Gruppen nicht garantiert erhält.
    private var memberCommunities: [DiscoverCommunity] {
        let members = store.communities.filter(\.isMember)
        return members.filter(\.official) + members.filter { !$0.official }
    }

    /// Entdecken: alles, dem du noch nicht angehörst, in der Reihenfolge des Servers.
    private var discoverCommunities: [DiscoverCommunity] {
        store.communities.filter { !$0.isMember }
    }

    var body: some View {
        if store.communities.isEmpty && !store.hasLoaded {
            CommunityLoadingPlaceholder()
        } else if store.communities.isEmpty, let loadError = store.loadError {
            ContentUnavailableView {
                Label("Communitys nicht geladen", systemImage: "wifi.exclamationmark")
            } description: {
                Text(loadError)
            } actions: {
                // Bordered-Knopf: nach R1 Primärfarbe statt Akzent.
                Button("Erneut versuchen") { Task { await store.load() } }
                    .buttonStyle(.bordered)
                    .tint(.primary)
                    .foregroundStyle(.primary)
            }
        } else if store.communities.isEmpty {
            ContentUnavailableView {
                Label("Noch keine Communitys", systemImage: "person.3")
            } description: {
                Text("Gründe die erste, dann findest du sie hier.")
            } actions: {
                CreateCommunityButton(action: onCreate)
            }
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if let loadError = store.loadError {
                        ReloadErrorBanner(message: loadError) { Task { await store.load() } }
                            .padding(.bottom, 12)
                    }

                    if !memberCommunities.isEmpty {
                        sectionHeader("Deine Communitys")
                        CommunityGroup(communities: memberCommunities, showsTags: false)
                    }

                    if !discoverCommunities.isEmpty {
                        sectionHeader("Entdecken")
                        CommunityGroup(communities: discoverCommunities, showsTags: true)
                    }

                    // Ruhiger Abschluss ohne Hintergrund, für alle, die nichts Passendes gefunden haben.
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Nichts Passendes dabei?")
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                        CreateCommunityButton(action: onCreate)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 24)
                    .padding(.bottom, 32)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .refreshable { await store.load() }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.title3.weight(.semibold))
            .foregroundStyle(.primary)
            .textCase(nil)
            .accessibilityAddTraits(.isHeader)
            .padding(.horizontal, 16)
            .padding(.top, 24)
            .padding(.bottom, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Schlagwort ohne führendes „#“. Das Zeichen setzt die Anzeige selbst, sonst stünde „##Swift“ da.
/// Gilt auch fürs Hinzufügen im Gründen-Blatt, damit der Server nie „#Swift“ speichert.
func tagLabel(_ tag: String) -> String {
    String(tag.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespacesAndNewlines))
}

/// Eine Gruppe aus Zeilen. Die offizielle Community ist eine große Karte, die übrigen sind ruhige Zeilen mit Trennern.
private struct CommunityGroup: View {
    let communities: [DiscoverCommunity]
    /// Schlagwörter zeigen die Zeilen nur in „Entdecken“, dort helfen sie bei der Auswahl.
    let showsTags: Bool

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Muss dieselben Werte haben wie CommunityRow, sonst passt der Trenner nicht zur Textkante.
    @ScaledMetric(relativeTo: .headline) private var tileSize: CGFloat = 52

    /// Einzug des Trenners aus dem Layout der Zeile: 16 pt Rand, Kachel, 14 pt Abstand. Im Accessibility-Layout
    /// steht die Kachel über dem Text, dort beginnt der Text am Rand, also auch der Trenner.
    private var dividerLeading: CGFloat {
        dynamicTypeSize.isAccessibilitySize ? 16 : 16 + min(tileSize, 72) + 14
    }

    var body: some View {
        ForEach(communities.indices, id: \.self) { index in
            let community = communities[index]
            if community.official {
                OfficialCommunityCard(community: community)
            } else {
                CommunityRow(community: community, showsTags: showsTags)
            }
            // Trenner dort, wo der Text beginnt. Nicht an Karten und nicht zur Karte hin.
            if index + 1 < communities.count, !community.official, !communities[index + 1].official {
                Divider()
                    .padding(.leading, dividerLeading)
                    .padding(.trailing, 16)
            }
        }
    }
}

/// Die offizielle Community als große Karte, ganz oben bei „Deine Communitys“. Sie öffnet den öffentlichen Feed.
private struct OfficialCommunityCard: View {
    let community: DiscoverCommunity

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Derselbe Satz wie in der Feed-Ansicht (CommunityView.swift), falls der Server keine Beschreibung schickt.
    private static let fallbackDescription = "Updates, Roadmap und Umfragen vom Xyntal-Team."

    var body: some View {
        NavigationLink(value: community) {
            // Der Chevron bleibt außerhalb der Schichtung, damit er auch ab Accessibility-Größe rechts steht.
            HStack(alignment: .center, spacing: 12) {
                communityTileStack(accessibility: dynamicTypeSize.isAccessibilitySize, alignment: .center, spacing: 12) {
                    AvatarView(name: community.name, avatar: community.avatar, size: 56, shape: .roundedSquare, tone: .calm)
                    VStack(alignment: .leading, spacing: 4) {
                        // Ab Accessibility-Größe steht „Offiziell“ unter dem Namen, damit der Name die volle Breite hat.
                        communityTitleStack(accessibility: dynamicTypeSize.isAccessibilitySize) {
                            Text(community.name.nonEmptyText ?? "Community")
                                .font(.title3.weight(.semibold))
                                .foregroundStyle(.primary)
                                .lineLimit(2)
                            officialBadge
                        }
                        Text((community.description.nonEmptyText ?? Self.fallbackDescription).communityRowSummary)
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                            .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.muted)
                    .accessibilityHidden(true)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            )
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            // Die ganze Karte ist tippbar, nicht nur der Name.
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Kapsel mit Haken und „Offiziell“. Der Haken ist ein Symbol, daher Akzentfarbe (R1).
    private var officialBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(Theme.accent)
                .accessibilityHidden(true)
            Text("Offiziell")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.primary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.08), lineWidth: 1))
        .fixedSize()
    }
}

/// Eine Zeile: Kachel, Name, Kurzbeschreibung, Kategorie · Mitglieder und in „Entdecken“ die ersten Schlagwörter.
private struct CommunityRow: View {
    let community: DiscoverCommunity
    let showsTags: Bool

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Die Kachel wächst mit der Schrift, bleibt aber unter 72 pt, damit die Zeile nicht zu hoch wird.
    @ScaledMetric(relativeTo: .headline) private var tileSize: CGFloat = 52

    private var tile: CGFloat { min(tileSize, 72) }

    private var isAccessibilitySize: Bool { dynamicTypeSize.isAccessibilitySize }

    /// Ab Accessibility-Größe steht die Kachel über dem Text statt daneben. Dieselbe Schichtung wie in der offiziellen Karte.
    private var layout: AnyLayout {
        communityTileLayout(accessibility: isAccessibilitySize, alignment: .top, spacing: 14)
    }

    private var metaText: String {
        [community.category.nonEmptyText, memberCountText(community.memberCount)]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    /// Die ersten zwei Schlagwörter, z. B. „#Swift  #Vertrieb“.
    private var tagText: String? {
        let tags = community.tags.prefix(2).map { "#\(tagLabel($0))" }
        return tags.isEmpty ? nil : tags.joined(separator: "  ")
    }

    var body: some View {
        NavigationLink(value: community) {
            layout {
                AvatarView(name: community.name, avatar: community.avatar, size: tile, shape: .roundedSquare, tone: .calm)
                VStack(alignment: .leading, spacing: 3) {
                    Text(community.name.nonEmptyText ?? "Community")
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    if let description = community.description.nonEmptyText {
                        Text(description.communityRowSummary)
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                            .lineLimit(isAccessibilitySize ? 4 : 2)
                    }
                    Text(metaText)
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)
                    if showsTags, let tagText {
                        Text(tagText)
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
        }
        .buttonStyle(.plain)
    }
}

/// Der Knopf „Community gründen“ als ruhiger Textknopf. Nach R1 Primärfarbe statt Akzent.
private struct CreateCommunityButton: View {
    let action: () -> Void

    var body: some View {
        Button("Community gründen", action: action)
            .buttonStyle(.bordered)
            .tint(.primary)
            .foregroundStyle(.primary)
            .frame(minHeight: 44)
    }
}

/// Platzhalter beim ersten Laden: vier Zeilen in der Form der echten Zeilen, ohne echten Inhalt.
private struct CommunityLoadingPlaceholder: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(0..<4, id: \.self) { _ in
                HStack(alignment: .top, spacing: 14) {
                    AvatarView(name: "Community", avatar: nil, size: 52, shape: .roundedSquare, tone: .calm)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Name einer Community")
                            .font(.headline)
                        Text("Eine kurze Beschreibung der Community")
                            .font(.subheadline)
                        Text("Kategorie · Mitglieder")
                            .font(.footnote)
                    }
                }
                .padding(.vertical, 12)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .redacted(reason: .placeholder)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Communitys werden geladen")
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

/// Detail einer Community, die du nicht besitzt: Name, Beschreibung, Kategorie, Themen, Zahlen und Beitreten.
/// Beiträge zeigt die App hier nicht; der Server liefert sie für Nicht-Mitglieder nicht.
struct CommunityDetailView: View {
    let community: DiscoverCommunity
    let store: CommunityDirectoryStore

    /// Name für den Hinweis „Willkommen in …“ direkt nach dem Beitritt. nil, wenn gerade kein Hinweis steht.
    @State private var welcomeName: String?

    /// Die aktuelle Fassung aus dem Store, damit „Beitreten“ sofort sichtbar wirkt.
    private var current: DiscoverCommunity {
        store.community(id: community.id) ?? community
    }

    /// Der Beitritt ist genau für diese Community am fehlenden Arbeitsstil-Test gescheitert.
    /// Dann zeigt die Leiste den Test statt „Beitreten“, weil der Server den Beitritt in diesem Zustand ablehnt.
    private var needsAssessmentFirst: Bool {
        store.joinNeedsAssessment && store.joinErrorId == current.id
    }

    var body: some View {
        Group {
            if current.isMember {
                CommunityMemberView(community: current, welcome: welcomeName) { avatar in
                    store.updateAvatar(avatar, communityId: community.id)
                }
            } else {
                nonMemberList
            }
        }
        // Der Titel steht hier aussen und nicht nur in den beiden Zweigen: Beim Sprung direkt nach dem
        // Gründen ist die Navigationsleiste schon gebaut, wenn der innere Inhalt seinen Titel setzt,
        // und der Bildschirm bleibt dann ohne Überschrift. Gemessen: von der Liste geöffnet war der
        // Titel da, nach dem Gründen nicht.
        .navigationTitle(current.name.nonEmptyText ?? "Community")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: current.isMember) { _, isMember in
            // Nach dem Beitritt erscheint der Strom auf diesem Bildschirm, mit einem kurzen Hinweis.
            guard isMember else { return }
            welcomeName = current.name.nonEmptyText ?? "Community"
            Task {
                try? await Task.sleep(for: .seconds(4))
                welcomeName = nil
            }
        }
    }

    /// Ansicht für Nicht-Mitglieder: kein Formular, sondern eine lesbare Seite. Unten die feste Beitritt-Leiste,
    /// an der Stelle, wo Mitglieder die Schreibzeile haben. So ist der Unterschied auf einen Blick sichtbar.
    private var nonMemberList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                AvatarView(name: current.name, avatar: current.avatar, size: 64, shape: .roundedSquare, tone: .calm)

                VStack(alignment: .leading, spacing: 12) {
                    Text(current.name.nonEmptyText ?? "Community")
                        .font(.title2.bold())
                        .foregroundStyle(.primary)
                    if let category = current.category.nonEmptyText {
                        Text(category)
                            .font(.subheadline)
                            .foregroundStyle(Theme.muted)
                    }
                }

                // Die Beschreibung ist der Text, der überzeugt, deshalb in voller Länge.
                if let description = current.description.nonEmptyText {
                    Text(description)
                        .font(.body)
                        .foregroundStyle(.primary)
                        .lineSpacing(3)
                }

                Text("\(memberCountText(current.memberCount)) · \(channelCountText(current.channelCount))")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)

                if !current.tags.isEmpty {
                    ChipFlow(spacing: 8, alignment: .leading) {
                        ForEach(Array(current.tags.enumerated()), id: \.offset) { _, tag in
                            Text(verbatim: "#\(tagLabel(tag))")
                                .font(.footnote)
                                .foregroundStyle(.primary)
                                .padding(.horizontal, 12)
                                .frame(minHeight: 28)
                                .background(Capsule().fill(Color.primary.opacity(0.08)))
                        }
                    }
                }

                lockSurface
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .safeAreaInset(edge: .bottom) {
            joinBar
        }
    }

    /// Hinweis, dass Beiträge nur Mitglieder sehen. Sagt nur etwas über die Sichtbarkeit, nicht über den Inhalt.
    private var lockSurface: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "lock.fill")
                .font(.title3)
                .foregroundStyle(Theme.accent)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text("Die Beiträge sind für Mitglieder")
                    .font(.headline)
                    .foregroundStyle(.primary)
                Text("Tritt bei, um mitzulesen und selbst zu schreiben.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }

    /// Die feste Leiste unten: Fehler, dann „Beitreten“ oder der Arbeitsstil-Test.
    private var joinBar: some View {
        VStack(spacing: 10) {
            if let joinError = store.joinError, store.joinErrorId == current.id {
                Text(joinError)
                    .font(.subheadline)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if needsAssessmentFirst {
                NavigationLink {
                    WorkStyleTestView { _ in
                        store.assessmentCompleted()
                    }
                } label: {
                    Text("Arbeitsstil-Test machen")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                // Bordered-Knopf: nach R1 Primärfarbe statt Akzent.
                .buttonStyle(.bordered)
                .tint(.primary)
                .foregroundStyle(.primary)
            } else {
                JoinButton(isBusy: store.joiningId == current.id) {
                    Task { await store.join(current.id) }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(.bar)
    }
}

/// „Beitreten“ als volle Breite. Die Fläche trägt den Akzent, der Text darauf ist Theme.ink (R1).
/// Während des Beitritts steht ein Spinner statt des Textes, und der Knopf ist gesperrt.
private struct JoinButton: View {
    let isBusy: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if isBusy {
                    ProgressView()
                        .tint(Theme.ink)
                } else {
                    Text("Beitreten")
                        .font(.headline)
                        .foregroundStyle(Theme.ink)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Theme.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .accessibilityLabel("Beitreten")
    }
}

fileprivate extension String {
    /// Beschreibung für eine Listenzeile. Absätze und Zeilenumbrüche aus den Daten werden zu einfachen
    /// Leerzeichen: In der Zeile stehen nur zwei Zeilen zur Verfügung, und ein Umbruch würde eine davon
    /// leer lassen — die Zeile sieht dann kaputt aus, obwohl der Text in Ordnung ist.
    /// In der Detailansicht bleibt der Text ungekürzt und mit seinen Absätzen stehen, dort tragen sie.
    var communityRowSummary: String {
        split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }
}
