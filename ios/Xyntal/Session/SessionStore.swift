import Foundation
import Observation

/// Hält die Anmeldung. Das Token liegt nur im Schlüsselbund, nie in Logs oder UserDefaults.
@MainActor
@Observable
final class SessionStore {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn
    }

    private(set) var state: State = .loading
    /// Hinweis für den Anmeldebildschirm, z. B. wenn die Sitzung abgelaufen ist.
    private(set) var notice: String?

    let api = APIClient()

    private var token: String?
    private var isSigningIn = false

    private static let expiredMessage = "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an."
    private static let unverifiedMessage = "Die Anmeldung konnte gerade nicht geprüft werden. Bitte melde dich erneut an."
    private static let storeFailedMessage = "Deine Anmeldung konnte nicht sicher gespeichert werden. Bitte versuche es erneut."
    /// Merkzeichen in UserDefaults, enthält keine Daten.
    private static let migrationMarkerKey = "apiSessionMigrationDone"

    // MARK: - Start und Anmeldung

    /// Stellt die gespeicherte Sitzung wieder her und prüft sie mit /auth/me. Aufruf beim App-Start.
    func restore() async {
        guard state == .loading else { return }
        Self.migrateKeychainIfNeeded()
        guard let data = KeychainStore.load(), !data.isEmpty else {
            state = .signedOut
            return
        }
        token = String(decoding: data, as: UTF8.self)
        do {
            _ = try await withAccess { current in try await self.api.me(token: current) }
            state = .signedIn
            PushManager.shared.sync(session: self)
        } catch AppError.network {
            // Offline: Token bleibt im Schlüsselbund, die Prüfung läuft beim nächsten Start erneut.
            token = nil
            notice = AppError.network.errorDescription
            state = .signedOut
        } catch is CancellationError {
            return
        } catch AppError.unauthorized {
            // withAccess hat die Sitzung bereits beendet.
            return
        } catch {
            // Serverfehler oder unlesbare Antwort: Token bleibt im Schlüsselbund, der nächste Start prüft erneut.
            token = nil
            notice = Self.unverifiedMessage
            state = .signedOut
        }
    }

    /// Meldet an. Ist 2FA aktiv, wirft die Funktion AppError.twoFactor; dann mit dem Code erneut aufrufen.
    func signIn(email: String, password: String, code: String?) async throws {
        guard !isSigningIn else { throw AppError.message("Die Anmeldung läuft bereits. Bitte warte kurz.") }
        isSigningIn = true
        defer { isSigningIn = false }

        notice = nil
        let fresh = try await api.login(email: email, password: password, code: code)

        // Nur ein tatsächlich gespeichertes Token gilt als angemeldet.
        guard store(fresh) else {
            await api.logout(token: fresh)
            clearSession()
            throw AppError.message(Self.storeFailedMessage)
        }
        state = .signedIn
        PushManager.shared.sync(session: self)
    }

    /// Meldet mit einem fertigen Token an, z. B. nach Apple, Google oder Discord. Speichert es wie signIn(email:password:code:).
    func signIn(withToken fresh: String) async throws {
        guard !isSigningIn else { throw AppError.message("Die Anmeldung läuft bereits. Bitte warte kurz.") }
        isSigningIn = true
        defer { isSigningIn = false }

        notice = nil

        // Nur ein tatsächlich gespeichertes Token gilt als angemeldet.
        guard store(fresh) else {
            await api.logout(token: fresh)
            clearSession()
            throw AppError.message(Self.storeFailedMessage)
        }
        state = .signedIn
        PushManager.shared.sync(session: self)
    }

    /// Legt ein Konto an und meldet danach an. Ab hier gilt dieselbe Sitzung wie nach signIn.
    func register(email: String, password: String, displayName: String, birthdate: String) async throws {
        guard !isSigningIn else { throw AppError.message("Die Anmeldung läuft bereits. Bitte warte kurz.") }
        isSigningIn = true
        defer { isSigningIn = false }

        notice = nil
        let result = try await api.register(email: email, password: password, displayName: displayName, birthdate: birthdate)

        // Nur ein tatsächlich gespeichertes Token gilt als angemeldet.
        guard store(result.token) else {
            await api.logout(token: result.token)
            clearSession()
            throw AppError.message(Self.storeFailedMessage)
        }
        state = .signedIn
        PushManager.shared.sync(session: self)
    }

    func signOut() async {
        // Push-Token abmelden, solange das Sitzungs-Token noch gültig ist. Fehler werden still ignoriert.
        if token != nil {
            await PushManager.shared.unregister(session: self)
        }
        // Lokal sofort beenden. Der Server wird im Hintergrund informiert.
        let previous = token
        clearSession()
        notice = nil
        state = .signedOut
        if let previous {
            await api.logout(token: previous)
        }
    }

    /// Löscht das Konto mit E-Mail-Code und optional 2FA-Code. Danach ist die lokale Sitzung weg.
    func deleteAccount(code: String, totpCode: String?) async throws {
        guard token != nil else { throw AppError.unauthorized }
        // Push-Token zuerst abmelden, solange das Sitzungs-Token sicher noch gültig ist. Fehler werden still ignoriert.
        await PushManager.shared.unregister(session: self)
        do {
            try await withAccess { current in
                try await self.api.deleteAccount(code: code, totpCode: totpCode, token: current)
            }
        } catch {
            // Das Konto besteht weiter: Push-Token erneut anmelden, sofern die Sitzung noch gilt.
            if state == .signedIn {
                PushManager.shared.sync(session: self)
            }
            throw error
        }
        clearSession()
        // Kein Hinweis „Anmeldung abgelaufen“: Der Nutzer hat das Konto selbst gelöscht.
        notice = nil
        state = .signedOut
    }

    // MARK: - Zugriff mit Token

    /// Führt einen Aufruf mit dem gespeicherten Token aus. Lehnt der Server es ab, ist die Sitzung beendet.
    func withAccess<T>(_ operation: (String) async throws -> T) async throws -> T {
        guard let current = token else { throw AppError.unauthorized }
        do {
            return try await operation(current)
        } catch AppError.unauthorized {
            clearSession()
            notice = Self.expiredMessage
            state = .signedOut
            throw AppError.unauthorized
        }
    }

    // MARK: - Speicher

    /// Setzt das Token im Speicher und im Schlüsselbund. Gibt false zurück, wenn der Schlüsselbund nicht schreiben konnte.
    @discardableResult
    private func store(_ newToken: String) -> Bool {
        token = newToken
        return KeychainStore.save(Data(newToken.utf8))
    }

    private func clearSession() {
        token = nil
        KeychainStore.delete()
    }

    /// Einmalig: Sitzungen aus früheren Versionen der App aus dem Schlüsselbund entfernen. Sie passen nicht zum neuen Server.
    private static func migrateKeychainIfNeeded() {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: migrationMarkerKey) else { return }
        KeychainStore.deleteAll()
        defaults.set(true, forKey: migrationMarkerKey)
    }
}
