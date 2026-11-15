import Foundation
import Observation

/// Entwurf einer Schreibzeile für genau einen Kanal: Text und Anhänge. Je Kanal ein eigener, damit nichts in einen
/// anderen Kanal wandert. Wer den Kanal wechselt und zurückkommt, findet seinen Entwurf wieder.
@MainActor
@Observable
final class PostDraft {
    let channelId: String
    var text = ""
    let composer = AttachmentComposer()

    init(channelId: String) {
        self.channelId = channelId
    }
}

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
    /// Der gemeinsame Versand. Beiträge laufen über ihn, damit Upload und Wiederaufnahme wie im Chat funktionieren.
    private let outgoing: OutgoingStore
    private var detailGeneration = 0
    private var postsGeneration = 0
    private var likingPostIds: Set<String> = []
    private var deletingPostIds: Set<String> = []
    /// Entwürfe je Kanal. Angelegt, sobald die Kanäle bekannt sind.
    private var drafts: [String: PostDraft] = [:]

    init(session: SessionStore, communityId: String, outgoing: OutgoingStore) {
        self.session = session
        self.communityId = communityId
        self.outgoing = outgoing
    }

    // MARK: - Abgeleitete Werte

    var selectedChannel: MemberCommunity.Channel? {
        channels.first { $0.id == selectedChannelId }
    }

    /// Schreibzeile nur, wenn du im gewählten Kanal schreiben darfst. Die Rechte gelten pro Kanal, nicht pro Community.
    var canPostHere: Bool {
        selectedChannel?.canPost == true
    }

    /// Ausstehende Beiträge des gewählten Kanals, die noch hochladen oder fehlgeschlagen sind.
    var pendingPosts: [OutgoingMessage] {
        guard let selectedChannelId else { return [] }
        return outgoing.messages(for: .channel(selectedChannelId))
    }

    /// Entwurf des gewählten Kanals. nil, solange der Kanal nicht bekannt ist.
    var selectedDraft: PostDraft? {
        selectedChannelId.flatMap { drafts[$0] }
    }

    /// Hinweis nach einem Abbruch, der zum gewählten Kanal gehört.
    var selectedNotice: String? {
        guard let selectedChannelId else { return nil }
        return outgoing.notice(for: .channel(selectedChannelId))
    }

    func dismissSelectedNotice() {
        guard let selectedChannelId else { return }
        outgoing.dismissNotice(for: .channel(selectedChannelId))
    }

    /// Steigt, sobald ein Beitrag im gewählten Kanal angekommen ist. Die Ansicht lädt daraufhin neu.
    var deliveredCount: Int {
        guard let selectedChannelId else { return 0 }
        return outgoing.deliveredEvents[.channel(selectedChannelId)] ?? 0
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
            for channel in channels where drafts[channel.id] == nil {
                drafts[channel.id] = PostDraft(channelId: channel.id)
            }
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
        // Was im verlassenen Kanal zugestellt wurde, zeigt er nicht mehr. Der Kanal lädt beim Zurückkommen neu.
        dropDeliveredPosts()
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

    /// Schickt einen Beitrag in den Kanal des Entwurfs. false, wenn gerade keine Verbindung besteht. Dann bleibt alles
    /// beim Aufrufer. Ohne Schreibrecht in diesem Kanal wird nichts gestartet.
    func submitPost(from draft: PostDraft, body: String, attachments: [ComposerAttachment]) -> Bool {
        guard channels.contains(where: { $0.id == draft.channelId && $0.canPost }) else { return false }
        return outgoing.submit(target: .channel(draft.channelId), body: body, replyToId: nil, attachments: attachments)
    }

    /// Abbrechen eines Beitrags: Anhänge und Text kommen zurück in den Entwurf seines Kanals, nicht in den gerade offenen.
    func cancelPost(_ message: OutgoingMessage) {
        let restored = outgoing.cancel(message)
        guard case .channel(let channelId) = message.target, let draft = drafts[channelId] else {
            for attachment in restored.attachments {
                AttachmentFiles.remove(attachment.fileURL)
            }
            return
        }
        draft.composer.restore(restored.attachments)
        if !restored.body.isEmpty {
            draft.text = draft.text.isEmpty ? restored.body : draft.text + "\n" + restored.body
        }
    }

    /// Entfernt zugestellte Beiträge aus dem Versand, und zwar aller Kanäle der Community. Ein Beitrag, der in einem
    /// Kanal ankam, während man woanders war, bleibt sonst für immer liegen.
    func dropDeliveredPosts() {
        for channel in channels {
            outgoing.dropDelivered(for: .channel(channel.id))
        }
    }

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
