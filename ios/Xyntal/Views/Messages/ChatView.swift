import SwiftUI

/// Verlauf eines Gesprächs mit Eingabezeile. Erstellt den ChatStore für genau dieses Gespräch.
struct ChatView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ConversationsStore.self) private var conversations
    @Environment(PushManager.self) private var push
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss

    let conversation: Conversation

    @State private var store: ChatStore?
    @State private var showGroupInfo = false
    @State private var reportTarget: ReportTarget?
    @State private var blockUserId: String?
    /// true zwischen onAppear und onDisappear. Nur dann wird als gelesen gemeldet.
    @State private var isVisible = false

    /// Aktuelle Fassung aus der Liste (Titel, Ungelesen), sonst die übergebene.
    private var current: Conversation {
        conversations.conversation(withId: conversation.id) ?? conversation
    }

    private var title: String { conversations.title(for: current) }

    private var subtitle: String? {
        if current.isGroup { return "Gruppeninfo" }
        return conversations.isPartnerOnline(current) ? "Online" : nil
    }

    var body: some View {
        Group {
            if let store {
                ChatTranscriptView(store: store, conversation: current)
            } else {
                ProgressView()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Button {
                    if current.isGroup { showGroupInfo = true }
                } label: {
                    VStack(spacing: 1) {
                        Text(title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        if let subtitle {
                            Text(subtitle)
                                .font(.caption)
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
                .disabled(!current.isGroup)
                .accessibilityLabel(current.isGroup ? "\(title), Gruppeninfo öffnen" : title)
            }
            // Melden und Sperren im Chat, sonst nur im Mitgliedsprofil. Bei Gruppen gibt es kein Gegenüber.
            if current.isDirect, let partnerId = current.partnerId {
                ToolbarItem(placement: .primaryAction) {
                    Menu {
                        Button("Melden", systemImage: "flag") {
                            reportTarget = .user(partnerId)
                        }
                        Button("Mitglied sperren", systemImage: "hand.raised", role: .destructive) {
                            blockUserId = partnerId
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                    .accessibilityLabel("Weitere Aktionen")
                }
            }
        }
        .sheet(isPresented: $showGroupInfo) {
            GroupInfoView(conversation: current, title: title)
        }
        .sheet(item: $reportTarget) { target in
            ReportMemberSheet(target: target)
        }
        .blockConfirmation($blockUserId) {
            dismiss()
        }
        .onAppear {
            isVisible = true
            // Offenes Gespräch: dafür zeigt die App im Vordergrund kein Push-Banner.
            push.activeConversationId = conversation.id
            // Die Push-Berechtigung wird erst hier erfragt, nicht beim App-Start.
            Task { await push.requestAuthorizationIfNeeded() }
        }
        .onDisappear {
            isVisible = false
            if push.activeConversationId == conversation.id {
                push.activeConversationId = nil
            }
        }
        .task {
            if store == nil {
                store = ChatStore(conversationId: conversation.id,
                                  currentUserId: conversations.currentUserId,
                                  session: session)
            }
            guard let store else { return }
            await store.loadInitial()
            await markRead(store)
        }
        .onChange(of: conversations.messageEvents[conversation.id] ?? 0) { _, _ in
            guard let store else { return }
            Task {
                await store.refresh()
                await markRead(store)
            }
        }
    }

    /// Meldet nur, was der Nutzer tatsächlich sehen kann: Ansicht sichtbar und App im Vordergrund.
    private func markRead(_ store: ChatStore) async {
        guard isVisible, scenePhase == .active else { return }
        await store.markRead()
        conversations.markedRead(conversationId: conversation.id)
    }
}

/// Nachrichtenliste und Eingabe. Bekommt einen fertigen Store.
private struct ChatTranscriptView: View {
    @Environment(ConversationsStore.self) private var conversations

    let store: ChatStore
    let conversation: Conversation

    @State private var draft = ""
    @State private var editingMessage: Message?
    @State private var replyTo: Message?
    @State private var messageToDelete: Message?
    @State private var lastTypingDraft = ""
    @State private var reportTarget: ReportTarget?
    @State private var blockUserId: String?
    @State private var reactionTarget: Message?
    @State private var viewer: ImageViewerRequest?
    @FocusState private var inputFocused: Bool

    private var typingText: String? {
        let names = conversations.typingNames(in: conversation.id)
        guard !names.isEmpty else { return nil }
        if names.count == 1 { return "\(names[0]) schreibt …" }
        return "\(names.count) Personen schreiben …"
    }

    var body: some View {
        transcript
            .safeAreaInset(edge: .bottom, spacing: 0) {
                inputArea
            }
            .confirmationDialog("Nachricht löschen?",
                                isPresented: Binding(
                                    get: { messageToDelete != nil },
                                    set: { if !$0 { messageToDelete = nil } }
                                ),
                                presenting: messageToDelete) { message in
                Button("Löschen", role: .destructive) {
                    Task { await store.delete(message) }
                }
                Button("Abbrechen", role: .cancel) {}
            } message: { _ in
                Text("Die Nachricht wird für alle entfernt.")
            }
            .onChange(of: draft) { _, newValue in
                guard editingMessage == nil, !newValue.isEmpty, newValue != lastTypingDraft else { return }
                lastTypingDraft = newValue
                Task { await store.sendTyping() }
            }
            .sheet(item: $reportTarget) { target in
                ReportMemberSheet(target: target)
            }
            .blockConfirmation($blockUserId) {
                Task { await store.refresh() }
            }
            .confirmationDialog("Reagieren",
                                isPresented: Binding(
                                    get: { reactionTarget != nil },
                                    set: { if !$0 { reactionTarget = nil } }
                                ),
                                titleVisibility: .visible) {
                ForEach(ChatStore.allowedReactions, id: \.self) { emoji in
                    Button(emoji) {
                        if let target = reactionTarget {
                            Task { await store.toggleReaction(target, emoji: emoji) }
                        }
                    }
                }
            }
            .fullScreenCover(item: $viewer) { request in
                ImageViewer(images: request.images, start: request.start)
            }
    }

    // MARK: - Verlauf

    @ViewBuilder
    private var transcript: some View {
        if store.messages.isEmpty && !store.hasLoaded {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store.messages.isEmpty, let loadError = store.loadError {
            ContentUnavailableView {
                Label("Verlauf nicht geladen", systemImage: "wifi.exclamationmark")
            } description: {
                Text(loadError)
            } actions: {
                Button("Erneut versuchen") { Task { await store.loadInitial() } }
            }
        } else if store.messages.isEmpty {
            ContentUnavailableView {
                Label("Noch keine Nachrichten", systemImage: "bubble.left.and.bubble.right")
            } description: {
                Text("Schreib die erste Nachricht.")
            }
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 6) {
                        if store.hasMore {
                            Button {
                                let firstId = store.messages.first?.id
                                Task {
                                    await store.loadOlder()
                                    if let firstId {
                                        proxy.scrollTo(firstId, anchor: .top)
                                    }
                                }
                            } label: {
                                if store.isLoadingOlder {
                                    ProgressView()
                                } else {
                                    Text("Ältere laden")
                                        .font(.subheadline)
                                }
                            }
                            .disabled(store.isLoadingOlder)
                            .padding(.vertical, 8)
                        }

                        ForEach(ChatStore.groupedByDay(store.messages)) { group in
                            DaySeparator(day: group.day)
                            ForEach(group.messages) { message in
                                messageRow(message)
                                    .id(message.id)
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                }
                .defaultScrollAnchor(.bottom)
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: store.messages.last?.id) { _, newValue in
                    guard let newValue else { return }
                    withAnimation {
                        proxy.scrollTo(newValue, anchor: .bottom)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func messageRow(_ message: Message) -> some View {
        if message.isSystem {
            SystemMessageRow(message: message)
        } else {
            let isMine = store.isMine(message)
            MessageBubble(message: message,
                          isMine: isMine,
                          showsAuthor: conversation.isGroup && !isMine,
                          replyTarget: store.message(withId: message.replyToId),
                          senderTrusted: isMine || store.hasWrittenHere,
                          onReact: { emoji in Task { await store.toggleReaction(message, emoji: emoji) } },
                          onOpenImage: { index in
                              viewer = ImageViewerRequest(images: message.imageAttachments, start: index)
                          },
                          onReply: {
                              editingMessage = nil
                              replyTo = message
                              inputFocused = true
                          },
                          onRequestReaction: { reactionTarget = message },
                          onReport: { reportTarget = .message(message.id) })
                .contextMenu {
                    Menu("Reagieren") {
                        ForEach(ChatStore.allowedReactions, id: \.self) { emoji in
                            Button(emoji) {
                                Task { await store.toggleReaction(message, emoji: emoji) }
                            }
                        }
                    }
                    Button("Antworten", systemImage: "arrowshape.turn.up.left") {
                        editingMessage = nil
                        replyTo = message
                        inputFocused = true
                    }
                    if let body = message.body.nonEmptyText, message.isText {
                        Button("Kopieren", systemImage: "doc.on.doc") {
                            UIPasteboard.general.string = body
                        }
                    }
                    if !isMine {
                        Button("Melden", systemImage: "flag") {
                            reportTarget = .message(message.id)
                        }
                        if let authorId = message.authorId {
                            Button("Mitglied sperren", systemImage: "hand.raised", role: .destructive) {
                                blockUserId = authorId
                            }
                        }
                    }
                    if isMine {
                        // Bearbeiten nur bei Text. Löschen gilt für jede eigene Nachricht, auch Fotos, Dateien und Sprache.
                        if message.isText {
                            Button("Bearbeiten", systemImage: "pencil") {
                                replyTo = nil
                                editingMessage = message
                                draft = message.body ?? ""
                                inputFocused = true
                            }
                        }
                        Button("Löschen", systemImage: "trash", role: .destructive) {
                            messageToDelete = message
                        }
                    }
                }
        }
    }

    // MARK: - Eingabe

    private var inputArea: some View {
        VStack(spacing: 6) {
            if let actionError = store.actionError {
                HStack {
                    Text(actionError)
                        .font(.caption)
                        .foregroundStyle(.red)
                    Spacer()
                    Button {
                        store.clearActionError()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .accessibilityLabel("Fehler ausblenden")
                }
            }

            if let typingText {
                Text(typingText)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let editingMessage {
                contextBar(title: "Nachricht bearbeiten", detail: editingMessage.previewText, symbol: editingMessage.previewSymbol) {
                    self.editingMessage = nil
                    draft = ""
                }
            } else if let replyTo {
                contextBar(title: "Antwort an \(replyTo.author.nonEmptyText ?? "Unbekannt")", detail: replyTo.previewText, symbol: replyTo.previewSymbol) {
                    self.replyTo = nil
                }
            }

            HStack(alignment: .bottom, spacing: 8) {
                TextField("Nachricht", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 18))
                    .focused($inputFocused)

                Button {
                    Task { await submit() }
                } label: {
                    if store.isSending {
                        ProgressView()
                            .frame(width: 32, height: 32)
                    } else {
                        Image(systemName: editingMessage == nil ? "arrow.up.circle.fill" : "checkmark.circle.fill")
                            .font(.system(size: 32))
                    }
                }
                .disabled(!canSend)
                .accessibilityLabel(editingMessage == nil ? "Senden" : "Änderung speichern")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private func contextBar(title: String, detail: String, symbol: String?, cancel: @escaping () -> Void) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.bold())
                HStack(spacing: 4) {
                    if let symbol {
                        Image(systemName: symbol)
                    }
                    Text(detail)
                }
                .font(.caption)
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
            }
            Spacer()
            Button(action: cancel) {
                Image(systemName: "xmark.circle.fill")
            }
            .accessibilityLabel("Abbrechen")
        }
        .padding(8)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }

    private var canSend: Bool {
        !store.isSending && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func submit() async {
        guard canSend else { return }
        let text = draft
        let success: Bool
        if let editingMessage {
            success = await store.edit(editingMessage, body: text)
        } else {
            success = await store.send(body: text, replyToId: replyTo?.id)
        }
        if success {
            draft = ""
            lastTypingDraft = ""
            editingMessage = nil
            replyTo = nil
        }
    }
}

// MARK: - Bausteine

private struct DaySeparator: View {
    let day: Date

    var body: some View {
        Text(Self.label(for: day))
            .font(.caption)
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(Color(.secondarySystemBackground), in: Capsule())
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity)
    }

    static func label(for day: Date, calendar: Calendar = .current) -> String {
        if calendar.isDateInToday(day) { return "Heute" }
        if calendar.isDateInYesterday(day) { return "Gestern" }
        if calendar.isDate(day, equalTo: Date(), toGranularity: .year) {
            return day.formatted(.dateTime.weekday(.wide).day().month(.wide))
        }
        return day.formatted(date: .long, time: .omitted)
    }
}

private struct SystemMessageRow: View {
    let message: Message

    var body: some View {
        Text(message.previewText.isEmpty ? "Systemnachricht" : message.previewText)
            .font(.caption)
            .foregroundStyle(Theme.muted)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 2)
    }
}

/// Eine Nachricht als Blase. Text, Fotos, GIFs, Sprache und Dateien; eine Beschriftung steht als Text darunter.
private struct MessageBubble: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let message: Message
    let isMine: Bool
    let showsAuthor: Bool
    let replyTarget: Message?
    /// Absender ist vertraut: eigene Nachricht oder Gespräch, in dem du selbst schon geschrieben hast.
    let senderTrusted: Bool
    let onReact: (String) -> Void
    let onOpenImage: (Int) -> Void
    let onReply: () -> Void
    let onRequestReaction: () -> Void
    let onReport: () -> Void

    /// Längere Texte werden gekürzt, bis der Nutzer "Mehr anzeigen" tippt.
    static let collapsedLength = 4_000

    @State private var isExpanded = false
    @State private var gifPlayback = GIFPlayback()
    @State private var voice: VoicePlayer
    @State private var files: [AttachmentFileModel]

    init(message: Message,
         isMine: Bool,
         showsAuthor: Bool,
         replyTarget: Message?,
         senderTrusted: Bool,
         onReact: @escaping (String) -> Void,
         onOpenImage: @escaping (Int) -> Void,
         onReply: @escaping () -> Void,
         onRequestReaction: @escaping () -> Void,
         onReport: @escaping () -> Void) {
        self.message = message
        self.isMine = isMine
        self.showsAuthor = showsAuthor
        self.replyTarget = replyTarget
        self.senderTrusted = senderTrusted
        self.onReact = onReact
        self.onOpenImage = onOpenImage
        self.onReply = onReply
        self.onRequestReaction = onRequestReaction
        self.onReport = onReport
        _voice = State(initialValue: VoicePlayer(attachmentId: message.voiceAttachment?.id ?? "",
                                                 durationMs: message.voiceAttachment?.durationMs))
        _files = State(initialValue: message.fileAttachments.map { AttachmentFileModel(attachment: $0) })
    }

    private var hasMedia: Bool { message.isGif || message.isVoice || !message.attachments.isEmpty }
    private var foreground: Color { isMine ? Theme.ink : .primary }
    private var bubbleColor: Color { isMine ? Theme.accent : Color(.systemGray5) }
    private var caption: String? { message.body.nonEmptyText }
    private var gifPlays: Bool {
        GIFPolicy.animates(gifPlayback, isActive: scenePhase == .active, reduceMotion: reduceMotion)
    }

    var body: some View {
        HStack {
            if isMine { Spacer(minLength: 48) }
            VStack(alignment: isMine ? .trailing : .leading, spacing: 4) {
                if showsAuthor {
                    Text(message.author.nonEmptyText ?? "Unbekannt")
                        .font(.caption.bold())
                        .foregroundStyle(Theme.muted)
                        .padding(.horizontal, 4)
                }

                bubble

                HStack(spacing: 4) {
                    Text(message.date.formatted(date: .omitted, time: .shortened))
                    if message.isEdited {
                        Text("· bearbeitet")
                    }
                }
                .font(.caption2)
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 4)

                if !message.reactions.isEmpty {
                    ReactionsRow(reactions: message.reactions, onTap: onReact)
                }
            }
            if !isMine { Spacer(minLength: 48) }
        }
        .accessibilityElement(children: hasMedia ? .contain : .combine)
        .onChange(of: scenePhase) { _, phase in
            // Kein Hintergrund-Audio: Sprache pausiert, sobald die App nicht mehr aktiv ist.
            if phase != .active { voice.pause() }
        }
    }

    @ViewBuilder
    private var bubble: some View {
        if hasMedia {
            mediaAccessibility(mediaBubble)
        } else {
            textBubble
        }
    }

    private var textBubble: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let replyTarget {
                quote(replyTarget)
            }
            textContent
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .foregroundStyle(foreground)
        .background(bubbleColor, in: RoundedRectangle(cornerRadius: 18))
    }

    /// Medien flächig bis zum Rand der Blase, Radius 18. Eigene Abstände haben die einzelnen Teile.
    private var mediaBubble: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let replyTarget {
                quote(replyTarget)
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    .padding(.bottom, 4)
            }
            MessageMediaContent(message: message,
                                senderTrusted: senderTrusted,
                                voice: voice,
                                files: files,
                                gifPlayback: gifPlayback,
                                foreground: foreground,
                                onOpenImage: onOpenImage)
            if let caption {
                VStack(alignment: .leading, spacing: 4) {
                    bodyText(caption)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
        }
        .foregroundStyle(foreground)
        .background(bubbleColor)
        .clipShape(RoundedRectangle(cornerRadius: 18))
    }

    private func quote(_ target: Message) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(target.author.nonEmptyText ?? "Unbekannt")
                .font(.caption2.bold())
            HStack(spacing: 4) {
                if let symbol = target.previewSymbol {
                    Image(systemName: symbol)
                }
                Text(target.previewText)
            }
            .font(.caption2)
            .lineLimit(2)
        }
        .padding(6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.black.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
    }

    @ViewBuilder
    private var textContent: some View {
        if let placeholder = message.placeholderText {
            Label(placeholder, systemImage: message.placeholderSymbol ?? "paperclip")
                .italic()
            if let body = caption {
                bodyText(body)
            }
        } else {
            bodyText(message.body ?? "")
        }
    }

    @ViewBuilder
    private func bodyText(_ body: String) -> some View {
        if body.count > Self.collapsedLength && !isExpanded {
            Text(String(body.prefix(Self.collapsedLength)) + " …")
                .textSelection(.enabled)
            Button("Mehr anzeigen") {
                isExpanded = true
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(isMine ? Theme.ink : .primary)
            .underline()
        } else {
            Text(body)
                .textSelection(.enabled)
        }
    }

    // MARK: - VoiceOver

    /// Jede Medienblase ist ein einziges Element mit eigener Beschriftung; die Teile darin sind ausgeblendet.
    @ViewBuilder
    private func mediaAccessibility<Content: View>(_ content: Content) -> some View {
        if message.isVoice, let attachment = message.voiceAttachment {
            let base = content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(voiceLabel)
                .accessibilityHint("Doppeltippen zum Abspielen")
                .accessibilityValue(voice.isPlaying
                    ? "Wiedergabe, \(Int(voice.currentTime)) Sekunden von \(Int(voice.displayDuration))"
                    : "")
                .accessibilityAction(.default) {
                    Task {
                        await voice.togglePlayback {
                            try await MediaLoader.shared.fileData(for: attachment, session: session)
                        }
                    }
                }
                .accessibilityAdjustableAction { direction in
                    switch direction {
                    case .increment: voice.seek(by: 10)
                    case .decrement: voice.seek(by: -10)
                    @unknown default: break
                    }
                }
                .accessibilityAction(named: "Geschwindigkeit ändern") { voice.cycleRate() }
                .accessibilityAction(named: "Antworten") { onReply() }
                .accessibilityAction(named: "Reagieren") { onRequestReaction() }
            if isMine {
                base
            } else {
                base.accessibilityAction(named: "Melden") { onReport() }
            }
        } else if message.isGif {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(gifLabel)
                .accessibilityValue(gifPlays ? "Wird abgespielt" : "Angehalten")
                .accessibilityAction(.default) {
                    if gifPlayback.canAnimate {
                        gifPlayback.override = !GIFPolicy.wantsAnimation(gifPlayback, reduceMotion: reduceMotion)
                    }
                }
        } else if message.fileAttachments.isEmpty && !message.imageAttachments.isEmpty {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(imageLabel)
                .accessibilityAction(.default) { onOpenImage(0) }
        } else {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(mediaLabel)
                .accessibilityAction(.default) {
                    if files.count == 1, let only = files.first {
                        Task { await only.open(session: session) }
                    }
                }
                .accessibilityActions {
                    ForEach(files, id: \.attachment.id) { model in
                        Button("Öffnen: \(model.attachment.displayName)") {
                            Task { await model.open(session: session) }
                        }
                    }
                }
        }
    }

    private var senderPhrase: String {
        isMine ? "von dir" : "von \(message.author.nonEmptyText ?? "Unbekannt")"
    }

    private var timePhrase: String {
        "\(message.date.formatted(date: .omitted, time: .shortened)) Uhr"
    }

    private func withCaption(_ base: String) -> String {
        guard let caption else { return base }
        return base + ", Beschriftung: " + caption
    }

    private var voiceLabel: String {
        let seconds = (message.voiceAttachment?.durationMs ?? 0) / 1000
        return withCaption("Sprachnachricht \(senderPhrase), \(seconds) Sekunden, \(timePhrase)")
    }

    private var gifLabel: String {
        let title = message.gif?.title.nonEmptyText
        return withCaption("GIF \(senderPhrase)" + (title.map { ": \($0)" } ?? ""))
    }

    private var imageLabel: String {
        let count = message.imageAttachments.count
        let noun = count == 1 ? "Foto" : "\(count) Fotos"
        return withCaption("\(noun) \(senderPhrase), \(timePhrase)")
    }

    private var mediaLabel: String {
        if message.imageAttachments.isEmpty, message.fileAttachments.count == 1, let file = message.fileAttachments.first {
            var parts = [file.displayName, MediaFormat.typeLabel(for: file)]
            if let size = MediaFormat.spokenSize(file.size) {
                parts.append(size)
            }
            return withCaption("Datei \(senderPhrase): " + parts.joined(separator: ", "))
        }
        let total = message.attachments.count
        if message.imageAttachments.isEmpty {
            return withCaption("\(total) Dateien \(senderPhrase), \(timePhrase)")
        }
        return withCaption("\(total) Anhänge \(senderPhrase), \(timePhrase)")
    }
}

private struct ReactionsRow: View {
    let reactions: [Reaction]
    let onTap: (String) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(reactions, id: \.emoji) { reaction in
                Button {
                    onTap(reaction.emoji)
                } label: {
                    HStack(spacing: 3) {
                        Text(reaction.emoji)
                        if reaction.count > 1 {
                            Text("\(reaction.count)")
                                .font(.caption2.bold())
                        }
                    }
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(reaction.mine ? Theme.accent.opacity(0.35) : Color(.secondarySystemBackground), in: Capsule())
                    .overlay(Capsule().stroke(reaction.mine ? Theme.accent : .clear, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(accessibilityText(for: reaction))
            }
        }
        .padding(.horizontal, 4)
    }

    private func accessibilityText(for reaction: Reaction) -> String {
        let names = reaction.names.isEmpty ? "" : " von " + reaction.names.joined(separator: ", ")
        return "\(reaction.emoji) \(reaction.count)\(names)"
    }
}
