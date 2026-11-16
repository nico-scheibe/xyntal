import PhotosUI
import SwiftUI

/// Blatt „Logo und Banner“ für die Eigentümerin oder den Eigentümer. Ein gewähltes Foto geht sofort hoch, es gibt kein Speichern.
/// Fehler stehen unter dem Abschnitt, in dem sie passiert sind. Das alte Bild bleibt dabei stehen.
struct CommunityImagesSheet: View {
    @Environment(\.dismiss) private var dismiss

    let store: MemberCommunityStore
    /// Name der Community. Ohne Logo zeigt die Vorschau daraus die Anfangsbuchstaben.
    let name: String

    @State private var logoItem: PhotosPickerItem?
    @State private var bannerItem: PhotosPickerItem?
    /// Die Abschnitte, deren Foto gerade hochlädt oder entfernt wird. Nur deren Knöpfe sind gesperrt.
    @State private var busy: Set<CommunityImageKind> = []
    @State private var logoError: String?
    @State private var bannerError: String?
    @State private var askLogoRemoval = false
    @State private var askBannerRemoval = false

    private var hasLogo: Bool {
        store.avatar.nonEmptyText != nil
    }

    private var hasBanner: Bool {
        store.banner.nonEmptyText != nil
    }

    /// Knöpfe eines Abschnitts sind aus, wenn du nicht (mehr) Eigentümer bist oder dieser Abschnitt gerade arbeitet.
    private func locked(_ kind: CommunityImageKind) -> Bool {
        !store.canEdit || busy.contains(kind)
    }

    var body: some View {
        NavigationStack {
            Form {
                logoSection
                bannerSection
            }
            .navigationTitle("Logo und Banner")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fertig") {
                        dismiss()
                    }
                }
            }
            // Solange ein Bild hochlädt, lässt sich das Blatt nicht wegwischen. So sieht man, ob es geklappt hat.
            .interactiveDismissDisabled(!busy.isEmpty)
            .confirmationDialog("Logo entfernen?", isPresented: $askLogoRemoval, titleVisibility: .visible) {
                Button("Logo entfernen", role: .destructive) {
                    Task { await remove(.logo) }
                }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Die Community zeigt dann wieder die Anfangsbuchstaben.")
            }
            .confirmationDialog("Banner entfernen?", isPresented: $askBannerRemoval, titleVisibility: .visible) {
                Button("Banner entfernen", role: .destructive) {
                    Task { await remove(.banner) }
                }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Die Community zeigt dann kein Banner mehr.")
            }
            .onChange(of: logoItem) { _, item in
                guard let item else { return }
                Task { await pick(.logo, item) }
            }
            .onChange(of: bannerItem) { _, item in
                guard let item else { return }
                Task { await pick(.banner, item) }
            }
        }
        // Textknöpfe der Leiste: Akzent, aber auf 4,5:1 abgesichert (Regel R1b). Wie im Gründungsblatt.
        .tint(Theme.accentText)
    }

    // MARK: - Logo

    private var logoSection: some View {
        Section {
            AvatarView(name: name, avatar: store.avatar, size: 56, shape: .roundedSquare, tone: .calm)
                .opacity(busy.contains(.logo) ? 0.6 : 1)
                .overlay {
                    if busy.contains(.logo) {
                        ProgressView()
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

            PhotosPicker(selection: $logoItem, matching: .images) {
                actionLabel(hasLogo ? "Logo ändern" : "Logo festlegen")
            }
            .disabled(locked(.logo))

            if hasLogo {
                Button("Logo entfernen", role: .destructive) {
                    askLogoRemoval = true
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
                .disabled(locked(.logo))
            }

            if busy.contains(.logo) {
                Text("Wird hochgeladen …")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
            if let logoError {
                Text(logoError)
                    .font(.subheadline)
                    .foregroundStyle(.red)
            }
        } header: {
            Text("Logo")
        } footer: {
            Text("Quadratisch passt am besten. Das Bild wird mittig zugeschnitten.")
        }
    }

    // MARK: - Banner

    private var bannerSection: some View {
        Section {
            bannerPreview
                .opacity(busy.contains(.banner) ? 0.6 : 1)
                .overlay {
                    if busy.contains(.banner) {
                        ProgressView()
                    }
                }

            PhotosPicker(selection: $bannerItem, matching: .images) {
                actionLabel(hasBanner ? "Banner ändern" : "Banner festlegen")
            }
            .disabled(locked(.banner))

            if hasBanner {
                Button("Banner entfernen", role: .destructive) {
                    askBannerRemoval = true
                }
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
                .disabled(locked(.banner))
            }

            if busy.contains(.banner) {
                Text("Wird hochgeladen …")
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)
            }
            if let bannerError {
                Text(bannerError)
                    .font(.subheadline)
                    .foregroundStyle(.red)
            }
        } header: {
            Text("Banner")
        } footer: {
            Text("Querformat, etwa 3:1. Das Bild wird mittig zugeschnitten. Der Name deiner Community steht immer darunter.")
        }
    }

    /// Vorschau im Verhältnis 3:1 wie in der Community. Ohne Banner eine ruhige Fläche mit Hinweis.
    @ViewBuilder
    private var bannerPreview: some View {
        if let image = store.bannerImage {
            CommunityBannerFrame {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            }
        } else {
            CommunityBannerFrame {
                ZStack {
                    Color.primary.opacity(0.04)
                    Text("Noch kein Banner")
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                }
            }
        }
    }

    /// Textknopf, Akzent als Text (R1b), Tipp-Ziel mindestens 44 pt. Die Sperre setzt der Aufrufer über .disabled.
    private func actionLabel(_ title: String) -> some View {
        Text(title)
            .foregroundStyle(Theme.accentText)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
    }

    // MARK: - Aktionen

    /// Ein Foto ist gewählt: sofort vorbereiten und hochladen. Die Auswahl wird danach zurückgesetzt,
    /// damit sich dasselbe Foto erneut wählen lässt.
    private func pick(_ kind: CommunityImageKind, _ item: PhotosPickerItem) async {
        setError(nil, for: kind)
        busy.insert(kind)
        defer {
            busy.remove(kind)
            clearPickerItem(kind)
        }
        do {
            guard let photo = try await item.loadTransferable(type: Data.self) else {
                throw CommunityImageError.badFormat
            }
            try await store.changeImage(kind, from: photo)
        } catch is CancellationError {
            return
        } catch {
            setError(CommunityImageError.from(error).text(removing: false), for: kind)
        }
    }

    private func remove(_ kind: CommunityImageKind) async {
        setError(nil, for: kind)
        busy.insert(kind)
        defer { busy.remove(kind) }
        do {
            try await store.removeImage(kind)
        } catch is CancellationError {
            return
        } catch {
            setError(CommunityImageError.from(error).text(removing: true), for: kind)
        }
    }

    private func setError(_ text: String?, for kind: CommunityImageKind) {
        switch kind {
        case .logo: logoError = text
        case .banner: bannerError = text
        }
    }

    private func clearPickerItem(_ kind: CommunityImageKind) {
        switch kind {
        case .logo: logoItem = nil
        case .banner: bannerItem = nil
        }
    }
}
