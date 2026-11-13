import SwiftUI

/// Ein Beitrag des Xyntal-Teams: Kopf mit Autor und Kanal, Text, optional Umfrage, Fuß mit Zeit, Reaktionen und Anhängen.
/// Servertexte werden nur als Text gezeigt, ohne Markdown-Interpretation.
struct CommunityPostView: View {
    let post: CommunityPost
    /// Avatar der Community (data-URL), für alle Beiträge gleich.
    let communityAvatar: String?
    let isNew: Bool

    /// Längere Texte werden gekürzt, bis der Nutzer „Mehr anzeigen“ tippt.
    static let collapsedLength = 1_500

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            bodyText
            if let poll = post.poll {
                CommunityPollView(poll: poll)
            }
            footer
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isNew ? Theme.accent : .clear, lineWidth: 1)
        )
    }

    // MARK: - Kopf

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            AvatarView(name: "Xyntal", avatar: communityAvatar, size: 36)
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: post.authorName)
                    .font(.subheadline.bold())
                    .lineLimit(1)
                Text("Xyntal-Team")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 4) {
                if let channel = post.channel.nonEmptyText {
                    Text(verbatim: "#\(channel)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.accent)
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
                .textSelection(.enabled)
            Button("Mehr anzeigen") {
                isExpanded = true
            }
            .font(.subheadline.weight(.semibold))
        } else {
            Text(verbatim: text)
                .font(.body)
                .textSelection(.enabled)
        }
    }

    // MARK: - Fuß

    private var footer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !post.reactions.isEmpty || post.attachmentText != nil {
                HStack(spacing: 6) {
                    ForEach(post.reactions, id: \.emoji) { reaction in
                        Text(verbatim: "\(reaction.emoji) \(reaction.count)")
                            .font(.caption)
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
            if let date = post.date {
                Text(CommunityTimeFormat.relative(date))
                    .font(.caption2)
                    .foregroundStyle(Theme.muted)
                    .accessibilityLabel(date.formatted(date: .long, time: .shortened))
            }
        }
    }
}

/// Ergebnis einer Umfrage. Abstimmen geht nur in der Desktop-App.
struct CommunityPollView: View {
    let poll: CommunityPoll

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !poll.question.isEmpty {
                Text(verbatim: poll.question)
                    .font(.subheadline.weight(.semibold))
            }
            ForEach(Array(poll.options.enumerated()), id: \.offset) { _, option in
                optionRow(option)
            }
            HStack {
                Text(poll.voteCountText)
                Text("·")
                Text(poll.statusText)
            }
            .font(.caption)
            .foregroundStyle(Theme.muted)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    private func optionRow(_ option: PollOption) -> some View {
        let percent = poll.percent(for: option)
        let leading = poll.isLeading(option)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: option.label.isEmpty ? "–" : option.label)
                    .font(leading ? .subheadline.weight(.semibold) : .subheadline)
                Spacer(minLength: 8)
                Text(verbatim: "\(percent) %")
                    .font(leading ? .subheadline.weight(.semibold) : .subheadline)
                    .foregroundStyle(leading ? .primary : Theme.muted)
                    .monospacedDigit()
            }
            ProgressView(value: Double(percent), total: 100)
                .tint(leading ? Theme.accent : Theme.muted.opacity(0.6))
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
