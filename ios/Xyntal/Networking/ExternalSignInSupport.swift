import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

/// Hilfen für die Anbieter-Anmeldung: Nonce für Apple, Auswertung der Rückkehr-Adresse, Web-Anmeldung.
enum ExternalSignInSupport {
    /// Zeichen für den Nonce: 64 Stück, damit ein Byte ohne Verzerrung darauf abgebildet werden kann (256 = 4 · 64).
    private static let nonceCharacters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_")

    /// Roher Nonce mit 32 Zeichen aus dem Zufallsgenerator des Systems. Schlägt das fehl, ist keine sichere Anmeldung möglich.
    static func makeRawNonce(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess, "Nonce konnte nicht erzeugt werden (SecRandomCopyBytes: \(status))")
        return String(bytes.map { nonceCharacters[Int($0) % nonceCharacters.count] })
    }

    /// SHA256 als Hex-Text. Diesen Wert setzt die App in der Apple-Anfrage (request.nonce).
    static func sha256Hex(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Liest code und state aus xyntal://auth/oauth/callback?code=…&state=…. Nur genau diese Rückkehr-Adresse wird akzeptiert.
    /// Ein error-Parameter, fehlende Werte oder zu lange Werte (mehr als 512 Zeichen) sind ein Fehler.
    static func codeAndState(from url: URL) throws -> (code: String, state: String) {
        guard url.scheme?.lowercased() == "xyntal",
              url.host?.lowercased() == "auth",
              url.path == "/oauth/callback" else {
            throw AppError.message(AppError.genericMessage)
        }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let code = items.first { $0.name == "code" }?.value
        let state = items.first { $0.name == "state" }?.value
        guard items.first(where: { $0.name == "error" }) == nil,
              let code, !code.isEmpty, code.count <= 512,
              let state, !state.isEmpty, state.count <= 512 else {
            throw AppError.message(AppError.genericMessage)
        }
        return (code, state)
    }
}

/// Führt die Web-Anmeldung für Google und Discord aus. Der Abbruch durch den Nutzer kommt als CancellationError.
final class WebSignInRunner: NSObject, ASWebAuthenticationPresentationContextProviding {
    /// Hält die Sitzung, bis sie beendet ist. Sonst würde das System das Fenster nicht zuverlässig öffnen.
    private var webSession: ASWebAuthenticationSession?

    @MainActor
    func run(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "xyntal") { [weak self] callbackURL, error in
                self?.webSession = nil
                if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
                    continuation.resume(throwing: CancellationError())
                } else {
                    continuation.resume(throwing: AppError.message(AppError.genericMessage))
                }
            }
            session.presentationContextProvider = self
            webSession = session
            if !session.start() {
                webSession = nil
                continuation.resume(throwing: AppError.message(AppError.genericMessage))
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
            return scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first ?? ASPresentationAnchor()
        }
    }
}
