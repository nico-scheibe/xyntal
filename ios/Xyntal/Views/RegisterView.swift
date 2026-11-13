import SwiftUI

/// Konto anlegen ohne Einladung. Nach Erfolg ist die Sitzung wie nach dem Login aktiv.
struct RegisterView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    @State private var displayName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var passwordRepeat = ""
    /// Bewusst leer, bis der Nutzer ein Datum aktiv wählt.
    @State private var birthDate: Date?
    @State private var isBirthDatePickerVisible = false
    @State private var isWorking = false
    @State private var errorText: String?
    /// Zeigt den Button "Zur Anmeldung", wenn die E-Mail schon ein Konto hat.
    @State private var showsLoginButton = false

    @FocusState private var focusedField: Field?

    // Gleiche Grenzen wie auth/routes.ts auf dem Server (PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, DISPLAY_NAME_MAX_LENGTH).
    private static let passwordMinLength = 8
    private static let passwordMaxLength = 512
    private static let displayNameMaxLength = 80
    private static let emailMaxLength = 254

    private static let privacyURL = URL(string: "https://xyntal.de/datenschutz")!
    private static let termsURL = URL(string: "https://xyntal.de/agb")!

    private enum Field {
        case displayName
        case email
        case password
        case passwordRepeat
    }

    private var trimmedName: String {
        displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // Längen werden in UTF-16-Einheiten gezählt, wie der Server (JavaScript-String-Länge).
    private var nameIsValid: Bool {
        (1...Self.displayNameMaxLength).contains(trimmedName.utf16.count)
    }

    private var emailIsValid: Bool {
        trimmedEmail.utf16.count <= Self.emailMaxLength
            && trimmedEmail.wholeMatch(of: /^[^\s@]+@[^\s@]+\.[^\s@]+$/) != nil
    }

    private var passwordIsValid: Bool {
        (Self.passwordMinLength...Self.passwordMaxLength).contains(password.utf16.count)
    }

    /// Datum gewählt, aber jünger als 16.
    private var isTooYoung: Bool {
        BirthDateRules.isTooYoung(birthDate)
    }

    private var canSubmit: Bool {
        !isWorking
            && nameIsValid
            && emailIsValid
            && passwordIsValid
            && password == passwordRepeat
            && birthDate != nil
            && BirthDateRules.isOldEnough(birthDate)
    }

    var body: some View {
        Form {
            Section {
                TextField("Anzeigename", text: $displayName)
                    .textContentType(.name)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focusedField, equals: .displayName)
                    .onSubmit { focusedField = .email }

                TextField("E-Mail", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focusedField, equals: .email)
                    .onSubmit { focusedField = .password }

                SecureField("Passwort", text: $password)
                    .textContentType(.newPassword)
                    .submitLabel(.next)
                    .focused($focusedField, equals: .password)
                    .onSubmit { focusedField = .passwordRepeat }

                SecureField("Passwort wiederholen", text: $passwordRepeat)
                    .textContentType(.newPassword)
                    .submitLabel(.go)
                    .focused($focusedField, equals: .passwordRepeat)
                    .onSubmit { submit() }
            } header: {
                Text("Dein Konto")
            } footer: {
                Text("Das Passwort braucht mindestens \(Self.passwordMinLength) Zeichen.")
            }

            Section {
                BirthDateFields(birthDate: $birthDate, isPickerVisible: $isBirthDatePickerVisible)
            }

            // Kein Häkchen mehr: Die Zustimmung ergibt sich aus der Nutzung, so wie
            // es in den AGB steht. Hier steht nur noch der Hinweis mit den Links.
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Mit dem Erstellen deines Kontos stimmst du den AGB zu. Wie wir deine Daten verarbeiten, steht in der Datenschutzerklärung.")
                        .font(.footnote)
                        .foregroundStyle(Theme.muted)

                    HStack(spacing: 16) {
                        Link("AGB", destination: Self.termsURL)
                        Link("Datenschutzerklärung", destination: Self.privacyURL)
                    }
                    .font(.footnote)
                }
                .padding(.vertical, 2)
            }

            if let errorText {
                Section {
                    Text(errorText)
                        .foregroundStyle(.red)
                    if showsLoginButton {
                        Button("Zur Anmeldung") { dismiss() }
                    }
                }
            }

            Section {
                PrimaryButton(title: "Konto erstellen", isBusy: isWorking) {
                    submit()
                }
                .disabled(!canSubmit)
            }
        }
        .navigationTitle("Konto erstellen")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: isTooYoung) { _, nowTooYoung in
            if nowTooYoung {
                AccessibilityNotification.Announcement(BirthDateRules.underageHint).post()
            }
        }
        .onDisappear { clearSecrets() }
    }

    /// Setzt "isWorking" synchron, damit ein zweiter Tipp vor dem Start der Registrierung ignoriert wird.
    private func submit() {
        guard canSubmit else { return }
        isWorking = true
        errorText = nil
        showsLoginButton = false
        Task { await createAccount() }
    }

    private func createAccount() async {
        defer { isWorking = false }
        do {
            // Das Geburtsdatum geht als YYYY-MM-DD an den Server, der das Mindestalter von 16
            // verbindlich prüft. Die Prüfung hier in der App ist nur die freundliche Hürde davor.
            guard let birthDate else { return }
            try await session.register(email: trimmedEmail,
                                       password: password,
                                       displayName: trimmedName,
                                       birthdate: BirthDateRules.isoDate(birthDate))
            clearSecrets()
        } catch is CancellationError {
            return
        } catch AppError.accountExists(let text) {
            errorText = text
            showsLoginButton = true
        } catch {
            errorText = AppError.displayText(for: error)
        }
    }

    /// Passwörter und Geburtsdatum nur im Speicher der Ansicht. Nach Erfolg oder beim
    /// Verlassen leeren. Das Geburtsdatum gehört dazu: Es ist besonders schützenswert,
    /// gerade bei jungen Mitgliedern, und wird nach dem Absenden nicht mehr gebraucht.
    private func clearSecrets() {
        password = ""
        passwordRepeat = ""
        birthDate = nil
        isBirthDatePickerVisible = false
    }
}
