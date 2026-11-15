import SwiftUI

/// Mitglied-Zustand einer Community: Kopf, Kanal-Kapseln und Beitragsstrom. Erscheint in CommunityDetailView,
/// sobald du Mitglied bist, auch direkt nach dem Beitreten auf demselben Bildschirm.
struct CommunityMemberView: View {
    @Environment(SessionStore.self) private var session

    let community: DiscoverCommunity
    /// Name für den Hinweis „Willkommen in {Name}“. nil, wenn gerade kein Hinweis gezeigt wird.
    let welcome: String?

    @State private var store: MemberCommunityStore?

    var body: some View {
        Group {
            if let store {
                MemberFeedContent(community: community, store: store, welcome: welcome)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task {
            if store == nil {
                store = MemberCommunityStore(session: session, communityId: community.id)
            }
            if let store, !store.hasLoaded {
                await store.load()
            }
        }
    }
}

/// Kopf, Hinweis, Kanal-Kapseln, Fehlerzeilen und die Beiträge.
private struct MemberFeedContent: View {
    let community: DiscoverCommunity
    let store: MemberCommunityStore
    let welcome: String?

    var body: some View {
        List {
            MemberHeader(community: community)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)

            if let welcome {
                Text("Willkommen in \(welcome)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Theme.accent, in: Capsule())
                    .frame(maxWidth: .infinity)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }

            // Hat die Community nur einen Kanal, entfällt die Leiste: es wirkt wie ein einfacher Feed.
            if store.channels.count > 1 {
                ChannelCapsules(channels: store.channels, selectedId: store.selectedChannelId) { channelId in
                    Task { await store.select(channelId: channelId) }
                }
                .listRowInsets(EdgeInsets())
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }

            if let actionError = store.actionError {
                Text(actionError)
                    .font(.subheadline)
                    .foregroundStyle(.red)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }

            if let loadError = store.loadError, store.hasLoaded, !store.posts.isEmpty {
                ReloadErrorBanner(message: loadError) { Task { await store.load() } }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }

            feedRows
        }
        .listStyle(.plain)
        .navigationTitle(community.name.nonEmptyText ?? "Community")
        .refreshable { await store.load() }
    }

    @ViewBuilder
    private var feedRows: some View {
        if !store.hasLoaded {
            ProgressView()
                .frame(maxWidth: .infinity)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        } else if store.posts.isEmpty, let loadError = store.loadError {
            ContentUnavailableView {
                Label("Beiträge nicht geladen", systemImage: "wifi.exclamationmark")
            } description: {
                Text(loadError)
            } actions: {
                Button("Erneut versuchen") { Task { await store.load() } }
            }
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
        } else if store.isLoadingPosts && store.posts.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity)
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        } else if store.posts.isEmpty {
            emptyState
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        } else {
            ForEach(store.visiblePosts) { post in
                MemberPostView(post: post,
                               canDelete: store.canDelete(post),
                               onToggleLike: { Task { await store.toggleLike(post) } },
                               onDelete: { Task { await store.delete(post) } })
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    .onAppear {
                        // Der letzte sichtbare Beitrag blendet die nächste Seite ein.
                        if post.id == store.visiblePosts.last?.id {
                            store.showMore()
                        }
                    }
            }
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if store.channels.count > 1, let channel = store.selectedChannel {
            ContentUnavailableView("In \(channel.name) ist noch nichts", systemImage: "bubble.left")
        } else {
            ContentUnavailableView {
                Label("Hier ist noch nichts los", systemImage: "bubble.left.and.bubble.right")
            } description: {
                Text("Schreib den ersten Beitrag: eine Frage, eine Idee oder ein kurzes Hallo.")
            }
        }
    }
}

/// Avatar, Name und dein Status als Mitglied.
private struct MemberHeader: View {
    let community: DiscoverCommunity

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(name: community.name, avatar: community.avatar, size: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(community.name.nonEmptyText ?? "Community")
                    .font(.headline)
                Text("Du bist Mitglied")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// Kanäle als waagerecht scrollende Kapseln, ohne „#“. 36 pt hoch, wächst mit Dynamic Type.
private struct ChannelCapsules: View {
    let channels: [MemberCommunity.Channel]
    let selectedId: String?
    let onSelect: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(channels) { channel in
                    capsule(channel)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
    }

    private func capsule(_ channel: MemberCommunity.Channel) -> some View {
        let isSelected = channel.id == selectedId
        return Button {
            onSelect(channel.id)
        } label: {
            Text(verbatim: channel.name)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .lineLimit(1)
                .foregroundStyle(isSelected ? Theme.ink : .primary)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(isSelected ? Theme.accent : Color(.secondarySystemBackground), in: Capsule())
                .overlay {
                    if !isSelected {
                        Capsule().stroke(Color(.separator), lineWidth: 1)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}
