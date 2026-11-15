import SwiftUI

/// Wählt zwischen Ladezustand, Anmeldung und den Hauptbereichen.
/// Steuert außerdem das Live-Polling der Nachrichten: läuft nur angemeldet und im Vordergrund.
struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ConversationsStore.self) private var conversations
    @Environment(SubscriptionStore.self) private var subscription
    @Environment(OutgoingStore.self) private var outgoing
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch session.state {
            case .loading:
                ProgressView()
            case .signedOut:
                LoginView()
            case .signedIn:
                MainTabView()
            }
        }
        .task { await session.restore() }
        .onChange(of: scenePhase, initial: true) { _, phase in
            conversations.update(isSceneActive: phase == .active)
        }
        .onChange(of: session.state) { _, state in
            conversations.update(isSceneActive: scenePhase == .active)
            // Ausstehende Beiträge und Nachrichten gehören zur Anmeldung. Beim Abmelden verschwinden sie samt Dateien.
            if state != .signedIn {
                outgoing.clear()
            }
        }
        .onChange(of: session.state, initial: true) { _, state in
            subscription.update(isSignedIn: state == .signedIn)
        }
    }
}

/// Die Hauptbereiche der App.
enum AppTab: Hashable {
    case forYou
    case messages
    case community
    // "Mitglieder" ist raus. MembersView und MemberDetailView bleiben im Projekt:
    // Der Mitglieds-Bildschirm trägt die KI-Kurzinfo und die volle Xyntal-Karte und
    // ist nur noch über nichts erreichbar – wer den Tab zurückholt oder die Karte im
    // Stapel antippbar macht, hat ihn sofort wieder.
    case profile
}

struct MainTabView: View {
    @Environment(ConversationsStore.self) private var conversations
    @Environment(PushManager.self) private var pushManager

    @State private var selection: AppTab = .messages

    var body: some View {
        TabView(selection: $selection) {
            ForYouView()
                .tabItem { Label("Für dich", systemImage: "sparkles") }
                .tag(AppTab.forYou)
            ConversationsListView()
                .tabItem { Label("Nachrichten", systemImage: "bubble.left.and.bubble.right") }
                .badge(conversations.unreadTotal)
                .tag(AppTab.messages)
            CommunityView()
                .tabItem { Label("Community", systemImage: "person.3") }
                .tag(AppTab.community)
            ProfileView()
                .tabItem { Label("Profil", systemImage: "person.crop.circle") }
                .tag(AppTab.profile)
        }
        // Deep Link aus einer Push-Benachrichtigung: auf „Nachrichten“ wechseln, ConversationsListView öffnet das Gespräch.
        .onChange(of: pushManager.pendingConversationId, initial: true) { _, conversationId in
            if conversationId != nil {
                selection = .messages
            }
        }
    }
}
