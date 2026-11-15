import SwiftUI

/// Ein Beitrag in einem Kanal einer Community, in der du Mitglied bist: Kopf mit Autor und Zeit, Text,
/// Umfrage, Bilder und „Gefällt mir“. Das „…“-Menü erscheint nur, wenn du etwas davon darfst.
struct MemberPostView: View {
    let post: ChannelPost
    let canDelete: Bool
    /// Moderatoren dürfen Umfragen schließen (Server: canManage).
    let canClosePoll: Bool
    /// Für diese Umfrage läuft gerade eine Abstimmung oder das Schließen. Die Antworten sind dann gesperrt.
    let pollBusy: Bool
    let onToggleLike: () -> Void
    let onDelete: () -> Void
    /// Tippen auf eine Antwort: Index der Antwort.
    let onVote: (Int) -> Void
    let onClosePoll: () -> Void

    @State private var confirmDelete = false
    @State private var confirmClosePoll = false
    @State private var showReport = false
    @State private var viewer: ImageViewerRequest?

    /// Melden geht nur an einen bekannten Autor und nie am eigenen Beitrag.
    private var canReport: Bool {
        !post.mine && post.authorId.nonEmptyText != nil
    }

    /// Umfrage schließen: nur Moderatoren, nur offene Umfragen mit Id. Der Server prüft dasselbe.
    private var canCloseThisPoll: Bool {
        canClosePoll && (post.poll?.canVote ?? false)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            if !post.body.isEmpty {
                ExpandableBody(text: post.body)
            }
            if let poll = post.poll {
                PollBlock(poll: poll, isBusy: pollBusy, onVote: onVote)
            }
            if !post.images.isEmpty {
                PostImageGrid(images: post.images, senderTrusted: post.mine) { index in
                    viewer = ImageViewerRequest(images: post.images, start: index)
                }
            }
            footer
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .fullScreenCover(item: $viewer) { request in
            ImageViewer(images: request.images, start: request.start)
        }
        .alert("Beitrag löschen?", isPresented: $confirmDelete) {
            Button("Löschen", role: .destructive, action: onDelete)
            Button("Abbrechen", role: .cancel) {}
        }
        .alert("Umfrage schließen?", isPresented: $confirmClosePoll) {
            Button("Schließen", role: .destructive, action: onClosePoll)
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Danach kann niemand mehr abstimmen. Das lässt sich nicht rückgängig machen.")
        }
        .sheet(isPresented: $showReport) {
            ReportPostSheet(post: post)
        }
    }

    // MARK: - Kopf

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            AvatarView(name: post.authorName, avatar: nil, size: 36)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(verbatim: post.authorName)
                        .font(.subheadline.bold())
                        .lineLimit(1)
                    // Nur das Wort „Team“. Eine Rangordnung gibt es in Xyntal bewusst nicht.
                    if post.authorIsTeam {
                        Text("Team")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Theme.muted)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .overlay(Capsule().stroke(Theme.muted.opacity(0.5), lineWidth: 1))
                    }
                }
                if let date = post.date {
                    Text(MemberTimeFormat.text(for: date))
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                        .accessibilityLabel(date.formatted(date: .long, time: .shortened))
                }
            }
            Spacer(minLength: 8)
            if canDelete || canReport || canCloseThisPoll {
                Menu {
                    if canReport {
                        Button("Melden", systemImage: "flag") {
                            showReport = true
                        }
                    }
                    if canCloseThisPoll {
                        // Während eine Stimme läuft, nicht anbieten: sonst bestätigt man einen Dialog ohne Folge.
                        Button("Umfrage schließen", systemImage: "lock") {
                            confirmClosePoll = true
                        }
                        .disabled(pollBusy)
                    }
                    if canDelete {
                        Button("Löschen", systemImage: "trash", role: .destructive) {
                            confirmDelete = true
                        }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 36, height: 36)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("Weitere Optionen")
            }
        }
    }

    // MARK: - Fuß

    private var footer: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(action: onToggleLike) {
                Label(post.likedByMe ? "Gefällt dir" : "Gefällt mir",
                      systemImage: post.likedByMe ? "hand.thumbsup.fill" : "hand.thumbsup")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(post.likedByMe ? Theme.accent : Theme.muted)
                    .padding(.vertical, 4)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if let caption = post.likeCaption {
                Text(verbatim: caption)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
        }
    }
}

/// Meldeformular für einen Beitrag: Grund wählen, dann Absenden mit Bestätigung. Ohne Notizfeld.
///
/// Gemeldet wird der Autor über den Nutzer-Weg. Der laufende Server kennt den Beitragstyp für Meldungen noch nicht
/// (nur Nutzer, Nachricht, Projekt, Community, Arbeitsbereich). Deshalb steht die Beitrags-Id im Freitext.
/// Sobald der Zweig feat/apple-abo vereint ist, wird auf den Beitragstyp umgestellt.
private struct ReportPostSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let post: ChannelPost

    @State private var reason: ReportReason?
    @State private var showSendConfirmation = false
    @State private var isSending = false
    @State private var didSend = false
    @State private var sendError: String?

    /// Der Freitext nennt den Beitrag, damit die Moderation ihn findet: die Id und der Anfang des Textes.
    private var details: String {
        let excerpt = String(post.body.prefix(200)).trimmingCharacters(in: .whitespacesAndNewlines)
        return excerpt.isEmpty ? "Beitrag \(post.id)" : "Beitrag \(post.id)\n\n\(excerpt)"
    }

    var body: some View {
        NavigationStack {
            Form {
                if didSend {
                    Section {
                        Text("Danke. Wir prüfen die Meldung.")
                    }
                } else {
                    Section("Grund") {
                        ForEach(ReportReason.allCases) { option in
                            Button {
                                reason = option
                            } label: {
                                HStack {
                                    Text(option.title)
                                    Spacer()
                                    if reason == option {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.tint)
                                    }
                                }
                            }
                            .foregroundStyle(.primary)
                            .accessibilityAddTraits(reason == option ? .isSelected : [])
                        }
                    }

                    if let sendError {
                        Section {
                            Text(sendError)
                                .foregroundStyle(.red)
                        }
                    }
                }
            }
            .navigationTitle("Beitrag melden")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(didSend ? "Fertig" : "Abbrechen") {
                        dismiss()
                    }
                }
                if !didSend {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Senden") {
                            showSendConfirmation = true
                        }
                        .disabled(reason == nil || isSending || post.authorId.nonEmptyText == nil)
                    }
                }
            }
            .alert("Meldung absenden?", isPresented: $showSendConfirmation) {
                Button("Absenden") {
                    Task { await send() }
                }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Bitte melde nur, was du selbst erlebt oder gesehen hast.")
            }
        }
    }

    private func send() async {
        guard let reason, !isSending, let authorId = post.authorId.nonEmptyText else { return }
        isSending = true
        sendError = nil
        defer { isSending = false }
        do {
            try await session.withAccess { token in
                try await session.api.reportUser(id: authorId,
                                                 reason: reason.rawValue,
                                                 details: details,
                                                 token: token)
            }
            didSend = true
        } catch {
            sendError = AppError.displayText(for: error)
        }
    }
}

/// Umfrage unter dem Text: Frage, Antworten mit Balken und Stimmenzahl, deine Stimme markiert, darunter die Gesamtzahl.
/// Die Ergebnisse sind immer sichtbar, auch vor deiner Stimme. Antippbar nur, solange die Umfrage offen ist und eine Id hat.
private struct PollBlock: View {
    let poll: CommunityPoll
    let isBusy: Bool
    let onVote: (Int) -> Void

    private var votable: Bool { poll.canVote }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(verbatim: poll.question)
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .leading)

            VStack(spacing: 6) {
                ForEach(Array(poll.options.enumerated()), id: \.offset) { index, option in
                    optionRow(index: index, option: option)
                }
            }

            Text(verbatim: totalLine)
                .font(.caption)
                .foregroundStyle(Theme.muted)

            if votable {
                Text(poll.myChoice == nil
                     ? "Tippe eine Antwort an, um abzustimmen."
                     : "Tippe eine andere Antwort an, um deine Stimme zu ändern.")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    /// „4 Stimmen“, dahinter „· Umfrage geschlossen“, wenn sie zu ist.
    private var totalLine: String {
        poll.closed ? "\(poll.voteCountText) · Umfrage geschlossen" : poll.voteCountText
    }

    @ViewBuilder
    private func optionRow(index: Int, option: PollOption) -> some View {
        // myChoice ist nil bei -1 (keine Stimme). Nur ein echter Index markiert eine Antwort als deine.
        let mine = poll.myChoice == index
        let label = optionLabel(option, mine: mine, fraction: Double(poll.percent(for: option)) / 100)
        if votable {
            Button {
                onVote(index)
            } label: {
                label
            }
            .buttonStyle(.plain)
            .disabled(isBusy)
        } else {
            label
        }
    }

    private func optionLabel(_ option: PollOption, mine: Bool, fraction: Double) -> some View {
        HStack(spacing: 8) {
            if mine {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Theme.accent)
                    .accessibilityHidden(true)
            }
            Text(verbatim: option.label)
                .font(.subheadline.weight(mine ? .semibold : .regular))
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(verbatim: "\(option.votes)")
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(Theme.muted)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .background {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Color(.secondarySystemGroupedBackground)
                    Rectangle()
                        .fill(mine ? Theme.accent.opacity(0.35) : Color(.systemGray4))
                        .frame(width: proxy.size.width * fraction)
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(mine ? Theme.accent : Color(.separator), lineWidth: 1))
        .contentShape(RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(mine ? "\(option.label), deine Stimme" : option.label)
        .accessibilityValue("\(option.votes) Stimmen")
    }
}

/// Text in .body, höchstens 8 Zeilen. Ist der Text länger, folgt „Mehr anzeigen“.
/// Die volle Höhe misst ein unsichtbarer Zwilling ohne Zeilenbegrenzung.
private struct ExpandableBody: View {
    let text: String

    static let collapsedLines = 8

    @State private var isExpanded = false
    @State private var collapsedHeight: CGFloat = 0
    @State private var fullHeight: CGFloat = 0

    private var isTruncated: Bool {
        fullHeight > collapsedHeight + 0.5
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(verbatim: text)
                .font(.body)
                .lineLimit(isExpanded ? nil : Self.collapsedLines)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(key: CollapsedBodyHeightKey.self, value: proxy.size.height)
                    }
                )
                .background(
                    Text(verbatim: text)
                        .font(.body)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .opacity(0)
                        .accessibilityHidden(true)
                        .background(
                            GeometryReader { proxy in
                                Color.clear.preference(key: FullBodyHeightKey.self, value: proxy.size.height)
                            }
                        )
                )
            if isTruncated && !isExpanded {
                Button("Mehr anzeigen") {
                    isExpanded = true
                }
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.plain)
            }
        }
        .onPreferenceChange(CollapsedBodyHeightKey.self) { collapsedHeight = $0 }
        .onPreferenceChange(FullBodyHeightKey.self) { fullHeight = $0 }
    }
}

private struct CollapsedBodyHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private struct FullBodyHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

/// Bilder eines Beitrags: 1 in voller Breite, 2 nebeneinander, 3 links hoch und rechts zwei, ab 4 ein 2×2-Raster.
/// Ab 5 Bildern steht auf dem vierten Feld „+n“. Ecken 12 pt, Abstand 2 pt.
/// Fremde Bilder laden nicht von selbst (wie im Chat); eigene schon.
private struct PostImageGrid: View {
    let images: [Attachment]
    let senderTrusted: Bool
    let onOpen: (Int) -> Void

    @State private var width: CGFloat = 0

    private static let gap: CGFloat = 2
    private static let corner: CGFloat = 12

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if width > 0 {
                grid(width: width)
                    .clipShape(RoundedRectangle(cornerRadius: Self.corner))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            GeometryReader { proxy in
                Color.clear.preference(key: GridWidthKey.self, value: proxy.size.width)
            }
        )
        .onPreferenceChange(GridWidthKey.self) { width = $0 }
    }

    @ViewBuilder
    private func grid(width w: CGFloat) -> some View {
        let g = Self.gap
        let half = (w - g) / 2
        switch images.count {
        case 0:
            EmptyView()
        case 1:
            tile(0, width: w, height: singleHeight(width: w, image: images[0]))
        case 2:
            HStack(spacing: g) {
                tile(0, width: half, height: half)
                tile(1, width: half, height: half)
            }
        case 3:
            HStack(spacing: g) {
                tile(0, width: half, height: w)
                VStack(spacing: g) {
                    tile(1, width: half, height: half)
                    tile(2, width: half, height: half)
                }
            }
        default:
            VStack(spacing: g) {
                HStack(spacing: g) {
                    tile(0, width: half, height: half)
                    tile(1, width: half, height: half)
                }
                HStack(spacing: g) {
                    tile(2, width: half, height: half)
                    tile(3, width: half, height: half, remainder: images.count > 4 ? images.count - 4 : nil)
                }
            }
        }
    }

    /// Höhe eines einzelnen Bildes: das eigene Seitenverhältnis, begrenzt auf 4:5 bis 16:9. Ohne Maße 4:3.
    private func singleHeight(width w: CGFloat, image: Attachment) -> CGFloat {
        var ratio: CGFloat = 4.0 / 3.0
        if let imageWidth = image.width, let imageHeight = image.height, imageWidth > 0, imageHeight > 0 {
            ratio = CGFloat(imageWidth) / CGFloat(imageHeight)
        }
        ratio = min(max(ratio, 4.0 / 5.0), 16.0 / 9.0)
        return w / ratio
    }

    private func tile(_ index: Int, width w: CGFloat, height h: CGFloat, remainder: Int? = nil) -> some View {
        PhotoTile(attachment: images[index],
                  size: CGSize(width: w, height: h),
                  allowAutoLoad: senderTrusted && !LowDataMonitor.shared.isConstrained,
                  isStranger: !senderTrusted,
                  remainder: remainder) {
            onOpen(index)
        }
    }
}

private struct GridWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

/// Relative Zeit auf Deutsch: „gerade eben“, „vor 12 Min.“, „vor 3 Std.“, „Gestern, 14:20“, „12. Okt.“
enum MemberTimeFormat {
    @MainActor
    private static let clock: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    @MainActor
    private static let dayMonth: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.dateFormat = "d. MMM"
        return formatter
    }()

    @MainActor
    static func text(for date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        let seconds = now.timeIntervalSince(date)
        if seconds < 60 { return "gerade eben" }
        if seconds < 3600 { return "vor \(Int(seconds / 60)) Min." }
        if calendar.isDate(date, inSameDayAs: now) { return "vor \(Int(seconds / 3600)) Std." }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
           calendar.isDate(date, inSameDayAs: yesterday) {
            return "Gestern, \(clock.string(from: date))"
        }
        return dayMonth.string(from: date)
    }
}
