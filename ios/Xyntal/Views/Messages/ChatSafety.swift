import SwiftUI

/// Sperren aus dem Chat: Bestätigung, dann POST /users/:id/block. Gleicher Wortlaut wie im Mitgliedsprofil.
/// onBlocked läuft nach Erfolg (z. B. Verlauf neu laden oder Chat schließen).
struct BlockConfirmation: ViewModifier {
    @Environment(SessionStore.self) private var session

    @Binding var userId: String?
    let onBlocked: () -> Void

    @State private var actionError: String?

    func body(content: Content) -> some View {
        content
            .alert("Mitglied sperren?", isPresented: Binding(
                get: { userId != nil },
                set: { if !$0 { userId = nil } }
            )) {
                Button("Sperren", role: .destructive) {
                    guard let target = userId else { return }
                    userId = nil
                    Task { await block(target) }
                }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Du siehst dieses Mitglied dann nicht mehr in der Liste.")
            }
            .alert("Sperren nicht möglich", isPresented: Binding(
                get: { actionError != nil },
                set: { if !$0 { actionError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(actionError ?? "")
            }
    }

    private func block(_ id: String) async {
        do {
            try await session.withAccess { token in
                try await session.api.blockUser(id: id, token: token)
            }
            onBlocked()
        } catch is CancellationError {
            return
        } catch {
            actionError = AppError.displayText(for: error)
        }
    }
}

extension View {
    /// Bestätigt „Mitglied sperren“ für die gesetzte Nutzer-ID und sperrt bei Zustimmung.
    func blockConfirmation(_ userId: Binding<String?>, onBlocked: @escaping () -> Void) -> some View {
        modifier(BlockConfirmation(userId: userId, onBlocked: onBlocked))
    }
}
