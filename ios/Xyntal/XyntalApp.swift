import SwiftUI

@main
struct XyntalApp: App {
    /// Für APNs-Token und Benachrichtigungen. Setzt in didFinishLaunching den UNUserNotificationCenter-Delegate.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @State private var session: SessionStore
    @State private var conversations: ConversationsStore
    @State private var subscription: SubscriptionStore
    @State private var outgoing: OutgoingStore

    init() {
        AttachmentFiles.removeAllAtLaunch()
        MediaLoader.removeDownloadedFiles()
        let session = SessionStore()
        _session = State(initialValue: session)
        _conversations = State(initialValue: ConversationsStore(session: session))
        _subscription = State(initialValue: SubscriptionStore(session: session))
        _outgoing = State(initialValue: OutgoingStore(session: session))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(conversations)
                .environment(subscription)
                .environment(outgoing)
                .environment(PushManager.shared)
                .modifier(AppearanceModifier())
        }
    }
}
