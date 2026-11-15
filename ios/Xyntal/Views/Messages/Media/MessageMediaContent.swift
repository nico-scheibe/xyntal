import SwiftUI

/// Die Anhänge einer Nachricht in fester Reihenfolge: GIF oder Sprache, dann Fotos, dann Dateien.
/// Die Beschriftung setzt die Bubble darunter.
///
/// Fotos und GIFs von Fremden laden nicht von selbst. "Fremd" heißt: In diesem Gespräch hast du selbst noch
/// nie eine Nachricht geschrieben. Begründung: Die App ist ab 16, und jeder kann jeden ungefragt anschreiben.
/// Ein Bild, das sich von selbst öffnet, kann man nicht mehr ungesehen machen.
struct MessageMediaContent: View {
    let message: Message
    /// true bei eigenen Nachrichten und in Gesprächen, in denen du selbst schon geschrieben hast.
    let senderTrusted: Bool
    let voice: VoicePlayer
    let files: [AttachmentFileModel]
    @Binding var gifVisible: Bool
    let foreground: Color
    let onOpenImage: (Int) -> Void

    @Environment(SessionStore.self) private var session

    /// Automatisch laden nur bei vertrautem Absender und ohne Datenreduzierung.
    private var allowAutoLoad: Bool {
        senderTrusted && !LowDataMonitor.shared.isConstrained
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if message.isGif {
                GIFMediaView(gif: message.gif,
                             allowAutoLoad: allowAutoLoad,
                             isStranger: !senderTrusted,
                             visible: $gifVisible)
            }
            if let attachment = message.voiceAttachment {
                VoiceMessageView(attachment: attachment, player: voice, foreground: foreground)
            }
            PhotoGrid(images: message.imageAttachments,
                      allowAutoLoad: allowAutoLoad,
                      isStranger: !senderTrusted,
                      onOpen: onOpenImage)
            ForEach(files, id: \.attachment.id) { model in
                FileAttachmentRow(model: model, foreground: foreground) {
                    Task { await model.open(session: session) }
                }
            }
        }
    }
}
