import SwiftUI

/// Personen suchen und ein Gespräch starten: eine Person → Direktnachricht, mehrere + Titel → Gruppe.
struct NewConversationView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ConversationsStore.self) private var conversations
    @Environment(\.dismiss) private var dismiss

    /// Wird nach dem Anlegen mit dem neuen Gespräch aufgerufen. Das Blatt schließt sich davor.
    let onCreated: (Conversation) -> Void

    private static let minimumQueryLength = 2
    private static let titleMaxLength = 80

    @State private var query = ""
    @State private var results: [Profile] = []
    @State private var isSearching = false
    @State private var searchError: String?
    @State private var selected: [Profile] = []
    @State private var groupTitle = ""
    @State private var isCreating = false
    @State private var createError: String?

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedTitle: String {
        groupTitle.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isGroup: Bool { selected.count > 1 }

    private var canCreate: Bool {
        !isCreating && !selected.isEmpty && (!isGroup || (1...Self.titleMaxLength).contains(trimmedTitle.utf16.count))
    }

    var body: some View {
        NavigationStack {
            List {
                if !selected.isEmpty {
                    Section("Ausgewählt") {
                        ForEach(selected) { profile in
                            Button {
                                toggle(profile)
                            } label: {
                                PersonRow(profile: profile, isSelected: true)
                            }
                            .foregroundStyle(.primary)
                            .accessibilityLabel("\(profile.name) abwählen")
                        }
                    }
                }

                if isGroup {
                    Section("Gruppe") {
                        TextField("Gruppenname", text: $groupTitle)
                            .textInputAutocapitalization(.sentences)
                            .onChange(of: groupTitle) { _, newValue in
                                if newValue.utf16.count > Self.titleMaxLength {
                                    groupTitle = newValue.truncatedToUTF16(Self.titleMaxLength)
                                }
                            }
                    }
                }

                Section {
                    searchContent
                } header: {
                    Text("Personen")
                } footer: {
                    if trimmedQuery.count < Self.minimumQueryLength {
                        Text("Gib mindestens \(Self.minimumQueryLength) Zeichen ein, um zu suchen.")
                    }
                }

                if let createError {
                    Section {
                        Text(createError)
                            .foregroundStyle(.red)
                    }
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Name oder Handle")
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .navigationTitle("Neues Gespräch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                        .disabled(isCreating)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isCreating {
                        ProgressView()
                    } else {
                        Button(isGroup ? "Gruppe starten" : "Starten") {
                            Task { await create() }
                        }
                        .disabled(!canCreate)
                    }
                }
            }
            .task(id: trimmedQuery) {
                await search(for: trimmedQuery)
            }
        }
    }

    @ViewBuilder
    private var searchContent: some View {
        if trimmedQuery.count < Self.minimumQueryLength {
            EmptyView()
        } else if isSearching && results.isEmpty {
            HStack {
                Spacer()
                ProgressView()
                Spacer()
            }
        } else if let searchError {
            Text(searchError)
                .foregroundStyle(.secondary)
        } else if results.isEmpty {
            Text("Niemand gefunden.")
                .foregroundStyle(.secondary)
        } else {
            ForEach(results) { profile in
                let isSelected = selected.contains { $0.id == profile.id }
                Button {
                    toggle(profile)
                } label: {
                    PersonRow(profile: profile, isSelected: isSelected)
                }
                .foregroundStyle(.primary)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
    }

    private func toggle(_ profile: Profile) {
        createError = nil
        if let index = selected.firstIndex(where: { $0.id == profile.id }) {
            selected.remove(at: index)
        } else {
            selected.append(profile)
        }
    }

    /// Sucht 300 ms nach der letzten Eingabe. Ein neuer Suchbegriff bricht die laufende Suche ab (task(id:)).
    private func search(for text: String) async {
        guard text.count >= Self.minimumQueryLength else {
            results = []
            searchError = nil
            isSearching = false
            return
        }
        try? await Task.sleep(for: .milliseconds(300))
        guard !Task.isCancelled else { return }
        isSearching = true
        defer { isSearching = false }
        do {
            let found = try await session.withAccess { token in
                try await session.api.searchUsers(query: text, token: token)
            }
            guard !Task.isCancelled else { return }
            results = found.filter { $0.id != conversations.currentUserId }
            searchError = nil
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            results = []
            searchError = AppError.displayText(for: error)
        }
    }

    private func create() async {
        guard canCreate else { return }
        isCreating = true
        createError = nil
        defer { isCreating = false }
        do {
            var conversation: Conversation
            if isGroup {
                conversation = try await session.withAccess { token in
                    try await session.api.createGroupConversation(memberIds: selected.map(\.id), title: trimmedTitle, token: token)
                }
            } else if let partner = selected.first {
                conversation = try await session.withAccess { token in
                    try await session.api.createDirectConversation(userId: partner.id, token: token)
                }
                // Der Partner ist bekannt, auch wenn die Antwort ihn nicht nennt; so stimmt der Titel sofort.
                if !conversation.isDirect {
                    conversation.kind = "dm"
                    conversation.partnerId = partner.id
                }
            } else {
                return
            }
            for profile in selected {
                conversations.cache(profile)
            }
            dismiss()
            onCreated(conversation)
        } catch is CancellationError {
            return
        } catch {
            createError = AppError.displayText(for: error)
        }
    }
}

/// Zeile mit Avatar, Name und Überschrift; Haken, wenn ausgewählt.
struct PersonRow: View {
    let profile: Profile
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(name: profile.name, avatar: profile.avatar, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(profile.name)
                    .font(.body)
                if let line = [profile.headline, profile.handle.map { "@\($0)" }].compactMap({ $0.nonEmptyText }).first {
                    Text(line)
                        .font(.caption)
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            Spacer()
            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.tint)
            }
        }
    }
}
