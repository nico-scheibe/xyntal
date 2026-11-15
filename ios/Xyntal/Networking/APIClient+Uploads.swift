import Foundation

/// Eine Upload-Sitzung auf dem Server (POST /files/uploads). Größe der Teile und Anzahl gleichzeitiger Teile kommen vom Server.
struct UploadTicket: Decodable, Equatable {
    let id: String
    let chunkSize: Int
    let parallel: Int
}

// Anhänge im Chat: Datei hochladen in Teilen, dann die Datei-Ids an die Nachricht hängen.
extension APIClient {
    /// POST /files/uploads. Der Server prüft die Tarifgrenzen schon hier, anhand der angegebenen Größe.
    func startUpload(name: String, mimeType: String, size: Int, token: String) async throws -> UploadTicket {
        let result = try await send("files/uploads",
                                    method: "POST",
                                    token: token,
                                    body: StartUploadRequest(name: name, mimeType: mimeType, size: size),
                                    as: StartUploadResult.self,
                                    mapFailure: Self.uploadFailure)
        return result.upload
    }

    /// PUT /files/uploads/:id/chunks/:index mit rohen Bytes. Ein wiederholtes Teil ist unschädlich.
    /// Das Zeitlimit ist länger als bei anderen Anfragen, weil ein Teil mehrere Megabyte groß sein kann.
    func uploadPart(uploadId: String, index: Int, data: Data, token: String) async throws {
        let id = try Self.validatedPathId(uploadId)
        _ = try await send("files/uploads/\(id)/chunks/\(index)",
                           method: "PUT",
                           token: token,
                           rawBody: data,
                           as: UploadAck.self,
                           mapFailure: Self.uploadFailure,
                           timeout: 120)
    }

    /// POST /files/uploads/:id/complete. Liefert die Id der fertigen Datei.
    func completeUpload(uploadId: String, token: String) async throws -> String {
        let id = try Self.validatedPathId(uploadId)
        let result = try await send("files/uploads/\(id)/complete",
                                    method: "POST",
                                    token: token,
                                    as: CompletedUploadResult.self,
                                    mapFailure: Self.uploadFailure)
        return result.file.id
    }

    /// DELETE /files/uploads/:id: bricht eine Sitzung ab. Der Aufrufer ignoriert Fehler.
    func abortUpload(uploadId: String, token: String) async throws {
        let id = try Self.validatedPathId(uploadId)
        _ = try await send("files/uploads/\(id)", method: "DELETE", token: token, as: UploadAck.self)
    }

    /// POST /conversations/:id/messages mit Text und Datei-Ids. Der Server übernimmt höchstens 10 Ids.
    func sendAttachmentMessage(conversationId: String, body: String, replyToId: String?, attachmentIds: [String], token: String) async throws {
        let id = try Self.validatedPathId(conversationId)
        _ = try await send("conversations/\(id)/messages",
                           method: "POST",
                           token: token,
                           body: AttachmentMessageRequest(body: body, attachments: attachmentIds, replyToId: replyToId),
                           as: UploadAck.self)
    }

    /// Fehler beim Anlegen und Hochladen. Tarifgrenzen werden getrennt gemeldet, 404 heißt: Sitzung unbekannt.
    private static func uploadFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code.uppercased()) {
        case (400, "PLAN_LIMIT"):
            return .attachmentTooLarge
        case (403, "PLAN_LIMIT"):
            return .storageFull
        case (404, _):
            return .uploadExpired
        default:
            return nil
        }
    }
}

private struct UploadAck: Decodable {}

private struct StartUploadRequest: Encodable {
    let name: String
    let mimeType: String
    let size: Int
}

private struct StartUploadResult: Decodable {
    let upload: UploadTicket
}

private struct CompletedUploadResult: Decodable {
    let file: CompletedFile

    struct CompletedFile: Decodable {
        let id: String
    }
}

private struct AttachmentMessageRequest: Encodable {
    let body: String
    let attachments: [String]
    let replyToId: String?
}
