import Foundation

/// Anmeldung über Apple, Google und Discord.
///
/// Server-Vertrag: /auth/config meldet, welche Anbieter aktiv sind. Apple schickt das Identity-Token mit dem
/// rohen Nonce. Google und Discord laufen über eine Web-Anmeldung, die am Ende einen Code zurückgibt.
/// Verlangt ein Konto 2FA, liefert der Server ein `ticket`; der Code geht dann an den /complete-Aufruf.
extension APIClient {
    /// Gerätename für die Sitzung auf dem Server. Enthält keine personenbezogenen Daten.
    static let externalDeviceName = "Xyntal iOS-App"

    /// GET /auth/config (ohne Token): welche Anbieter der Server gerade anbietet.
    /// Fehlt ein Schlüssel, gilt der Anbieter als nicht verfügbar.
    func authConfig() async throws -> OAuthProviderAvailability {
        let result = try await send("auth/config", as: AuthConfigResult.self)
        return OAuthProviderAvailability(apple: result.oauth?.apple ?? false,
                                         google: result.oauth?.google ?? false,
                                         discord: result.oauth?.discord ?? false)
    }

    /// POST /auth/apple. nonce ist der ROHE Nonce; die App hat dessen SHA256 schon in der Apple-Anfrage gesetzt.
    func appleLogin(identityToken: String, rawNonce: String) async throws -> String {
        let result = try await send("auth/apple",
                                    method: "POST",
                                    body: AppleLoginRequest(identityToken: identityToken,
                                                            nonce: rawNonce,
                                                            deviceName: Self.externalDeviceName),
                                    as: ExternalTokenResult.self)
        return result.token
    }

    /// GET /auth/oauth/{provider}/start: liefert die Adresse der Anbieter-Seite.
    /// redirectUri ist die https-Rückkehr-Adresse des Servers, nicht die App-Adresse.
    func oauthStartURL(provider: ExternalSignInProvider) async throws -> URL {
        let result = try await send("auth/oauth/\(provider.rawValue)/start",
                                    query: [URLQueryItem(name: "redirectUri", value: provider.redirectURI)],
                                    as: OAuthStartResult.self)
        guard let url = URL(string: result.url), url.scheme?.lowercased() == "https" else {
            throw AppError.message(AppError.genericMessage)
        }
        return url
    }

    /// POST /auth/oauth/{provider}/callback mit dem Code aus der Web-Anmeldung.
    func oauthCallback(provider: ExternalSignInProvider, code: String, state: String) async throws -> String {
        let result = try await send("auth/oauth/\(provider.rawValue)/callback",
                                    method: "POST",
                                    body: OAuthCallbackRequest(code: code,
                                                               state: state,
                                                               redirectUri: provider.redirectURI,
                                                               deviceName: Self.externalDeviceName),
                                    as: ExternalTokenResult.self)
        return result.token
    }

    /// Zweiter Schritt bei 2FA: POST /auth/apple/complete für Apple, sonst /auth/oauth/{provider}/complete.
    func completeExternalLogin(provider: ExternalSignInProvider, ticket: String, code: String) async throws -> String {
        let path = provider == .apple ? "auth/apple/complete" : "auth/oauth/\(provider.rawValue)/complete"
        let result = try await send(path,
                                    method: "POST",
                                    body: TwoFactorCompleteRequest(ticket: ticket,
                                                                   code: code,
                                                                   deviceName: Self.externalDeviceName),
                                    as: ExternalTokenResult.self)
        return result.token
    }

    /// Abschluss der ersten Anmeldung über einen Anbieter ohne Konto: POST /auth/apple/signup für Apple,
    /// sonst /auth/oauth/{provider}/signup. birthdate als YYYY-MM-DD. Erfolg liefert das Token wie /callback.
    /// Verlangt der Server das Datum noch, kommt ein neuer Fahrschein (AppError.birthDateRequired).
    func signupExternal(provider: ExternalSignInProvider,
                        ticket: String,
                        birthdate: String,
                        deviceName: String = APIClient.externalDeviceName) async throws -> String {
        let path = provider == .apple ? "auth/apple/signup" : "auth/oauth/\(provider.rawValue)/signup"
        let result = try await send(path,
                                    method: "POST",
                                    body: ExternalSignupRequest(ticket: ticket,
                                                                birthdate: birthdate,
                                                                deviceName: deviceName),
                                    as: ExternalTokenResult.self,
                                    mapFailure: Self.signupFailure)
        return result.token
    }

    /// Fehlerantworten von POST .../signup, die nur hier gelten. 403 BIRTHDATE_REQUIRED (mit neuem Fahrschein)
    /// und 403 UNDERAGE laufen über failure(), damit der Fahrschein erhalten bleibt.
    private static func signupFailure(status: Int, code: String, message: String) -> AppError? {
        switch (status, code) {
        case (400, "VALIDATION_FAILED"):
            // Falsches Format, Datum in der Zukunft, oder Fahrschein ungültig, abgelaufen oder fremd.
            return .message("Bitte prüfe dein Geburtsdatum. Ist die Anmeldung abgelaufen, starte sie bitte neu.")
        default:
            return nil
        }
    }
}

/// Anbieter, die die Anmeldung anbietet. rawValue ist der Pfadteil des Servers.
enum ExternalSignInProvider: String {
    case apple
    case google
    case discord

    /// Die https-Rückkehr-Adresse des Servers. Der Server leitet von dort auf xyntal://auth/oauth/callback um.
    var redirectURI: String {
        AppConfig.apiBaseURL.appending(path: "auth/oauth/\(rawValue)/return").absoluteString
    }
}

/// Welche Anbieter der Server gerade meldet.
struct OAuthProviderAvailability: Equatable {
    let apple: Bool
    let google: Bool
    let discord: Bool
}

private struct AuthConfigResult: Decodable {
    let oauth: OAuthFlags?
}

private struct OAuthFlags: Decodable {
    let apple: Bool?
    let google: Bool?
    let discord: Bool?
}

/// Antwort mit Sitzungs-Token (Apple, Callback, Complete).
private struct ExternalTokenResult: Decodable {
    let token: String
}

private struct OAuthStartResult: Decodable {
    let url: String
}

private struct AppleLoginRequest: Encodable {
    let identityToken: String
    let nonce: String
    let deviceName: String
}

private struct OAuthCallbackRequest: Encodable {
    let code: String
    let state: String
    let redirectUri: String
    let deviceName: String
}

private struct TwoFactorCompleteRequest: Encodable {
    let ticket: String
    let code: String
    let deviceName: String
}

/// Körper für POST .../signup. birthdate als YYYY-MM-DD.
private struct ExternalSignupRequest: Encodable {
    let ticket: String
    let birthdate: String
    let deviceName: String
}
