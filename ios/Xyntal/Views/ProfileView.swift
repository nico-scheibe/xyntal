import SwiftUI

struct ProfileView: View {
    @Environment(SessionStore.self) private var session

    @State private var me: CurrentUser?
    @State private var hasLoaded = false
    @State private var loadError: String?
    @State private var showDeleteSheet = false
    /// Wird bei Pull-to-Refresh erhöht, damit der Abschnitt "Gesperrte Mitglieder" neu lädt.
    @State private var blocksReloadToken = 0

    var body: some View {
        NavigationStack {
            Form {
                matchingSection
                accountSection
                BlockedMembersSection(reloadToken: blocksReloadToken)
                settingsSection
                actionsSection
            }
            .navigationTitle("Profil")
            .refreshable {
                blocksReloadToken += 1
                await load()
            }
            .task { await load() }
            .sheet(isPresented: $showDeleteSheet) {
                if let me {
                    DeleteAccountSheet(email: me.email)
                }
            }
        }
    }

    private var matchingSection: some View {
        Section("Matching") {
            NavigationLink {
                MatchingProfileView()
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Matching-Profil")
                    Text("Ziele, Skills, Verfügbarkeit")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            NavigationLink("Tarif & KI-Guthaben") {
                BillingView()
            }
        }
    }

    @ViewBuilder
    private var accountSection: some View {
        Section("Mein Konto") {
            if let me {
                DetailRow(title: "Name", value: me.displayName)
                DetailRow(title: "Handle", value: "@\(me.handle)")
                DetailRow(title: "E-Mail", value: me.email)
            } else if let loadError {
                Text(loadError)
                    .foregroundStyle(.secondary)
            } else if hasLoaded {
                Text("Konto konnte nicht geladen werden.")
                    .foregroundStyle(.secondary)
            } else {
                ProgressView()
            }
        }
    }

    private var settingsSection: some View {
        Section {
            NavigationLink("Einstellungen") {
                SettingsView()
            }
        }
    }

    private var actionsSection: some View {
        Section("Konto") {
            Button("Abmelden") {
                Task { await session.signOut() }
            }
            Button("Konto löschen", role: .destructive) {
                showDeleteSheet = true
            }
            .disabled(me == nil)
        }
    }

    private func load() async {
        do {
            me = try await session.withAccess { token in
                try await session.api.me(token: token)
            }
            loadError = nil
        } catch is CancellationError {
            return
        } catch {
            loadError = AppError.displayText(for: error)
        }
        hasLoaded = true
    }
}

/// Gesperrte Mitglieder mit Entsperren. Die Liste wird bei jedem Erscheinen frisch geladen und nicht gecacht.
private struct BlockedMembersSection: View {
    @Environment(SessionStore.self) private var session

    let reloadToken: Int

    @State private var blocked: [BlockedMember] = []
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var unblockingIds: Set<String> = []
    @State private var actionError: String?

    var body: some View {
        Section {
            if isLoading && blocked.isEmpty && loadError == nil {
                ProgressView()
            } else if let loadError {
                Text(loadError)
                    .foregroundStyle(.secondary)
                Button("Erneut versuchen") { Task { await load() } }
            } else if blocked.isEmpty {
                Text("Du hast niemanden gesperrt.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(blocked) { member in
                    let name = member.displayName.nonEmptyText ?? "Unbekannt"
                    HStack {
                        VStack(alignment: .leading) {
                            Text(name)
                            if let handle = member.handle.nonEmptyText {
                                Text(verbatim: "@\(handle)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Button("Entsperren") {
                            Task { await unblock(member) }
                        }
                        .buttonStyle(.borderless)
                        .disabled(unblockingIds.contains(member.id))
                        .accessibilityLabel("\(name) entsperren")
                    }
                }
            }

            if let actionError {
                Text(actionError)
                    .foregroundStyle(.red)
            }
        } header: {
            Text("Gesperrte Mitglieder")
        }
        .task(id: reloadToken) { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            blocked = try await session.withAccess { token in
                try await session.api.blockedMembers(token: token)
            }
            loadError = nil
        } catch is CancellationError {
            return
        } catch {
            blocked = []
            loadError = AppError.displayText(for: error)
        }
    }

    private func unblock(_ member: BlockedMember) async {
        guard !unblockingIds.contains(member.id) else { return }
        unblockingIds.insert(member.id)
        actionError = nil
        defer { unblockingIds.remove(member.id) }
        do {
            try await session.withAccess { token in
                try await session.api.unblockUser(id: member.id, token: token)
            }
            blocked.removeAll { $0.id == member.id }
        } catch is CancellationError {
            return
        } catch {
            actionError = AppError.displayText(for: error)
        }
    }
}

/// Kontolöschung in zwei Schritten: Code an die Adresse des Kontos anfordern, dann Code (und 2FA, falls aktiv) eingeben.
private struct DeleteAccountSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let email: String

    @State private var code = ""
    @State private var totpCode = ""
    @State private var codeSent = false
    @State private var isWorking = false
    @State private var errorText: String?
    @State private var showConfirmation = false

    private var canDelete: Bool {
        !isWorking && !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Dein Konto und dein Profil werden dauerhaft gelöscht. Das lässt sich nicht rückgängig machen.")
                }

                Section {
                    Button(codeSent ? "Code erneut senden" : "Code per E-Mail senden") {
                        Task { await requestCode() }
                    }
                    .disabled(isWorking)
                } footer: {
                    if codeSent {
                        Text("Wir haben einen Code an \(email) geschickt.")
                    }
                }

                if codeSent {
                    Section("Bestätigung") {
                        TextField("Code aus der E-Mail", text: $code)
                            .textContentType(.oneTimeCode)
                            .keyboardType(.numberPad)
                        TextField("Zwei-Faktor-Code (falls aktiv)", text: $totpCode)
                            .textContentType(.oneTimeCode)
                            .keyboardType(.numberPad)
                    }

                    Section {
                        Button("Konto endgültig löschen", role: .destructive) {
                            showConfirmation = true
                        }
                        .disabled(!canDelete)
                    }
                }

                if let errorText {
                    Section {
                        Text(errorText)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Konto löschen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
            }
            .alert("Konto endgültig löschen?", isPresented: $showConfirmation) {
                Button("Endgültig löschen", role: .destructive) {
                    Task { await deleteAccount() }
                }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Das lässt sich nicht rückgängig machen.")
            }
        }
    }

    private func requestCode() async {
        guard !isWorking else { return }
        isWorking = true
        errorText = nil
        defer { isWorking = false }
        do {
            try await session.api.requestDeletionCode(email: email)
            codeSent = true
        } catch is CancellationError {
            return
        } catch {
            errorText = AppError.displayText(for: error)
        }
    }

    private func deleteAccount() async {
        guard canDelete else { return }
        isWorking = true
        errorText = nil
        defer { isWorking = false }
        let trimmedTotp = totpCode.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            // Nach Erfolg wechselt die Root-Ansicht zur Anmeldung und schließt dieses Blatt.
            try await session.deleteAccount(code: code.trimmingCharacters(in: .whitespacesAndNewlines),
                                            totpCode: trimmedTotp.isEmpty ? nil : trimmedTotp)
        } catch is CancellationError {
            return
        } catch {
            errorText = AppError.displayText(for: error)
        }
    }
}
