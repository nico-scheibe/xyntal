import SwiftUI

/// Anbieter, deren Anmelde-Knopf nach den Markenvorgaben aussieht.
enum ProviderSignInProvider {
    case google
    case discord
}

/// Aussehen der Anbieter-Knöpfe neben dem Apple-Knopf. Die Beschriftung kommt als Label des Buttons.
/// Logo links, Beschriftung mittig, volle Breite, gleiche Höhe und gleicher Eckenradius wie der Apple-Knopf.
/// Die Farben folgen den Markenvorgaben von Google und Discord.
struct ProviderSignInButtonStyle: ButtonStyle {
    let provider: ProviderSignInProvider

    /// Höhe des Apple-Knopfs in LoginView.
    static let height: CGFloat = 50
    /// Eckenradius des Apple-Knopfs. Nicht messbar (der Apple-Knopf rendert außerhalb des Simulators nicht), daher angenähert.
    static let cornerRadius: CGFloat = 8

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        let look = Look(provider: provider, dark: colorScheme == .dark, pressed: configuration.isPressed)
        let shape = RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)

        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(look.text)
            .multilineTextAlignment(.center)
            // Seitlicher Abstand, damit die Beschriftung nie unter das Logo läuft (auch bei großer Schrift).
            .padding(.horizontal, 44)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: Self.height)
            .background(shape.fill(look.fill))
            .overlay(alignment: .leading) {
                logo
                    .padding(.leading, 16)
            }
            .overlay {
                shape.strokeBorder(look.border ?? .clear, lineWidth: 1)
            }
            .contentShape(shape)
            // Deaktiviert bleibt der Knopf erkennbar, nur abgeblendet.
            .opacity(isEnabled ? 1 : 0.5)
    }

    @ViewBuilder
    private var logo: some View {
        switch provider {
        case .google:
            GoogleGLogo(height: 20)
        case .discord:
            DiscordLogo(height: 20)
        }
    }

    /// Farben eines Zustands. Google hat in Hell und Dunkel eigene Flächen und Rahmen, Discord ist in beiden Modi gleich.
    private struct Look {
        let fill: Color
        let text: Color
        let border: Color?

        init(provider: ProviderSignInProvider, dark: Bool, pressed: Bool) {
            switch provider {
            case .google:
                if dark {
                    fill = Color(providerHex: pressed ? 0x1E1E1F : 0x131314)
                    text = Color(providerHex: 0xE3E3E3)
                    border = Color(providerHex: 0x8E918F)
                } else {
                    fill = Color(providerHex: pressed ? 0xF1F1F1 : 0xFFFFFF)
                    text = Color(providerHex: 0x1F1F1F)
                    border = Color(providerHex: 0x747775)
                }
            case .discord:
                fill = Color(providerHex: pressed ? 0x4752C4 : 0x5865F2)
                text = Color(providerHex: 0xFFFFFF)
                border = nil
            }
        }
    }
}
