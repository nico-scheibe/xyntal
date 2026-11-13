import SwiftUI

/// Liste aller Gespräche mit Filter, Ungelesen-Zählern und Einstieg in neue Gespräche.
struct ConversationsListView: View {
    @Environment(ConversationsStore.self) private var store
    @Environment(PushManager.self) private var push

    private enum Filter: String, CaseIterable, Identifiable {
        case all = "Alle"
        case unread = "Ungelesen"
        case groups = "Gruppen"

        var id: String { rawValue }
    }

    @State private var filter: Filter = .all
    @State private var path: [Conversation] = []
    @State private var showNewConversation = false
    /// true, während ein Gespräch aus einer Push-Benachrichtigung aufgelöst wird (ggf. mit Neuladen der Liste).
    @State private var isOpeningPendingConversation = false

    /// Archivierte Gespräche bleiben immer ausgeblendet.
    private var visibleConversations: [Conversation] {
        let active = store.conversations.filter { !$0.isArchived }
        switch filter {
        case .all:
            return active
        case .unread:
            return active.filter { $0.unreadCount > 0 }
        case .groups:
            return active.filter { $0.isGroup }
        }
    }

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 0) {
                Picker("Filter", selection: $filter) {
                    ForEach(Filter.allCases) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 8)

                content
            }
            .safeAreaInset(edge: .top) {
                if let loadError = store.loadError, !store.conversations.isEmpty {
                    ReloadErrorBanner(message: loadError) { Task { await store.load() } }
                }
            }
            .navigationTitle("Nachrichten")
            .navigationDestination(for: Conversation.self) { conversation in
                ChatView(conversation: conversation)
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showNewConversation = true
                    } label: {
                        Image(systemName: "square.and.pencil")
                    }
                    .accessibilityLabel("Neues Gespräch")
                }
            }
            .sheet(isPresented: $showNewConversation) {
                NewConversationView { conversation in
                    store.upsert(conversation)
                    path.append(conversation)
                    Task { await store.load() }
                }
            }
            .refreshable { await store.load() }
            .task {
                if !store.hasLoaded { await store.load() }
            }
            .onChange(of: push.pendingConversationId, initial: true) { _, _ in
                Task { await openPendingConversation() }
            }
            .onChange(of: store.hasLoaded) { _, _ in
                Task { await openPendingConversation() }
            }
        }
    }

    /// Höchstens so viele Durchläufe pro Aufruf, falls während des Neuladens immer wieder neue IDs eintreffen.
    private static let maxPendingAttempts = 3

    /// Deep Link aus einer Push-Benachrichtigung: zum Gespräch navigieren, sobald die Liste geladen ist.
    /// Fehlt das Gespräch in der Liste, wird sie neu geladen. Trifft währenddessen eine neue ID ein, wird diese
    /// im nächsten Durchlauf verarbeitet (höchstens 3 Durchläufe). Danach ist der Wunsch in jedem Fall erledigt.
    /// Folgepunkt: Der Wechsel auf den Tab „Nachrichten“ liegt in RootView und ist hier nicht enthalten.
    private func openPendingConversation() async {
        guard !isOpeningPendingConversation else { return }
        isOpeningPendingConversation = true
        defer { isOpeningPendingConversation = false }

        var attempts = 0
        while attempts < Self.maxPendingAttempts, let id = push.pendingConversationId, store.hasLoaded {
            attempts += 1
            if let conversation = store.conversation(withId: id) {
                push.pendingConversationId = nil
                show(conversation)
                return
            }
            await store.load()
            // Inzwischen ein anderes Gespräch gewünscht? Dann mit der neuen ID weiter.
            guard push.pendingConversationId == id else { continue }
            push.pendingConversationId = nil
            if let conversation = store.conversation(withId: id) {
                show(conversation)
            }
            return
        }
        // Nach dem letzten Durchlauf bleibt keine ID liegen, die später unerwartet ein Gespräch öffnen könnte.
        if attempts >= Self.maxPendingAttempts {
            push.pendingConversationId = nil
        }
    }

    private func show(_ conversation: Conversation) {
        showNewConversation = false
        // Den Pfad ersetzen, damit sich keine Chats stapeln.
        if path.last?.id != conversation.id {
            path = [conversation]
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.conversations.isEmpty && !store.hasLoaded {
            Spacer()
            ProgressView()
            Spacer()
        } else if store.conversations.isEmpty, let loadError = store.loadError {
            ContentUnavailableView {
                Label("Nachrichten nicht geladen", systemImage: "wifi.exclamationmark")
            } description: {
                Text(loadError)
            } actions: {
                Button("Erneut versuchen") { Task { await store.load() } }
            }
        } else if visibleConversations.isEmpty {
            emptyState
        } else {
            List(visibleConversations) { conversation in
                NavigationLink(value: conversation) {
                    ConversationRow(conversation: conversation,
                                    title: store.title(for: conversation),
                                    avatar: store.avatar(for: conversation),
                                    isOnline: store.isPartnerOnline(conversation))
                }
            }
            .listStyle(.plain)
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        switch filter {
        case .all:
            ContentUnavailableView {
                Label("Noch keine Nachrichten", systemImage: "bubble.left.and.bubble.right")
            } description: {
                Text("Starte ein Gespräch über das Stift-Symbol oben rechts oder über ein Mitgliederprofil.")
            }
        case .unread:
            ContentUnavailableView("Alles gelesen", systemImage: "checkmark.circle")
        case .groups:
            ContentUnavailableView {
                Label("Noch keine Gruppen", systemImage: "person.3")
            } description: {
                Text("Wähle beim neuen Gespräch mehrere Personen aus, um eine Gruppe zu starten.")
            }
        }
    }
}

private struct ConversationRow: View {
    let conversation: Conversation
    let title: String
    let avatar: String?
    let isOnline: Bool

    var body: some View {
        HStack(spacing: 12) {
            // Gruppen ohne Bild zeigen ihr Emoji, sonst die Initialen des Titels.
            AvatarView(name: title, avatar: avatar, size: 48, emoji: conversation.isGroup ? conversation.emoji : nil)
                .overlay(alignment: .bottomTrailing) {
                    if isOnline {
                        Circle()
                            .fill(.green)
                            .frame(width: 12, height: 12)
                            .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 2))
                    }
                }

            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline) {
                    Text(title)
                        .font(.headline)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    if let date = conversation.updatedDate {
                        Text(Self.timeLabel(for: date))
                            .font(.caption)
                            .foregroundStyle(Theme.muted)
                    }
                }
                HStack {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    if conversation.unreadCount > 0 {
                        Text("\(conversation.unreadCount)")
                            .font(.caption.bold())
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Theme.accent, in: Capsule())
                            .accessibilityLabel("\(conversation.unreadCount) ungelesen")
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var subtitle: String {
        if conversation.isGroup {
            if let description = conversation.description.nonEmptyText { return description }
            return "Gruppe"
        }
        return isOnline ? "Online" : "Direktnachricht"
    }

    private var accessibilityText: String {
        var parts = [title, subtitle]
        if conversation.unreadCount > 0 { parts.append("\(conversation.unreadCount) ungelesen") }
        return parts.joined(separator: ", ")
    }

    /// Heute: Uhrzeit. Innerhalb einer Woche: Wochentag. Sonst Datum.
    static func timeLabel(for date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        if calendar.isDate(date, inSameDayAs: now) {
            return date.formatted(date: .omitted, time: .shortened)
        }
        if let weekAgo = calendar.date(byAdding: .day, value: -6, to: calendar.startOfDay(for: now)), date >= weekAgo {
            return date.formatted(.dateTime.weekday(.abbreviated))
        }
        return date.formatted(date: .numeric, time: .omitted)
    }
}
