import SwiftUI

struct MembersView: View {
    @Environment(SessionStore.self) private var session

    /// Anzahl pro Seite. Der Server nimmt höchstens 50.
    private static let pageSize = 50

    /// Höchstens so viele Nachladerunden pro Auslösung. Danach bietet die Ansicht "Mehr laden" an.
    private static let maxPagesPerTrigger = 10

    /// Alle bisher geladenen Mitglieder, ungefiltert. Der Offset der Paginierung zählt über diese Liste.
    @State private var members: [Member] = []
    @State private var hasMore = false
    /// true, wenn das automatische Nachladen die Obergrenze erreicht hat, aber noch Seiten übrig sind.
    @State private var pagingPaused = false
    @State private var isLoading = true
    @State private var isLoadingMore = false
    @State private var loadError: String?
    /// true, wenn der letzte Fehler beim Nachladen einer Seite passierte (dann wiederholt "Erneut versuchen" nur diese Seite).
    @State private var failedWhileLoadingMore = false
    /// Erhöht sich bei jedem vollständigen Laden. Antworten eines älteren Ladens werden verworfen.
    @State private var loadGeneration = 0
    @State private var searchText = ""

    /// Filter: nur Mitglieder mit Xyntal-Karte (websiteCard vorhanden). Der Server liefert ungefiltert, daher wird hier gefiltert.
    /// Kann eine geladene Seite nach dem Filter leer sein, lädt die App automatisch weiter (siehe appendNextPage).
    private var cardMembers: [Member] {
        members.filter { $0.websiteCard != nil }
    }

    /// Mitglieder mit Karte, gefiltert nach der Suche in den bereits geladenen Seiten.
    private var visibleMembers: [Member] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return cardMembers }
        return cardMembers.filter { $0.matches(query) }
    }

    var body: some View {
        NavigationStack {
            content
                .safeAreaInset(edge: .top) {
                    if let loadError, !members.isEmpty {
                        ReloadErrorBanner(message: loadError) { Task { await retry() } }
                    }
                }
                .navigationTitle("Mitglieder")
                .searchable(text: $searchText, prompt: "Name, Rolle oder Ort")
                .navigationDestination(for: Member.self) { member in
                    MemberDetailView(member: member) { blocked in
                        members.removeAll { $0.id == blocked.id }
                    }
                }
                .refreshable { await load() }
                .task {
                    if members.isEmpty { await load() }
                }
        }
    }

    @ViewBuilder
    private var content: some View {
        if members.isEmpty && isLoading {
            ProgressView()
        } else if cardMembers.isEmpty, let loadError {
            ContentUnavailableView {
                Label("Mitglieder nicht geladen", systemImage: "wifi.exclamationmark")
            } description: {
                Text(loadError)
            } actions: {
                Button("Erneut versuchen") { Task { await load() } }
            }
        } else if cardMembers.isEmpty && hasMore && pagingPaused {
            // Die Obergrenze fürs automatische Nachladen ist erreicht. Der Nutzer entscheidet, ob es weitergeht.
            ContentUnavailableView {
                Label("Noch keine Mitglieder mit Karte", systemImage: "person.2")
            } description: {
                Text("Auf den bisher geladenen Seiten hat noch niemand eine Karte. Lade weitere Mitglieder, um weiterzusuchen.")
            } actions: {
                Button("Mehr laden") { Task { await loadMore() } }
                    .disabled(isLoadingMore)
            }
        } else if cardMembers.isEmpty && hasMore {
            // Die geladenen Seiten haben noch keine Karte. Die nächste Seite ist unterwegs.
            ProgressView()
        } else if cardMembers.isEmpty {
            ContentUnavailableView("Noch keine Mitglieder mit Karte.", systemImage: "person.2")
        } else if visibleMembers.isEmpty {
            ContentUnavailableView.search(text: searchText)
        } else {
            List {
                ForEach(visibleMembers) { member in
                    NavigationLink(value: member) {
                        MemberRow(member: member)
                    }
                    .onAppear {
                        // Die letzte sichtbare Zeile lädt die nächste Seite nach.
                        if member.id == visibleMembers.last?.id {
                            Task { await loadMore() }
                        }
                    }
                }
                if isLoadingMore {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                }
            }
        }
    }

    private func retry() async {
        if failedWhileLoadingMore {
            await loadMore()
        } else {
            await load()
        }
    }

    /// Lädt die erste Seite neu und ersetzt die Liste. Hat sie keine Mitglieder mit Karte, geht es mit der nächsten Seite weiter.
    private func load() async {
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        defer { isLoading = false }
        do {
            let page = try await session.withAccess { token in
                try await session.api.members(token: token, offset: 0, limit: Self.pageSize)
            }
            guard generation == loadGeneration else { return }
            members = page.people
            hasMore = page.hasMore && !page.people.isEmpty
            loadError = nil
            failedWhileLoadingMore = false
            pagingPaused = false
            var rounds = 0
            while hasMore && cardMembers.isEmpty {
                guard rounds < Self.maxPagesPerTrigger else {
                    pagingPaused = true
                    break
                }
                rounds += 1
                guard await appendNextPage(generation: generation) else { break }
            }
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            loadError = AppError.displayText(for: error)
            failedWhileLoadingMore = false
        }
    }

    /// Hängt die nächste Seite an, solange der Server hasMore meldet. Mindestens eine Seite; weitere nur,
    /// solange noch kein Mitglied mit Karte sichtbar ist.
    private func loadMore() async {
        guard hasMore, !isLoadingMore, !isLoading else { return }
        isLoadingMore = true
        pagingPaused = false
        let generation = loadGeneration
        defer { isLoadingMore = false }
        var rounds = 0
        repeat {
            if rounds == Self.maxPagesPerTrigger {
                pagingPaused = true
                return
            }
            rounds += 1
            guard await appendNextPage(generation: generation) else { return }
        } while hasMore && cardMembers.isEmpty
    }

    /// Holt die Seite nach dem letzten geladenen Mitglied und hängt sie an.
    /// false, wenn das Laden fehlschlug, abgebrochen wurde, veraltet ist oder keine neuen Mitglieder brachte.
    private func appendNextPage(generation: Int) async -> Bool {
        do {
            // Der Offset ist die Zahl der bereits geladenen Mitglieder. Gesperrte Mitglieder fehlen dann auch serverseitig.
            let offset = members.count
            let page = try await session.withAccess { token in
                try await session.api.members(token: token, offset: offset, limit: Self.pageSize)
            }
            guard generation == loadGeneration else { return false }
            // Doppelte Zeilen vermeiden, falls sich die Liste zwischen zwei Seiten verschoben hat.
            let known = Set(members.map(\.id))
            let added = page.people.filter { !known.contains($0.id) }
            members += added
            // Ohne neue Mitglieder gäbe es kein Weiter. Sonst würde die Schleife ewig dieselbe Seite holen.
            hasMore = page.hasMore && !added.isEmpty
            loadError = nil
            failedWhileLoadingMore = false
            return !added.isEmpty
        } catch is CancellationError {
            return false
        } catch {
            guard generation == loadGeneration else { return false }
            loadError = AppError.displayText(for: error)
            failedWhileLoadingMore = true
            return false
        }
    }
}

private struct MemberRow: View {
    let member: Member

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(member.displayName.nonEmptyText ?? "Unbekannt")
                    .font(.headline)
                if member.verified == true {
                    VerifiedBadge()
                }
            }
            let line = [member.headline, member.location].compactMap { $0.nonEmptyText }.joined(separator: " · ")
            if !line.isEmpty {
                Text(line)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
