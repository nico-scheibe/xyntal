import Foundation

/// Push-Geräte beim Server an- und abmelden.
///
/// Server-Vertrag (Annahme – der Server-Anteil existiert noch nicht, siehe Repo xyntal-app-windows):
/// - `POST /devices/push` mit Bearer, Body `{ token: String (hex), platform: "ios", deviceName: "Xyntal iOS-App", environment: "sandbox" | "production" }`
/// - `DELETE /devices/push/:token` mit Bearer
/// Antworten in der üblichen Hülle `{ data, error }`. Fehler (404, 5xx, Netz) behandelt der Aufrufer still.
extension APIClient {
    /// Gerätename für den Server. Enthält keine personenbezogenen Daten.
    private static let pushDeviceName = "Xyntal iOS-App"

    /// Kürzerer Timeout, damit das Abmelden beim Logout nicht lange blockiert.
    private static let pushTimeout: TimeInterval = 8

    /// POST /devices/push: meldet das APNs-Token für diesen Nutzer an. Idempotent auf Serverseite erwartet.
    /// Wirft AppError.rejected bei 4xx außer 401 und 429: Dann lohnt kein weiterer Versuch in diesem App-Start.
    func registerPushDevice(deviceToken: String, environment: String, token: String) async throws {
        let device = try Self.validatedPushToken(deviceToken)
        _ = try await send("devices/push",
                           method: "POST",
                           token: token,
                           body: PushDeviceRequest(token: device,
                                                   platform: "ios",
                                                   deviceName: Self.pushDeviceName,
                                                   environment: environment),
                           as: PushDeviceAck.self,
                           mapFailure: Self.registerFailure,
                           timeout: Self.pushTimeout)
    }

    /// 401 (Sitzung) und 429 (Drosselung) gehen den normalen Weg; jede andere 4xx-Antwort gilt als endgültige Ablehnung.
    private static func registerFailure(status: Int, code: String, message: String) -> AppError? {
        guard (400..<500).contains(status), status != 401, status != 429 else { return nil }
        return .rejected
    }

    /// DELETE /devices/push/:token: meldet das APNs-Token ab (beim Logout).
    func unregisterPushDevice(deviceToken: String, token: String) async throws {
        let device = try Self.validatedPushToken(deviceToken)
        _ = try await send("devices/push/\(device)",
                           method: "DELETE",
                           token: token,
                           as: PushDeviceAck.self,
                           timeout: Self.pushTimeout)
    }

    /// APNs-Tokens sind Hex-Strings (64 Zeichen). Nur [0-9a-fA-F] gelangt in Body oder Pfad.
    static func validatedPushToken(_ token: String) throws -> String {
        let hexScalars = CharacterSet(charactersIn: "0123456789abcdefABCDEF")
        guard !token.isEmpty, token.count <= 256,
              token.unicodeScalars.allSatisfy({ hexScalars.contains($0) }) else {
            throw AppError.message(AppError.genericMessage)
        }
        return try validatedPathId(token)
    }
}

private struct PushDeviceRequest: Encodable {
    let token: String
    let platform: String
    let deviceName: String
    let environment: String
}

/// Antwort ohne ausgewerteten Inhalt.
private struct PushDeviceAck: Decodable {}
