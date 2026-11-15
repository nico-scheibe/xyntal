import Foundation
import Observation

/// Eine Community, in der du Mitglied bist: Kanäle, Beiträge des gewählten Kanals, „Gefällt mir“ und Löschen.
/// Braucht ein Konto. Der Server liefert pro Kanal alle Beiträge auf einmal; gezeigt werden davon 20 je Seite.
@MainActor
@Observable
final class MemberCommunityStore {
    /// Beiträge je Seite. Die Ansicht zeigt die nächste Seite, sobald das Listenende sichtbar wird.
    static let pageSize = 20

    private(set) var channels: [MemberCommunity.Channel] = []
    private(set) var canManage = false
    /// nil, solange keine Kanäle bekannt sind.
    private(set) var selectedChannelId: String?
    /// Alle Beiträge des gewählten Kanals, neueste zuerst.
    private(set) var posts: [ChannelPost] = []
    private(set) var visibleCount = MemberCommunityStore.pageSize
    /// true nach dem ersten abgeschlossenen Ladeversuch, auch wenn er fehlschlug.
    private(set) var hasLoaded = false
    private(set) var isLoadingPosts = false
    private(set) var loadError: String?
    /// Fehler einer Aktion (Reaktion, Löschen). Die Liste bleibt stehen.
    private(set) var actionError: String?

    private let session: SessionStore
    private let communityId: String
    private var detailGeneration = 0
    private var postsGeneration = 0
    private var likingPostIds: Set<String> = []
    private var deletingPostIds: Set<String> = []

    init(session: SessionStore, communityId: String) {
        self.session = session
        self.communityId = communityId
    }

    // MARK: - Abgeleitete Werte

    var selectedChannel: MemberCommunity.Channel? {
        channels.first { $0.id == selectedChannelId }
    }

    /// Die Beiträge der aktuellen Seite.
    var visiblePosts: [ChannelPost] {
        Array(posts.prefix(visibleCount))
    }

    var hasMorePosts: Bool {
        visibleCount < posts.count
    }

    /// Löschen dürfen der Autor und Moderatoren, wie der Server es prüft.
    func canDelete(_ post: ChannelPost) -> Bool {
        post.mine || canManage
    }

    // MARK: - Laden

    /// Lädt Kanäle und Rechte, danach die Beiträge des gewählten Kanals.
    func load() async {
        detailGeneration += 1
        let generation = detailGeneration
        do {
            let community = try await session.withAccess { token in
                try await self.session.api.memberCommunity(id: self.communityId, token: token)
            }
            guard generation == detailGeneration else { return }
            channels = community.channels
            canManage = community.canManage
            if !channels.contains(where: { $0.id == selectedChannelId }) {
                selectedChannelId = channels.first?.id
            }
            loadError = nil
        } catch is CancellationError {
            return
        } catch {
            guard generation == detailGeneration else { return }
            loadError = AppError.displayText(for: error)
            hasLoaded = true
            return
        }
        await loadPosts()
    }

    /// Wechselt den Kanal. Die Beiträge des alten Kanals verschwinden sofort.
    func select(channelId: String) async {
        guard channelId != selectedChannelId, channels.contains(where: { $0.id == channelId }) else { return }
        selectedChannelId = channelId
        posts = []
        visibleCount = Self.pageSize
        await loadPosts()
    }

    /// Zeigt die nächste Seite, wenn noch Beiträge übrig sind.
    func showMore() {
        guard hasMorePosts else { return }
        visibleCount += Self.pageSize
    }

    /// Lädt die Beiträge des gewählten Kanals. Zählt nur die Antwort des jüngsten Aufrufs.
    private func loadPosts() async {
        postsGeneration += 1
        let generation = postsGeneration
        guard let channelId = selectedChannelId else {
            posts = []
            hasLoaded = true
            return
        }
        isLoadingPosts = true
        do {
            let fresh = try await session.withAccess { token in
                try await self.session.api.channelPosts(channelId: channelId, token: token)
            }
            guard generation == postsGeneration else { return }
            posts = fresh
            loadError = nil
            isLoadingPosts = false
            hasLoaded = true
        } catch is CancellationError {
            return
        } catch {
            guard generation == postsGeneration else { return }
            loadError = AppError.displayText(for: error)
            isLoadingPosts = false
            hasLoaded = true
        }
    }

    // MARK: - Aktionen

    /// Schaltet dein „Gefällt mir“ um. Die Reaktionen kommen vom Server zurück.
    func toggleLike(_ post: ChannelPost) async {
        guard !likingPostIds.contains(post.id) else { return }
        likingPostIds.insert(post.id)
        defer { likingPostIds.remove(post.id) }
        do {
            let reactions = try await session.withAccess { token in
                try await self.session.api.toggleReaction(postId: post.id, emoji: ChannelPost.likeEmoji, token: token)
            }
            if let index = posts.firstIndex(where: { $0.id == post.id }) {
                posts[index].reactions = reactions
            }
            actionError = nil
        } catch is CancellationError {
            return
        } catch {
            actionError = AppError.displayText(for: error)
        }
    }

    /// Löscht einen Beitrag, den du löschen darfst. Danach verschwindet er aus der Liste.
    func delete(_ post: ChannelPost) async {
        guard canDelete(post), !deletingPostIds.contains(post.id) else { return }
        deletingPostIds.insert(post.id)
        defer { deletingPostIds.remove(post.id) }
        do {
            try await session.withAccess { token in
                try await self.session.api.deleteChannelPost(id: post.id, token: token)
            }
            posts.removeAll { $0.id == post.id }
            actionError = nil
        } catch is CancellationError {
            return
        } catch {
            actionError = AppError.displayText(for: error)
        }
    }
}
