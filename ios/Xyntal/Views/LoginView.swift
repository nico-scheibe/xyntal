import AuthenticationServices
import SwiftUI

struct LoginView: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.colorScheme) private var colorScheme

    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    /// Wird eingeblendet, sobald der Server einen 2FA-Code verlangt.
    @State private var needsCode = false
    @State private var isWorking = false
    @State private var errorText: String?
    /// Öffentliche Community als Gast, ohne Konto.
    @State private var showsCommunity = false

    /// Anbieter, die der Server gerade meldet. nil, solange die Konfiguration lädt oder nicht lesbar war: dann gibt es keine Anbieter-Knöpfe.
    @State private var providers: OAuthProviderAvailability?
    /// Eine Anbieter-Anmeldung läuft (Apple-Dialog, Web-Fenster oder Server).
    @State private var isExternalWorking = false
    /// Roher Nonce der laufenden Apple-Anmeldung. Wird beim Start der Apple-Anfrage gesetzt.
    @State private var appleNonce: String?
    /// Anbieter-Anmeldung, die einen 2FA-Code verlangt. Der Code geht dann an /complete statt an die Passwort-Anmeldung.
    @State private var pendingExternal: PendingExternalTwoFactor?
    /// Erste Anmeldung über einen Anbieter ohne Konto: das Geburtsdatum wird im Blatt abgefragt.
    @State private var birthDateRequest: PendingExternalBirthDate?
    @State private var webSignIn = WebSignInRunner()

    @FocusState private var focusedField: Field?

    private enum Field {
        case email
        case password
        case code
    }

    private var canSubmit: Bool {
        guard !isWorking, !isExternalWorking else { return false }
        let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        // Anbieter-2FA: E-Mail und Passwort sind gesperrt, also zählt nur der Code.
        if pendingExternal != nil {
            return !trimmedCode.isEmpty
        }
        // Passwort-Anmeldung, ggf. mit 2FA-Code.
        return !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !password.isEmpty
            && (!needsCode || !trimmedCode.isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("E-Mail", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .focused($focusedField, equals: .email)
                        .onSubmit { focusedField = .password }
                        .disabled(pendingExternal != nil)

                    SecureField("Passwort", text: $password)
                        .textContentType(.password)
                        .submitLabel(needsCode ? .next : .go)
                        .focused($focusedField, equals: .password)
                        .onSubmit {
                            if needsCode {
                                focusedField = .code
                            } else {
                                submit()
                            }
                        }
                        .disabled(pendingExternal != nil)

                    if needsCode {
                        TextField("Zwei-Faktor-Code", text: $code)
                            .textContentType(.oneTimeCode)
                            .keyboardType(.numberPad)
                            .submitLabel(.go)
                            .focused($focusedField, equals: .code)
                            .onSubmit { submit() }
                    }
                }

                if let message = errorText ?? session.notice {
                    Section {
                        Text(message)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    PrimaryButton(title: "Anmelden", isBusy: isWorking) {
                        submit()
                    }
                    .disabled(!canSubmit)
                }

                if let providers, providers.apple || providers.google || providers.discord {
                    Section {
                        ExternalSignInDivider()

                        if providers.apple {
                            SignInWithAppleButton(.signIn, onRequest: prepareAppleRequest, onCompletion: finishAppleSignIn)
                                .signInWithAppleButtonStyle(colorScheme == .dark ? .white : .black)
                                .frame(height: 50)
                                .disabled(isExternalWorking)
                        }

                        if providers.google {
                            Button {
                                startWebSignIn(.google)
                            } label: {
                                Text("Mit Google anmelden")
                            }
                            .buttonStyle(ProviderSignInButtonStyle(provider: .google))
                            .disabled(isExternalWorking)
                        }

                        if providers.discord {
                            Button {
                                startWebSignIn(.discord)
                            } label: {
                                Text("Mit Discord anmelden")
                            }
                            .buttonStyle(ProviderSignInButtonStyle(provider: .discord))
                            .disabled(isExternalWorking)
                        }
                    }
                }

                Section {
                    NavigationLink("Konto erstellen") {
                        RegisterView()
                    }
                }
            }
            // Unauffällige Fußzeile am unteren Bildschirmrand statt mitten im Formular.
            .safeAreaInset(edge: .bottom) {
                Button("Community ansehen – ohne Konto") {
                    showsCommunity = true
                }
                .font(.footnote)
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .navigationTitle("Xyntal")
            .sheet(isPresented: $showsCommunity) {
                CommunityView(onDone: { showsCommunity = false })
            }
            .sheet(item: $birthDateRequest) { request in
                ExternalBirthDateSheet(request: request) { text in
                    // Zu jung: Der Ablauf endet, der Hinweis steht im Anmeldeblatt.
                    errorText = text
                    AccessibilityNotification.Announcement(text).post()
                }
            }
            .task {
                providers = try? await session.api.authConfig()
            }
        }
    }

    /// Setzt "isWorking" synchron, damit ein zweiter Tipp vor dem Start der Anmeldung ignoriert wird.
    private func submit() {
        guard canSubmit else { return }
        if let pending = pendingExternal {
            completePendingExternalSignIn(pending)
            return
        }
        isWorking = true
        errorText = nil
        Task { await signIn() }
    }

    private func signIn() async {
        defer { isWorking = false }
        do {
            try await session.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password,
                code: needsCode ? code.trimmingCharacters(in: .whitespacesAndNewlines) : nil
            )
            password = ""
            code = ""
        } catch is CancellationError {
            return
        } catch AppError.twoFactor(let text, _) {
            // Das Passwort bleibt stehen, damit nur der Code nachgereicht werden muss.
            needsCode = true
            errorText = text
        } catch {
            errorText = AppError.displayText(for: error)
        }
    }

    // MARK: - Anbieter-Anmeldung

    /// Apple-Anfrage: frischer Nonce. An Apple geht nur sein SHA256, den Rohwert behält die App bis zur Antwort.
    private func prepareAppleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let rawNonce = ExternalSignInSupport.makeRawNonce()
        appleNonce = rawNonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = ExternalSignInSupport.sha256Hex(rawNonce)
    }

    private func finishAppleSignIn(_ result: Result<ASAuthorization, Error>) {
        let pendingNonce = appleNonce
        appleNonce = nil
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let identityToken = String(data: tokenData, encoding: .utf8),
                  let rawNonce = pendingNonce else {
                errorText = AppError.genericMessage
                return
            }
            beginExternalSignIn()
            Task {
                await finishExternalSignIn(.apple) {
                    try await session.api.appleLogin(identityToken: identityToken, rawNonce: rawNonce)
                }
            }
        case .failure(let error):
            // Abbruch im Apple-Dialog ist kein Fehler.
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            errorText = AppError.displayText(for: error)
        }
    }

    /// Google und Discord: Startadresse holen, Web-Anmeldung, Code an den Server zum Abschluss geben.
    private func startWebSignIn(_ provider: ExternalSignInProvider) {
        beginExternalSignIn()
        Task {
            await finishExternalSignIn(provider) {
                let startURL = try await session.api.oauthStartURL(provider: provider)
                let callbackURL = try await webSignIn.run(url: startURL)
                let (authCode, state) = try ExternalSignInSupport.codeAndState(from: callbackURL)
                return try await session.api.oauthCallback(provider: provider, code: authCode, state: state)
            }
        }
    }

    /// Zweiter Schritt nach 2FA: der eingegebene Code geht mit dem Ticket an /complete.
    private func completePendingExternalSignIn(_ pending: PendingExternalTwoFactor) {
        let enteredCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        isExternalWorking = true
        errorText = nil
        Task {
            await finishExternalSignIn(pending.provider) {
                try await session.api.completeExternalLogin(provider: pending.provider,
                                                            ticket: pending.ticket,
                                                            code: enteredCode)
            }
        }
    }

    /// Setzt den Zustand zurück, bevor eine neue Anbieter-Anmeldung startet.
    private func beginExternalSignIn() {
        errorText = nil
        pendingExternal = nil
        needsCode = false
        code = ""
        isExternalWorking = true
    }

    /// Gemeinsamer Abschluss: Token speichern, oder bei 2FA das Code-Feld zeigen. Abbruch durch den Nutzer bleibt ohne Meldung.
    private func finishExternalSignIn(_ provider: ExternalSignInProvider, _ work: () async throws -> String) async {
        defer { isExternalWorking = false }
        do {
            let token = try await work()
            try await session.signIn(withToken: token)
            pendingExternal = nil
            code = ""
        } catch is CancellationError {
            return
        } catch AppError.twoFactor(let text, let ticket?) {
            pendingExternal = PendingExternalTwoFactor(provider: provider, ticket: ticket)
            needsCode = true
            errorText = text
        } catch AppError.birthDateRequired(_, let ticket?) {
            // Kein Konto für diese Anmeldung: Das Blatt fragt das Geburtsdatum ab und schließt den Abschluss mit dem Fahrschein.
            birthDateRequest = PendingExternalBirthDate(provider: provider, ticket: ticket)
        } catch {
            errorText = AppError.displayText(for: error)
        }
    }
}

/// Anbieter-Anmeldung wartet auf den 2FA-Code. Das Ticket gehört zu diesem Anbieter und läuft beim Server ab.
private struct PendingExternalTwoFactor {
    let provider: ExternalSignInProvider
    let ticket: String
}

/// Erste Anmeldung über einen Anbieter wartet auf das Geburtsdatum. Der Fahrschein gehört zu diesem Anbieter.
/// Schließt der Nutzer das Blatt, ist der Fahrschein mit dem Blatt verworfen.
private struct PendingExternalBirthDate: Identifiable {
    let provider: ExternalSignInProvider
    let ticket: String

    var id: String { ticket }
}

/// Blatt für das Geburtsdatum bei der ersten Anmeldung über einen Anbieter. Abbrechen oder Wischen verwirft den Fahrschein ohne Meldung.
private struct ExternalBirthDateSheet: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    let provider: ExternalSignInProvider
    /// Wird ersetzt, wenn der Server das Datum noch einmal verlangt und einen neuen Fahrschein gibt.
    @State private var ticket: String
    @State private var birthDate: Date?
    @State private var isPickerVisible = false
    @State private var isWorking = false
    @State private var errorText: String?
    /// Der Server lehnt wegen des Alters ab. Der Aufrufer zeigt den Hinweis im Anmeldeblatt.
    let onUnderage: (String) -> Void

    init(request: PendingExternalBirthDate, onUnderage: @escaping (String) -> Void) {
        provider = request.provider
        _ticket = State(initialValue: request.ticket)
        self.onUnderage = onUnderage
    }

    private var canSubmit: Bool {
        !isWorking && BirthDateRules.isOldEnough(birthDate)
    }

    private var isTooYoung: Bool {
        BirthDateRules.isTooYoung(birthDate)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Dein Konto ist noch nicht angelegt. Dafür brauchen wir dein Geburtsdatum.")
                        .foregroundStyle(.secondary)
                }

                Section {
                    BirthDateFields(birthDate: $birthDate, isPickerVisible: $isPickerVisible)
                }

                if let errorText {
                    Section {
                        Text(errorText)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    PrimaryButton(title: "Konto erstellen", isBusy: isWorking) {
                        submit()
                    }
                    .disabled(!canSubmit)
                }
            }
            .navigationTitle("Geburtsdatum")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                        .disabled(isWorking)
                }
            }
            .onChange(of: isTooYoung) { _, nowTooYoung in
                if nowTooYoung {
                    AccessibilityNotification.Announcement(BirthDateRules.underageHint).post()
                }
            }
        }
        // Während der Server antwortet, kein Wischen: sonst läuft der Abschluss im Hintergrund weiter.
        .interactiveDismissDisabled(isWorking)
    }

    /// Setzt "isWorking" synchron, damit ein zweiter Tipp vor dem Start des Abschlusses ignoriert wird.
    private func submit() {
        guard canSubmit, let birthDate else { return }
        isWorking = true
        errorText = nil
        Task { await signUp(birthDate: birthDate) }
    }

    /// Abschluss mit Fahrschein und Geburtsdatum. Bei Erfolg wie nach /callback angemeldet.
    private func signUp(birthDate: Date) async {
        defer { isWorking = false }
        do {
            let token = try await session.api.signupExternal(provider: provider,
                                                            ticket: ticket,
                                                            birthdate: BirthDateRules.isoDate(birthDate))
            try await session.signIn(withToken: token)
            dismiss()
        } catch is CancellationError {
            return
        } catch AppError.birthDateRequired(_, let newTicket?) {
            // Der Server verlangt das Datum noch einmal und gibt einen neuen Fahrschein. Den übernehmen, das Blatt bleibt offen.
            ticket = newTicket
            errorText = "Bitte gib dein Geburtsdatum noch einmal ein."
        } catch AppError.underage(let text) {
            // Unter 16: Der Ablauf endet hier. Das Blatt schließt, der Fahrschein ist verworfen, der Hinweis steht im Anmeldeblatt.
            onUnderage(text)
            dismiss()
        } catch {
            errorText = AppError.displayText(for: error)
        }
    }
}

/// Trennlinie zwischen E-Mail-Anmeldung und Anbietern. Rein optisch, VoiceOver überspringt sie.
private struct ExternalSignInDivider: View {
    var body: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(Theme.muted.opacity(0.4))
                .frame(height: 1)
            Text("oder")
                .font(.footnote)
                .foregroundStyle(Theme.muted)
            Rectangle()
                .fill(Theme.muted.opacity(0.4))
                .frame(height: 1)
        }
        .accessibilityHidden(true)
    }
}
