import Foundation

// Matching-Profil und Tarif. Die Endpunkte entsprechen dem Web-Client (profil-matching.js, profil-billing.js).
extension APIClient {
    /// GET /users/:myId mit den Matching-Feldern des eigenen Profils.
    func matchingProfile(userId: String, token: String) async throws -> MatchingProfile {
        let id = try Self.validatedUserId(userId)
        let result = try await send("users/\(id)", token: token, as: MatchingProfileResult.self)
        return result.profile
    }

    /// GET /profile/assessment: Fragen, Anleitung, Sperrfrist und Ergebnis des Arbeitsstil-Tests; status fehlt ohne Test.
    func workStyleAssessment(token: String) async throws -> WorkStyleAssessment {
        try await send("profile/assessment", token: token, as: WorkStyleAssessment.self)
    }

    /// POST /profile/assessment: schickt alle Antworten (ein Eintrag je Block, gleiche Reihenfolge wie die Fragen).
    /// Liefert das neue Ergebnis. Die Sperrfrist wird vom Server geprüft (COOLDOWN_ACTIVE).
    func submitAssessment(answers: [WorkStyleAnswer], token: String) async throws -> WorkStyleStatus? {
        let result = try await send("profile/assessment",
                                    method: "POST",
                                    token: token,
                                    body: WorkStyleAnswerBody(answers: answers),
                                    as: WorkStyleAssessment.self,
                                    mapFailure: { status, code, _ in
                                        switch (status, code) {
                                        case (400, "VALIDATION_FAILED"):
                                            return .message("Der Test ist noch nicht vollständig. Ordne in jedem Block alle vier Aussagen ein.")
                                        default:
                                            return nil
                                        }
                                    })
        return result.status
    }

    /// PATCH /profile: speichert die Matching-Felder und liefert das aktualisierte Profil.
    func updateMatchingProfile(_ body: ProfilePatchBody, token: String) async throws -> MatchingProfile {
        let result = try await send("profile",
                                    method: "PATCH",
                                    token: token,
                                    body: body,
                                    as: MatchingProfileResult.self,
                                    mapFailure: { status, code, _ in
                                        switch (status, code) {
                                        case (400, _), (422, _):
                                            return .message("Bitte prüfe deine Angaben. Einträge dürfen höchstens 40 Zeichen lang sein.")
                                        case (413, _):
                                            return .message("Das sind zu viele Angaben auf einmal. Bitte kürze deine Einträge.")
                                        default:
                                            return nil
                                        }
                                    })
        return result.profile
    }

    /// GET /billing: Tarif und KI-Guthaben, nur zur Anzeige.
    func billing(token: String) async throws -> BillingInfo {
        try await send("billing", token: token, as: BillingInfo.self)
    }
}

private struct MatchingProfileResult: Decodable {
    let profile: MatchingProfile
}
