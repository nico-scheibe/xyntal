import SwiftUI

/// Das Muster im Kopfbereich einer Xyntal-Karte. Gezeichnet wird nur das Muster – der
/// Theme-Verlauf darunter und der Schleier darüber kommen vom Aufrufer.
///
/// Die Zahlen stammen aus qml/components/CardBanner.qml (Windows- und Mac-App) und müssen
/// mit dem Desktop gleich bleiben: ändert sich dort etwas, wird es hier nachgezogen, sonst
/// sieht dieselbe Karte auf dem Handy anders aus als am Rechner.
///
/// Bewegte Muster (flow, stars, pulse, scan) und das eigene Bild fehlen absichtlich –
/// CardDesign.bannerID gibt sie gar nicht zurück. "theme" und unbekannte IDs zeichnen nichts.
struct CardBannerView: View {
    let bannerID: String
    let design: CardDesign

    var body: some View {
        // Canvas füllt die Fläche, die der Aufrufer anbietet, ohne festes Frame.
        Canvas { context, size in
            switch bannerID {
            case "mesh": drawMesh(&context, size)
            case "grid": drawGrid(&context, size)
            case "dots": drawDots(&context, size)
            case "waves": drawWaves(&context, size)
            case "stripes": drawStripes(&context, size)
            case "glow": drawGlow(&context, size)
            case "solid": drawSolid(&context, size)
            default: break
            }
        }
    }

    // MARK: - Muster

    private func drawMesh(_ context: inout GraphicsContext, _ size: CGSize) {
        let rect = CGRect(origin: .zero, size: size)
        radial(&context, in: rect, center: CGPoint(x: size.width * 0.12, y: size.height * 0.15),
               radius: size.width * 0.42, color: .white, alpha: 0.32)
        radial(&context, in: rect, center: CGPoint(x: size.width * 0.88, y: size.height * 0.85),
               radius: size.width * 0.55, color: Color(hex: 0x0A0A10), alpha: 0.55)
    }

    private func drawGrid(_ context: inout GraphicsContext, _ size: CGSize) {
        // Rechtecke von 1 pt statt Striche: ein Strich auf halben Punkten würde verwischen.
        // Senkrechte und waagerechte Linien werden getrennt gefüllt. Dort, wo sie sich kreuzen,
        // legt sich die Deckkraft zweimal drüber – so wie der Desktop es auch tut.
        var vertical = Path()
        for x in stride(from: 0, to: size.width, by: 16) {
            vertical.addRect(CGRect(x: x, y: 0, width: 1, height: size.height))
        }
        var horizontal = Path()
        for y in stride(from: 0, to: size.height, by: 16) {
            horizontal.addRect(CGRect(x: 0, y: y, width: size.width, height: 1))
        }
        context.fill(vertical, with: .color(.white.opacity(0.16)))
        context.fill(horizontal, with: .color(.white.opacity(0.16)))
    }

    private func drawDots(_ context: inout GraphicsContext, _ size: CGSize) {
        // Erster Punkt bei (6, 6), Raster 12 pt, Radius 1,3 pt.
        var dots = Path()
        for x in stride(from: 6.0, to: size.width, by: 12) {
            for y in stride(from: 6.0, to: size.height, by: 12) {
                dots.addEllipse(in: CGRect(x: x - 1.3, y: y - 1.3, width: 2.6, height: 2.6))
            }
        }
        context.fill(dots, with: .color(.white.opacity(0.34)))
    }

    private func drawWaves(_ context: inout GraphicsContext, _ size: CGSize) {
        // Die Amplituden entsprechen den Kontrollpunkten aus dem QML (q30 -10 / q30 -8).
        // Eine quadratische Bézierkurve erreicht nur die halbe Kontrollpunkt-Abweichung,
        // die sichtbare Welle ist im QML also 5 bzw. 4 pt hoch. Das bleibt so, damit es gleich aussieht.
        context.fill(wave(startY: size.height - 34, amplitude: 10, size: size),
                     with: .color(.white.opacity(0.14)))
        context.fill(wave(startY: size.height - 20, amplitude: 8, size: size),
                     with: .color(.black.opacity(0.18)))
    }

    private func drawStripes(_ context: inout GraphicsContext, _ size: CGSize) {
        // Diagonalen 45 Grad nach rechts unten, jede 22 pt versetzt. Der Start bei -h
        // sorgt dafür, dass die Ecke links oben schon gefüllt ist.
        var stripes = Path()
        for s in stride(from: -size.height, to: size.width + size.height, by: 22) {
            stripes.move(to: CGPoint(x: s, y: 0))
            stripes.addLine(to: CGPoint(x: s + size.height, y: size.height))
        }
        context.stroke(stripes, with: .color(.white.opacity(0.13)), style: StrokeStyle(lineWidth: 10))
    }

    private func drawGlow(_ context: inout GraphicsContext, _ size: CGSize) {
        let rect = CGRect(origin: .zero, size: size)
        // Deckende Grundfläche: sie verdeckt den Theme-Verlauf darunter ganz, das ist gewollt.
        context.fill(Path(rect), with: .linearGradient(
            Gradient(colors: [Color(hex: 0x0B0B12), Color(hex: 0x15151E)]),
            startPoint: .zero, endPoint: CGPoint(x: 0, y: size.height)))
        // Das Leuchten sitzt absichtlich unter der Fläche (1,3 h), darum muss der Radialverlauf
        // über seinen Mittelpunkt hinaus funktionieren.
        radial(&context, in: rect, center: CGPoint(x: size.width / 2, y: size.height * 1.3),
               radius: size.width * 0.55, color: design.accent, alpha: 1)
        // Dünne Leiste unten: die Themenfarben, aber auf den festen Stellen 0 / 0,33 / 0,66 / 1
        // statt auf den Positionen von gradientStops (dort liegen die Enden doppelt).
        let barY = size.height - 2
        let stops = zip(design.gradientStops.map(\.color), [0, 0.33, 0.66, 1] as [CGFloat])
            .map { Gradient.Stop(color: $0, location: $1) }
        context.fill(Path(CGRect(x: 0, y: barY, width: size.width, height: 2)), with: .linearGradient(
            Gradient(stops: stops),
            startPoint: CGPoint(x: 0, y: barY + 1), endPoint: CGPoint(x: size.width, y: barY + 1)))
    }

    private func drawSolid(_ context: inout GraphicsContext, _ size: CGSize) {
        let rect = CGRect(origin: .zero, size: size)
        context.fill(Path(rect), with: .color(design.accent))
        context.fill(Path(rect), with: .linearGradient(
            Gradient(colors: [.black.opacity(0.12), .black.opacity(0.38)]),
            startPoint: .zero, endPoint: CGPoint(x: 0, y: size.height)))
    }

    // MARK: - Hilfen

    /// Ein Radialverlauf wie in CSS: von der Mitte (Deckkraft `alpha`) bis zum Radius (Deckkraft 0).
    /// Ausgeblendet wird über dieselbe Farbe mit Deckkraft 0 statt über Color.clear, damit der
    /// Verlauf nicht durch Schwarz läuft.
    private func radial(_ context: inout GraphicsContext, in rect: CGRect, center: CGPoint,
                        radius: CGFloat, color: Color, alpha: Double) {
        context.fill(Path(rect), with: .radialGradient(
            Gradient(stops: [
                Gradient.Stop(color: color.opacity(alpha), location: 0),
                Gradient.Stop(color: color.opacity(0), location: 1)
            ]),
            center: center, startRadius: 0, endRadius: radius))
    }

    /// Ein Wellenband über die ganze Breite. Je 120 pt ein Zug: ein Bogen hoch, einer zurück
    /// (QML: "q30 -10 60 0 t60 0"). Der zweite Bogen spiegelt den Kontrollpunkt des ersten.
    private func wave(startY: CGFloat, amplitude: CGFloat, size: CGSize) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0, y: startY))
        var x: CGFloat = 0
        while x < size.width + 120 {
            path.addQuadCurve(to: CGPoint(x: x + 60, y: startY),
                              control: CGPoint(x: x + 30, y: startY - amplitude))
            path.addQuadCurve(to: CGPoint(x: x + 120, y: startY),
                              control: CGPoint(x: x + 90, y: startY + amplitude))
            x += 120
        }
        // Nach dem Zug steht der Punkt bei (x, startY); von dort runter auf die Unterkante und zurück.
        path.addLine(to: CGPoint(x: x, y: size.height))
        path.addLine(to: CGPoint(x: 0, y: size.height))
        path.closeSubpath()
        return path
    }
}

// MARK: - Vorschau

/// Alle Muster untereinander, so wie die Karte sie zeigt: Theme-Verlauf, Schleier, dann das Muster.
private struct CardBannerPreviewList: View {
    let design: CardDesign
    private static let patterns = ["theme", "mesh", "grid", "dots", "waves", "stripes", "glow", "solid"]

    var body: some View {
        VStack(spacing: 12) {
            ForEach(Self.patterns, id: \.self) { id in
                ZStack {
                    LinearGradient(stops: design.gradientStops, startPoint: .topLeading, endPoint: .bottomTrailing)
                    LinearGradient(colors: design.coverVeil, startPoint: .top, endPoint: .bottom)
                    CardBannerView(bannerID: id, design: design)
                }
                .frame(width: 377, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(alignment: .bottomLeading) {
                    Text(id)
                        .font(.caption2)
                        .padding(4)
                        .background(.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 4))
                        .padding(6)
                }
            }
        }
        .padding()
    }
}

#Preview("Muster – aurora") {
    CardBannerPreviewList(design: CardDesign(theme: "aurora", c1: nil, c2: nil, banner: nil,
                                             surface: nil, layout: nil, shape: nil, order: nil, off: nil))
}

#Preview("Muster – mono") {
    CardBannerPreviewList(design: CardDesign(theme: "mono", c1: nil, c2: nil, banner: nil,
                                             surface: nil, layout: nil, shape: nil, order: nil, off: nil))
}
