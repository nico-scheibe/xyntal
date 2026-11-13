import SwiftUI

/// Tab „Community“ für angemeldete Nutzer: alle Communitys. Die offizielle Xyntal-Community öffnet den bestehenden Feed.
struct CommunityDirectoryView: View {
    @Environment(SessionStore.self) private var session

    @State private var store: CommunityDirectoryStore?

    var body: some View {
        NavigationStack {
            Group {
                if let store {
                    CommunityListContent(store: store)
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Community")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: DiscoverCommunity.self) { community in
                if community.official {
                    CommunityFeedScreen()
                } else if let store {
                    CommunityDetailView(community: community, store: store)
                }
            }
            .task {
                if store == nil {
                    store = CommunityDirectoryStore(session: session)
                }
                if let store, !store.hasLoaded {
                    await store.load()
                }
            }
        }
    }
}

/// Liste mit Lade-, Fehler- und Leerzustand.
private struct CommunityListContent: View {
    let store: CommunityDirectoryStore

    var body: some View {
        if store.communities.isEmpty && !store.hasLoaded {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if store.communities.isEmpty, let loadError = store.loadError {
            ContentUnavailableView {
                Label("Communitys nicht geladen", systemImage: "wifi.exclamationmark")
            } description: {
                Text(loadError)
            } actions: {
                Button("Erneut versuchen") { Task { await store.load() } }
            }
        } else if store.communities.isEmpty {
            ContentUnavailableView {
                Label("Noch keine Communitys", systemImage: "person.3")
            } description: {
                Text("Es gibt gerade keine Communitys.")
            }
        } else {
            List {
                if let loadError = store.loadError {
                    ReloadErrorBanner(message: loadError) { Task { await store.load() } }
                        .listRowInsets(EdgeInsets())
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }

                ForEach(store.communities) { community in
                    NavigationLink(value: community) {
                        CommunityRow(community: community)
                    }
                }
            }
            .listStyle(.plain)
            .refreshable { await store.load() }
        }
    }
}

/// Eine Zeile: Avatar, Name, Kurzbeschreibung, Kategorie und Mitgliederzahl.
private struct CommunityRow: View {
    let community: DiscoverCommunity

    private var name: String {
        community.name.nonEmptyText ?? "Community"
    }

    private var memberText: String {
        community.memberCount == 1 ? "1 Mitglied" : "\(community.memberCount) Mitglieder"
    }

    private var detailLine: String {
        [community.category.nonEmptyText, memberText].compactMap { $0 }.joined(separator: " · ")
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AvatarView(name: community.name, avatar: community.avatar, size: 44)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(name)
                        .font(.headline)
                    if community.official {
                        Text("Offiziell")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.muted)
                    }
                }
                if let description = community.description.nonEmptyText {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                        .lineLimit(2)
                }
                Text(detailLine)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// Detail einer Community, die du nicht besitzt: Name, Beschreibung, Kategorie, Themen, Zahlen und Beitreten.
/// Beiträge zeigt die App hier nicht; der Server liefert sie für Nicht-Eigentümer nicht.
struct CommunityDetailView: View {
    let community: DiscoverCommunity
    let store: CommunityDirectoryStore

    /// Die aktuelle Fassung aus dem Store, damit „Beitreten“ sofort sichtbar wirkt.
    private var current: DiscoverCommunity {
        store.community(id: community.id) ?? community
    }

    private var memberText: String {
        current.memberCount == 1 ? "1 Mitglied" : "\(current.memberCount) Mitglieder"
    }

    private var channelText: String {
        current.channelCount == 1 ? "1 Kanal" : "\(current.channelCount) Kanäle"
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        AvatarView(name: current.name, avatar: current.avatar, size: 56)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(current.name.nonEmptyText ?? "Community")
                                .font(.title3.weight(.semibold))
                            if let category = current.category.nonEmptyText {
                                Text(category)
                                    .font(.subheadline)
                                    .foregroundStyle(Theme.muted)
                            }
                        }
                    }
                    if let description = current.description.nonEmptyText {
                        Text(description)
                            .font(.body)
                    }
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
            }

            Section {
                LabeledContent("Mitglieder", value: memberText)
                LabeledContent("Kanäle", value: channelText)
            }

            if !current.tags.isEmpty {
                Section("Themen") {
                    Text(current.tags.map { "#\($0)" }.joined(separator: "  "))
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                }
            }

            Section {
                if current.isMember {
                    Label("Du bist Mitglied", systemImage: "checkmark.circle.fill")
                } else {
                    PrimaryButton(title: "Beitreten", isBusy: store.joiningId == current.id) {
                        Task { await store.join(current.id) }
                    }
                }
                if let joinError = store.joinError, store.joinErrorId == current.id {
                    Text(joinError)
                        .font(.subheadline)
                        .foregroundStyle(.red)
                    if store.joinNeedsAssessment {
                        NavigationLink("Arbeitsstil-Test machen") {
                            WorkStyleTestView { _ in
                                store.assessmentCompleted()
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(current.name.nonEmptyText ?? "Community")
        .navigationBarTitleDisplayMode(.inline)
    }
}
