import SwiftUI

/// Einstellungen. Darstellung: Modus und Akzentfarbe. Beide Auswahlen wirken sofort in der ganzen App.
struct SettingsView: View {
    @Environment(\.colorScheme) private var colorScheme
    @Bindable private var appearance = AppAppearance.shared

    var body: some View {
        Form {
            Section("Darstellung") {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Modus")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Picker("Modus", selection: $appearance.mode) {
                        ForEach(AppearanceMode.allCases) { mode in
                            Text(mode.name).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }
                .padding(.vertical, 4)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Akzentfarbe")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    ForEach(AccentColor.allCases) { accent in
                        AccentRow(accent: accent,
                                  isSelected: appearance.accent == accent,
                                  dark: colorScheme == .dark) {
                            appearance.accent = accent
                        }
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .navigationTitle("Einstellungen")
    }
}

/// Eine Zeile der Akzentauswahl: Farbfleck, Name und Haken bei der aktiven Farbe.
/// Die Farbe ist nie das einzige Merkmal: Name und Haken tragen die Auswahl auch ohne Farbe.
private struct AccentRow: View {
    let accent: AccentColor
    let isSelected: Bool
    let dark: Bool
    let onSelect: () -> Void

    @ScaledMetric(relativeTo: .body) private var swatchSize: CGFloat = 28

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color(hex: accent.rawHex(dark: dark)))
                    .overlay(Circle().stroke(Color(.separator), lineWidth: 1))
                    .frame(width: swatchSize, height: swatchSize)
                    .accessibilityHidden(true)
                Text(accent.name)
                    .foregroundStyle(.primary)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Theme.accent)
                        .accessibilityHidden(true)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
