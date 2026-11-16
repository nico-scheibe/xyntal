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
    /// Meldet ein geändertes Logo an den Aufrufer, damit die Liste es ohne neuen Netzaufruf zeigt.
    var onAvatarChanged: (String?) -> Void = { _ in }

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
                store = MemberCommunityStore(session: session,
                                             communityId: community.id,
                                             outgoing: outgoing,
                                             avatar: community.avatar,
                                             onAvatarChanged: onAvatarChanged)
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

    /// Der Schreibanstoß im leeren Kanal setzt den Cursor ins Eingabefeld der Schreibzeile.
    @FocusState private var composerFocused: Bool
    /// Das „…“-Blatt mit Logo und Banner. Nur erreichbar, wenn du Eigentümer bist.
    @State private var showImages = false

    var body: some View {
        List {
            // Das Banner steht als erste Zeile und scrollt mit. Es ist Schmuck, darum nicht antippbar und für VoiceOver ausgeblendet.
            // Das Bild dekodiert der Store außerhalb des Haupt-Threads. Ohne Bild fällt die Zeile ganz weg.
            if let bannerImage = store.bannerImage {
                CommunityBannerFrame {
                    Image(uiImage: bannerImage)
                        .resizable()
                        .scaledToFill()
                }
                .accessibilityHidden(true)
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 0, trailing: 16))
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
            }

            // Mit Banner 16 pt Abstand zum Kopf, ohne Banner bleibt der Kopf wie bisher.
            MemberHeader(community: community, avatar: store.avatar)
                .padding(.top, store.bannerImage == nil ? 0 : 16)
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
                ChannelCapsules(options: store.channels.map { ChannelCapsuleOption(id: $0.id, title: $0.name) },
                                selectedId: store.selectedChannelId) { channelId in
                    if let channelId {
                        Task { await store.select(channelId: channelId) }
                    }
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
                PostComposer(store: store, draft: draft, isFocused: $composerFocused)
                    .id(draft.channelId)
            }
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
        .toolbar {
            // Nur der Eigentümer sieht das Menü. Der Server prüft jede Änderung trotzdem noch einmal.
            if store.canEdit {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Logo und Banner") {
                            showImages = true
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Mehr")
                }
            }
        }
        .sheet(isPresented: $showImages) {
            CommunityImagesSheet(store: store, name: community.name.nonEmptyText ?? "Community")
        }
    }

    /// Abbrechen während des Hochladens: Anhänge und Text kommen zurück in den Entwurf des Kanals.
    private func cancel(_ message: OutgoingMessage) {
        store.cancelPost(message)
    }

    /// Beiträge, die noch hochladen oder nicht angekommen sind. Sie stehen oben im Strom.
    /// Im Strom wie ein Beitrag gezeigt, nicht als Chat-Blase: die Blase bleibt dem Chat vorbehalten.
    @ViewBuilder
    private var pendingRows: some View {
        ForEach(store.pendingPosts) { message in
            PendingPostRow(message: message,
                           onCancel: { cancel(message) },
                           onRetry: { outgoing.retry(message) },
                           onDiscard: { outgoing.discard(message) })
                .listRowSeparatorTint(Color.primary.opacity(0.12))
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
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
                .listRowInsets(EdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16))
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
                    // Flach statt Platte: Der Beitrag braucht keine Fläche, der Trenner trennt die Beiträge.
                    .listRowSeparatorTint(Color.primary.opacity(0.12))
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
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
        return "Mach den Anfang"
    }

    /// Der leere Kanal ist die erste Begegnung des Gründers mit dem Kanal. Die Aufforderung hängt allein am
    /// Schreibrecht, nicht an der Zahl der Kanäle. Wer nur lesen darf, bekommt keine Knöpfe.
    @ViewBuilder
    private var emptyState: some View {
        if store.canPostHere {
            CommunityEmptyCard(
                title: emptyTitle,
                text: "Der erste Beitrag gibt den Ton an. Stell dich vor oder stell eine Frage.",
                starters: [
                    WritingStarter(label: "Stell dich vor", opening: "Hallo zusammen! Ich arbeite gerade an "),
                    WritingStarter(label: "Frage stellen", opening: "Ich habe eine Frage: ")
                ],
                onStarter: { insertStarter($0.opening) }
            )
        } else {
            CommunityEmptyCard(
                title: "In diesem Kanal kannst du nur lesen",
                text: "Sobald jemand etwas schreibt, siehst du es hier."
            )
        }
    }

    /// Schreibt den Anfang in den Entwurf des Kanals und setzt den Cursor ans Ende. Rein lokal: der Server sieht nichts davon.
    /// Steht schon Text im Entwurf, bleibt er unangetastet. Der Anfang kommt dann in eine neue Zeile dahinter.
    private func insertStarter(_ opening: String) {
        guard let draft = store.selectedDraft else { return }
        let combined = draft.text.isEmpty ? opening : draft.text + "\n" + opening
        // Dieselbe Grenze wie beim Tippen. Der Server kürzt still, die App kürzt vorher und zeigt es.
        draft.text = combined.truncatedToUTF16(PostComposer.bodyLimit)
        composerFocused = true
    }
}

/// Schreibzeile unten in der Community. Gleiche Bausteine wie im Chat: Anhangsleiste, „+“ und Senden.
/// Der Versand läuft im Hintergrund weiter, die Zeile ist sofort wieder frei. Nur sichtbar, wenn du im Kanal schreiben darfst.
/// Sie zeigt immer den Entwurf des gewählten Kanals.
private struct PostComposer: View {
    @Environment(OutgoingStore.self) private var outgoing

    let store: MemberCommunityStore
    @Bindable var draft: PostDraft
    /// Fokus des Eingabefelds, vom Kopf der Liste gesteuert (Schreibanstoß im leeren Kanal).
    var isFocused: FocusState<Bool>.Binding

    /// Durchmesser des Senden-Kreises. Skaliert mit der Schrift, das Tipp-Ziel bleibt 44 pt.
    @ScaledMetric(relativeTo: .body) private var sendSize: CGFloat = 36

    @State private var showPhotoPicker = false
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showFileImporter = false
    @State private var showCamera = false
    @State private var showCameraDenied = false
    @State private var previewAttachment: ComposerAttachment?
    @State private var showPoll = false

    /// Der Server übernimmt höchstens so viele Zeichen und kürzt still. Die App kürzt vorher, damit man es beim Tippen sieht.
    static let bodyLimit = 8000

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
                    .focused(isFocused)

                // Eigener Kreis statt des Symbols: Der weiße Pfeil lag bei hellem Akzent schlecht lesbar.
                // Theme.ink rechnet den Kontrast auf den gewählten Akzent aus.
                Button(action: send) {
                    ZStack {
                        Circle()
                            .fill(canSend ? Theme.accent : Color.primary.opacity(0.15))
                            .frame(width: sendSize, height: sendSize)
                        Image(systemName: "arrow.up")
                            .font(.body.weight(.bold))
                            .foregroundStyle(canSend ? Theme.ink : Theme.muted)
                    }
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
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

/// Rahmen für ein Banner: Verhältnis 3:1, Ecken 16 pt, Umrandung 1 pt. Die Breite gibt die Zeile vor, die Höhe ist ein Drittel.
/// Das Bild füllt den Rahmen und wird mittig beschnitten. Der Inhalt kommt von außen, damit Innenansicht und Blatt denselben Rahmen teilen.
struct CommunityBannerFrame<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .aspectRatio(3, contentMode: .fit)
            .overlay { content }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.18), lineWidth: 1)
            }
    }
}

/// Avatar, Name, Abzeichen „Mitglied“, Kategorie und Mitgliederzahl, Beschreibung.
private struct MemberHeader: View {
    let community: DiscoverCommunity
    /// Logo aus der Innenansicht (Store). Das Verzeichnis kann nach einer Änderung noch das alte haben.
    let avatar: String?

    var body: some View {
        CommunityIdentityHeader(name: community.name.nonEmptyText ?? "Community",
                                avatar: avatar,
                                badge: "Mitglied",
                                subline: sublineText,
                                description: community.description.nonEmptyText)
    }

    /// „Technik · 1 Mitglied“. Die Kategorie entfällt, wenn es keine gibt. Nichts wird erfunden.
    private var sublineText: String {
        var parts: [String] = []
        if let category = community.category.nonEmptyText {
            parts.append(category)
        }
        parts.append(community.memberCount == 1 ? "1 Mitglied" : "\(community.memberCount) Mitglieder")
        return parts.joined(separator: " · ")
    }
}

/// Schichtung von Kachel und Text. Nebeneinander, ab Accessibility-Größe untereinander (R5). Für alle Community-Zeilen
/// und Köpfe dieselbe Funktion, damit sie nicht wieder auseinanderlaufen.
func communityTileLayout(accessibility: Bool, alignment: VerticalAlignment = .top, spacing: CGFloat = 14) -> AnyLayout {
    accessibility
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
        : AnyLayout(HStackLayout(alignment: alignment, spacing: spacing))
}

/// Schichtung von Name und Abzeichen (Kapsel). Nebeneinander, ab Accessibility-Größe untereinander, damit der Name
/// die volle Breite hat und nicht mitten im Wort umbricht. Dieselbe Regel für Kopf, Beitrag und Karte.
func communityTitleLayout(accessibility: Bool) -> AnyLayout {
    accessibility
        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
        : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 8))
}

/// Kachel und Text in der Schichtung von communityTileLayout, mit Inhalt als Closure. Für Aufrufe mit nachgestelltem Closure.
func communityTileStack<Content: View>(accessibility: Bool,
                                       alignment: VerticalAlignment = .top,
                                       spacing: CGFloat = 14,
                                       @ViewBuilder content: () -> Content) -> some View {
    let layout = communityTileLayout(accessibility: accessibility, alignment: alignment, spacing: spacing)
    return layout {
        content()
    }
}

/// Name und Abzeichen in der Schichtung von communityTitleLayout, mit Inhalt als Closure.
func communityTitleStack<Content: View>(accessibility: Bool, @ViewBuilder content: () -> Content) -> some View {
    let layout = communityTitleLayout(accessibility: accessibility)
    return layout {
        content()
    }
}

/// Kopf einer Community: Kachel, Name mit Abzeichen, Zeile darunter und Beschreibung. Für die Mitglieder-Ansicht
/// („Mitglied“) und den offiziellen Strom („Offiziell“) dieselbe Form. Nur das Abzeichen wechselt.
struct CommunityIdentityHeader: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let name: String
    let avatar: String?
    let badge: String
    /// Zeile unter dem Namen. nil, wenn die Quelle nichts liefert (die offizielle Community hat keine Kategorie).
    var subline: String? = nil
    var description: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            communityTileStack(accessibility: dynamicTypeSize.isAccessibilitySize) {
                // Ruhige Kachel: die Tönung tritt hinter den Namen zurück, Akzent bleibt dem Abzeichen.
                AvatarView(name: name, avatar: avatar, size: 56, shape: .roundedSquare, tone: .calm)
                VStack(alignment: .leading, spacing: 6) {
                    communityTitleStack(accessibility: dynamicTypeSize.isAccessibilitySize) {
                        Text(name)
                            .font(.title2.bold())
                        badgeView
                    }
                    if let subline {
                        Text(subline)
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
                    }
                }
                // Nur Name und Zeile darunter werden zu einem Element. Die Beschreibung bleibt getrennt,
                // damit „Mehr anzeigen“ für VoiceOver als eigener Knopf erreichbar bleibt.
                .accessibilityElement(children: .combine)
            }
            if let description, !description.isEmpty {
                ExpandableBody(text: description, collapsedLines: 3, font: .subheadline)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Kapsel mit Häkchen. Der Akzent liegt nur auf Kontur und Symbol, der Text bleibt in .primary (Regel R1).
    private var badgeView: some View {
        HStack(spacing: 4) {
            Image(systemName: "checkmark")
                .foregroundStyle(Theme.accent)
                .accessibilityHidden(true)
            Text(badge)
                .foregroundStyle(.primary)
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .overlay(Capsule().stroke(Theme.accent, lineWidth: 1))
    }
}

/// Eine Kapsel der Kanalleiste. Die id nil steht für „Alle“ und gibt es nur im offiziellen Strom.
struct ChannelCapsuleOption: Identifiable {
    let id: String?
    let title: String
}

/// Kanal-Kapseln als waagerecht scrollende Leiste. Für die Mitglieder-Ansicht und den offiziellen Strom gemeinsam.
/// Gewählt: die einzige Akzentfläche im Strom, sie markiert eine Auswahl. Text darauf in Theme.ink.
/// Nicht gewählt: Haarlinie, Text in .primary. Ohne „#“.
/// Sichtbar 36 pt. Der Abstand darum macht das Tipp-Ziel 44 pt (Regel R4), ohne die Kapsel zu vergrößern.
struct ChannelCapsules: View {
    let options: [ChannelCapsuleOption]
    let selectedId: String?
    let onSelect: (String?) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(options) { option in
                    capsule(option)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func capsule(_ option: ChannelCapsuleOption) -> some View {
        let isSelected = option.id == selectedId
        return Button {
            onSelect(option.id)
        } label: {
            Text(verbatim: option.title)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .lineLimit(1)
                .foregroundStyle(isSelected ? Theme.ink : Color.primary)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(isSelected ? Theme.accent : Color.clear, in: Capsule())
                .overlay {
                    if !isSelected {
                        Capsule().stroke(Color.primary.opacity(0.08), lineWidth: 1)
                    }
                }
                .padding(.vertical, 4)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

/// Ein eigener Beitrag, der noch hochlädt oder nicht angekommen ist. Gleiche Form wie ein fertiger Beitrag:
/// links, flach, gleiche Abstände und Trenner. Gedämpft, damit man sieht, dass er noch nicht veröffentlicht ist.
/// Die Chat-Blase (OutgoingBubble) bleibt im Chat unverändert.
private struct PendingPostRow: View {
    let message: OutgoingMessage
    let onCancel: () -> Void
    let onRetry: () -> Void
    let onDiscard: () -> Void

    @ScaledMetric(relativeTo: .body) private var thumbnail: CGFloat = 56

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Der eigene Name ist hier nicht bekannt, deshalb steht nur „Du“. Kein Bild, keine erfundene Person.
            Text("Du")
                .font(.subheadline.weight(.semibold))
            if !message.body.isEmpty {
                Text(message.body)
                    .font(.body)
                    .lineSpacing(3)
                    .foregroundStyle(.primary)
                    .textSelection(.enabled)
            }
            ForEach(message.attachments) { attachment in
                attachmentRow(attachment)
            }
            if message.state == .sending && !message.attachments.isEmpty {
                ProgressView(value: uploadFraction)
                    .accessibilityLabel("Hochladen")
            }
            statusLine
            actions
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .opacity(0.6)
    }

    /// Mittelwert der Anhänge. Ohne Anhang gibt es keinen Balken.
    private var uploadFraction: Double {
        let values = message.attachments.map { message.progress[$0.id] ?? 0 }
        guard !values.isEmpty else { return 0 }
        return values.reduce(0, +) / Double(values.count)
    }

    private func attachmentRow(_ attachment: ComposerAttachment) -> some View {
        HStack(spacing: 10) {
            if attachment.isImage, let preview = attachment.preview {
                Image(uiImage: preview)
                    .resizable()
                    .scaledToFill()
                    .frame(width: thumbnail, height: thumbnail)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            } else {
                Image(systemName: message.voiceDurationMs != nil ? "waveform" : AttachmentRules.symbol(forName: attachment.name))
                    .font(.title3)
                    .foregroundStyle(.primary)
                    .frame(width: thumbnail, height: thumbnail)
            }
            Text(message.voiceDurationMs != nil ? "Sprachnachricht" : MediaFormat.middleTruncated(attachment.name, limit: 40))
                .font(.subheadline)
                .foregroundStyle(.primary)
                .lineLimit(2)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var statusLine: some View {
        switch message.state {
        case .sending:
            Text("Wird gesendet …")
                .font(.caption)
                .foregroundStyle(Theme.muted)
        case .failed:
            Label {
                Text(message.failureText ?? AttachmentRules.uploadFailedText)
                    .foregroundStyle(.primary)
            } icon: {
                Image(systemName: "exclamationmark.circle")
                    .foregroundStyle(.red)
            }
            .font(.caption)
        case .delivered:
            EmptyView()
        }
    }

    /// Während des Hochladens: Abbrechen. Nach einem Fehler: erneut senden oder löschen.
    @ViewBuilder
    private var actions: some View {
        switch message.state {
        case .sending:
            // Der Knopf verschwindet, sobald die Sende-Anfrage läuft. Dann ist das Hochladen durch.
            if !message.isSubmitting {
                Button("Abbrechen", action: onCancel)
                    .textButton()
            }
        case .failed:
            HStack(spacing: 16) {
                Button("Erneut senden", action: onRetry)
                    .textButton()
                Button("Löschen", role: .destructive, action: onDiscard)
                    .textButton()
            }
        case .delivered:
            EmptyView()
        }
    }
}

/// Textknopf für Zeilen im Strom: Text in .primary, Tipp-Ziel mindestens 44 pt (R1, R4).
@MainActor
private extension Button {
    func textButton() -> some View {
        self
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.primary)
            .frame(minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
            .buttonStyle(.plain)
    }
}

/// Ein Schreibanstoß im leeren Kanal: die Kapsel steht für den Anfang, der in den Entwurf geschrieben wird.
struct WritingStarter: Identifiable {
    let label: String
    let opening: String

    var id: String { label }
}

/// Leerer Zustand eines Kanals: eine Fläche mit Symbol, Titel und Text. Schreibanstöße gibt es nur für Schreibende.
struct CommunityEmptyCard: View {
    @ScaledMetric(relativeTo: .title) private var iconSize: CGFloat = 36

    var icon: String = "text.bubble"
    let title: String
    let text: String
    var starters: [WritingStarter] = []
    var onStarter: (WritingStarter) -> Void = { _ in }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: iconSize))
                .foregroundStyle(Theme.accent)
                .accessibilityHidden(true)
            Text(title)
                .font(.title3.weight(.semibold))
            Text(text)
                .font(.body)
                .foregroundStyle(Theme.muted)
            if !starters.isEmpty {
                ChipFlow(spacing: 8) {
                    ForEach(starters) { starter in
                        Button {
                            onStarter(starter)
                        } label: {
                            Text(starter.label)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.primary)
                                .padding(.horizontal, 14)
                                .frame(minHeight: 44)
                                .background(Color.primary.opacity(0.08), in: Capsule())
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Gleiche Farben wie die Dateizeilen in MemberPostView (PostFileList): Fläche primary 4 %, Linie primary 18 %.
        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.primary.opacity(0.18), lineWidth: 1))
    }
}
