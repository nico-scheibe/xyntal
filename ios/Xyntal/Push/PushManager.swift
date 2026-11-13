import Foundation
import Observation
import UIKit
import UserNotifications

/// Verwaltet Push-Berechtigung, APNs-Geräte-Token und die Anmeldung des Tokens beim Server.
///
/// Ablauf: Die Berechtigung wird erst beim ersten Öffnen eines Chats erfragt (ChatView). Sobald Token UND
/// Anmeldung vorliegen, geht das Token einmal pro Anmeldung an den Server (sync). Beim Logout wird es vor dem
/// Löschen der Sitzung abgemeldet (unregister). Fehler des Servers werden still ignoriert – der Server-Anteil
/// existiert noch nicht. Das Token ist kein Geheimnis und liegt in UserDefaults, damit es beim Logout noch da ist.
@MainActor
@Observable
final class PushManager {
    static let shared = PushManager()

    /// Gespräch aus einer angetippten Benachrichtigung. ConversationsListView navigiert dorthin und setzt den Wert zurück.
    var pendingConversationId: String?
    /// Gespräch, das gerade offen ist. Dafür zeigt die App im Vordergrund kein Banner.
    var activeConversationId: String?
    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    /// APNs-Token als Hex-String.
    private(set) var deviceToken: String?

    /// Sitzung, die beim letzten sync übergeben wurde. Die App hält sie ohnehin, daher weak.
    @ObservationIgnored private weak var session: SessionStore?
    /// true, wenn das Token (erneut) an den Server soll – nach Anmeldung oder Token-Wechsel.
    @ObservationIgnored private var needsSync = false
    /// Token, das in dieser Anmeldung erfolgreich gemeldet wurde. Wird bei jeder neuen Anmeldung zurückgesetzt,
    /// damit ein anderer Nutzer auf demselben Gerät das Token ebenfalls bekommt.
    @ObservationIgnored private var syncedToken: String?
    @ObservationIgnored private var syncTask: Task<Void, Never>?
    /// true, sobald der Server die Anmeldung mit 4xx (außer 401/429) abgelehnt hat. Dann wird in diesem
    /// App-Start nicht erneut gesendet; Netz- und 5xx-Fehler lassen den Abgleich dagegen offen.
    @ObservationIgnored private var serverRejected = false

    static let deviceTokenKey = "pushDeviceToken"

    /// APNs-Umgebung des Builds. Debug-Builds laufen gegen den Sandbox-Dienst.
    ///
    /// Achtung: Die tatsächliche APNs-Umgebung bestimmt das Provisioning-Profil (aps-environment), nicht die
    /// Build-Konfiguration. Ein Release-Build mit Development-Profil meldet hier „production“, obwohl das Token
    /// zur Sandbox gehört. Für TestFlight/App Store (Distribution-Profil) stimmt der Wert.
    static var environment: String {
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    private init() {
        deviceToken = UserDefaults.standard.string(forKey: Self.deviceTokenKey)
    }

    // MARK: - Berechtigung und Registrierung

    /// Fragt die Berechtigung nur an, wenn der Nutzer noch nie gefragt wurde. Danach wird bei APNs registriert.
    func requestAuthorizationIfNeeded() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        authorizationStatus = settings.authorizationStatus
        switch settings.authorizationStatus {
        case .notDetermined:
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            authorizationStatus = await center.notificationSettings().authorizationStatus
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
        case .denied:
            break
        @unknown default:
            break
        }
    }

    /// Registriert bei APNs, wenn die Berechtigung schon erteilt ist. Zeigt keinen Dialog.
    func registerIfAuthorized() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
        default:
            break
        }
    }

    /// Vom AppDelegate: neues oder bestätigtes Token von APNs.
    func didRegister(deviceToken token: String) {
        guard !token.isEmpty else { return }
        if token != deviceToken {
            deviceToken = token
            UserDefaults.standard.set(token, forKey: Self.deviceTokenKey)
        }
        if syncedToken != token {
            needsSync = true
        }
        attemptSync()
    }

    /// Vom AppDelegate: Benachrichtigung angetippt. Die ID ist bereits geprüft.
    func open(conversationId: String) {
        pendingConversationId = conversationId
    }

    // MARK: - Abgleich mit dem Server

    /// Nach Anmeldung oder Wiederherstellung: Token an den Server melden, sobald es vorliegt, und bei APNs registrieren.
    func sync(session: SessionStore) {
        self.session = session
        syncedToken = nil
        needsSync = true
        attemptSync()
        Task { await registerIfAuthorized() }
    }

    /// Beim Logout, solange das Sitzungs-Token noch gültig ist: Token beim Server abmelden, dann lokal vergessen.
    /// Ein laufender Abgleich wird erst zu Ende gewartet, damit kein POST nach dem DELETE beim Server ankommt.
    func unregister(session: SessionStore) async {
        // Zuerst needsSync löschen: Dann startet der endende Abgleich keinen weiteren.
        needsSync = false
        if let task = syncTask {
            await task.value
        }
        syncTask = nil
        syncedToken = nil
        pendingConversationId = nil
        let stored = deviceToken ?? UserDefaults.standard.string(forKey: Self.deviceTokenKey)
        if let stored {
            _ = try? await session.withAccess { access in
                try await session.api.unregisterPushDevice(deviceToken: stored, token: access)
            }
        }
        deviceToken = nil
        UserDefaults.standard.removeObject(forKey: Self.deviceTokenKey)
        // Zugestellte Benachrichtigungen des bisherigen Kontos gehören nicht mehr auf dieses Gerät.
        let center = UNUserNotificationCenter.current()
        center.removeAllDeliveredNotifications()
        try? await center.setBadgeCount(0)
    }

    /// Schickt das Token, wenn alles vorliegt. Läuft höchstens einmal gleichzeitig.
    private func attemptSync() {
        guard needsSync, !serverRejected, syncTask == nil,
              let session, session.state == .signedIn,
              let token = deviceToken else { return }
        guard syncedToken != token else {
            needsSync = false
            return
        }
        syncTask = Task { [weak self] in
            let outcome = await Self.send(deviceToken: token, session: session)
            guard let self, !Task.isCancelled else { return }
            self.syncTask = nil
            switch outcome {
            case .sent:
                self.syncedToken = token
                if self.deviceToken == token {
                    self.needsSync = false
                } else {
                    // Das Token hat sich währenddessen geändert: noch einmal mit dem neuen.
                    self.attemptSync()
                }
            case .rejected:
                // Der Server kennt den Endpunkt nicht oder lehnt den Inhalt ab: in diesem App-Start nicht mehr senden.
                self.serverRejected = true
                self.needsSync = false
            case .failed:
                // Netz oder 5xx: needsSync bleibt stehen; der nächste Start oder Login versucht es erneut.
                break
            }
        }
    }

    private enum SendOutcome {
        case sent
        case rejected
        case failed
    }

    private static func send(deviceToken: String, session: SessionStore) async -> SendOutcome {
        do {
            try await session.withAccess { access in
                try await session.api.registerPushDevice(deviceToken: deviceToken, environment: environment, token: access)
            }
            return .sent
        } catch AppError.rejected {
            return .rejected
        } catch {
            return .failed
        }
    }
}
