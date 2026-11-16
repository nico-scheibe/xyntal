import Foundation

// Anrufe im Direktgespräch. Die Medien laufen in der Anruf-Seite (Views/Calls/CallPageHost.swift), hier geht es nur um Sitze und Zustand.
extension APIClient {
    /// GET /calls/info: ob der Server Anrufe anbietet, und die Obergrenze der Teilnehmer.
    func callInfo(token: String) async throws -> CallsInfo {
        try await send("calls/info", token: token, as: CallsInfo.self)
    }

    /// POST /conversations/:id/calls. Startet einen Anruf oder nimmt einen Platz im laufenden. kind ist "audio" oder "video".
    func startCall(conversationId: String, kind: String, token: String) async throws -> CallStartResult {
        let id = try Self.validatedPathId(conversationId)
        return try await send("conversations/\(id)/calls",
                              method: "POST",
                              token: token,
                              body: CallStartRequest(kind: kind),
                              as: CallStartResult.self,
                              mapFailure: Self.callFailure)
    }

    /// POST /calls/:id/join: nimmt einen Platz in einem laufenden Anruf (auch nach einem Klingeln).
    func joinCall(callId: String, token: String) async throws -> CallJoinResult {
        let id = try Self.validatedPathId(callId)
        return try await send("calls/\(id)/join",
                              method: "POST",
                              token: token,
                              as: CallJoinResult.self,
                              mapFailure: Self.callFailure)
    }

    /// POST /calls/:id/leave. Wer als Letzter geht, beendet den Anruf.
    func leaveCall(callId: String, token: String) async throws {
        let id = try Self.validatedPathId(callId)
        _ = try await send("calls/\(id)/leave",
                           method: "POST",
                           token: token,
                           as: CallAck.self,
                           mapFailure: Self.callFailure)
    }

    /// POST /calls/:id/decline: einen eingehenden Anruf ablehnen. Der Anrufer hört davon nur, was der Server zeigt.
    func declineCall(callId: String, token: String) async throws {
        let id = try Self.validatedPathId(callId)
        _ = try await send("calls/\(id)/decline",
                           method: "POST",
                           token: token,
                           as: CallAck.self,
                           mapFailure: Self.callFailure)
    }

    /// GET /conversations/:id/call: der laufende Anruf eines Gesprächs, oder nil.
    func activeCall(conversationId: String, token: String) async throws -> CallInfo? {
        let id = try Self.validatedPathId(conversationId)
        let result = try await send("conversations/\(id)/call",
                                    token: token,
                                    as: CallActiveResult.self)
        return result.call
    }

    /// Fehlerantworten der Anruf-Endpunkte. Die Texte sind deutsch und ohne Server-Details.
    private static func callFailure(status: Int, code: String, message: String) -> AppError? {
        switch status {
        case 403:
            return .message("Du kannst diese Person gerade nicht anrufen.")
        case 404:
            return .stale("Dieser Anruf gibt es nicht mehr.")
        case 409:
            return .stale("Der Anruf ist voll oder schon beendet.")
        case 410:
            return .stale("Deine Verbindung zum Anruf ist abgelaufen.")
        case 503:
            return .message("Anrufe sind auf diesem Server noch nicht eingerichtet.")
        default:
            return nil
        }
    }
}

private struct CallStartRequest: Encodable {
    let kind: String
}

/// Antwort ohne Inhalt, z. B. { "call": … } für leave. Der Inhalt wird nicht gebraucht.
private struct CallAck: Decodable {}
