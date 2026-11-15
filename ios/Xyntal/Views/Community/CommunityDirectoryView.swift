import SwiftUI

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
                    CommunityListContent(store: store)
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Community")
            .navigationBarTitleDisplayMode(.inline)
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

/// Liste mit Lade-, Fehler- und Leerzustand.
private struct CommunityListContent: View {
    let store: CommunityDirectoryStore

    var body: some View {
        if store.communities.isEmpty && !store.hasLoaded {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store.communities.isEmpty, let loadError = store.loadError {
            ContentUnavailableView {
                Label("Communitys nicht geladen", systemImage: "wifi.exclamationmark")
            } description: {
                Text(loadError)
            } actions: {
                Button("Erneut versuchen") { Task { await store.load() } }
            }
        } else if store.communities.isEmpty {
            ContentUnavailableView {
                Label("Noch keine Communitys", systemImage: "person.3")
            } description: {
                Text("Es gibt gerade keine Communitys.")
            }
        } else {
            List {
                if let loadError = store.loadError {
                    ReloadErrorBanner(message: loadError) { Task { await store.load() } }
                        .listRowInsets(EdgeInsets())
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }

                ForEach(store.communities) { community in
                    NavigationLink(value: community) {
                        CommunityRow(community: community)
                    }
                }
            }
            .listStyle(.plain)
            .refreshable { await store.load() }
        }
    }
}

/// Eine Zeile: Avatar, Name, Kurzbeschreibung, Kategorie und Mitgliederzahl.
private struct CommunityRow: View {
    let community: DiscoverCommunity

    private var name: String {
        community.name.nonEmptyText ?? "Community"
    }

    private var memberText: String {
        community.memberCount == 1 ? "1 Mitglied" : "\(community.memberCount) Mitglieder"
    }

    private var detailLine: String {
        [community.category.nonEmptyText, memberText].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AvatarView(name: community.name, avatar: community.avatar, size: 44)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(name)
                        .font(.headline)
                    if community.official {
                        Text("Offiziell")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.muted)
                    }
                }
                if let description = community.description.nonEmptyText {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .lineLimit(2)
                }
                Text(detailLine)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// Detail einer Community, die du nicht besitzt: Name, Beschreibung, Kategorie, Themen, Zahlen und Beitreten.
/// Beiträge zeigt die App hier nicht; der Server liefert sie für Nicht-Eigentümer nicht.
struct CommunityDetailView: View {
    let community: DiscoverCommunity
    let store: CommunityDirectoryStore

    /// Name für den Hinweis „Willkommen in …“ direkt nach dem Beitritt. nil, wenn gerade kein Hinweis steht.
    @State private var welcomeName: String?

    /// Die aktuelle Fassung aus dem Store, damit „Beitreten“ sofort sichtbar wirkt.
    private var current: DiscoverCommunity {
        store.community(id: community.id) ?? community
    }

    private var memberText: String {
        current.memberCount == 1 ? "1 Mitglied" : "\(current.memberCount) Mitglieder"
    }

    private var channelText: String {
        current.channelCount == 1 ? "1 Kanal" : "\(current.channelCount) Kanäle"
    }

    var body: some View {
        Group {
            if current.isMember {
                CommunityMemberView(community: current, welcome: welcomeName)
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

    private var nonMemberList: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        AvatarView(name: current.name, avatar: current.avatar, size: 56)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(current.name.nonEmptyText ?? "Community")
                                .font(.title3.weight(.semibold))
                            if let category = current.category.nonEmptyText {
                                Text(category)
                                    .font(.subheadline)
                                    .foregroundStyle(Theme.muted)
                            }
                        }
                    }
                    if let description = current.description.nonEmptyText {
                        Text(description)
                            .font(.body)
                    }
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
            }

            Section {
                LabeledContent("Mitglieder", value: memberText)
                LabeledContent("Kanäle", value: channelText)
            }

            if !current.tags.isEmpty {
                Section("Themen") {
                    Text(current.tags.map { "#\($0)" }.joined(separator: "  "))
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                }
            }

            Section {
                if current.isMember {
                    Label("Du bist Mitglied", systemImage: "checkmark.circle.fill")
                } else {
                    PrimaryButton(title: "Beitreten", isBusy: store.joiningId == current.id) {
                        Task { await store.join(current.id) }
                    }
                }
                if let joinError = store.joinError, store.joinErrorId == current.id {
                    Text(joinError)
                        .font(.subheadline)
                        .foregroundStyle(.red)
                    if store.joinNeedsAssessment {
                        NavigationLink("Arbeitsstil-Test machen") {
                            WorkStyleTestView { _ in
                                store.assessmentCompleted()
                            }
                        }
                    }
                }
            }

            // Beiträge sieht nur, wer Mitglied ist. Der Platz zeigt, was nach dem Beitritt kommt.
            Section {
                ContentUnavailableView {
                    Label("Noch keine Beiträge", systemImage: "bubble.left.and.bubble.right")
                } description: {
                    Text("Tritt bei und schreib den ersten.")
                }
                .listRowBackground(Color.clear)
            }
        }
        .navigationTitle(current.name.nonEmptyText ?? "Community")
        .navigationBarTitleDisplayMode(.inline)
    }
}
