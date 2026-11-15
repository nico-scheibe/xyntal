import SwiftUI

/// Anhangsleiste über dem Textfeld: waagerecht scrollbar. Hintergrund und Radius wie die Kontextleiste.
/// Die Leiste ist die Kontrolle: Man sieht, was mitgeht, und kann jeden Anhang vorher entfernen.
struct AttachmentStrip: View {
    let attachments: [ComposerAttachment]
    let onRemove: (ComposerAttachment) -> Void
    let onPreview: (ComposerAttachment) -> Void

    var body: some View {
        HStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(attachments.enumerated()), id: \.element.id) { index, attachment in
                        AttachmentTile(attachment: attachment,
                                       position: index + 1,
                                       total: attachments.count,
                                       onRemove: { onRemove(attachment) },
                                       onPreview: { onPreview(attachment) })
                    }
                }
                // Platz für das × am oberen Rand und rechts, sonst wird es abgeschnitten.
                .padding(.top, 12)
                .padding(.trailing, 12)
            }
            if attachments.count >= AttachmentRules.counterFrom {
                Text("\(attachments.count) von \(AttachmentRules.maxPerMessage)")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                    .accessibilityLabel("\(attachments.count) von \(AttachmentRules.maxPerMessage) Anhängen")
            }
        }
        .padding(8)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
    }
}

/// Eine Kachel in der Leiste. Bild 64 × 64 mit Vorschau, Datei 64 breit mit Symbol und Namen.
private struct AttachmentTile: View {
    @ScaledMetric(relativeTo: .body) private var size: CGFloat = 64

    let attachment: ComposerAttachment
    let position: Int
    let total: Int
    let onRemove: () -> Void
    let onPreview: () -> Void

    var body: some View {
        tileContent
            .frame(width: size, height: size)
            .overlay(alignment: .topTrailing) {
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, Color.black.opacity(0.65))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .offset(x: 12, y: -12)
                .accessibilityHidden(true)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Anhang \(position) von \(total), \(attachment.isImage ? "Foto" : "Datei: \(attachment.name)")")
            .accessibilityAction(named: "Anhang entfernen", onRemove)
            .accessibilityAddTraits(attachment.isImage ? .isButton : [])
            .accessibilityAction(.default) {
                if attachment.isImage { onPreview() }
            }
    }

    @ViewBuilder
    private var tileContent: some View {
        if attachment.isImage {
            Button(action: onPreview) {
                if let preview = attachment.preview {
                    Image(uiImage: preview)
                        .resizable()
                        .scaledToFill()
                        .frame(width: size, height: size)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                } else {
                    imagePlaceholder
                }
            }
            .buttonStyle(.plain)
        } else {
            VStack(spacing: 4) {
                Image(systemName: AttachmentRules.symbol(forName: attachment.name))
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(Theme.accent)
                Text(MediaFormat.middleTruncated(attachment.name, limit: 16))
                    .font(.caption2)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 4)
            .frame(width: size, height: size)
            .background(Color(.tertiarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    private var imagePlaceholder: some View {
        RoundedRectangle(cornerRadius: 10)
            .fill(Color(.tertiarySystemBackground))
            .overlay {
                Image(systemName: "photo")
                    .foregroundStyle(Theme.muted)
            }
            .frame(width: size, height: size)
    }
}

/// Das "+" links in der Eingabezeile. Bei voller Leiste sind alle drei Einträge ausgegraut.
struct AttachmentMenu: View {
    let isFull: Bool
    let cameraAvailable: Bool
    let onPhotos: () -> Void
    let onCamera: () -> Void
    let onFiles: () -> Void
    /// Nur in Communitys mit Umfrage-Recht gesetzt. Im Chat bleibt der Eintrag weg (nil).
    var onPoll: (() -> Void)? = nil

    var body: some View {
        Menu {
            Button("Fotos", systemImage: "photo.on.rectangle", action: onPhotos)
                .disabled(isFull)
            if cameraAvailable {
                Button("Kamera", systemImage: "camera", action: onCamera)
                    .disabled(isFull)
            }
            Button("Datei", systemImage: "doc", action: onFiles)
                .disabled(isFull)
            if let onPoll {
                Button("Umfrage", systemImage: "chart.bar", action: onPoll)
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(Theme.muted)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Anhang hinzufügen")
    }
}

/// Vollbild-Vorschau eines Fotos vor dem Senden, zum Prüfen.
struct AttachmentPreview: View {
    let attachment: ComposerAttachment
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?

    var body: some View {
        ZStack(alignment: .topLeading) {
            Color.black.ignoresSafeArea()
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Foto, zum Prüfen")
            }
            Button {
                dismiss()
            } label: {
                Text("Schließen")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 12)
        }
        .task {
            image = UIImage(contentsOfFile: attachment.fileURL.path)
        }
    }
}
