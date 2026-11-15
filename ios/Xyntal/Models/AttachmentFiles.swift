import AVFoundation
import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

/// Ein Anhang, der in der Leiste liegt und noch nicht gesendet ist. Die Datei liegt im Temp-Ordner und bleibt dort,
/// bis die Nachricht zugestellt oder verworfen wird. Abbrechen gibt den Anhang zurück, ohne die Datei anzufassen.
struct ComposerAttachment: Identifiable {
    let id = UUID()
    let fileURL: URL
    /// Name, wie er beim Server ankommt. Fotos heißen "Foto-….jpg".
    let name: String
    let mimeType: String
    let size: Int
    let isImage: Bool
    /// Vorschau für Bilder, nil bei Dateien.
    let preview: UIImage?
}

/// Fehler bei der Vorbereitung, die der Nutzer sieht.
enum AttachmentPreparationError: Error {
    case videoNotPrepared
}

/// Dateien für Anhänge: Temp-Ordner, Fotovorbereitung und Teile zum Hochladen. Ohne UI.
enum AttachmentFiles {
    /// Längste Kante eines Fotos im Chat.
    static let maxImageEdge = 2048
    static let jpegQuality = 0.85
    private static let previewEdge = 256

    /// Eigener Ordner im Temp-Verzeichnis, nicht im Dokumentenordner.
    static var directory: URL {
        let url = FileManager.default.temporaryDirectory.appending(path: "Anhaenge", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static func newFileURL(ext: String) -> URL {
        directory.appending(path: UUID().uuidString).appendingPathExtension(ext)
    }

    static func remove(_ url: URL) {
        try? FileManager.default.removeItem(at: url)
    }

    /// Fotos: JPEG, längste Kante höchstens 2048 px. Das Bild wird neu aufgebaut, ohne Standort-, Kamera- und
    /// sonstige EXIF-Daten des Originals. Nur die Bildpunkte gehen in die Datei.
    static func jpegWithoutMetadata(_ data: Data) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        // Nur die Maße werden gelesen, um nicht hochzuskalieren.
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        let width = properties?[kCGImagePropertyPixelWidth] as? Int ?? maxImageEdge
        let height = properties?[kCGImagePropertyPixelHeight] as? Int ?? maxImageEdge
        let edge = min(max(width, height, 1), maxImageEdge)
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: edge,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else {
            return nil
        }
        // Ohne Eigenschaften: das neue Bild trägt keine Metadaten.
        CGImageDestinationAddImage(destination, image,
                                   [kCGImageDestinationLossyCompressionQuality: jpegQuality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }

    /// Foto aus Daten (Mediathek, Kamera oder Dateien-App) als Anhang. nil, wenn sich das Bild nicht lesen lässt.
    /// Animierte GIFs bleiben unverändert, siehe `isAnimatedGIF`.
    static func imageAttachment(fromData data: Data) -> ComposerAttachment? {
        if let source = CGImageSourceCreateWithData(data as CFData, nil), isAnimatedGIF(source) {
            let url = newFileURL(ext: "gif")
            do {
                try data.write(to: url, options: .atomic)
            } catch {
                return nil
            }
            return ComposerAttachment(fileURL: url,
                                      name: "Foto-\(UUID().uuidString.prefix(8)).gif",
                                      mimeType: "image/gif",
                                      size: data.count,
                                      isImage: true,
                                      preview: thumbnail(of: data))
        }
        guard let jpeg = jpegWithoutMetadata(data) else { return nil }
        let url = newFileURL(ext: "jpg")
        do {
            try jpeg.write(to: url, options: .atomic)
        } catch {
            return nil
        }
        return ComposerAttachment(fileURL: url,
                                  name: "Foto-\(UUID().uuidString.prefix(8)).jpg",
                                  mimeType: "image/jpeg",
                                  size: jpeg.count,
                                  isImage: true,
                                  preview: thumbnail(of: jpeg))
    }

    /// Ein GIF mit mehr als einem Einzelbild.
    ///
    /// Hier wird bewusst nicht umgewandelt. Jede Umwandlung (JPEG, Verkleinern, Neu-Kodieren) würde die Bewegung
    /// vernichten, und genau die ist der Inhalt: Der Empfänger bekäme ein eingefrorenes Standbild, ohne es zu merken.
    /// Deshalb geht die Datei unverändert als image/gif hoch. Ist sie zu groß, greift die normale Tarifmeldung.
    /// Ein GIF mit nur einem Bild wird dagegen wie ein Foto behandelt (JPEG, ohne Metadaten).
    static func isAnimatedGIF(_ source: CGImageSource) -> Bool {
        CGImageSourceGetType(source) as String? == "com.compuserve.gif" && CGImageSourceGetCount(source) > 1
    }

    /// Datei aus der Dateien-App in den Temp-Ordner bringen. Bilder laufen durch die Fotovorbereitung,
    /// Videos durch den Export ohne Ortsdaten. Alles andere wird unverändert kopiert.
    static func attachment(fromFile source: URL, name: String, mimeType: String, kind: AttachmentRules.Kind) async throws -> ComposerAttachment? {
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        if kind == .image {
            let data = try Data(contentsOf: source)
            return imageAttachment(fromData: data)
        }
        let ext = MediaFormat.fileExtension(name)
        let url = newFileURL(ext: ext)
        if kind == .video {
            try await exportVideoForSharing(from: source, to: url)
        } else {
            try FileManager.default.copyItem(at: source, to: url)
        }
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        return ComposerAttachment(fileURL: url, name: name, mimeType: mimeType, size: size, isImage: false, preview: nil)
    }

    /// Video ohne Ortsdaten und identifizierende Angaben: Export mit dem Filter für die Weitergabe.
    /// Ein Video wird nie unverändert hochgeladen. Scheitert der Export, wirft die Funktion einen Fehler.
    static func exportVideoForSharing(from source: URL, to target: URL) async throws {
        let session = AVAssetExportSession(asset: AVURLAsset(url: source), presetName: AVAssetExportPresetPassthrough)
        guard let session else { throw AttachmentPreparationError.videoNotPrepared }
        switch target.pathExtension.lowercased() {
        case "mp4": session.outputFileType = .mp4
        case "m4v": session.outputFileType = .m4v
        default: session.outputFileType = .mov
        }
        session.outputURL = target
        session.metadataItemFilter = AVMetadataItemFilter.forSharing()
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            session.exportAsynchronously {
                if session.status == .completed {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: session.error ?? AttachmentPreparationError.videoNotPrepared)
                }
            }
        }
    }

    /// Ein Stück einer Datei lesen, für den Upload. Höchstens ein Stück liegt je Aufruf im Speicher.
    static func readPart(_ url: URL, offset: Int, length: Int) throws -> Data {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(offset))
        guard let data = try handle.read(upToCount: length), data.count == length else {
            throw AppError.message(AppError.genericMessage)
        }
        return data
    }

    /// Kleine Vorschau für die Kachel, aus den bereits vorbereiteten JPEG-Daten.
    static func thumbnail(of jpeg: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(jpeg as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: previewEdge,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }

}
