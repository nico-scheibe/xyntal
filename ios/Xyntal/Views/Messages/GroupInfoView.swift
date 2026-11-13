import SwiftUI

/// Titel, Beschreibung und Mitglieder einer Gruppe.
struct GroupInfoView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let conversation: Conversation
    let title: String

    @State private var members: [Profile] = []
    @State private var isLoading = true
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 14) {
                        AvatarView(name: title, avatar: conversation.avatar, size: 56, emoji: conversation.emoji)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(title)
                                .font(.title3.bold())
                            if let emoji = conversation.emoji.nonEmptyText {
                                Text(emoji)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                if let description = conversation.description.nonEmptyText {
                    Section("Beschreibung") {
                        Text(description)
                    }
                }

                Section {
                    if isLoading && members.isEmpty {
                        ProgressView()
                    } else if let loadError {
                        Text(loadError)
                            .foregroundStyle(.secondary)
                        Button("Erneut versuchen") { Task { await load() } }
                    } else if members.isEmpty {
                        Text("Keine Mitglieder gefunden.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(members) { member in
                            HStack(spacing: 12) {
                                AvatarView(name: member.name, avatar: member.avatar, size: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(member.name)
                                    if let headline = member.headline.nonEmptyText {
                                        Text(headline)
                                            .font(.caption)
                                            .foregroundStyle(Theme.muted)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer()
                                if let role = Self.roleLabel(member.role) {
                                    Text(role)
                                        .font(.caption)
                                        .foregroundStyle(Theme.muted)
                                }
                            }
                        }
                    }
                } header: {
                    Text(members.isEmpty ? "Mitglieder" : "Mitglieder (\(members.count))")
                }
            }
            .navigationTitle("Gruppeninfo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") { dismiss() }
                }
            }
            .task { await load() }
        }
    }

    /// Rollen des Servers auf Deutsch; unbekannte Rollen werden nicht angezeigt.
    static func roleLabel(_ role: String?) -> String? {
        switch role?.lowercased() {
        case "owner": return "Inhaber"
        case "admin": return "Admin"
        case "moderator": return "Moderator"
        default: return nil
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            members = try await session.withAccess { token in
                try await session.api.conversationMembers(conversationId: conversation.id, token: token)
            }
            loadError = nil
        } catch is CancellationError {
            return
        } catch {
            loadError = AppError.displayText(for: error)
        }
    }
}
