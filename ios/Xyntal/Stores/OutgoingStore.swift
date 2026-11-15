import Foundation
import Observation
import UIKit

/// Tarifgrenzen aus GET /billing. nil heißt: noch nicht geladen. Ein Feld nil heißt: unbegrenzt oder unbekannt.
struct UploadLimits: Equatable {
    let perFile: Int?
    let storage: Int?
}

/// Wohin eine ausstehende Nachricht geht: in ein Gespräch (Chat) oder als Beitrag in einen Community-Kanal.
/// Der Upload ist für beide gleich, unterschieden wird erst beim letzten Schritt des Versands.
enum OutgoingTarget: Hashable {
    case conversation(String)
    case channel(String)
}

/// Fehler des Versands, die eine eigene Meldung brauchen. Der Anhang steht dabei im Text.
enum OutgoingProblem: Error {
    case tooLarge(String)
    case storageFull
}

/// Eine eigene Nachricht mit Anhängen, die gerade hochlädt, fehlgeschlagen ist oder schon angekommen ist.
/// Sie steht unten im Verlauf, bis der Server sie als Nachricht zurückgibt.
@MainActor
@Observable
final class OutgoingMessage: Identifiable {
    enum State: Equatable {
        case sending
        case failed
        case delivered
    }

    let id = UUID()
    let target: OutgoingTarget
    /// Anmeldung, in der die Nachricht entstanden ist. Nach Abmelden oder Kontowechsel ist sie nicht mehr sichtbar.
    let sessionId: UUID
    let body: String
    let replyToId: String?
    let attachments: [ComposerAttachment]
    /// Länge in Millisekunden, wenn es eine Sprachnachricht ist. Der eine Anhang ist dann die Aufnahme.
    let voiceDurationMs: Int?

    private(set) var state: State = .sending
    /// Meldung zum Fehler, im Dialog "Nachricht nicht gesendet".
    private(set) var failureText: String?
    /// Anteil je Anhang, 0...1. Speist die Fortschrittsringe.
    private(set) var progress: [UUID: Double] = [:]

    /// Upload-Sitzungen und Ids fertiger Dateien. Bleiben beim erneuten Senden erhalten, damit dort weitergemacht wird.
    fileprivate(set) var tickets: [UUID: UploadTicket] = [:]
    fileprivate(set) var fileIds: [UUID: String] = [:]
    private var confirmedParts: [UUID: Set<Int>] = [:]
    private var announcedStep = 0
    /// Gesetzt, wenn der Nutzer abgebrochen oder verworfen hat. Dann meldet der Versand keinen Fehler mehr.
    fileprivate var wasCancelled = false
    fileprivate var task: Task<Void, Never>?

    init(target: OutgoingTarget, sessionId: UUID, body: String, replyToId: String?, attachments: [ComposerAttachment], voiceDurationMs: Int?) {
        self.target = target
        self.sessionId = sessionId
        self.body = body
        self.replyToId = replyToId
        self.attachments = attachments
        self.voiceDurationMs = voiceDurationMs
    }

    /// Gesamtanteil über alle Anhänge, nach Größe gewichtet.
    var totalProgress: Double {
        let total = attachments.reduce(0) { $0 + $1.size }
        guard total > 0 else { return 0 }
        let sent = attachments.reduce(0.0) { $0 + Double($1.size) * (progress[$1.id] ?? 0) }
        return min(1, sent / Double(total))
    }

    // MARK: - Vom Store gesteuert

    /// true, sobald die abschließende Anfrage (Nachricht oder Beitrag) abgesetzt ist. Ab dann gibt es keinen
    /// Abbrechen-Knopf mehr: Der Server kann die Nachricht dann schon annehmen. Vorher bleibt Abbrechen erreichbar.
    private(set) var isSubmitting = false

    fileprivate func beginSubmitting() {
        isSubmitting = true
    }

    fileprivate func beginAttempt() {
        state = .sending
        isSubmitting = false
        failureText = nil
        announcedStep = 0
        UIAccessibility.post(notification: .announcement, argument: "Wird gesendet")
    }

    fileprivate func confirmedIndices(for attachmentId: UUID) -> Set<Int> {
        confirmedParts[attachmentId] ?? []
    }

    fileprivate func recordConfirmed(_ index: Int, of attachment: ComposerAttachment, chunkSize: Int) {
        confirmedParts[attachment.id, default: []].insert(index)
        let bytes = (confirmedParts[attachment.id] ?? []).reduce(0) { sum, part in
            sum + min(chunkSize, attachment.size - part * chunkSize)
        }
        progress[attachment.id] = min(1, Double(bytes) / Double(max(attachment.size, 1)))
        announceProgress()
    }

    fileprivate func markCompleted(_ attachment: ComposerAttachment) {
        progress[attachment.id] = 1
        tickets[attachment.id] = nil
    }

    /// Die Sitzung ist auf dem Server verloren: alles für diesen Anhang beginnt von vorn.
    fileprivate func forgetUpload(_ attachmentId: UUID) {
        tickets[attachmentId] = nil
        confirmedParts[attachmentId] = nil
        progress[attachmentId] = 0
    }

    fileprivate func setTicket(_ ticket: UploadTicket, for attachmentId: UUID) {
        tickets[attachmentId] = ticket
    }

    fileprivate func markDelivered() {
        state = .delivered
        failureText = nil
        UIAccessibility.post(notification: .announcement, argument: "Gesendet")
    }

    fileprivate func markFailed(_ text: String) {
        state = .failed
        failureText = text
        UIAccessibility.post(notification: .announcement, argument: "Senden fehlgeschlagen")
    }

    /// Ansage bei 25, 50 und 75 Prozent. Jede Stufe nur einmal.
    private func announceProgress() {
        let percent = Int(totalProgress * 100)
        let step = (percent / 25) * 25
        guard step > announcedStep, step < 100 else { return }
        announcedStep = step
        UIAccessibility.post(notification: .announcement, argument: "Wird gesendet, \(step) Prozent")
    }
}

/// Hält alle ausstehenden Nachrichten mit Anhängen, App-weit. Der Upload läuft weiter, auch wenn der Chat
/// verlassen wird, solange die App offen ist. Nur die Chatansicht des Gesprächs zeigt die Nachricht.
@MainActor
@Observable
final class OutgoingStore {
    private let session: SessionStore
    private(set) var messages: [OutgoingMessage] = []
    /// Zähler je Ziel. Steigt, sobald eine Nachricht angekommen ist, damit die Chat- oder Kanalansicht neu lädt.
    private(set) var deliveredEvents: [OutgoingTarget: Int] = [:]
    /// Tarifgrenzen. nil, solange sie nicht geladen sind.
    private(set) var limits: UploadLimits?

    init(session: SessionStore) {
        self.session = session
        // Beim Abmelden läuft das Token noch: dann lassen sich die offenen Upload-Sitzungen freigeben.
        session.onSessionEnding = { [weak self] token in
            self?.releaseUploads(token: token)
        }
    }

    /// Gibt die offenen Upload-Sitzungen auf dem Server frei, solange das Token noch gilt. Läuft im Hintergrund und wird
    /// nicht abgewartet: Scheitert es (kein Netz, Server antwortet nicht), hält es die Abmeldung weder auf noch verzögert es sie.
    /// Eine verwaiste Sitzung räumt der Server irgendwann ab.
    private func releaseUploads(token: String) {
        let tickets = messages.flatMap { Array($0.tickets.values) }
        guard !tickets.isEmpty else { return }
        let api = session.api
        Task {
            for ticket in tickets {
                _ = try? await api.abortUpload(uploadId: ticket.id, token: token)
            }
        }
    }

    /// Hinweise nach dem Abbrechen, je Ziel. Der Nutzer blendet sie aus.
    private(set) var notices: [OutgoingTarget: String] = [:]

    /// Ausstehende Nachrichten eines Ziels der aktuellen Anmeldung. Zugestellte fehlen, die lädt der Verlauf oder der Kanal schon.
    /// Nachrichten einer früheren Anmeldung bleiben unsichtbar, auch wenn sie noch im Speicher liegen.
    func messages(for target: OutgoingTarget) -> [OutgoingMessage] {
        messages.filter { $0.target == target && $0.sessionId == session.sessionId && $0.state != .delivered }
    }

    func notice(for target: OutgoingTarget) -> String? {
        notices[target]
    }

    func dismissNotice(for target: OutgoingTarget) {
        notices[target] = nil
    }

    /// Verwirft alles Ausstehende. Aufruf beim Abmelden und beim Löschen des Kontos, sobald das Token weg ist.
    /// Laufende Versände werden gestoppt und die Anhang-Dateien gelöscht, damit der nächste Nutzer nichts davon sieht.
    func clear() {
        for message in messages {
            stop(message)
            for attachment in message.attachments {
                AttachmentFiles.remove(attachment.fileURL)
            }
        }
        messages = []
        deliveredEvents = [:]
        notices = [:]
    }

    /// Liest die Tarifgrenzen neu aus GET /billing. Schlägt der Abruf fehl, bleibt der alte Stand.
    func refreshLimits() async {
        guard let info = try? await session.withAccess({ token in try await session.api.billing(token: token) }) else {
            return
        }
        limits = UploadLimits(perFile: info.maxUploadBytes, storage: info.storageBytes)
    }

    /// Startet den Versand. false, wenn gerade keine Verbindung besteht: dann ist nichts gestartet, und die
    /// Anhänge bleiben beim Aufrufer.
    func submit(target: OutgoingTarget, body: String, replyToId: String?, attachments: [ComposerAttachment], voiceDurationMs: Int? = nil) -> Bool {
        guard NetworkReachability.shared.isOnline else { return false }
        let message = OutgoingMessage(target: target, sessionId: session.sessionId, body: body, replyToId: replyToId,
                                      attachments: attachments, voiceDurationMs: voiceDurationMs)
        messages.append(message)
        start(message)
        return true
    }

    /// Erneut senden: macht dort weiter, wo der Upload stand.
    func retry(_ message: OutgoingMessage) {
        guard message.state == .failed, messages.contains(where: { $0.id == message.id }) else { return }
        guard NetworkReachability.shared.isOnline else {
            message.markFailed(AttachmentRules.offlineText)
            return
        }
        start(message)
    }

    /// Abbrechen während des Sendens. Der Upload stoppt, die Anhänge und der Text kommen zurück in die Eingabe.
    func cancel(_ message: OutgoingMessage) -> (attachments: [ComposerAttachment], body: String) {
        stop(message)
        messages.removeAll { $0.id == message.id }
        return (message.attachments, message.body)
    }

    /// Löschen nach einem Fehler. Die Anhänge sind dann weg.
    func discard(_ message: OutgoingMessage) {
        stop(message)
        messages.removeAll { $0.id == message.id }
        for attachment in message.attachments {
            AttachmentFiles.remove(attachment.fileURL)
        }
    }

    /// Entfernt zugestellte Nachrichten eines Ziels, sobald der Verlauf oder der Kanal sie selbst zeigt.
    func dropDelivered(for target: OutgoingTarget) {
        messages.removeAll { $0.target == target && $0.state == .delivered }
    }

    /// Satz für den Fall, dass der Versand nach dem Abbrechen doch angekommen ist. Im Chat und im Kanal ist er verschieden.
    private static func acceptedAfterCancelText(for target: OutgoingTarget) -> String {
        switch target {
        case .conversation:
            return "Die Nachricht war schon abgeschickt und steht jetzt im Verlauf."
        case .channel:
            return "Der Beitrag war schon abgeschickt und steht jetzt im Kanal."
        }
    }

    // MARK: - Versand

    private func start(_ message: OutgoingMessage) {
        message.beginAttempt()
        message.task = Task { await run(message) }
    }

    /// Stoppt den Versand und gibt die Upload-Sitzungen auf dem Server frei. Das ist best effort.
    private func stop(_ message: OutgoingMessage) {
        message.wasCancelled = true
        message.task?.cancel()
        message.task = nil
        for ticket in message.tickets.values {
            Task {
                _ = try? await session.withAccess { token in
                    try await session.api.abortUpload(uploadId: ticket.id, token: token)
                }
            }
        }
    }

    private func run(_ message: OutgoingMessage) async {
        do {
            for attachment in message.attachments where message.fileIds[attachment.id] == nil {
                message.fileIds[attachment.id] = try await upload(attachment, in: message)
            }
            let ids = message.attachments.compactMap { message.fileIds[$0.id] }
            // Ab hier ist die Anfrage auf dem Weg: Der Abbrechen-Knopf verschwindet. Bis hierher war Abbrechen möglich.
            message.beginSubmitting()
            // Nur dieser letzte Schritt unterscheidet Chat und Community. Den Upload davor teilen sich beide.
            try await session.withAccess { token in
                switch message.target {
                case .conversation(let conversationId):
                    try await session.api.sendAttachmentMessage(conversationId: conversationId,
                                                                body: message.body,
                                                                replyToId: message.replyToId,
                                                                attachmentIds: ids,
                                                                voiceDurationMs: message.voiceDurationMs,
                                                                token: token)
                case .channel(let channelId):
                    // Beiträge haben keine Antwort und keine Sprachnachricht.
                    try await session.api.sendChannelPost(channelId: channelId,
                                                          body: message.body,
                                                          attachmentIds: ids,
                                                          token: token)
                }
            }
            if message.wasCancelled {
                // Angekommen, obwohl der Nutzer schon abgebrochen hat. Die Anhänge liegen dann in der Eingabe
                // und ihre Dateien werden gebraucht, also bleiben sie. Der Nutzer sieht, dass es schon abgeschickt ist.
                notices[message.target] = Self.acceptedAfterCancelText(for: message.target)
            } else {
                for attachment in message.attachments {
                    AttachmentFiles.remove(attachment.fileURL)
                }
            }
            message.markDelivered()
            deliveredEvents[message.target, default: 0] += 1
        } catch is CancellationError {
            return
        } catch {
            guard !message.wasCancelled else { return }
            message.markFailed(failureText(for: error, target: message.target))
        }
    }

    /// Ein Anhang: Sitzung eröffnen, fehlende Teile hochladen, abschließen. Bei verlorener Sitzung einmal von vorn.
    private func upload(_ attachment: ComposerAttachment, in message: OutgoingMessage) async throws -> String {
        do {
            return try await uploadOnce(attachment, in: message)
        } catch AppError.uploadExpired {
            message.forgetUpload(attachment.id)
            return try await uploadOnce(attachment, in: message)
        } catch AppError.attachmentTooLarge {
            throw OutgoingProblem.tooLarge(attachment.name)
        } catch AppError.storageFull {
            throw OutgoingProblem.storageFull
        }
    }

    private func uploadOnce(_ attachment: ComposerAttachment, in message: OutgoingMessage) async throws -> String {
        let ticket: UploadTicket
        if let existing = message.tickets[attachment.id] {
            ticket = existing
        } else {
            ticket = try await session.withAccess { token in
                try await session.api.startUpload(name: attachment.name,
                                                  mimeType: attachment.mimeType,
                                                  size: attachment.size,
                                                  token: token)
            }
            message.setTicket(ticket, for: attachment.id)
        }
        let chunkSize = max(1, ticket.chunkSize)
        let count = (attachment.size + chunkSize - 1) / chunkSize
        let confirmed = message.confirmedIndices(for: attachment.id)
        var iterator = (0..<count).filter { !confirmed.contains($0) }.makeIterator()
        var inFlight = 0

        try await withThrowingTaskGroup(of: Int.self) { group in
            while inFlight < max(1, ticket.parallel), let index = iterator.next() {
                group.addTask { try await self.sendPart(index, of: attachment, ticket: ticket) }
                inFlight += 1
            }
            while let index = try await group.next() {
                inFlight -= 1
                message.recordConfirmed(index, of: attachment, chunkSize: chunkSize)
                if let next = iterator.next() {
                    group.addTask { try await self.sendPart(next, of: attachment, ticket: ticket) }
                    inFlight += 1
                }
            }
        }

        let fileId = try await session.withAccess { token in
            try await session.api.completeUpload(uploadId: ticket.id, token: token)
        }
        message.markCompleted(attachment)
        return fileId
    }

    /// Ein Teil der Datei hochladen. Gibt den Index zurück, wenn der Server ihn bestätigt hat.
    private func sendPart(_ index: Int, of attachment: ComposerAttachment, ticket: UploadTicket) async throws -> Int {
        let offset = index * ticket.chunkSize
        let length = min(ticket.chunkSize, attachment.size - offset)
        let url = attachment.fileURL
        let data = try await Task.detached(priority: .utility) {
            try AttachmentFiles.readPart(url, offset: offset, length: length)
        }.value
        try await session.withAccess { token in
            try await session.api.uploadPart(uploadId: ticket.id, index: index, data: data, token: token)
        }
        return index
    }

    private func failureText(for error: Error, target: OutgoingTarget) -> String {
        if !NetworkReachability.shared.isOnline {
            return AttachmentRules.offlineText
        }
        if let problem = error as? OutgoingProblem {
            switch problem {
            case .tooLarge(let name):
                return AttachmentRules.tooLargeText(name: name, limit: limits?.perFile)
            case .storageFull:
                return AttachmentRules.storageFullText(limit: limits?.storage)
            }
        }
        // Im Kanal sagt der Server, warum es nicht geht (z. B. nicht erlaubt). Die Texte dafür sind schon deutsch.
        // Im Chat bleibt es beim allgemeinen Text, wie bisher.
        if case .channel = target, let appError = error as? AppError, case .message(let text) = appError {
            return text
        }
        return AttachmentRules.uploadFailedText
    }
}
