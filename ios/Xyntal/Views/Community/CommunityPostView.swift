import SwiftUI

/// Ein Beitrag des Xyntal-Teams: Kopf mit Autor, Team und Zeit, Text, Fuß mit Reaktionen und Anhängen.
/// Flach wie die Beiträge im Mitglieder-Kanal: keine Fläche, der Trenner gliedert den Strom.
/// Servertexte werden nur als Text gezeigt, ohne Markdown-Interpretation.
struct CommunityPostView: View {
    let post: CommunityPost
    /// Avatar der Community (data-URL), für alle Beiträge gleich.
    let communityAvatar: String?
    let isNew: Bool

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Längere Texte werden gekürzt, bis der Nutzer „Mehr anzeigen“ tippt.
    static let collapsedLength = 1_500

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            bodyText
            footer
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Kopf

    /// Zeile 1: Autor. Zeile 2: „Xyntal-Team · vor 3 Std.“, die Zeit steht also im Kopf und nicht am Ende.
    /// Rechts oben der Kanal (neutral, nicht Akzent) und die Kapsel „Neu“. Ein Hinweis auf dieselbe Sache genügt.
    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            AvatarView(name: "Xyntal", avatar: communityAvatar, size: 32, tone: .calm)
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: post.authorName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(verbatim: authorLine)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                // Ab Accessibility-Größe wandert die Reihe unter den Autor, damit der Name die volle Breite hat (R5).
                if dynamicTypeSize.isAccessibilitySize {
                    tagRow
                        .padding(.top, 4)
                }
            }
            if !dynamicTypeSize.isAccessibilitySize {
                Spacer(minLength: 8)
                tagRow
            }
        }
    }

    /// Kanal und „Neu“. Bei normaler Schrift untereinander rechts oben, ab Accessibility-Größe nebeneinander unter dem Autor.
    @ViewBuilder
    private var tagRow: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(HStackLayout(spacing: 6))
            : AnyLayout(VStackLayout(alignment: .trailing, spacing: 4))
        layout {
            if let channel = post.channel.nonEmptyText {
                Text(verbatim: "#\(channel)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            if isNew {
                Text("Neu")
                    .font(.caption2.bold())
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Theme.accent, in: Capsule())
            }
        }
    }

    /// „Xyntal-Team · vor 3 Std.“. Ohne Datum bleibt nur der Name des Teams, nichts wird geschätzt.
    private var authorLine: String {
        guard let date = post.date else { return "Xyntal-Team" }
        return "Xyntal-Team · \(CommunityTimeFormat.relative(date))"
    }

    // MARK: - Text

    @ViewBuilder
    private var bodyText: some View {
        let text = post.bodyText
        if text.isEmpty {
            EmptyView()
        } else if text.count > Self.collapsedLength && !isExpanded {
            Text(verbatim: String(text.prefix(Self.collapsedLength)) + " …")
                .font(.body)
                .lineSpacing(3)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
            Button("Mehr anzeigen") {
                isExpanded = true
            }
            .font(.subheadline.weight(.semibold))
            // Textknopf in .primary, nicht in Akzent (Regel R1).
            .foregroundStyle(.primary)
        } else {
            Text(verbatim: text)
                .font(.body)
                .lineSpacing(3)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
        }
    }

    // MARK: - Fuß

    /// Nur Reaktionen und Anhänge. Die Zeit steht im Kopf, daher bleibt am Ende nichts mehr übrig, wenn beides fehlt.
    @ViewBuilder
    private var footer: some View {
        if !post.reactions.isEmpty || post.attachmentText != nil {
            HStack(spacing: 6) {
                ForEach(post.reactions, id: \.emoji) { reaction in
                    Text(verbatim: "\(reaction.emoji) \(reaction.count)")
                        .font(.caption)
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(.tertiarySystemGroupedBackground), in: Capsule())
                        .accessibilityLabel(Text(verbatim: "\(reaction.emoji) \(reaction.count)"))
                }
                if let attachmentText = post.attachmentText {
                    Label {
                        Text(attachmentText)
                    } icon: {
                        Image(systemName: "paperclip")
                    }
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                }
            }
        }
    }
}

/// Relative Zeitangabe auf Deutsch, z. B. „vor 3 Min.“, „gestern“.
enum CommunityTimeFormat {
    @MainActor
    private static let formatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "de_DE")
        formatter.unitsStyle = .short
        formatter.dateTimeStyle = .named
        return formatter
    }()

    @MainActor
    static func relative(_ date: Date, now: Date = Date()) -> String {
        if now.timeIntervalSince(date) < 60 { return "gerade eben" }
        return formatter.localizedString(for: date, relativeTo: now)
    }
}
