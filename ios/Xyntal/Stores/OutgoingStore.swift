import Foundation
import Observation
import UIKit

/// Tarifgrenzen aus GET /billing. nil heißt: noch nicht geladen. Ein Feld nil heißt: unbegrenzt oder unbekannt.
struct UploadLimits: Equatable {
    let perFile: Int?
    let storage: Int?
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
    let conversationId: String
    let body: String
    let replyToId: String?
    let attachments: [ComposerAttachment]

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

    init(conversationId: String, body: String, replyToId: String?, attachments: [ComposerAttachment]) {
        self.conversationId = conversationId
        self.body = body
        self.replyToId = replyToId
        self.attachments = attachments
    }

    /// Gesamtanteil über alle Anhänge, nach Größe gewichtet.
    var totalProgress: Double {
        let total = attachments.reduce(0) { $0 + $1.size }
        guard total > 0 else { return 0 }
        let sent = attachments.reduce(0.0) { $0 + Double($1.size) * (progress[$1.id] ?? 0) }
        return min(1, sent / Double(total))
    }

    // MARK: - Vom Store gesteuert

    fileprivate func beginAttempt() {
        state = .sending
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
    /// Zähler je Gespräch. Steigt, sobald eine Nachricht angekommen ist, damit die Chatansicht neu lädt.
    private(set) var deliveredEvents: [String: Int] = [:]
    /// Tarifgrenzen. nil, solange sie nicht geladen sind.
    private(set) var limits: UploadLimits?

    init(session: SessionStore) {
        self.session = session
    }

    /// Ausstehende Nachrichten eines Gesprächs. Zugestellte fehlen, die lädt der Verlauf schon.
    func messages(in conversationId: String) -> [OutgoingMessage] {
        messages.filter { $0.conversationId == conversationId && $0.state != .delivered }
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
    func submit(conversationId: String, body: String, replyToId: String?, attachments: [ComposerAttachment]) -> Bool {
        guard NetworkReachability.shared.isOnline else { return false }
        let message = OutgoingMessage(conversationId: conversationId, body: body, replyToId: replyToId, attachments: attachments)
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

    /// Entfernt zugestellte Nachrichten eines Gesprächs, sobald der Verlauf sie selbst zeigt.
    func dropDelivered(conversationId: String) {
        messages.removeAll { $0.conversationId == conversationId && $0.state == .delivered }
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
            try await session.withAccess { token in
                try await session.api.sendAttachmentMessage(conversationId: message.conversationId,
                                                            body: message.body,
                                                            replyToId: message.replyToId,
                                                            attachmentIds: ids,
                                                            token: token)
            }
            for attachment in message.attachments {
                AttachmentFiles.remove(attachment.fileURL)
            }
            message.markDelivered()
            deliveredEvents[message.conversationId, default: 0] += 1
        } catch is CancellationError {
            return
        } catch {
            guard !message.wasCancelled else { return }
            message.markFailed(failureText(for: error))
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

    private func failureText(for error: Error) -> String {
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
        return AttachmentRules.uploadFailedText
    }
}
