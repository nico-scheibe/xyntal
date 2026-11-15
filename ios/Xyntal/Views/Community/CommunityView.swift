import SwiftUI

/// Tab „Community“. Angemeldet: alle Communitys (CommunityDirectoryView). Gast: der öffentliche Xyntal-Feed, nur lesend und ohne Konto.
/// Mit onDone zeigt die Ansicht einen „Fertig“-Button, z. B. im Gast-Sheet der Anmeldung.
struct CommunityView: View {
    @Environment(SessionStore.self) private var session

    var onDone: (() -> Void)? = nil

    var body: some View {
        if session.state == .signedIn {
            CommunityDirectoryView()
        } else {
            NavigationStack {
                CommunityFeedScreen(onDone: onDone)
            }
            // „Fertig“ in der Werkzeugleiste als Text: Akzent, aber auf 4,5:1 abgesichert (Theme.accentText).
            .tint(Theme.accentText)
        }
    }
}

/// Der öffentliche Xyntal-Feed ohne Konto. Auch das Ziel der offiziellen Community in der Liste der Communitys.
struct CommunityFeedScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase

    var onDone: (() -> Void)? = nil

    @State private var store: CommunityStore?

    var body: some View {
        Group {
            if let store {
                CommunityFeedContent(store: store)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Community")
        // Inline statt Large Title: Der große Kopf hat die Kanal-Chips verdeckt und beim Scrollen Blur-Reste hinterlassen.
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let onDone {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig", action: onDone)
                }
            }
        }
        // Läuft neu an, wenn sich die Szene ändert: Im Hintergrund endet der Auto-Refresh, im Vordergrund startet er wieder.
        .task(id: scenePhase) {
            if store == nil {
                store = CommunityStore(api: session.api)
            }
            guard let store, scenePhase == .active else { return }
            await store.refreshIfStale()
            await store.runAutoRefresh { scenePhase == .active }
        }
        .onDisappear {
            store?.acknowledgeNewPosts()
        }
    }
}

/// Kopf, Kanal-Chips und Beitragsliste. Bekommt einen fertigen Store.
private struct CommunityFeedContent: View {
    let store: CommunityStore

    private var posts: [CommunityPost] { store.visiblePosts }

    var body: some View {
        if store.feed == nil && !store.hasLoaded {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store.feed == nil, let loadError = store.loadError {
            ContentUnavailableView {
                Label("Community nicht geladen", systemImage: "wifi.exclamationmark")
            } description: {
                Text(loadError)
            } actions: {
                Button("Erneut versuchen") { Task { await store.load() } }
            }
        } else {
            List {
                CommunityIdentityHeader(name: "Xyntal",
                                        avatar: store.communityAvatar,
                                        badge: "Offiziell",
                                        description: "Updates, Roadmap und Umfragen vom Xyntal-Team.")
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

                // Kanal-Kapseln als normale Zeile direkt unter dem Kopf; ohne Zeileneinzug, damit sie bis zum Rand scrollen.
                if !store.channels.isEmpty {
                    ChannelCapsules(options: [ChannelCapsuleOption(id: nil, title: "Alle")]
                                        + store.channels.map { ChannelCapsuleOption(id: $0, title: $0) },
                                    selectedId: store.selectedChannel) { channel in
                        store.select(channel: channel)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                }

                if let loadError = store.loadError, store.feed != nil {
                    ReloadErrorBanner(message: loadError) { Task { await store.load() } }
                        .listRowInsets(EdgeInsets())
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }

                if posts.isEmpty {
                    // Dieselbe Fläche wie im Mitglieder-Kanal, aber ohne Schreibanstöße: Der Strom ist nur lesbar.
                    CommunityEmptyCard(
                        icon: "person.3",
                        title: "Noch nichts hier",
                        text: store.selectedChannel == nil
                            ? "Hier erscheinen Neuigkeiten vom Xyntal-Team."
                            : "In diesem Kanal gibt es noch keine Beiträge."
                    )
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16))
                } else {
                    ForEach(posts) { post in
                        CommunityPostView(post: post,
                                          communityAvatar: store.communityAvatar,
                                          isNew: store.isNew(post))
                            // Flach wie im Mitglieder-Kanal: Trenner zwischen den Beiträgen, keine Fläche dahinter.
                            .listRowSeparatorTint(Color.primary.opacity(0.12))
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                    }
                }
            }
            .listStyle(.plain)
            .refreshable { await store.load() }
        }
    }
}
