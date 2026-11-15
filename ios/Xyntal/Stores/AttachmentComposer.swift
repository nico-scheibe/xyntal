import Foundation
import Observation
import UIKit

/// Die Anhänge in der Eingabezeile, noch nicht gesendet. Prüft Anzahl, Typ und Tarifgrenze beim Hinzufügen,
/// damit ein unpassender Anhang gar nicht erst in der Leiste landet.
@MainActor
@Observable
final class AttachmentComposer {
    private(set) var items: [ComposerAttachment] = []
    /// Meldung über der Leiste, z. B. "zu groß" oder "zu viele". Der Nutzer blendet sie aus.
    var errorText: String?

    var isFull: Bool { items.count >= AttachmentRules.maxPerMessage }
    var remaining: Int { max(0, AttachmentRules.maxPerMessage - items.count) }

    /// Fotos aus der Mediathek oder Kamera. Jedes Bild wird vorbereitet, bevor es in der Leiste liegt.
    func addPhotos(_ datas: [Data], limits: UploadLimits?) async {
        let prepared = await Task.detached(priority: .userInitiated) {
            datas.map { AttachmentFiles.imageAttachment(fromData: $0) }
        }.value
        var accepted: [ComposerAttachment] = []
        for photo in prepared {
            guard let photo else {
                errorText = AttachmentRules.uploadFailedText
                continue
            }
            accepted.append(photo)
        }
        append(accepted, limits: limits)
    }

    /// Dateien aus der Dateien-App. Typ und Größe werden geprüft, Bilder wie Fotos vorbereitet.
    func addFiles(_ urls: [URL], limits: UploadLimits?) async {
        var pending: [(url: URL, name: String, kind: AttachmentRules.Kind)] = []
        for url in urls {
            let name = url.lastPathComponent
            guard let kind = AttachmentRules.kind(forName: name) else {
                errorText = AttachmentRules.unsupportedText(name: name)
                continue
            }
            pending.append((url, name, kind))
        }
        var accepted: [ComposerAttachment] = []
        for entry in pending {
            // Nichts kopieren, was nicht mehr in die Leiste passt.
            if items.count + accepted.count >= AttachmentRules.maxPerMessage {
                errorText = AttachmentRules.tooManyText
                break
            }
            let mime = AttachmentRules.mimeType(forName: entry.name)
            do {
                let item = try await Task.detached(priority: .userInitiated) {
                    try await AttachmentFiles.attachment(fromFile: entry.url, name: entry.name, mimeType: mime, kind: entry.kind)
                }.value
                if let item {
                    accepted.append(item)
                } else {
                    errorText = AttachmentRules.uploadFailedText
                }
            } catch is AttachmentPreparationError {
                // Ein Video ohne Ortsdaten gibt es nicht: Es wird dann gar nicht hochgeladen.
                errorText = AttachmentRules.videoPreparationFailedText
            } catch {
                errorText = AttachmentRules.uploadFailedText
            }
        }
        append(accepted, limits: limits)
    }

    /// Entfernt einen Anhang aus der Leiste und löscht seine Datei.
    func remove(_ attachment: ComposerAttachment) {
        items.removeAll { $0.id == attachment.id }
        AttachmentFiles.remove(attachment.fileURL)
    }

    /// Gibt alle Anhänge für den Versand heraus. Die Dateien bleiben erhalten.
    func takeAll() -> [ComposerAttachment] {
        let taken = items
        items = []
        return taken
    }

    /// Bringt Anhänge zurück in die Leiste, z. B. nach Abbrechen einer Nachricht.
    func restore(_ attachments: [ComposerAttachment]) {
        items.append(contentsOf: attachments)
    }

    func clearError() {
        errorText = nil
    }

    /// Nimmt auf, was passt, und meldet den Rest. Zu große Dateien werden gelöscht.
    private func append(_ candidates: [ComposerAttachment], limits: UploadLimits?) {
        for candidate in candidates {
            if isFull {
                errorText = AttachmentRules.tooManyText
                AttachmentFiles.remove(candidate.fileURL)
                continue
            }
            // Der Server nimmt keine leeren Dateien an. Das sagen wir gleich, nicht erst nach dem Senden.
            if candidate.size == 0 {
                errorText = "„\(candidate.name)“ ist leer und kann nicht gesendet werden."
                AttachmentFiles.remove(candidate.fileURL)
                continue
            }
            if let perFile = limits?.perFile, candidate.size > perFile {
                errorText = AttachmentRules.tooLargeText(name: candidate.name, limit: perFile)
                AttachmentFiles.remove(candidate.fileURL)
                continue
            }
            items.append(candidate)
        }
    }
}
