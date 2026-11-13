import Foundation
import Observation

/// Arbeitsstil-Test in der App: lädt die Fragen, hält die Rangfolge je Block und schickt alles auf einmal ab.
/// Weiter kommt man nur mit einem vollständig eingeordneten Block, abgeschickt wird nur, wenn alle Blöcke vollständig sind.
@MainActor
@Observable
final class WorkStyleTestStore {
    private(set) var blocks: [WorkStyleBlock] = []
    private(set) var instruction: String?
    private(set) var cooldownDays: Int?
    /// Ende der Sperrfrist, wenn der Test schon gemacht wurde und die Frist noch läuft. Sonst nil.
    private(set) var cooldownUntil: Date?
    private(set) var hasLoaded = false
    private(set) var loadError: String?
    /// false, solange die Anleitung steht. true, sobald der erste Block angezeigt wird.
    private(set) var hasStarted = false
    /// Aktueller Block, 0-basiert.
    private(set) var currentBlock = 0
    /// Je Block: die Aussagen-Indizes in der Reihenfolge, in der sie eingeordnet wurden. Der erste Eintrag ist Rang 1.
    private(set) var orders: [[Int]] = []
    private(set) var isSubmitting = false
    private(set) var submitError: String?
    private(set) var isFinished = false
    /// Ergebnis nach dem Absenden.
    private(set) var result: WorkStyleStatus?

    private let session: SessionStore

    init(session: SessionStore) {
        self.session = session
    }

    var currentStatements: [String] {
        blocks.indices.contains(currentBlock) ? blocks[currentBlock].statements : []
    }

    var currentOrder: [Int] {
        orders.indices.contains(currentBlock) ? orders[currentBlock] : []
    }

    var isLastBlock: Bool {
        currentBlock == blocks.count - 1
    }

    var isCurrentBlockComplete: Bool {
        WorkStyleRanking.ranks(fromOrder: currentOrder) != nil
    }

    var allBlocksComplete: Bool {
        WorkStyleRanking.answers(fromOrders: orders, blockCount: blocks.count) != nil
    }

    /// Rang (1–4) der Aussage im aktuellen Block, nil solange sie noch keinen Rang hat.
    func rank(of statement: Int) -> Int? {
        currentOrder.firstIndex(of: statement).map { $0 + 1 }
    }

    // MARK: - Laden

    func load() async {
        do {
            let assessment = try await session.withAccess { token in
                try await session.api.workStyleAssessment(token: token)
            }
            // Ein Block mit anderer Anzahl Aussagen würde die Antworten verschieben. Dann lieber gar nicht starten.
            let usable = !assessment.questionnaire.isEmpty
                && assessment.questionnaire.allSatisfy { $0.statements.count == WorkStyleBlock.statementCount }
            guard usable else {
                loadError = "Der Test ist gerade nicht verfügbar. Bitte versuche es später erneut."
                hasLoaded = true
                return
            }
            blocks = assessment.questionnaire
            orders = Array(repeating: [], count: blocks.count)
            instruction = assessment.instruction.nonEmptyText
            cooldownDays = assessment.cooldownDays
            cooldownUntil = assessment.status?.nextAvailableDate.flatMap { $0 > Date() ? $0 : nil }
            loadError = nil
        } catch is CancellationError {
            return
        } catch AppError.unauthorized {
            return
        } catch {
            loadError = AppError.displayText(for: error)
        }
        hasLoaded = true
    }

    // MARK: - Bedienung

    func start() {
        hasStarted = true
    }

    /// Tippen auf eine Aussage: Ist sie noch ohne Rang, bekommt sie den nächsten Rang. Ist sie schon eingeordnet, verliert sie ihren Rang.
    func toggle(_ statement: Int) {
        guard orders.indices.contains(currentBlock) else { return }
        var order = orders[currentBlock]
        if let position = order.firstIndex(of: statement) {
            order.remove(at: position)
        } else if order.count < WorkStyleBlock.statementCount {
            order.append(statement)
        }
        orders[currentBlock] = order
    }

    /// Nimmt die zuletzt vergebene Einordnung im aktuellen Block zurück.
    func undo() {
        guard orders.indices.contains(currentBlock), !orders[currentBlock].isEmpty else { return }
        orders[currentBlock].removeLast()
    }

    func goToNextBlock() {
        guard isCurrentBlockComplete, !isLastBlock else { return }
        currentBlock += 1
    }

    func goToPreviousBlock() {
        guard currentBlock > 0 else { return }
        currentBlock -= 1
    }

    // MARK: - Absenden

    /// Schickt alle Blöcke ab. Ohne vollständige Rangfolge in jedem Block wird nichts gesendet.
    /// Bei Erfolg steht das Ergebnis in result und isFinished ist true.
    func submit() async {
        guard !isSubmitting, !isFinished,
              let answers = WorkStyleRanking.answers(fromOrders: orders, blockCount: blocks.count) else { return }
        isSubmitting = true
        submitError = nil
        defer { isSubmitting = false }
        do {
            let status = try await session.withAccess { token in
                try await session.api.submitAssessment(answers: answers, token: token)
            }
            result = status
            isFinished = true
        } catch is CancellationError {
            return
        } catch AppError.unauthorized {
            return
        } catch {
            submitError = AppError.displayText(for: error)
        }
    }
}
