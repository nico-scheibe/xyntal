import SwiftUI

struct MemberDetailView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ConversationsStore.self) private var conversations
    @Environment(\.dismiss) private var dismiss

    let member: Member
    /// Wird nach dem Sperren aufgerufen, damit die Liste das Mitglied ausblendet.
    let onBlocked: (Member) -> Void

    @State private var showBlockConfirmation = false
    @State private var showReport = false
    @State private var isBlocking = false
    @State private var isStartingChat = false
    @State private var actionError: String?
    /// Nach "Nachricht schreiben": öffnet den Chat.
    @State private var openConversation: Conversation?

    var body: some View {
        Form {
            if let card = member.websiteCard {
                Section {
                    XyntalCardView(card: card, fallbackName: member.displayName)
                }
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            } else {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Text(member.displayName.nonEmptyText ?? "Unbekannt")
                                .font(.title2.bold())
                            if member.verified == true {
                                VerifiedBadge()
                            }
                        }
                        if let headline = member.headline.nonEmptyText {
                            Text(headline)
                                .font(.headline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Section {
                Button {
                    Task { await startChat() }
                } label: {
                    HStack {
                        Spacer()
                        if isStartingChat {
                            ProgressView()
                        } else {
                            Label("Nachricht schreiben", systemImage: "bubble.left.and.bubble.right")
                                .fontWeight(.semibold)
                        }
                        Spacer()
                    }
                }
                .disabled(isStartingChat || isBlocking)
            }

            if let bio = member.bio.nonEmptyText {
                Section("Kurzinfo") {
                    Text(bio)
                }
            }

            Section("Details") {
                DetailRow(title: "Ort", value: member.location)
                DetailRow(title: "Land", value: member.country)
            }

            if let skills = member.skills, !skills.isEmpty {
                Section("Skills") {
                    Text(skills.joined(separator: " · "))
                }
            }

            if let actionError {
                Section {
                    Text(actionError)
                        .foregroundStyle(.red)
                }
            }
        }
        .navigationTitle(member.displayName.nonEmptyText ?? "Mitglied")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("Mitglied sperren", role: .destructive) {
                        showBlockConfirmation = true
                    }
                    Button("Melden") {
                        showReport = true
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("Weitere Aktionen")
                .disabled(isBlocking)
            }
        }
        .alert("Mitglied sperren?", isPresented: $showBlockConfirmation) {
            Button("Sperren", role: .destructive) {
                Task { await block() }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Du siehst dieses Mitglied dann nicht mehr in der Liste.")
        }
        .sheet(isPresented: $showReport) {
            ReportMemberSheet(userId: member.id)
        }
        .navigationDestination(item: $openConversation) { conversation in
            ChatView(conversation: conversation)
        }
    }

    /// Legt die Direktnachricht an (oder holt die bestehende) und öffnet den Chat.
    private func startChat() async {
        guard !isStartingChat else { return }
        isStartingChat = true
        actionError = nil
        defer { isStartingChat = false }
        do {
            var conversation = try await session.withAccess { token in
                try await session.api.createDirectConversation(userId: member.id, token: token)
            }
            // Der Partner ist bekannt, auch wenn die Antwort ihn nicht nennt; so stimmt der Titel sofort.
            if !conversation.isDirect {
                conversation.kind = "dm"
                conversation.partnerId = member.id
            }
            conversations.cache(Profile(id: member.id, displayName: member.displayName, headline: member.headline))
            conversations.upsert(conversation)
            openConversation = conversation
        } catch is CancellationError {
            return
        } catch {
            actionError = AppError.displayText(for: error)
        }
    }

    private func block() async {
        guard !isBlocking else { return }
        isBlocking = true
        actionError = nil
        defer { isBlocking = false }
        do {
            try await session.withAccess { token in
                try await session.api.blockUser(id: member.id, token: token)
            }
            onBlocked(member)
            dismiss()
        } catch is CancellationError {
            return
        } catch {
            actionError = AppError.displayText(for: error)
        }
    }
}

/// Meldeformular: Grund auswählen, optionale Notiz (max. 500 Zeichen), dann Absenden mit Bestätigung.
/// Der Notiztext wird weder gespeichert noch geloggt.
private struct ReportMemberSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let userId: String

    private static let noteLimit = 500

    @State private var reason: ReportReason?
    @State private var note = ""
    @State private var showSendConfirmation = false
    @State private var isSending = false
    @State private var didSend = false
    @State private var sendError: String?

    var body: some View {
        NavigationStack {
            Form {
                if didSend {
                    Section {
                        Text("Danke. Wir prüfen die Meldung.")
                    }
                } else {
                    Section("Grund") {
                        ForEach(ReportReason.allCases) { option in
                            Button {
                                reason = option
                            } label: {
                                HStack {
                                    Text(option.title)
                                    Spacer()
                                    if reason == option {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.tint)
                                    }
                                }
                            }
                            .foregroundStyle(.primary)
                            .accessibilityAddTraits(reason == option ? .isSelected : [])
                        }
                    }

                    Section {
                        TextField("Was ist passiert? (optional)", text: $note, axis: .vertical)
                            .lineLimit(3...6)
                    } header: {
                        Text("Notiz")
                    } footer: {
                        Text("\(note.count) / \(Self.noteLimit)")
                    }

                    if let sendError {
                        Section {
                            Text(sendError)
                                .foregroundStyle(.red)
                        }
                    }
                }
            }
            .navigationTitle("Mitglied melden")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(didSend ? "Fertig" : "Abbrechen") {
                        dismiss()
                    }
                }
                if !didSend {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Senden") {
                            showSendConfirmation = true
                        }
                        .disabled(reason == nil || isSending)
                    }
                }
            }
            .onChange(of: note) { _, newValue in
                if newValue.count > Self.noteLimit {
                    note = String(newValue.prefix(Self.noteLimit))
                }
            }
            .alert("Meldung absenden?", isPresented: $showSendConfirmation) {
                Button("Absenden") {
                    Task { await send() }
                }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Bitte melde nur, was du selbst erlebt oder gesehen hast.")
            }
        }
    }

    private func send() async {
        guard let reason, !isSending else { return }
        isSending = true
        sendError = nil
        defer { isSending = false }
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await session.withAccess { token in
                try await session.api.reportUser(id: userId,
                                                 reason: reason.rawValue,
                                                 details: trimmedNote.isEmpty ? nil : trimmedNote,
                                                 token: token)
            }
            didSend = true
        } catch is CancellationError {
            return
        } catch {
            sendError = AppError.displayText(for: error)
        }
    }
}
