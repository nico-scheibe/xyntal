import SwiftUI

extension Color {
    /// Feste Markenfarbe aus einem RGB-Hexwert (0xRRGGBB). Richtet sich nicht nach dem Modus.
    init(providerHex hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}

/// Google-„G“ in den vier Markenfarben. Gezeichnet auf 48 × 48 Punkten, auf `height` skaliert.
/// Rein dekorativ: VoiceOver liest das Logo nicht vor.
struct GoogleGLogo: View {
    var height: CGFloat = 20

    var body: some View {
        ZStack(alignment: .topLeading) {
            Path { p in
                p.move(to: CGPoint(x: 24, y: 9.5))
                p.addCurve(to: CGPoint(x: 33.21, y: 13.1), control1: CGPoint(x: 27.54, y: 9.5), control2: CGPoint(x: 30.71, y: 10.72))
                p.addLine(to: CGPoint(x: 40.06, y: 6.25))
                p.addCurve(to: CGPoint(x: 24, y: 0), control1: CGPoint(x: 35.9, y: 2.38), control2: CGPoint(x: 30.47, y: 0))
                p.addCurve(to: CGPoint(x: 2.56, y: 13.22), control1: CGPoint(x: 14.62, y: 0), control2: CGPoint(x: 6.51, y: 5.38))
                p.addLine(to: CGPoint(x: 10.54, y: 19.41))
                p.addCurve(to: CGPoint(x: 24, y: 9.5), control1: CGPoint(x: 12.43, y: 13.72), control2: CGPoint(x: 17.74, y: 9.5))
                p.closeSubpath()
            }
            .fill(Color(providerHex: 0xEA4335))

            Path { p in
                p.move(to: CGPoint(x: 46.98, y: 24.55))
                p.addCurve(to: CGPoint(x: 46.6, y: 20), control1: CGPoint(x: 46.98, y: 22.98), control2: CGPoint(x: 46.83, y: 21.46))
                p.addLine(to: CGPoint(x: 24, y: 20))
                p.addLine(to: CGPoint(x: 24, y: 29.02))
                p.addLine(to: CGPoint(x: 36.94, y: 29.02))
                p.addCurve(to: CGPoint(x: 32.16, y: 36.2), control1: CGPoint(x: 36.36, y: 31.98), control2: CGPoint(x: 34.68, y: 34.5))
                p.addLine(to: CGPoint(x: 39.89, y: 42.2))
                p.addCurve(to: CGPoint(x: 46.98, y: 24.55), control1: CGPoint(x: 44.4, y: 38.02), control2: CGPoint(x: 46.98, y: 31.84))
                p.closeSubpath()
            }
            .fill(Color(providerHex: 0x4285F4))

            Path { p in
                p.move(to: CGPoint(x: 10.53, y: 28.59))
                p.addCurve(to: CGPoint(x: 9.77, y: 24), control1: CGPoint(x: 10.05, y: 27.14), control2: CGPoint(x: 9.77, y: 25.6))
                p.addCurve(to: CGPoint(x: 10.53, y: 19.41), control1: CGPoint(x: 9.77, y: 22.4), control2: CGPoint(x: 10.04, y: 20.86))
                p.addLine(to: CGPoint(x: 2.55, y: 13.22))
                p.addCurve(to: CGPoint(x: 0, y: 24), control1: CGPoint(x: 0.92, y: 16.46), control2: CGPoint(x: 0, y: 20.12))
                p.addCurve(to: CGPoint(x: 2.56, y: 34.78), control1: CGPoint(x: 0, y: 27.88), control2: CGPoint(x: 0.92, y: 31.54))
                p.addLine(to: CGPoint(x: 10.53, y: 28.59))
                p.closeSubpath()
            }
            .fill(Color(providerHex: 0xFBBC05))

            Path { p in
                p.move(to: CGPoint(x: 24, y: 48))
                p.addCurve(to: CGPoint(x: 39.89, y: 42.19), control1: CGPoint(x: 30.48, y: 48), control2: CGPoint(x: 35.93, y: 45.87))
                p.addLine(to: CGPoint(x: 32.16, y: 36.19))
                p.addCurve(to: CGPoint(x: 24, y: 38.49), control1: CGPoint(x: 30.01, y: 37.64), control2: CGPoint(x: 27.24, y: 38.49))
                p.addCurve(to: CGPoint(x: 10.53, y: 28.58), control1: CGPoint(x: 17.74, y: 38.49), control2: CGPoint(x: 12.43, y: 34.27))
                p.addLine(to: CGPoint(x: 2.55, y: 34.77))
                p.addCurve(to: CGPoint(x: 24, y: 48), control1: CGPoint(x: 6.51, y: 42.62), control2: CGPoint(x: 14.62, y: 48))
                p.closeSubpath()
            }
            .fill(Color(providerHex: 0x34A853))
        }
        .frame(width: 48, height: 48, alignment: .topLeading)
        .scaleEffect(height / 48, anchor: .topLeading)
        .frame(width: height, height: height, alignment: .topLeading)
        .accessibilityHidden(true)
    }
}

/// Discord-Logo in Weiß. Gezeichnet auf 127,14 × 96,36 Punkten, auf `height` Höhe skaliert.
/// Rein dekorativ: VoiceOver liest das Logo nicht vor.
struct DiscordLogo: View {
    var height: CGFloat = 20

    private static let viewWidth: CGFloat = 127.14
    private static let viewHeight: CGFloat = 96.36

    var body: some View {
        ZStack(alignment: .topLeading) {
            Path { p in
                p.move(to: CGPoint(x: 107.7, y: 8.07))
                p.addCurve(to: CGPoint(x: 81.47, y: 0), control1: CGPoint(x: 99.347, y: 4.246), control2: CGPoint(x: 90.528, y: 1.533))
                p.addCurve(to: CGPoint(x: 78.11, y: 6.83), control1: CGPoint(x: 80.23, y: 2.216), control2: CGPoint(x: 79.109, y: 4.496))
                p.addCurve(to: CGPoint(x: 49, y: 6.83), control1: CGPoint(x: 68.461, y: 5.376), control2: CGPoint(x: 58.649, y: 5.376))
                p.addCurve(to: CGPoint(x: 45.64, y: 0), control1: CGPoint(x: 48.001, y: 4.496), control2: CGPoint(x: 46.879, y: 2.216))
                p.addCurve(to: CGPoint(x: 19.39, y: 8.09), control1: CGPoint(x: 36.576, y: 1.546), control2: CGPoint(x: 27.752, y: 4.265))
                p.addCurve(to: CGPoint(x: 0.54, y: 80.21), control1: CGPoint(x: 2.79, y: 32.65), control2: CGPoint(x: -1.71, y: 56.6))
                p.addLine(to: CGPoint(x: 0.54, y: 80.21))
                p.addCurve(to: CGPoint(x: 32.71, y: 96.36), control1: CGPoint(x: 10.261, y: 87.393), control2: CGPoint(x: 21.142, y: 92.855))
                p.addCurve(to: CGPoint(x: 39.6, y: 85.25), control1: CGPoint(x: 35.315, y: 92.857), control2: CGPoint(x: 37.62, y: 89.14))
                p.addCurve(to: CGPoint(x: 28.75, y: 80.07), control1: CGPoint(x: 35.838, y: 83.845), control2: CGPoint(x: 32.208, y: 82.112))
                p.addCurve(to: CGPoint(x: 31.41, y: 78.07), control1: CGPoint(x: 29.66, y: 79.41), control2: CGPoint(x: 30.55, y: 78.73))
                p.addCurve(to: CGPoint(x: 95.73, y: 78.07), control1: CGPoint(x: 51.78, y: 87.65), control2: CGPoint(x: 75.36, y: 87.65))
                p.addCurve(to: CGPoint(x: 98.39, y: 80.07), control1: CGPoint(x: 96.6, y: 78.78), control2: CGPoint(x: 97.49, y: 79.46))
                p.addCurve(to: CGPoint(x: 87.52, y: 85.26), control1: CGPoint(x: 94.926, y: 82.115), control2: CGPoint(x: 91.288, y: 83.852))
                p.addCurve(to: CGPoint(x: 94.41, y: 96.36), control1: CGPoint(x: 89.498, y: 89.149), control2: CGPoint(x: 91.803, y: 92.862))
                p.addCurve(to: CGPoint(x: 126.6, y: 80.22), control1: CGPoint(x: 105.988, y: 92.869), control2: CGPoint(x: 116.877, y: 87.409))
                p.addLine(to: CGPoint(x: 126.6, y: 80.22))
                p.addCurve(to: CGPoint(x: 107.7, y: 8.07), control1: CGPoint(x: 129.24, y: 52.84), control2: CGPoint(x: 122.09, y: 29.11))
                p.closeSubpath()
                p.move(to: CGPoint(x: 42.45, y: 65.69))
                p.addCurve(to: CGPoint(x: 31, y: 53), control1: CGPoint(x: 36.18, y: 65.69), control2: CGPoint(x: 31, y: 60))
                p.addCurve(to: CGPoint(x: 42.43, y: 40.26), control1: CGPoint(x: 31, y: 46), control2: CGPoint(x: 36, y: 40.26))
                p.addCurve(to: CGPoint(x: 53.89, y: 53), control1: CGPoint(x: 48.86, y: 40.26), control2: CGPoint(x: 54, y: 46))
                p.addCurve(to: CGPoint(x: 42.45, y: 65.69), control1: CGPoint(x: 53.78, y: 60), control2: CGPoint(x: 48.84, y: 65.69))
                p.closeSubpath()
                p.move(to: CGPoint(x: 84.69, y: 65.69))
                p.addCurve(to: CGPoint(x: 73.25, y: 53), control1: CGPoint(x: 78.41, y: 65.69), control2: CGPoint(x: 73.25, y: 60))
                p.addCurve(to: CGPoint(x: 84.69, y: 40.26), control1: CGPoint(x: 73.25, y: 46), control2: CGPoint(x: 78.25, y: 40.26))
                p.addCurve(to: CGPoint(x: 96.12, y: 53), control1: CGPoint(x: 91.13, y: 40.26), control2: CGPoint(x: 96.23, y: 46))
                p.addCurve(to: CGPoint(x: 84.69, y: 65.69), control1: CGPoint(x: 96.01, y: 60), control2: CGPoint(x: 91.08, y: 65.69))
                p.closeSubpath()
            }
            .fill(Color.white)
        }
        .frame(width: Self.viewWidth, height: Self.viewHeight, alignment: .topLeading)
        .scaleEffect(height / Self.viewHeight, anchor: .topLeading)
        .frame(width: height * Self.viewWidth / Self.viewHeight, height: height, alignment: .topLeading)
        .accessibilityHidden(true)
    }
}
