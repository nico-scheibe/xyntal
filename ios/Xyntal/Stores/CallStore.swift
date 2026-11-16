import AVFoundation
import Foundation
import Observation

/// Direktgespräche, solange die App offen ist: eingehend klingeln, starten, beitreten, auflegen.
/// Die Medien laufen in der Anruf-Seite (CallPageHost). Die Oberfläche liest nur den letzten Schnappschuss.
@MainActor
@Observable
final class CallStore {
    /// Eingehender Anruf, der klingelt. Nur bei ring == true aus dem Realtime-Kanal.
    struct Incoming: Equatable {
        let callId: String
        let conversationId: String
        let kind: String
        let callerName: String
        let callerHeadline: String
        let title: String
    }

    /// Laufender Anruf, den die App gerade zeigt (Vollbild oder minimiert).
    struct Active: Equatable {
        let callId: String
        let conversationId: String
        /// "audio" oder "video".
        let kind: String
        let title: String
        /// true, wenn ich ihn gestartet habe. Bis jemand dazukommt, heißt es dann „Klingelt …“.
        let startedByMe: Bool
    }

    private(set) var incoming: Incoming?
    private(set) var active: Active?
    private(set) var isMinimized = false
    /// Letzter Schnappschuss der Anruf-Seite. nil, solange die Seite nicht antwortet.
    private(set) var snapshot: CallPageSnapshot?
    /// Erster Moment mit stehender Verbindung. Grundlage der Zeitanzeige.
    private(set) var liveSince: Date?
    /// Wer beim Start nicht angerufen wurde. Nur die Gründe, die der Server nennt.
    private(set) var held: [CallHoldNote] = []
    private(set) var errorText: String?
    /// Laufende Anrufe je Gespräch (conversationId -> callId), für die Beitreten-Leiste.
    private(set) var runningCalls: [String: String] = [:]
    /// Die Anruf-Seite des laufenden Anrufs. nil, wenn kein Anruf läuft.
    private(set) var page: CallPageHost?

    private let session: SessionStore
    private var pollTask: Task<Void, Never>?
    private var incomingExpiry: Task<Void, Never>?
    private var busy = false
    private var lostSince: Date?
    private var lastRejoinAttempt: Date?
    private var rejoining = false

    /// Wie lange die Verbindung stehen darf, bevor der Platz neu angefragt wird.
    private static let rejoinAfter: TimeInterval = 6
    /// Mindestabstand zwischen zwei Neuanfragen eines Platzes.
    private static let rejoinInterval: TimeInterval = 5
    private static let pollInterval: Duration = .milliseconds(350)
    /// Wie lange eine eingehende Karte stehen bleibt, wenn niemand abnimmt oder auflegt. Der Server beendet das
    /// Klingeln nicht selbst (er kennt keine Klingeldauer, nur das Ereignis „ended“). 30 s entsprechen ungefähr der
    /// Zeit, in der ein Telefon klingelt, bevor die Mailbox übernimmt. Länger würde eine verpasste Karte den
    /// Eingang blockieren, obwohl der Anruf längst vorbei ist.
    private static let ringDuration: Duration = .seconds(30)

    init(session: SessionStore) {
        self.session = session
    }

    // MARK: - Realtime

    /// Ereignis aus GET /realtime/poll (type "call"). Klingelt nur bei ring == true und nur, wenn gerade kein Anruf läuft.
    func handleRealtime(_ event: RealtimeEvent) {
        guard event.type == "call", let callId = event.callId, let conversationId = event.conversationId else { return }
        switch event.action {
        case "started":
            if event.ring == true, active == nil, incoming == nil {
                presentIncoming(Incoming(callId: callId,
                                         conversationId: conversationId,
                                         kind: event.kind ?? "audio",
                                         callerName: event.callerName.nonEmptyText ?? "Jemand",
                                         callerHeadline: event.callerHeadline ?? "",
                                         title: event.conversationTitle.nonEmptyText ?? event.callerName.nonEmptyText ?? "Anruf"))
            }
            // Auch ein stiller Anruf erscheint im Gespräch (Beitreten-Leiste), er klingelt nur nicht.
            runningCalls[conversationId] = callId
        case "declined":
            // Ein Anruf, den ich selbst abgelehnt habe (auch auf einem anderen Gerät): die Karte verschwindet.
            if incoming?.callId == callId { clearIncoming() }
        case "ended":
            // Der Anruf ist vorbei: Karte und Beitreten-Leiste zu dieser ID weg, eigene Teilnahme beenden.
            if incoming?.callId == callId { clearIncoming() }
            if runningCalls[conversationId] == callId { runningCalls[conversationId] = nil }
            if active?.callId == callId { Task { await finish() } }
        default:
            break
        }
    }

    /// Fragt den laufenden Anruf eines Gesprächs ab, etwa beim Öffnen des Chats.
    func refreshRunningCall(conversationId: String) async {
        let api = session.api
        do {
            let call = try await session.withAccess { token in
                try await api.activeCall(conversationId: conversationId, token: token)
            }
            runningCalls[conversationId] = call?.isActive == true ? call?.id : nil
        } catch {
            // Netzfehler lassen die Leiste, wie sie ist. Nur eine Antwort „kein Anruf“ löscht sie.
        }
    }

    // MARK: - Starten, Beitreten, Annehmen

    /// Startet einen Anruf im Gespräch (oder nimmt den laufenden, falls es schon einen gibt).
    func startCall(conversationId: String, kind: String, title: String) async {
        guard active == nil, !busy else { return }
        busy = true
        defer { busy = false }
        errorText = nil
        let api = session.api
        do {
            let result = try await session.withAccess { token in
                try await api.startCall(conversationId: conversationId, kind: kind, token: token)
            }
            let callKind = result.call?.kind ?? kind
            held = result.held
            runningCalls[conversationId] = result.session.callId
            await begin(session: result.session,
                        active: Active(callId: result.session.callId,
                                       conversationId: conversationId,
                                       kind: callKind,
                                       title: title,
                                       startedByMe: result.joined),
                        // Eigener Videoanruf: Kamera an. Einen laufenden nur betreten: Kamera aus.
                        startCamera: result.joined && callKind == "video")
        } catch {
            errorText = AppError.displayText(for: error)
        }
    }

    /// Betritt den laufenden Anruf eines Gesprächs aus der Beitreten-Leiste. Kamera bleibt aus.
    func joinRunningCall(conversationId: String, title: String) async {
        guard active == nil, !busy, let callId = runningCalls[conversationId] else { return }
        busy = true
        defer { busy = false }
        errorText = nil
        let api = session.api
        do {
            let result = try await session.withAccess { token in
                try await api.joinCall(callId: callId, token: token)
            }
            await begin(session: result.session,
                        active: Active(callId: callId,
                                       conversationId: conversationId,
                                       kind: result.call?.kind ?? "audio",
                                       title: title,
                                       startedByMe: false),
                        startCamera: false)
        } catch {
            if let appError = error as? AppError, case .stale = appError {
                runningCalls[conversationId] = nil
            }
            errorText = AppError.displayText(for: error)
        }
    }

    /// Nimmt den eingehenden Anruf an. Beim Annehmen ist die Kamera IMMER aus, das Mikrofon an.
    func acceptIncoming() async {
        guard let call = incoming, active == nil, !busy else { return }
        busy = true
        defer { busy = false }
        clearIncoming()
        errorText = nil
        let api = session.api
        do {
            let result = try await session.withAccess { token in
                try await api.joinCall(callId: call.callId, token: token)
            }
            runningCalls[call.conversationId] = call.callId
            await begin(session: result.session,
                        active: Active(callId: call.callId,
                                       conversationId: call.conversationId,
                                       kind: call.kind,
                                       title: call.title,
                                       startedByMe: false),
                        startCamera: false)
        } catch {
            errorText = AppError.displayText(for: error)
        }
    }

    /// Lehnt den eingehenden Anruf ab. Die Karte verschwindet sofort, der Server wird danach informiert.
    func declineIncoming() async {
        guard let call = incoming else { return }
        clearIncoming()
        let api = session.api
        _ = try? await session.withAccess { token in
            try await api.declineCall(callId: call.callId, token: token)
        }
    }

    /// Karte eines eingehenden Anrufs anzeigen und nach ringDuration von selbst verfallen lassen,
    /// wenn niemand abnimmt oder auflegt. Eine neue Karte ersetzt die alte nie ohne diesen Ablauf.
    private func presentIncoming(_ call: Incoming) {
        incoming = call
        incomingExpiry?.cancel()
        incomingExpiry = Task { [weak self] in
            try? await Task.sleep(for: Self.ringDuration)
            guard !Task.isCancelled, let self, self.incoming?.callId == call.callId else { return }
            self.incoming = nil
            self.incomingExpiry = nil
        }
    }

    private func clearIncoming() {
        incoming = nil
        incomingExpiry?.cancel()
        incomingExpiry = nil
    }

    // MARK: - Bedienung

    func setMuted(_ muted: Bool) { page?.command("mute", muted) }
    func setCamera(_ on: Bool) { page?.command("camera", on) }

    /// Minimieren: der Anruf läuft weiter, oben erscheint die Rückkehr-Leiste.
    func minimize() {
        guard active != nil else { return }
        isMinimized = true
    }

    func restore() {
        isMinimized = false
    }

    /// Auflegen. Der Server beendet den Anruf, wenn ich der Letzte bin.
    func hangUp() async {
        await finish()
    }

    /// Abmelden während eines Anrufs. Läuft vor dem Entfernen des Tokens, damit der Platz noch abgegeben werden kann.
    func releaseForSignOut() async {
        await finish(signingOut: true)
    }

    /// Sitzung ist beendet (Abmelden, Kontolöschung, abgelaufenes Token). Läuft synchron, damit Mikrofon und Kamera
    /// sofort aus sind, auch wenn kein Netz oder kein Token mehr da ist. Ist noch ein Token da, wird der Platz im
    /// Hintergrund abgegeben. Mehrfacher Aufruf ist harmlos.
    func sessionEnded(token: String?) {
        clearIncoming()
        let ended = stopLocally()
        // Der Zustand gehört der Sitzung: Beitreten-Leiste, Hinweise und Fehler aus der vorigen Sitzung bleiben nicht stehen.
        runningCalls.removeAll()
        held = []
        errorText = nil
        guard let ended, let token else { return }
        let api = session.api
        Task { _ = try? await api.leaveCall(callId: ended.callId, token: token) }
    }

    // MARK: - Ablauf

    /// Richtet Audio ein, lädt die Seite und übergibt die Sitzung. Die Abfrage läuft danach im Takt.
    private func begin(session payload: CallSessionPayload, active newActive: Active, startCamera: Bool) async {
        // Während des Netzaufrufs davor kann die Sitzung geendet haben. Dann startet hier nichts mehr.
        guard active == nil, session.state == .signedIn else { return }
        configureAudioSession(video: newActive.kind == "video")
        let host = CallPageHost()
        active = newActive
        page = host
        isMinimized = false
        snapshot = nil
        liveSince = nil
        lostSince = nil
        startPolling(host)
        do {
            try await host.load()
            try await host.start(sessionJSON: payload.json,
                                 prefs: Self.prefs(startCamera: startCamera, ringing: newActive.startedByMe))
            // Sicherheitshalber: Ist die Kamera aus, schalten wir sie nach dem Start ausdrücklich aus.
            if !startCamera {
                try await host.commandAndWait("camera", false)
            }
        } catch {
            errorText = AppError.displayText(for: error)
            await finish()
        }
    }

    /// Beendet den Anruf auf dieser Seite und gibt den Platz beim Server ab (sofern gewünscht und möglich).
    /// releaseSeat false, wenn der Platz schon an ein anderes Gerät gegangen ist ("replaced"): dann nicht abmelden.
    /// signingOut true nur beim Abmelden: Die Beitreten-Leiste ist danach bedeutungslos, und die Sitzung soll nicht
    /// auf das Netz warten. Deshalb keine Nachfrage und nur 3 s Zeitgrenze für den Abgabe-Aufruf.
    private func finish(releaseSeat: Bool = true, signingOut: Bool = false) async {
        guard let ended = stopLocally(), releaseSeat else { return }
        let api = session.api
        _ = try? await session.withAccess { token in
            try await api.leaveCall(callId: ended.callId, token: token, timeout: signingOut ? 3 : 20)
        }
        if !signingOut {
            // Der Anruf kann ohne mich weiterlaufen. Deshalb nachfragen, damit die Beitreten-Leiste wieder erscheint.
            await refreshRunningCall(conversationId: ended.conversationId)
        }
    }

    /// Alles, was ohne Netz geht: Medien stoppen (Seite leeren), Audio loslassen, Zustand zurücksetzen.
    /// Gibt den beendeten Anruf zurück, nil wenn keiner lief.
    private func stopLocally() -> Active? {
        guard let ended = active else { return nil }
        let host = page
        pollTask?.cancel()
        pollTask = nil
        active = nil
        page = nil
        snapshot = nil
        liveSince = nil
        lostSince = nil
        isMinimized = false
        held = []
        runningCalls[ended.conversationId] = nil
        host?.command("hangUp", false)
        host?.close()
        deactivateAudioSession()
        return ended
    }

    private func startPolling(_ host: CallPageHost) {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self, self.page === host else { return }
                await self.readSnapshot(from: host)
                try? await Task.sleep(for: Self.pollInterval)
            }
        }
    }

    private func readSnapshot(from host: CallPageHost) async {
        guard let json = await host.snapshotJSON(),
              let snap = try? JSONDecoder().decode(CallPageSnapshot.self, from: Data(json.utf8)),
              page === host else { return }
        snapshot = snap
        if snap.status == "live", liveSince == nil {
            liveSince = Date()
        }
        if snap.status == "ended" {
            // "replaced": dasselbe Konto ist jetzt mit einem anderen Gerät im Anruf. Abmelden würde dieses Gerät rauswerfen.
            let replaced = snap.events.contains { $0.type == "replaced" }
            await finish(releaseSeat: !replaced)
            return
        }
        guard snap.status == "lost" else {
            lostSince = nil
            return
        }
        if lostSince == nil { lostSince = Date() }
        guard !rejoining, let since = lostSince, Date().timeIntervalSince(since) > Self.rejoinAfter,
              Date().timeIntervalSince(lastRejoinAttempt ?? .distantPast) > Self.rejoinInterval else { return }
        rejoining = true
        lastRejoinAttempt = Date()
        await rejoin()
        rejoining = false
    }

    /// Verlorener Sitz: einen neuen anfragen und der Seite übergeben. Ist der Anruf inzwischen vorbei, endet er hier.
    private func rejoin() async {
        guard let current = active, let host = page else { return }
        let api = session.api
        do {
            let result = try await session.withAccess { token in
                try await api.joinCall(callId: current.callId, token: token)
            }
            try await host.resume(sessionJSON: result.session.json)
            lostSince = nil
        } catch {
            if let appError = error as? AppError, case .stale = appError {
                await finish()
            }
        }
    }

    // MARK: - Audio

    /// Gespräch: Hörer bei reiner Sprache, Lautsprecher bei Video. Die Berechtigungen fragt das System beim ersten Mal selbst.
    private func configureAudioSession(video: Bool) {
        let audio = AVAudioSession.sharedInstance()
        do {
            try audio.setCategory(.playAndRecord,
                                  mode: video ? .videoChat : .voiceChat,
                                  options: video ? [.defaultToSpeaker, .allowBluetoothHFP] : [.allowBluetoothHFP])
            try audio.setActive(true)
        } catch {
            errorText = "Die Tonwiedergabe konnte nicht gestartet werden. Bitte versuche es erneut."
        }
    }

    private func deactivateAudioSession() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private static func prefs(startCamera: Bool, ringing: Bool) -> [String: Any] {
        [
            "lang": "de",
            "startCamera": startCamera,
            "startMuted": false,
            "startDeafened": false,
            "ringing": ringing,
            "members": [String](),
            "volumes": [String: Any](),
            "inputVolume": 1,
            "outputVolume": 1,
            "inputId": "",
            "outputId": "",
            "cameraId": ""
        ]
    }
}
