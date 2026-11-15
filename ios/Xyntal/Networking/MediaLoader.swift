import Foundation

/// Lädt Anhänge und GIFs und hält die Bytes nur im Speicher, nicht auf dem Datenträger.
/// Anhänge kommen vom API-Server mit Token. GIFs kommen von GIPHY ohne Token; ihre Adresse muss
/// https und eine GIPHY-Adresse sein, sonst wird nichts geladen.
@MainActor
final class MediaLoader {
    static let shared = MediaLoader()

    private let cache = NSCache<NSString, NSData>()
    /// Ohne Token und ohne Weiterleitungen, für fremde Adressen.
    private let giphySession = APIClient.makeSession()

    private static let giphyHosts: Set<String> = [
        "i.giphy.com", "media.giphy.com", "media0.giphy.com", "media1.giphy.com",
        "media2.giphy.com", "media3.giphy.com", "media4.giphy.com"
    ]
    private static let maxGifBytes = 20 * 1024 * 1024

    /// Bytes eines Anhangs. progress meldet 0...1 während des Ladens.
    func fileData(for attachment: Attachment,
                  session: SessionStore,
                  progress: @escaping (Double) -> Void = { _ in }) async throws -> Data {
        if let cached = cache.object(forKey: attachment.id as NSString) {
            return cached as Data
        }
        let data = try await session.withAccess { token in
            try await session.api.downloadFile(id: attachment.id, token: token) { value in
                Task { @MainActor in progress(value) }
            }
        }
        cache.setObject(data as NSData, forKey: attachment.id as NSString, cost: data.count)
        return data
    }

    /// Bytes eines GIFs von GIPHY.
    func gifData(urlString: String) async throws -> Data {
        if let cached = cache.object(forKey: urlString as NSString) {
            return cached as Data
        }
        guard let url = URL(string: urlString), Self.isAllowedGifURL(url) else {
            throw AppError.message("GIF nicht verfügbar")
        }
        do {
            let (data, response) = try await giphySession.data(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  data.count <= Self.maxGifBytes else {
                throw AppError.network
            }
            cache.setObject(data as NSData, forKey: urlString as NSString, cost: data.count)
            return data
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch let error as AppError {
            throw error
        } catch {
            throw AppError.network
        }
    }

    /// true nur für https-Adressen auf GIPHY.
    static func isAllowedGifURL(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && giphyHosts.contains(url.host?.lowercased() ?? "")
    }

    /// Schreibt eine geladene Datei in den Temporär-Ordner, damit die Schnellansicht sie öffnen kann.
    /// Namen werden bereinigt; Schrägstriche und Doppelpunkte würden den Pfad zerlegen.
    func previewURL(for attachment: Attachment, data: Data) throws -> URL {
        let folderName = Self.safeComponent(attachment.id)
        let folder = FileManager.default.temporaryDirectory
            .appending(path: "Xyntal-Anhaenge", directoryHint: .isDirectory)
            .appending(path: folderName, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appending(path: Self.safeComponent(attachment.displayName))
        try data.write(to: url, options: .atomic)
        return url
    }

    private static func safeComponent(_ text: String) -> String {
        let replaced = String(text.map { character in
            character.isNewline || "/:\\".contains(character) ? "_" : character
        })
        let trimmed = replaced.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty || trimmed.hasPrefix(".") ? "Datei" + trimmed : trimmed
    }
}
