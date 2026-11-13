import UIKit
import UserNotifications

/// Nimmt das APNs-Geräte-Token entgegen und reicht Push-Interaktionen an den PushManager weiter.
/// Erwartete Payload: `aps` plus `conversationId: String` (nur [A-Za-z0-9_-], höchstens 128 Zeichen).
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Muss vor Ende des Starts gesetzt sein, damit ein Tipp auf eine Benachrichtigung beim Kaltstart ankommt.
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        PushManager.shared.didRegister(deviceToken: hex)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Still: ohne APNs (z. B. Simulator) gibt es einfach keine Push-Nachrichten.
    }

    /// Im Vordergrund: Banner nur, wenn das Gespräch nicht gerade offen ist (dort liefert der Long-Poll die Nachricht).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        let conversationId = Self.conversationId(from: notification.request.content.userInfo)
        let activeId = await PushManager.shared.activeConversationId
        if let conversationId, conversationId == activeId {
            return []
        }
        return [.banner, .sound]
    }

    /// Benachrichtigung angetippt: Gespräch vormerken, ConversationsListView navigiert dorthin.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse) async {
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier,
              let conversationId = Self.conversationId(from: response.notification.request.content.userInfo) else { return }
        await PushManager.shared.open(conversationId: conversationId)
    }

    /// Liest die Gesprächs-ID aus der Payload. Ungültige Werte werden verworfen.
    nonisolated static func conversationId(from userInfo: [AnyHashable: Any]) -> String? {
        guard let raw = userInfo["conversationId"] as? String else { return nil }
        return try? APIClient.validatedPathId(raw)
    }
}
