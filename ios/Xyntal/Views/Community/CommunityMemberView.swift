import AVFoundation
import PhotosUI
import SwiftUI

/// Mitglied-Zustand einer Community: Kopf, Kanal-Kapseln und Beitragsstrom. Erscheint in CommunityDetailView,
/// sobald du Mitglied bist, auch direkt nach dem Beitreten auf demselben Bildschirm.
struct CommunityMemberView: View {
    @Environment(SessionStore.self) private var session
    @Environment(OutgoingStore.self) private var outgoing

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
                store = MemberCommunityStore(session: session, communityId: community.id, outgoing: outgoing)
            }
            if let store, !store.hasLoaded {
                await store.load()
            }
        }
    }
}

/// Kopf, Hinweis, Kanal-Kapseln, Fehlerzeilen und die Beiträge.
private struct MemberFeedContent: View {
    @Environment(OutgoingStore.self) private var outgoing

    let community: DiscoverCommunity
    let store: MemberCommunityStore
    let welcome: String?

    @State private var failedMessage: OutgoingMessage?

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

            pendingRows
            feedRows
        }
        .listStyle(.plain)
        .navigationTitle(community.name.nonEmptyText ?? "Community")
        .refreshable { await store.load() }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            // Der Entwurf gehört zum Kanal. Die Id sorgt dafür, dass Fotoauswahl und Vorschau beim Kanalwechsel zurückgesetzt werden.
            if store.canPostHere, let draft = store.selectedDraft {
                PostComposer(store: store, draft: draft)
                    .id(draft.channelId)
            }
        }
        .confirmationDialog("Nachricht nicht gesendet",
                            isPresented: failedBinding,
                            titleVisibility: .visible,
                            presenting: failedMessage) { message in
            Button("Erneut senden") { outgoing.retry(message) }
            Button("Löschen", role: .destructive) { outgoing.discard(message) }
            Button("Abbrechen", role: .cancel) {}
        } message: { message in
            Text(message.failureText ?? AttachmentRules.uploadFailedText)
        }
        .onChange(of: store.deliveredCount) { _, _ in
            // Der Beitrag steht jetzt auf dem Server: Kanal neu laden, dann die eigene Blase entfernen.
            Task {
                await store.load()
                store.dropDeliveredPosts()
            }
        }
        .onAppear {
            store.dropDeliveredPosts()
        }
    }

    private var failedBinding: Binding<Bool> {
        Binding(
            get: { failedMessage != nil },
            set: { if !$0 { failedMessage = nil } }
        )
    }

    /// Abbrechen während des Hochladens: Anhänge und Text kommen zurück in den Entwurf des Kanals.
    private func cancel(_ message: OutgoingMessage) {
        store.cancelPost(message)
    }

    /// Beiträge, die noch hochladen oder nicht angekommen sind. Sie stehen oben im Strom, wie unten im Chat.
    @ViewBuilder
    private var pendingRows: some View {
        ForEach(store.pendingPosts) { message in
            OutgoingBubble(message: message,
                           onCancel: { cancel(message) },
                           onTapFailed: { failedMessage = message })
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
        }
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
        } else if store.posts.isEmpty && store.pendingPosts.isEmpty {
            emptyState
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
        } else {
            ForEach(store.visiblePosts) { post in
                MemberPostView(post: post,
                               canDelete: store.canDelete(post),
                               canClosePoll: store.canManage,
                               pollBusy: store.isPollBusy(post),
                               onToggleLike: { Task { await store.toggleLike(post) } },
                               onDelete: { Task { await store.delete(post) } },
                               onVote: { option in Task { await store.vote(on: post, option: option) } },
                               onClosePoll: { Task { await store.closePoll(post) } })
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

    /// Der Titel nennt den Kanal, sobald es mehrere gibt – sonst weiß man nicht, worauf sich „leer“ bezieht.
    private var emptyTitle: String {
        if store.channels.count > 1, let channel = store.selectedChannel {
            return "In \(channel.name) ist noch nichts"
        }
        return store.canPostHere ? "Hier ist noch nichts los" : "Noch keine Beiträge"
    }

    @ViewBuilder
    private var emptyState: some View {
        // Die Aufforderung hängt allein am Schreibrecht, nicht an der Zahl der Kanäle: Wer schreiben darf,
        // soll sie auch in einer Community mit mehreren Kanälen sehen. Wer nicht darf, wird nicht aufgefordert.
        if store.canPostHere {
            ContentUnavailableView {
                Label(emptyTitle, systemImage: "bubble.left.and.bubble.right")
            } description: {
                Text("Schreib den ersten Beitrag: eine Frage, eine Idee oder ein kurzes Hallo.")
            }
        } else {
            ContentUnavailableView(emptyTitle, systemImage: "bubble.left")
        }
    }
}

/// Schreibzeile unten in der Community. Gleiche Bausteine wie im Chat: Anhangsleiste, „+“ und Senden.
/// Der Versand läuft im Hintergrund weiter, die Zeile ist sofort wieder frei. Nur sichtbar, wenn du im Kanal schreiben darfst.
/// Sie zeigt immer den Entwurf des gewählten Kanals.
private struct PostComposer: View {
    @Environment(OutgoingStore.self) private var outgoing

    let store: MemberCommunityStore
    @Bindable var draft: PostDraft

    @State private var showPhotoPicker = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showFileImporter = false
    @State private var showCamera = false
    @State private var showCameraDenied = false
    @State private var previewAttachment: ComposerAttachment?
    @State private var showPoll = false

    /// Der Server übernimmt höchstens so viele Zeichen und kürzt still. Die App kürzt vorher, damit man es beim Tippen sieht.
    private static let bodyLimit = 8000

    private var composer: AttachmentComposer { draft.composer }

    private var canSend: Bool {
        !draft.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !composer.items.isEmpty
    }

    var body: some View {
        VStack(spacing: 6) {
            if let notice = store.selectedNotice {
                HStack {
                    Text(notice)
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                    Spacer()
                    Button {
                        store.dismissSelectedNotice()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .accessibilityLabel("Hinweis ausblenden")
                }
            }

            if let errorText = composer.errorText {
                HStack {
                    Text(errorText)
                        .font(.caption)
                        .foregroundStyle(.red)
                    Spacer()
                    Button {
                        composer.clearError()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .accessibilityLabel("Fehler ausblenden")
                }
            }

            if !composer.items.isEmpty {
                AttachmentStrip(attachments: composer.items,
                                onRemove: { composer.remove($0) },
                                onPreview: { previewAttachment = $0 })
            }

            HStack(alignment: .bottom, spacing: 8) {
                AttachmentMenu(isFull: composer.isFull,
                               cameraAvailable: UIImagePickerController.isSourceTypeAvailable(.camera),
                               onPhotos: { showPhotoPicker = true },
                               onCamera: openCamera,
                               onFiles: { showFileImporter = true },
                               onPoll: store.canPoll ? openPoll : nil)

                TextField(composer.items.isEmpty ? "Schreib einen Beitrag" : "Beschriftung (optional)",
                          text: $draft.text, axis: .vertical)
                    .lineLimit(1...5)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))

                Button(action: send) {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 32))
                        .frame(width: 44, height: 44)
                }
                .disabled(!canSend)
                .accessibilityLabel("Senden")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
        .onChange(of: draft.text) { _, newValue in
            if newValue.utf16.count > Self.bodyLimit {
                draft.text = newValue.truncatedToUTF16(Self.bodyLimit)
            }
        }
        .photosPicker(isPresented: $showPhotoPicker,
                      selection: $photoItems,
                      maxSelectionCount: max(1, composer.remaining),
                      matching: .images)
        .onChange(of: photoItems) { _, items in
            guard !items.isEmpty else { return }
            photoItems = []
            Task { await addPhotos(items) }
        }
        .fileImporter(isPresented: $showFileImporter,
                      allowedContentTypes: [.item],
                      allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            Task { await addFiles(urls) }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraCapture { image in
                showCamera = false
                guard let image, let data = image.jpegData(compressionQuality: 0.95) else { return }
                Task { await addPhotoData([data]) }
            }
            .ignoresSafeArea()
        }
        .fullScreenCover(item: $previewAttachment) { attachment in
            AttachmentPreview(attachment: attachment)
        }
        .sheet(isPresented: $showPoll) {
            PollCreateSheet(store: store, channelId: draft.channelId)
        }
        .alert(AttachmentRules.cameraDeniedTitle, isPresented: $showCameraDenied) {
            Button("Einstellungen öffnen") { openSettings() }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text(AttachmentRules.cameraDeniedText)
        }
    }

    /// Text und Anhänge gehen in den Versand. Offline startet nichts, dann bleibt alles im Entwurf.
    private func send() {
        // Wie im Chat: Mehr als 10 Anhänge nimmt der Server nicht an. Das sagen wir vor dem Senden.
        guard composer.items.count <= AttachmentRules.maxPerMessage else {
            composer.errorText = AttachmentRules.tooManyText
            return
        }
        let text = draft.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !composer.items.isEmpty else { return }
        let items = composer.takeAll()
        if store.submitPost(from: draft, body: text, attachments: items) {
            draft.text = ""
            composer.clearError()
        } else {
            composer.restore(items)
            composer.errorText = AttachmentRules.offlineText
        }
    }

    private func addPhotos(_ items: [PhotosPickerItem]) async {
        var datas: [Data] = []
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self) {
                datas.append(data)
            }
        }
        await addPhotoData(datas)
    }

    private func addPhotoData(_ datas: [Data]) async {
        await outgoing.refreshLimits()
        await composer.addPhotos(datas, limits: outgoing.limits)
    }

    private func addFiles(_ urls: [URL]) async {
        await outgoing.refreshLimits()
        await composer.addFiles(urls, limits: outgoing.limits)
    }

    /// Umfrage-Blatt für den Kanal dieses Entwurfs.
    private func openPoll() {
        showPoll = true
    }

    /// Kamera nur mit Erlaubnis. Ohne Erlaubnis erklärt ein Hinweis, wo man sie einschaltet.
    private func openCamera() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            showCamera = true
        case .notDetermined:
            Task {
                if await AVCaptureDevice.requestAccess(for: .video) {
                    showCamera = true
                } else {
                    showCameraDenied = true
                }
            }
        default:
            showCameraDenied = true
        }
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
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
