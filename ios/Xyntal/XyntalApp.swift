import SwiftUI

@main
struct XyntalApp: App {
    /// Für APNs-Token und Benachrichtigungen. Setzt in didFinishLaunching den UNUserNotificationCenter-Delegate.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @State private var session: SessionStore
    @State private var conversations: ConversationsStore

    init() {
        let session = SessionStore()
        _session = State(initialValue: session)
        _conversations = State(initialValue: ConversationsStore(session: session))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(conversations)
                .environment(PushManager.shared)
                .modifier(AppearanceModifier())
        }
    }
}
