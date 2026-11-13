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
                CommunityHeader(avatar: store.communityAvatar)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)

                // Kanal-Chips als normale Zeile direkt unter dem Kopf; ohne Zeileneinzug, damit sie bis zum Rand scrollen.
                if !store.channels.isEmpty {
                    ChannelChips(channels: store.channels, selected: store.selectedChannel) { channel in
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
                    ContentUnavailableView {
                        Label("Noch nichts hier", systemImage: "person.3")
                    } description: {
                        Text(store.selectedChannel == nil
                             ? "Noch keine Neuigkeiten aus der App."
                             : "In diesem Kanal gibt es noch keine Beiträge.")
                    }
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(posts) { post in
                        CommunityPostView(post: post,
                                          communityAvatar: store.communityAvatar,
                                          isNew: store.isNew(post))
                            .listRowSeparator(.hidden)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    }
                }

                Text("Mitreden, reagieren und abstimmen kannst du in der Xyntal-Desktop-App.")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
            .listStyle(.plain)
            .refreshable { await store.load() }
        }
    }
}

/// Avatar, Name und ein Satz, worum es hier geht.
private struct CommunityHeader: View {
    let avatar: String?

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(name: "Xyntal", avatar: avatar, size: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text("Xyntal")
                    .font(.headline)
                Text("Updates, Roadmap und Umfragen vom Xyntal-Team.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// Horizontale Chips: „Alle“ plus ein Chip je Kanal mit „#“.
private struct ChannelChips: View {
    let channels: [String]
    let selected: String?
    let onSelect: (String?) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(title: "Alle", isSelected: selected == nil) { onSelect(nil) }
                ForEach(channels, id: \.self) { channel in
                    chip(title: "#\(channel)", isSelected: selected == channel) { onSelect(channel) }
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    private func chip(title: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(verbatim: title)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .lineLimit(1)
                .foregroundStyle(isSelected ? Theme.ink : .primary)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? Theme.accent : Color(.secondarySystemBackground), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}
