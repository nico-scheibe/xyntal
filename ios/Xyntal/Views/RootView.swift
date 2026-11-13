import SwiftUI

/// Wählt zwischen Ladezustand, Anmeldung und den Hauptbereichen.
/// Steuert außerdem das Live-Polling der Nachrichten: läuft nur angemeldet und im Vordergrund.
struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ConversationsStore.self) private var conversations
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
        .onChange(of: session.state) { _, _ in
            conversations.update(isSceneActive: scenePhase == .active)
        }
    }
}

/// Die Hauptbereiche der App.
enum AppTab: Hashable {
    case forYou
    case messages
    case community
    case members
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
            MembersView()
                .tabItem { Label("Mitglieder", systemImage: "person.2") }
                .tag(AppTab.members)
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
