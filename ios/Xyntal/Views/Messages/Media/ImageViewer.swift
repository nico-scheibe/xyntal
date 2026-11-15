import SwiftUI
import UIKit

/// Anfrage für den Vollbild-Betrachter: alle Fotos einer Nachricht und das Startfoto.
struct ImageViewerRequest: Identifiable {
    let id = UUID()
    let images: [Attachment]
    let start: Int
}

/// Vollbild für Fotos: schwarzer Grund, Schließen links, Teilen rechts, Zähler mittig.
/// Wischen nach unten schließt. Pinch-Zoom liegt im UIScrollView jeder Seite.
struct ImageViewer: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let images: [Attachment]
    @State private var index: Int
    @State private var dragOffset: CGFloat = 0
    @State private var shareURL: URL?

    init(images: [Attachment], start: Int) {
        self.images = images
        _index = State(initialValue: min(max(start, 0), max(images.count - 1, 0)))
    }

    var body: some View {
        ZStack {
            Color.black
                .opacity(1 - min(Double(abs(dragOffset)) / 400, 0.5))
                .ignoresSafeArea()

            TabView(selection: $index) {
                ForEach(Array(images.enumerated()), id: \.offset) { offset, attachment in
                    ImagePage(attachment: attachment)
                        .tag(offset)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .offset(y: dragOffset)
        }
        .overlay(alignment: .top) {
            topBar
        }
        .simultaneousGesture(
            DragGesture()
                .onChanged { value in
                    // Nur senkrechtes Wischen zieht das Bild mit; waagerecht blättert die Seite.
                    if abs(value.translation.height) > abs(value.translation.width) {
                        dragOffset = max(value.translation.height, 0)
                    }
                }
                .onEnded { value in
                    let vertical = value.translation.height > abs(value.translation.width)
                    if vertical && value.translation.height > 120 {
                        dismiss()
                    } else {
                        withAnimation(.spring(duration: 0.3)) { dragOffset = 0 }
                    }
                }
        )
        .task(id: index) {
            await prepareShare()
        }
    }

    private var topBar: some View {
        HStack {
            Button("Schließen") {
                dismiss()
            }
            .foregroundStyle(.white)
            Spacer()
            if let shareURL {
                ShareLink(item: shareURL) {
                    Image(systemName: "square.and.arrow.up")
                }
                .foregroundStyle(.white)
                .accessibilityLabel("Teilen")
            } else {
                Image(systemName: "square.and.arrow.up")
                    .foregroundStyle(.white.opacity(0.4))
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .overlay {
            Text("\(index + 1) von \(images.count)")
                .font(.body.monospacedDigit().weight(.semibold))
                .foregroundStyle(.white)
        }
        .background(alignment: .top) {
            LinearGradient(colors: [.black.opacity(0.5), .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: 100)
                .allowsHitTesting(false)
        }
    }

    /// Teilen braucht eine Datei. Sie wird erst geschrieben, wenn das Foto geladen ist.
    private func prepareShare() async {
        shareURL = nil
        guard images.indices.contains(index) else { return }
        let attachment = images[index]
        guard let data = try? await MediaLoader.shared.fileData(for: attachment, session: session),
              let url = try? MediaLoader.shared.previewURL(for: attachment, data: data) else { return }
        shareURL = url
    }
}

/// Eine Seite des Betrachters: das Foto, zoombar.
private struct ImagePage: View {
    @Environment(SessionStore.self) private var session

    let attachment: Attachment
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Group {
            if let image {
                ZoomableImage(image: image)
            } else if failed {
                Button("Erneut laden") {
                    Task { await load() }
                }
                .foregroundStyle(.white)
            } else {
                ProgressView()
                    .tint(.white)
            }
        }
        .task {
            await load()
        }
    }

    private func load() async {
        guard image == nil else { return }
        failed = false
        do {
            let data = try await MediaLoader.shared.fileData(for: attachment, session: session)
            guard let decoded = UIImage(data: data) else {
                failed = true
                return
            }
            image = decoded
        } catch is CancellationError {
            return
        } catch {
            failed = true
        }
    }
}

/// Foto mit Pinch-Zoom über UIScrollView (1× bis 4×).
struct ZoomableImage: UIViewRepresentable {
    let image: UIImage

    func makeUIView(context: Context) -> ZoomScrollView {
        let view = ZoomScrollView()
        view.imageView.image = image
        return view
    }

    func updateUIView(_ view: ZoomScrollView, context: Context) {
        if view.imageView.image !== image {
            view.imageView.image = image
            view.resetZoom()
        }
    }
}

final class ZoomScrollView: UIScrollView, UIScrollViewDelegate {
    let imageView = UIImageView()

    override init(frame: CGRect) {
        super.init(frame: frame)
        delegate = self
        minimumZoomScale = 1
        maximumZoomScale = 4
        showsHorizontalScrollIndicator = false
        showsVerticalScrollIndicator = false
        backgroundColor = .black
        imageView.contentMode = .scaleAspectFit
        addSubview(imageView)
    }

    required init?(coder: NSCoder) {
        fatalError("ZoomScrollView wird nur im Code erzeugt.")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if zoomScale == minimumZoomScale {
            imageView.frame = bounds
            contentSize = bounds.size
        }
        centerContent()
    }

    func resetZoom() {
        setZoomScale(minimumZoomScale, animated: false)
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        imageView
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        centerContent()
    }

    /// Hält das Bild mittig, solange es kleiner als der Schirm ist.
    private func centerContent() {
        let horizontal = max((bounds.width - contentSize.width) / 2, 0)
        let vertical = max((bounds.height - contentSize.height) / 2, 0)
        contentInset = UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical, right: horizontal)
    }
}
