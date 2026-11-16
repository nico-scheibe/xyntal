import SwiftUI

@main
struct XyntalApp: App {
    /// Für APNs-Token und Benachrichtigungen. Setzt in didFinishLaunching den UNUserNotificationCenter-Delegate.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    @State private var session: SessionStore
    @State private var conversations: ConversationsStore
    @State private var subscription: SubscriptionStore
    @State private var outgoing: OutgoingStore
    @State private var calls: CallStore

    init() {
        AttachmentFiles.removeAllAtLaunch()
        MediaLoader.removeDownloadedFiles()
        let session = SessionStore()
        let conversations = ConversationsStore(session: session)
        let calls = CallStore(session: session)
        // Anruf-Ereignisse aus dem Long-Poll gehen direkt an den Anruf-Zustand.
        conversations.onCallEvent = { [weak calls] event in
            calls?.handleRealtime(event)
        }
        // Abmelden: ein laufender Anruf wird verlassen, solange das Token noch gilt.
        session.onWillSignOut = { [weak calls] in
            await calls?.releaseForSignOut()
        }
        // Jedes Sitzungsende (auch Kontolöschung oder abgelaufenes Token): Mikrofon und Kamera sofort aus.
        session.onSessionCleared = { [weak calls] token in
            calls?.sessionEnded(token: token)
        }
        _session = State(initialValue: session)
        _conversations = State(initialValue: conversations)
        _subscription = State(initialValue: SubscriptionStore(session: session))
        _outgoing = State(initialValue: OutgoingStore(session: session))
        _calls = State(initialValue: calls)
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(conversations)
                .environment(subscription)
                .environment(outgoing)
                .environment(calls)
                .environment(PushManager.shared)
                .modifier(AppearanceModifier())
        }
    }
}
