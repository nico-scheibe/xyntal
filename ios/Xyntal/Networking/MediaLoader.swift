import Foundation

/// Lädt Anhänge und GIFs. Bytes liegen im Zwischenspeicher im Speicher, begrenzt auf 64 MB und 50 Einträge.
/// Eine Datei, die die Schnellansicht zeigen soll, wird zusätzlich in den Temp-Ordner `Xyntal-Anhaenge` geschrieben.
/// Dieser Ordner wird beim App-Start geleert und beim Abmelden (SessionStore.clearSession), zusammen mit dem Zwischenspeicher.
/// GIFs bleiben nur im Speicher. Anhänge kommen vom API-Server mit Token. GIFs kommen von GIPHY ohne Token; ihre Adresse
/// muss https und eine GIPHY-Adresse sein, sonst wird nichts geladen.
@MainActor
final class MediaLoader {
    static let shared = MediaLoader()

    /// Grenzen: 64 MB und 50 Einträge. Der Avatar-Cache hat 20 MB, aber hier liegen GIFs (bis 20 MB) und Dateien
    /// (bis 100 MB). Mit 20 MB würde schon ein großes GIF den Zwischenspeicher fast leeren. Was über die Grenze
    /// hinausgeht, fliegt beim nächsten Speichern raus und wird bei Bedarf neu geladen.
    private let cache: NSCache<NSString, NSData> = {
        let cache = NSCache<NSString, NSData>()
        cache.totalCostLimit = 64 * 1024 * 1024
        cache.countLimit = 50
        return cache
    }()
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
        // Vor dem Netzverkehr: Die Größe kommt vom Server und kann lügen. Die Prüfung nach dem Laden bleibt.
        if let problem = Self.sizeProblem(for: attachment) {
            throw AppError.message(problem)
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

    /// Meldung, wenn der Server eine Datei größer als die Obergrenze angibt. nil, wenn sie passt oder die Größe fehlt.
    static func sizeProblem(for attachment: Attachment) -> String? {
        guard let size = attachment.size, size > APIClient.maxFileResponseBytes else { return nil }
        let limit = AttachmentRules.limitText(APIClient.maxFileResponseBytes)
        return "„\(attachment.displayName)“ ist zu groß zum Öffnen. Xyntal öffnet Dateien bis \(limit)."
    }

    /// Schreibt eine geladene Datei in den Temporär-Ordner, damit die Schnellansicht sie öffnen kann.
    /// Namen werden bereinigt; Schrägstriche und Doppelpunkte würden den Pfad zerlegen.
    func previewURL(for attachment: Attachment, data: Data) throws -> URL {
        let folderName = Self.safeComponent(attachment.id)
        let folder = Self.downloadFolder.appending(path: folderName, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let url = folder.appending(path: Self.safeComponent(attachment.displayName))
        try data.write(to: url, options: .atomic)
        return url
    }

    /// Löscht alle geladenen Dateien auf dem Datenträger. Aufruf beim App-Start und beim Abmelden.
    static func removeDownloadedFiles() {
        try? FileManager.default.removeItem(at: downloadFolder)
    }

    /// Leert den Zwischenspeicher und löscht die Dateien. Aufruf beim Abmelden, solange die Sitzung endet.
    func clear() {
        cache.removeAllObjects()
        Self.removeDownloadedFiles()
    }

    private static var downloadFolder: URL {
        FileManager.default.temporaryDirectory.appending(path: "Xyntal-Anhaenge", directoryHint: .isDirectory)
    }

    /// APFS lehnt Namen ab, die länger als 255 Bytes sind (Errno 63). 200 Bytes lassen Abstand.
    private static let maxNameBytes = 200

    private static func safeComponent(_ text: String) -> String {
        let separated = String(text.map { character in
            character.isNewline || "/:\\".contains(character) ? "_" : character
        })
        // Steuer- und Formatzeichen (z. B. U+202E) entfernen: Sie drehen die Anzeige um und können die Endung fälschen.
        let visible = String(String.UnicodeScalarView(separated.unicodeScalars.filter { scalar in
            let category = scalar.properties.generalCategory
            return category != .control && category != .format
        }))
        let trimmed = visible.trimmingCharacters(in: .whitespaces)
        let named = trimmed.isEmpty || trimmed.hasPrefix(".") ? "Datei" + trimmed : trimmed
        return limitedBytes(named, maxBytes: maxNameBytes)
    }

    /// Kürzt den Namen auf höchstens `maxBytes` UTF-8-Bytes, die Endung bleibt. Die Endung entscheidet über den
    /// Renderer der Schnellansicht. Eine Endung über 16 Bytes gilt nicht als Endung; solche Typen sind nicht erlaubt.
    private static func limitedBytes(_ name: String, maxBytes: Int) -> String {
        guard name.utf8.count > maxBytes else { return name }
        var suffix = ""
        if let dot = name.lastIndex(of: "."), dot != name.startIndex, name[dot...].utf8.count <= 16 {
            suffix = String(name[dot...])
        }
        let budget = maxBytes - suffix.utf8.count
        var stem = ""
        for character in name.dropLast(suffix.count) {
            guard stem.utf8.count + String(character).utf8.count <= budget else { break }
            stem.append(character)
        }
        return stem + suffix
    }
}
