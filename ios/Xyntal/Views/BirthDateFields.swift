import SwiftUI

/// Regeln fürs Geburtsdatum: Mindestalter 16, taggenau. Gelten für die Registrierung und die Anbieter-Anmeldung gleich.
enum BirthDateRules {
    static let minimumAge = 16
    static let underageHint = "Xyntal ist ab 16 Jahren. Sobald du 16 wirst, bist du herzlich willkommen."
    static let earliestBirthDate = Calendar.current.date(from: DateComponents(year: 1900, month: 1, day: 1)) ?? .distantPast

    /// Startwert des Rads: genau das Mindestalter zurück. Von dort ist der eigene
    /// Geburtstag meist nah, statt wie beim heutigen Datum sechzehn Jahre entfernt.
    /// Gewählt ist damit noch nichts – das Datum bleibt nil, bis jemand dreht.
    static var pickerStartDate: Date {
        Calendar.current.date(byAdding: .year, value: -minimumAge, to: Date()) ?? Date()
    }

    /// Das gewählte Datum als YYYY-MM-DD für den Server. Bewusst im lokalen Kalender
    /// und ohne Umrechnung in UTC: Gewählt wurde ein Kalendertag, kein Zeitpunkt.
    static func isoDate(_ date: Date) -> String {
        let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /// Volle Jahre, taggenau: Am Geburtstag zählt das neue Alter schon ab Tagesbeginn.
    static func age(of birthDate: Date) -> Int? {
        let calendar = Calendar.current
        return calendar.dateComponents([.year], from: calendar.startOfDay(for: birthDate), to: calendar.startOfDay(for: Date())).year
    }

    /// Gewählt und mindestens 16. Ohne Datum: false.
    static func isOldEnough(_ birthDate: Date?) -> Bool {
        guard let birthDate else { return false }
        return (age(of: birthDate) ?? 0) >= minimumAge
    }

    /// Datum gewählt, aber jünger als 16.
    static func isTooYoung(_ birthDate: Date?) -> Bool {
        birthDate != nil && !isOldEnough(birthDate)
    }
}

/// Geburtsdatum-Zeile mit Hinweis und Datumsrad. Gedacht als Inhalt einer Section; das Datum bleibt beim Aufrufer,
/// damit er es leeren oder absenden kann.
struct BirthDateFields: View {
    @Binding var birthDate: Date?
    @Binding var isPickerVisible: Bool

    private var birthDateSelection: Binding<Date> {
        Binding(get: { birthDate ?? BirthDateRules.pickerStartDate }, set: { birthDate = $0 })
    }

    private var birthDateText: String {
        birthDate?.formatted(date: .long, time: .omitted) ?? "Noch nicht gewählt"
    }

    var body: some View {
        Button {
            isPickerVisible.toggle()
        } label: {
            HStack {
                Text("Geburtsdatum")
                    .foregroundStyle(.primary)
                Spacer()
                Text(birthDateText)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityLabel("Geburtsdatum")
        .accessibilityValue(birthDateText)

        if BirthDateRules.isTooYoung(birthDate) {
            Text(BirthDateRules.underageHint)
                .foregroundStyle(.secondary)
        }

        if isPickerVisible {
            DatePicker(
                "Geburtsdatum",
                selection: birthDateSelection,
                in: BirthDateRules.earliestBirthDate...Date(),
                displayedComponents: .date
            )
            .datePickerStyle(.wheel)
            .labelsHidden()
        }
    }
}
