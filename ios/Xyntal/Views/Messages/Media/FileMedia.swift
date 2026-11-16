import SwiftUI
import QuickLook

/// Zustand einer Datei im Verlauf: lädt erst auf Antippen, dann Schnellansicht.
/// Nie vorab laden: Die App ist ab 16, und ungefragte Downloads kosten Daten.
@MainActor
@Observable
final class AttachmentFileModel {
    let attachment: Attachment
    /// 0...1 während des Ladens, sonst nil.
    private(set) var progress: Double?
    private(set) var failed = false
    /// Gesetzt, sobald die Schnellansicht öffnen soll. QuickLook setzt es beim Schließen wieder auf nil.
    var previewURL: URL?
    /// Datei ist da, aber die Schnellansicht kann den Typ nicht zeigen. Dann bleibt nur Teilen.
    private(set) var unpreviewableURL: URL?
    /// Meldung statt Laden, etwa wenn die Datei zu groß ist. Die Datei wird dann nicht geladen.
    private(set) var refusal: String?
    private var localURL: URL?

    init(attachment: Attachment) {
        self.attachment = attachment
    }

    var isLoading: Bool { progress != nil }

    /// Lädt beim ersten Aufruf, danach öffnet es direkt die Schnellansicht.
    func open(session: SessionStore) async {
        guard !isLoading else { return }
        failed = false
        unpreviewableURL = nil
        refusal = nil
        if let localURL {
            present(localURL)
            return
        }
        if let problem = MediaLoader.sizeProblem(for: attachment) {
            refusal = problem
            return
        }
        progress = 0
        defer { progress = nil }
        do {
            let data = try await MediaLoader.shared.fileData(for: attachment, session: session) { [weak self] value in
                self?.progress = value
            }
            let url = try MediaLoader.shared.previewURL(for: attachment, data: data)
            localURL = url
            present(url)
        } catch is CancellationError {
            return
        } catch {
            failed = true
        }
    }

    /// Vorschau nur für Typen, die die App auch zum Hochladen erlaubt, und nur, wenn der Server genau den MIME-Typ
    /// meldet, den die App für diese Endung schickt. Fehlt er oder passt er nicht, bleibt nur Teilen.
    private func present(_ url: URL) {
        guard Self.hasAllowedType(attachment), QLPreviewController.canPreview(url as NSURL) else {
            unpreviewableURL = url
            return
        }
        previewURL = url
    }

    /// Erlaubte Endung (AttachmentRules, wie beim Hochladen) und MIME-Typ, der zur Endung passt.
    /// Die App schickt beim Hochladen genau AttachmentRules.mimeType(forName:), also passt der Vergleich für ihre Anhänge.
    static func hasAllowedType(_ attachment: Attachment) -> Bool {
        let name = attachment.name ?? ""
        guard AttachmentRules.kind(forName: name) != nil, let sent = attachment.mimeType else { return false }
        // Parameter wie "; charset=utf-8" zählen nicht zum Typ.
        let declared = sent.split(separator: ";").first.map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
        return declared == AttachmentRules.mimeType(forName: name).lowercased()
    }
}

/// Eine Datei im Verlauf: Symbol-Kachel (oder Fortschrittsring), Name, Typ und Größe.
struct FileAttachmentRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .body) private var tileSize: CGFloat = 44

    @Bindable var model: AttachmentFileModel
    let foreground: Color
    let onTap: () -> Void

    private var nameLimit: Int { dynamicTypeSize.isAccessibilitySize ? 60 : 40 }
    private var nameLines: Int { dynamicTypeSize.isAccessibilitySize ? 3 : 2 }

    private var subtitle: String {
        let type = MediaFormat.typeLabel(for: model.attachment)
        guard let size = MediaFormat.size(model.attachment.size) else { return type }
        return "\(type) · \(size)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(action: onTap) {
                HStack(spacing: 12) {
                    tile
                    VStack(alignment: .leading, spacing: 2) {
                        Text(MediaFormat.middleTruncated(model.attachment.displayName, limit: nameLimit))
                            .font(.body)
                            .lineLimit(nameLines)
                            .multilineTextAlignment(.leading)
                        if let refusal = model.refusal {
                            Text(refusal)
                                .font(.caption)
                                .foregroundStyle(foreground.opacity(0.85))
                        } else if model.failed {
                            RetryHintText()
                        } else {
                            Text(subtitle)
                                .font(.caption)
                                .foregroundStyle(foreground.opacity(0.75))
                        }
                    }
                    Spacer(minLength: 0)
                }
                .foregroundStyle(foreground)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if let url = model.unpreviewableURL {
                Text("Für diesen Dateityp gibt es keine Vorschau. Teile die Datei, um sie in einer anderen App zu öffnen.")
                    .font(.caption)
                    .foregroundStyle(foreground.opacity(0.85))
                ShareLink(item: url) {
                    Label("Teilen", systemImage: "square.and.arrow.up")
                        .font(.caption.weight(.semibold))
                }
                .foregroundStyle(foreground)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .quickLookPreview($model.previewURL)
    }

    private var tile: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(Theme.accent.opacity(0.18))
            if let progress = model.progress {
                Circle()
                    .stroke(foreground.opacity(0.2), lineWidth: 3)
                    .padding(8)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(foreground, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(8)
            } else {
                Image(systemName: MediaFormat.fileSymbol(for: model.attachment))
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(Theme.accent)
            }
        }
        .frame(width: tileSize, height: tileSize)
        .accessibilityHidden(true)
    }
}
