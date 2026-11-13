import Foundation

// Arbeitsstil-Test: Fragen aus GET /profile/assessment und die Antwort für POST /profile/assessment.
// Die Anzahl der Blöcke bestimmt der Server; die App hält sich nur an vier Aussagen je Block.

/// Ein Block des Tests: vier Aussagen, die der Nutzer in eine Rangfolge von 1 bis 4 bringt.
/// Strikt gelesen: Hat ein Block nicht genau vier Texte, scheitert das ganze Fragenset (sonst passen Antworten und Blöcke nicht mehr zusammen).
struct WorkStyleBlock: Decodable, Hashable {
    static let statementCount = 4

    let statements: [String]
}

/// Eine Antwort für einen Block. ranks[i] ist der Rang (1–4) für statements[i].
struct WorkStyleAnswer: Encodable, Hashable {
    let ranks: [Int]
}

/// Körper von POST /profile/assessment.
struct WorkStyleAnswerBody: Encodable {
    let answers: [WorkStyleAnswer]
}

/// Rangfolge aus der Reihenfolge, in der der Nutzer die Aussagen antippt.
enum WorkStyleRanking {
    /// order[k] ist der Index der Aussage, die den Rang k + 1 bekommt. Nil, solange nicht alle vier Aussagen einen Rang haben.
    /// Ergebnis: ranks[i] ist der Rang der Aussage i, jede Zahl 1–4 genau einmal.
    static func ranks(fromOrder order: [Int]) -> [Int]? {
        let count = WorkStyleBlock.statementCount
        guard order.count == count, Set(order) == Set(0..<count) else { return nil }
        var ranks = Array(repeating: 0, count: count)
        for (position, statement) in order.enumerated() {
            ranks[statement] = position + 1
        }
        return ranks
    }

    /// Antworten für alle Blöcke, in der Reihenfolge der Blöcke. Nil, wenn ein Block fehlt oder unvollständig ist.
    static func answers(fromOrders orders: [[Int]], blockCount: Int) -> [WorkStyleAnswer]? {
        guard blockCount > 0, orders.count == blockCount else { return nil }
        var answers: [WorkStyleAnswer] = []
        for order in orders {
            guard let ranks = ranks(fromOrder: order) else { return nil }
            answers.append(WorkStyleAnswer(ranks: ranks))
        }
        return answers
    }
}
