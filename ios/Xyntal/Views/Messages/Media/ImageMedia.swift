import SwiftUI
import UIKit
import CoreGraphics

/// Graue Fläche für Medien, die noch nicht geladen sind. Der Inhalt liegt mittig darauf.
struct MediaSurface<Content: View>: View {
    let size: CGSize
    @ViewBuilder let content: () -> Content

    var body: some View {
        Rectangle()
            .fill(Color(.systemGray5))
            .frame(width: size.width, height: size.height)
            .overlay { content() }
            .clipped()
    }
}

/// Ein Foto im Verlauf. Lädt nur, wenn allowAutoLoad gesetzt ist; sonst steht dort die Aufforderung zum Laden.
struct PhotoTile: View {
    @Environment(SessionStore.self) private var session

    let attachment: Attachment
    let size: CGSize
    /// true, wenn der Absender vertraut ist (eigene Nachricht oder Gespräch, in dem man selbst schon geschrieben hat)
    /// und die Datenreduzierung aus ist.
    let allowAutoLoad: Bool
    let isStranger: Bool
    /// Zeigt auf einer Kachel "+N", wenn im Gespräch mehr Fotos sind, als das Raster zeigt.
    var remainder: Int?
    let onOpen: () -> Void

    @State private var image: UIImage?
    @State private var isLoading = false
    @State private var failed = false

    private var constrained: Bool { LowDataMonitor.shared.isConstrained }

    var body: some View {
        MediaSurface(size: size) {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                placeholder
            }
            if let remainder {
                Rectangle()
                    .fill(.black.opacity(0.45))
                Text("+\(remainder)")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if image != nil {
                onOpen()
            } else {
                Task { await load() }
            }
        }
        .task(id: allowAutoLoad) {
            if allowAutoLoad { await load() }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var placeholder: some View {
        if isLoading {
            ProgressView()
        } else if failed {
            Label("Erneut laden", systemImage: "arrow.clockwise")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.primary)
        } else if isStranger {
            Label("Foto anzeigen", systemImage: "photo")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)
        } else {
            Label(MediaPrompt.loadText(size: attachment.size, constrained: constrained), systemImage: "arrow.down.circle")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.primary)
                .multilineTextAlignment(.center)
        }
    }

    private func load() async {
        guard !isLoading, image == nil else { return }
        isLoading = true
        failed = false
        defer { isLoading = false }
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

/// Fotos einer Nachricht: 1 groß, 2 nebeneinander, 3 als eins groß plus zwei klein, ab 4 ein 2×2-Raster.
struct PhotoGrid: View {
    let images: [Attachment]
    let allowAutoLoad: Bool
    let isStranger: Bool
    let onOpen: (Int) -> Void

    private static let square: CGFloat = 119
    private static let gap: CGFloat = 2

    var body: some View {
        switch images.count {
        case 0:
            EmptyView()
        case 1:
            let size = MediaFormat.fittedSize(width: images[0].width, height: images[0].height)
            tile(0, size: size)
        case 2:
            HStack(spacing: Self.gap) {
                tile(0, size: CGSize(width: Self.square, height: Self.square))
                tile(1, size: CGSize(width: Self.square, height: Self.square))
            }
        case 3:
            HStack(spacing: Self.gap) {
                tile(0, size: CGSize(width: 144, height: 2 * Self.square + Self.gap))
                VStack(spacing: Self.gap) {
                    tile(1, size: CGSize(width: 240 - 144 - Self.gap, height: Self.square))
                    tile(2, size: CGSize(width: 240 - 144 - Self.gap, height: Self.square))
                }
            }
        default:
            let square = CGSize(width: Self.square, height: Self.square)
            VStack(spacing: Self.gap) {
                HStack(spacing: Self.gap) {
                    tile(0, size: square)
                    tile(1, size: square)
                }
                HStack(spacing: Self.gap) {
                    tile(2, size: square)
                    tile(3, size: square, remainder: images.count > 4 ? images.count - 4 : nil)
                }
            }
        }
    }

    private func tile(_ index: Int, size: CGSize, remainder: Int? = nil) -> some View {
        PhotoTile(attachment: images[index],
                  size: size,
                  allowAutoLoad: allowAutoLoad,
                  isStranger: isStranger,
                  remainder: remainder) {
            onOpen(index)
        }
    }
}

/// Texte für die Aufforderung auf grauen Flächen.
enum MediaPrompt {
    /// "Foto laden · 1,8 MB" bei Datenreduzierung, sonst "Foto laden".
    static func loadText(size: Int?, constrained: Bool) -> String {
        guard constrained else { return "Foto laden" }
        if let sizeText = MediaFormat.size(size) {
            return "Foto laden · \(sizeText)"
        }
        return "Foto laden"
    }
}

// MARK: - GIFs

/// Ob ein GIF gerade läuft. Nur mit allen Bedingungen: Bewegung nicht reduziert, Datenreduzierung aus,
/// Schalter an, zu mindestens der Hälfte sichtbar und die App ist aktiv. Sonst Standbild.
@MainActor
enum GIFPolicy {
    static func animates(visible: Bool, isActive: Bool, reduceMotion: Bool) -> Bool {
        visible && isActive && !reduceMotion && !LowDataMonitor.shared.isConstrained && AppAppearance.shared.gifAutoplay
    }
}

/// Ein GIF im Verlauf. Standbild mit rundem Abspiel-Symbol, solange es nicht läuft.
struct GIFMediaView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let gif: Message.Gif?
    let allowAutoLoad: Bool
    let isStranger: Bool
    @Binding var visible: Bool

    @State private var still: UIImage?
    @State private var animated: UIImage?
    @State private var isLoading = false
    @State private var failed = false

    private var isAllowedAddress: Bool {
        guard let urlString = gif?.url, let url = URL(string: urlString) else { return false }
        return MediaLoader.isAllowedGifURL(url)
    }

    private var animating: Bool {
        GIFPolicy.animates(visible: visible, isActive: scenePhase == .active, reduceMotion: reduceMotion)
            && animated != nil
    }

    var body: some View {
        let size = MediaFormat.fittedSize(width: gif?.width, height: gif?.height)
        MediaSurface(size: size) {
            if !isAllowedAddress {
                Text("GIF nicht verfügbar")
                    .font(.caption.weight(.semibold))
            } else if let still {
                AnimatedImageView(still: still, animated: animated, playing: animating)
                if !animating {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 44))
                        .foregroundStyle(.white.opacity(0.9))
                        .shadow(radius: 3)
                }
            } else {
                gifPlaceholder
            }
        }
        .overlay(alignment: .bottomLeading) {
            if isAllowedAddress {
                Text("GIF")
                    .font(.caption2.bold())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(.black.opacity(0.55), in: Capsule())
                    .padding(8)
                    .accessibilityHidden(true)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if still == nil { Task { await load() } }
        }
        .background(
            GeometryReader { proxy in
                Color.clear.preference(key: VisibleShareKey.self, value: Self.visibleShare(proxy.frame(in: .global)))
            }
        )
        .onPreferenceChange(VisibleShareKey.self) { share in
            visible = share >= 0.5
        }
        .task(id: allowAutoLoad) {
            if allowAutoLoad && isAllowedAddress { await load() }
        }
    }

    @ViewBuilder
    private var gifPlaceholder: some View {
        if isLoading {
            ProgressView()
        } else if failed {
            Label("Erneut laden", systemImage: "arrow.clockwise")
                .font(.caption.weight(.semibold))
        } else if isStranger {
            Label("Foto anzeigen", systemImage: "photo")
                .font(.caption.weight(.semibold))
        } else {
            Label("Foto laden", systemImage: "arrow.down.circle")
                .font(.caption.weight(.semibold))
        }
    }

    private func load() async {
        guard !isLoading, still == nil, isAllowedAddress, let urlString = gif?.url else { return }
        isLoading = true
        failed = false
        defer { isLoading = false }
        do {
            let data = try await MediaLoader.shared.gifData(urlString: urlString)
            let decoded = await Task.detached(priority: .userInitiated) { GIFDecoder.decode(data) }.value
            guard let decoded else {
                failed = true
                return
            }
            still = decoded.still
            animated = decoded.animated
        } catch is CancellationError {
            return
        } catch {
            failed = true
        }
    }

    /// Anteil der Fläche, der auf dem Bildschirm liegt (0...1).
    static func visibleShare(_ frame: CGRect) -> Double {
        guard frame.width > 0, frame.height > 0,
              let screen = UIApplication.shared.connectedScenes
                .compactMap({ ($0 as? UIWindowScene)?.screen.bounds }).first else { return 0 }
        let visiblePart = frame.intersection(screen)
        guard !visiblePart.isNull else { return 0 }
        return Double(visiblePart.width * visiblePart.height / (frame.width * frame.height))
    }
}

private struct VisibleShareKey: PreferenceKey {
    static var defaultValue: Double = 0

    static func reduce(value: inout Double, nextValue: () -> Double) {
        value = max(value, nextValue())
    }
}

/// Zeigt ein GIF als UIImageView. Animiert nur, wenn playing gesetzt ist; sonst das Standbild.
struct AnimatedImageView: UIViewRepresentable {
    let still: UIImage
    let animated: UIImage?
    let playing: Bool

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.contentMode = .scaleAspectFill
        view.clipsToBounds = true
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: UIImageView, context: Context) {
        if playing, let animated {
            if view.image !== animated {
                view.image = animated
            }
            if !view.isAnimating {
                view.startAnimating()
            }
        } else {
            view.stopAnimating()
            if view.image !== still {
                view.image = still
            }
        }
    }
}

/// Liest ein GIF: erster Frame als Standbild, alle Frames als Animation. Begrenzt auf 150 Frames.
enum GIFDecoder {
    struct Result {
        let still: UIImage
        let animated: UIImage?
    }

    static func decode(_ data: Data) -> Result? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let count = CGImageSourceGetCount(source)
        guard count > 0, let first = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
        let still = UIImage(cgImage: first)
        guard count > 1 else { return Result(still: still, animated: nil) }

        var frames: [UIImage] = []
        var duration: Double = 0
        for index in 0..<min(count, 150) {
            guard let frame = CGImageSourceCreateImageAtIndex(source, index, nil) else { continue }
            frames.append(UIImage(cgImage: frame))
            duration += frameDelay(source, index)
        }
        let animated = UIImage.animatedImage(with: frames, duration: max(duration, 0.1))
        return Result(still: still, animated: animated)
    }

    private static func frameDelay(_ source: CGImageSource, _ index: Int) -> Double {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any],
              let gif = properties[kCGImagePropertyGIFDictionary] as? [CFString: Any] else { return 0.1 }
        let delay = (gif[kCGImagePropertyGIFUnclampedDelayTime] as? Double)
            ?? (gif[kCGImagePropertyGIFDelayTime] as? Double)
            ?? 0.1
        return delay < 0.011 ? 0.1 : delay
    }
}
