import SwiftUI

/// Kreis mit Prozentzahl für die Passung. Farbe: ab 75 grün, ab 50 Akzent, sonst grau.
struct ScoreRing: View {
    /// 0–100; andere Werte werden begrenzt.
    let score: Int
    var size: CGFloat = 56

    private var clamped: Int { min(100, max(0, score)) }
    private var lineWidth: CGFloat { max(3, size * 0.09) }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(.systemGray5), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: CGFloat(clamped) / 100)
                .stroke(Self.color(for: clamped), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text("\(clamped)")
                    .font(.system(size: size * 0.32, weight: .bold, design: .rounded))
                Text("%")
                    .font(.system(size: size * 0.16, weight: .semibold, design: .rounded))
                    .foregroundStyle(Theme.muted)
            }
            .monospacedDigit()
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Passung \(clamped) Prozent")
    }

    /// Dieselben Schwellen wie im Web-Client.
    static func color(for score: Int) -> Color {
        if score >= 75 { return .green }
        if score >= 50 { return Theme.accent }
        return .gray
    }
}
