import SwiftUI

/// Eigene Nachricht mit Anhängen, die noch nicht beim Server angekommen ist. Sie lädt hoch, ist fehlgeschlagen
/// oder wird gerade zugestellt. Die Blase hat die Farbe eigener Nachrichten, bei Fehler grau.
struct OutgoingBubble: View {
    let message: OutgoingMessage
    let onCancel: () -> Void
    let onTapFailed: () -> Void

    @ScaledMetric(relativeTo: .body) private var thumbnail: CGFloat = 96
    @ScaledMetric(relativeTo: .body) private var fileTile: CGFloat = 40

    private var isFailed: Bool { message.state == .failed }
    private var foreground: Color { isFailed ? .primary : Theme.ink }
    private var background: Color { isFailed ? Color(.systemGray4) : Theme.accent }
    private var images: [ComposerAttachment] { message.attachments.filter(\.isImage) }
    private var files: [ComposerAttachment] { message.attachments.filter { !$0.isImage } }

    var body: some View {
        HStack {
            Spacer(minLength: 48)
            VStack(alignment: .trailing, spacing: 4) {
                if isFailed {
                    Button(action: onTapFailed) {
                        VStack(alignment: .trailing, spacing: 4) {
                            bubble
                            statusLine
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Doppeltippen für Optionen")
                } else {
                    bubble
                    statusLine
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var bubble: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !images.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: thumbnail), spacing: 4)], alignment: .leading, spacing: 4) {
                    ForEach(images) { attachment in
                        imageTile(attachment)
                    }
                }
            }
            ForEach(files) { attachment in
                fileRow(attachment)
            }
            if !message.body.isEmpty {
                Text(message.body)
                    .textSelection(.enabled)
                    .padding(.horizontal, 4)
                    .padding(.bottom, 2)
            }
        }
        .padding(8)
        .foregroundStyle(foreground)
        .background(background, in: RoundedRectangle(cornerRadius: 18))
        .overlay(alignment: .topTrailing) {
            if message.state == .sending {
                Button(action: onCancel) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, Color.black.opacity(0.6))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .offset(x: 12, y: -12)
                .accessibilityLabel("Senden abbrechen")
            }
        }
    }

    @ViewBuilder
    private var statusLine: some View {
        switch message.state {
        case .sending:
            Text("Wird gesendet …")
                .font(.caption2)
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 4)
        case .failed:
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.circle")
                    .foregroundStyle(.red)
                Text("Nicht gesendet")
                    .foregroundStyle(Theme.muted)
            }
            .font(.caption2)
            .padding(.horizontal, 4)
        case .delivered:
            EmptyView()
        }
    }

    private func imageTile(_ attachment: ComposerAttachment) -> some View {
        Group {
            if let preview = attachment.preview {
                Image(uiImage: preview)
                    .resizable()
                    .scaledToFill()
            } else {
                Rectangle().fill(Color.black.opacity(0.1))
            }
        }
        .frame(width: thumbnail, height: thumbnail)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            progressRing(for: attachment, dimmed: true)
        }
        .accessibilityHidden(true)
    }

    private func fileRow(_ attachment: ComposerAttachment) -> some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.black.opacity(0.08))
                if isUploading(attachment) {
                    progressRing(for: attachment, dimmed: false)
                } else {
                    Image(systemName: message.voiceDurationMs != nil ? "waveform" : AttachmentRules.symbol(forName: attachment.name))
                        .font(.system(size: 18, weight: .medium))
                }
            }
            .frame(width: fileTile, height: fileTile)
            Text(message.voiceDurationMs != nil ? "Sprachnachricht" : MediaFormat.middleTruncated(attachment.name, limit: 40))
                .font(.body)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .padding(.horizontal, 4)
        .accessibilityHidden(true)
    }

    /// Ring über dem Anhang, solange er hochlädt. Der Anteil steht in message.progress.
    @ViewBuilder
    private func progressRing(for attachment: ComposerAttachment, dimmed: Bool) -> some View {
        if isUploading(attachment) {
            let value = message.progress[attachment.id] ?? 0
            ZStack {
                if dimmed {
                    Color.black.opacity(0.35)
                }
                // Über dem abgedunkelten Foto weiß, auf der Dateikachel in der Textfarbe.
                Circle()
                    .stroke((dimmed ? Color.white : Color.primary).opacity(0.3), lineWidth: 3)
                    .padding(dimmed ? 26 : 8)
                Circle()
                    .trim(from: 0, to: value)
                    .stroke(dimmed ? Color.white : Color.primary, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(dimmed ? 26 : 8)
            }
        }
    }

    private func isUploading(_ attachment: ComposerAttachment) -> Bool {
        message.state == .sending && (message.progress[attachment.id] ?? 0) < 1
    }
}
