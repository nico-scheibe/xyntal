import SwiftUI
import UIKit

/// Der Stapel „Für dich“. Rechts wischen heißt Kennenlernen, links Passt nicht.
///
/// "Kennenlernen" geht sofort an den Server, weil die Antwort sagt, ob es passt. "Passt nicht" wird erst nach
/// Ablauf der Rücknahme-Kapsel gesendet (oder beim Verlassen des Tabs bzw. der App), denn der Server kann
/// das Ausblenden nicht zurücknehmen.
struct ForYouDeckView: View {
    @Environment(SessionStore.self) private var session
    @Environment(ConversationsStore.self) private var conversations
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    let store: MatchesStore
    /// Öffnet „Deine Auswahl“.
    let onShowSaved: () -> Void

    @State private var offset: CGSize = .zero
    @State private var tilt: Double = 0
    @State private var cardOpacity: Double = 1
    @State private var swipeLock: SwipeLock = .undecided
    @State private var pastThreshold = false
    @State private var inFlight = false
    @State private var decisionCount = 0
    @State private var screenWidth: CGFloat = 1
    /// Natürliche Höhe der obersten Karte bei der aktuellen Breite. 0, solange sie nicht gemessen ist.
    @State private var naturalCardHeight: CGFloat = 0
    @State private var notice: DeckNotice?
    @State private var noticeRemaining: Double = 1
    @State private var reasonTarget: MatchPerson?
    @State private var matchPerson: MatchPerson?
    @State private var openConversation: Conversation?
    @State private var showsMatchingProfile = false
    /// true, sobald der Stapel einmal Karten hatte. Danach heißt ein leerer Stapel „Das war’s für jetzt“.
    @State private var seenCards = false

    private enum SwipeLock {
        case undecided, horizontal, ignored
    }

    private enum SwipeDirection {
        case left, right
    }

    private enum DeckState {
        case loading
        case deck
        case failed(message: String, offline: Bool)
        case noSuggestions
        case finished

        var isDeck: Bool {
            if case .deck = self { return true }
            return false
        }
    }

    /// Kapsel nach einer Entscheidung. Die Kennung ist die Nummer der Entscheidung.
    private struct DeckNotice: Equatable {
        enum Kind: Equatable {
            /// Kennenlernen, noch nicht gegenseitig. Zurück nimmt es mit "unsaved".
            case wantToMeet
            /// Ausgeblendet, noch nicht gesendet. Zurück holt die Karte.
            case hidden
            /// Nach „Grund angeben“, zwei Sekunden lang.
            case thanks
            /// Annehmen ist gescheitert.
            case failed
            /// Erste Nachricht ist gesendet. Zum Chat führt in den Chat.
            case sent
        }

        let id: Int
        var kind: Kind
        let person: MatchPerson
        var duration: Double
        var reason: DismissReason?
        var conversation: Conversation?

        var timerKey: String { "\(id)-\(kind)" }
    }

    private var isStacked: Bool { typeSize >= .accessibility1 }


    private var deckState: DeckState {
        if !store.suggestions.isEmpty { return .deck }
        if !store.hasLoaded(.suggestions) { return .loading }
        if let message = store.loadError(for: .suggestions) {
            return .failed(message: message, offline: store.networkFailed.contains(.suggestions))
        }
        return seenCards ? .finished : .noSuggestions
    }

    /// Oberste Karten: eine ab sehr großer Schrift, sonst drei.
    private var slots: [DeckSlot] {
        Array(store.suggestions.prefix(isStacked ? 1 : 3)).enumerated().map { index, person in
            DeckSlot(depth: index, person: person)
        }
    }

    private var canDecide: Bool { !inFlight && !store.suggestions.isEmpty }

    var body: some View {
        ZStack(alignment: .bottom) {
            content
            if let notice {
                noticeCapsule(notice)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
        }
        .sensoryFeedback(.impact(weight: .light), trigger: pastThreshold)
        .sensoryFeedback(.impact(weight: .medium), trigger: decisionCount)
        .task(id: notice?.timerKey) { await runNotice() }
        .onChange(of: store.suggestions.count, initial: true) { _, count in
            if count > 0 { seenCards = true }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { leaveDeck() }
        }
        .onDisappear { leaveDeck() }
        .sheet(item: $reasonTarget) { person in
            DismissReasonSheet { reason in
                chooseReason(reason, for: person)
            }
        }
        .sheet(item: $matchPerson) { person in
            matchSheet(for: person)
        }
        .sheet(isPresented: $showsMatchingProfile) {
            NavigationStack {
                MatchingProfileView()
            }
        }
        .navigationDestination(item: $openConversation) { conversation in
            ChatView(conversation: conversation)
        }
    }

    // MARK: - Zustände

    @ViewBuilder
    private var content: some View {
        switch deckState {
        case .deck:
            deckView
        case .loading:
            loadingView
        case .failed(let message, let offline):
            ContentUnavailableView {
                Label(offline ? "Keine Verbindung" : "Vorschläge nicht geladen",
                      systemImage: offline ? "wifi.slash" : "wifi.exclamationmark")
            } description: {
                Text(offline
                     ? "Prüf dein WLAN oder dein Mobilfunknetz und versuch es noch mal."
                     : message)
            } actions: {
                Button("Erneut versuchen") { Task { await store.load(.suggestions) } }
            }
        case .noSuggestions:
            ContentUnavailableView {
                Label("Noch keine Vorschläge", systemImage: "sparkles")
            } description: {
                Text("Ergänze dein Profil, damit wir passende Personen für dich finden.")
            } actions: {
                Button("Profil ergänzen") { showsMatchingProfile = true }
                    .buttonStyle(.borderedProminent)
            }
        case .finished:
            ContentUnavailableView {
                Label("Das war's für jetzt", systemImage: "checkmark.circle")
            } description: {
                Text("Neue Vorschläge kommen, wenn Leute dazukommen oder ihr Profil ändern.")
            } actions: {
                Button("Deine Auswahl ansehen", action: onShowSaved)
                    .buttonStyle(.borderedProminent)
                Button("Nach neuen suchen") { Task { await store.load(.suggestions) } }
            }
        }
    }

    private var loadingView: some View {
        VStack(spacing: 16) {
            DeckPlaceholderCard()
                .frame(maxHeight: .infinity)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            Text("Wir suchen passende Leute für dich …")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .padding(.bottom, 16)
        }
    }

    // MARK: - Stapel

    /// Stapel und Begründungszeile, mittig im verfügbaren Bereich. Die Karte hat ihre natürliche Höhe,
    /// höchstens so viel wie da ist. Nur wenn sie größer ist, scrollt sie in sich.
    private var deckView: some View {
        GeometryReader { geo in
            deckLayout(in: geo)
        }
    }

    /// Abstand zwischen Karte und Begründungszeile, plus Höhe der Zeile.
    private static let reasonGap: CGFloat = 8
    private static let reasonHeight: CGFloat = 22

    private func deckLayout(in geo: GeometryProxy) -> some View {
        let frame = geo.frame(in: .global)
        let cardWidth = max(0, geo.size.width - 32)
        let available = max(0, geo.size.height - Self.reasonGap - Self.reasonHeight)
        let natural = naturalCardHeight > 0 ? naturalCardHeight : available
        let cardHeight = min(natural, available)
        let threshold = DeckSwipe.threshold(cardWidth: cardWidth)
        return VStack(spacing: 0) {
            cardStack(size: CGSize(width: cardWidth, height: cardHeight), threshold: threshold)
                .frame(width: cardWidth, height: cardHeight)
            Text(store.suggestions.first?.reason.nonEmptyText ?? " ")
                .font(.subheadline)
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .frame(width: cardWidth, height: Self.reasonHeight, alignment: .leading)
                .padding(.top, Self.reasonGap)
                .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .background(alignment: .top) {
            if let top = store.suggestions.first {
                DeckCardHeightProbe(card: top.deckCard,
                                    fallbackName: top.displayName,
                                    width: cardWidth)
                    .equatable()
            }
        }
        .onPreferenceChange(DeckCardHeightKey.self) { naturalCardHeight = $0 }
        .onChange(of: geo.size.width, initial: true) { _, width in
            screenWidth = max(1, width)
        }
        .simultaneousGesture(
            DragGesture(minimumDistance: 10, coordinateSpace: .global)
                .onChanged { value in
                    updateDrag(value, frame: frame, cardWidth: cardWidth)
                }
                .onEnded { value in
                    endDrag(value, cardWidth: cardWidth)
                }
        )
    }

    /// Alle sichtbaren Karten im selben Format. Die Karten 2 und 3 haben dieselbe Höhe wie die oberste.
    private func cardStack(size cardSize: CGSize, threshold: CGFloat) -> some View {
        ZStack {
            ForEach(slots.reversed()) { slot in
                DeckCard(person: slot.person,
                         depth: slot.depth,
                         size: cardSize,
                         drag: slot.depth == 0 ? offset : .zero,
                         tilt: slot.depth == 0 ? tilt : 0,
                         swipeActive: slot.depth == 0 && swipeLock == .horizontal,
                         threshold: threshold,
                         canUndo: slot.depth == 0 && isUndoable,
                         onAccept: { decide(.right) },
                         onPass: { decide(.left) },
                         onUndo: { undo() })
                    .opacity(slot.depth == 0 ? cardOpacity : 1)
                    .transition(.identity)
            }
        }
    }

    /// Zurück ist nur für die letzte Entscheidung möglich, solange sie noch zurückgenommen werden kann.
    private var isUndoable: Bool {
        guard let notice else { return false }
        return notice.kind == .hidden || notice.kind == .wantToMeet
    }

    // MARK: - Geste

    /// Beginn nach 10 pt. Waagerecht, wenn |dx| >= 1,5 · |dy|, sonst scrollt die Karte. Randberührungen zählen nicht.
    private func updateDrag(_ value: DragGesture.Value, frame: CGRect, cardWidth: CGFloat) {
        guard !inFlight, !store.suggestions.isEmpty else { return }
        let dx = value.translation.width
        let dy = value.translation.height
        if swipeLock == .undecided {
            let x = value.startLocation.x
            let nearEdge = x < frame.minX + 20 || x > frame.maxX - 20
            swipeLock = (!nearEdge && abs(dx) >= 1.5 * abs(dy)) ? .horizontal : .ignored
        }
        guard swipeLock == .horizontal else { return }

        offset = CGSize(width: dx, height: reduceMotion ? 0 : min(max(dy * 0.15, -24), 24))
        tilt = reduceMotion ? 0 : min(max(Double(dx / max(frame.width, 1)) * 14, -14), 14)
        let past = abs(dx) >= DeckSwipe.threshold(cardWidth: cardWidth)
        if past != pastThreshold {
            pastThreshold = past
        }
    }

    /// Über der Schwelle (40 % Breite, oder 800 pt/s ab 80 pt) fliegt die Karte weg. Darunter federt sie zurück.
    private func endDrag(_ value: DragGesture.Value, cardWidth: CGFloat) {
        let lock = swipeLock
        swipeLock = .undecided
        pastThreshold = false
        guard lock == .horizontal, canDecide else { return }

        let dx = value.translation.width
        let velocity = value.velocity.width
        let byDistance = abs(dx) >= DeckSwipe.threshold(cardWidth: cardWidth)
        let byVelocity = abs(velocity) >= 800 && abs(dx) >= 80
        if byDistance || byVelocity {
            decide(dx > 0 ? .right : .left)
        } else {
            withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.35, dampingFraction: 0.75)) {
                offset = .zero
                tilt = 0
            }
        }
    }

    // MARK: - Entscheidung

    private func decide(_ direction: SwipeDirection) {
        guard canDecide, let person = store.suggestions.first else { return }
        inFlight = true
        decisionCount += 1
        let token = decisionCount
        let sign: CGFloat = direction == .right ? 1 : -1

        // Annehmen geht sofort raus; das Ergebnis wartet auf das Wegfliegen.
        let saving: Task<MatchesStore.AcceptResult, Never>? = direction == .right
            ? Task { await store.accept(person) }
            : nil

        if reduceMotion {
            withAnimation(.easeOut(duration: 0.15)) { cardOpacity = 0 }
        } else {
            withAnimation(.easeOut(duration: 0.25)) {
                offset = CGSize(width: sign * screenWidth * 1.3, height: offset.height)
                tilt = Double(sign) * 20
            }
        }

        Task {
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 150 : 250))
            removeTop(person)
            if let saving {
                let result = await saving.value
                handleAccept(result, person: person, token: token, direction: direction)
            } else {
                handleDismiss(person, token: token)
            }
        }
    }

    /// Nimmt die oberste Karte aus dem Stapel. Die Karte darunter rückt mit einer Feder nach.
    private func removeTop(_ person: MatchPerson) {
        finalizeNotice()
        if reduceMotion {
            store.removeSuggestion(person.id)
            withAnimation(.easeIn(duration: 0.15)) { cardOpacity = 1 }
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                store.removeSuggestion(person.id)
            }
        }
        var noAnimation = Transaction()
        noAnimation.disablesAnimations = true
        withTransaction(noAnimation) {
            offset = .zero
            tilt = 0
        }
        inFlight = false
    }

    private func handleAccept(_ result: MatchesStore.AcceptResult, person: MatchPerson, token: Int, direction: SwipeDirection) {
        switch result {
        case .connected:
            // Keine Rücknahme-Kapsel: das Blatt übernimmt.
            Task {
                try? await Task.sleep(for: .milliseconds(350))
                matchPerson = person
            }
        case .notConnected:
            if token == decisionCount {
                setNotice(DeckNotice(id: token, kind: .wantToMeet, person: person, duration: 6))
            }
            announceNext("Du willst \(person.name) kennenlernen.")
        case .failed:
            // Die Karte kommt zurück an die Spitze, von der Seite, zu der sie geflogen ist.
            store.restoreSuggestion(person)
            if !reduceMotion {
                var noAnimation = Transaction()
                noAnimation.disablesAnimations = true
                let sign: CGFloat = direction == .right ? 1 : -1
                withTransaction(noAnimation) {
                    offset = CGSize(width: sign * screenWidth * 1.3, height: 0)
                }
                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                    offset = .zero
                }
            }
            if token == decisionCount {
                setNotice(DeckNotice(id: token, kind: .failed, person: person, duration: 4))
            }
        }
    }

    private func handleDismiss(_ person: MatchPerson, token: Int) {
        setNotice(DeckNotice(id: token, kind: .hidden, person: person, duration: 6))
        announceNext("\(person.name) ausgeblendet.")
    }

    /// Zurück: holt die letzte Karte nach vorn. Bei "Kennenlernen" wird es mit "unsaved" zurückgenommen.
    private func undo() {
        guard !inFlight, let current = notice, current.kind == .hidden || current.kind == .wantToMeet else { return }
        notice = nil
        if current.kind == .wantToMeet {
            Task { _ = await store.undoAccept(current.person) }
        }
        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85)) {
            store.restoreSuggestion(current.person)
        }
    }

    // MARK: - Kapsel

    private func noticeCapsule(_ notice: DeckNotice) -> some View {
        let name = notice.person.name
        switch notice.kind {
        case .wantToMeet:
            return DeckNoticeCapsule(text: "Du willst \(name) kennenlernen.",
                                     remaining: noticeRemaining,
                                     showsLine: true,
                                     actions: [DeckNoticeAction(id: "undo", title: "Zurück", perform: undo)])
        case .hidden:
            return DeckNoticeCapsule(text: "\(name) ausgeblendet.",
                                     remaining: noticeRemaining,
                                     showsLine: true,
                                     actions: [
                                        DeckNoticeAction(id: "undo", title: "Zurück", perform: undo),
                                        DeckNoticeAction(id: "reason", title: "Grund angeben") { reasonTarget = notice.person }
                                     ])
        case .thanks:
            return DeckNoticeCapsule(text: "Danke, wir merken es uns.",
                                     remaining: noticeRemaining,
                                     showsLine: false,
                                     actions: [])
        case .failed:
            return DeckNoticeCapsule(text: "Das hat nicht geklappt. Prüf deine Verbindung und wisch noch mal.",
                                     remaining: noticeRemaining,
                                     showsLine: true,
                                     actions: [])
        case .sent:
            return DeckNoticeCapsule(text: "Nachricht an \(name) gesendet.",
                                     remaining: noticeRemaining,
                                     showsLine: true,
                                     actions: [
                                        DeckNoticeAction(id: "chat", title: "Zum Chat") {
                                            if let conversation = notice.conversation {
                                                openConversation = conversation
                                            }
                                            setNotice(nil)
                                        }
                                     ])
        }
    }

    /// Setzt eine neue Kapsel. Die alte wird vorher abgeschlossen, damit ein Ausblenden jetzt gesendet wird.
    private func setNotice(_ new: DeckNotice?) {
        finalizeNotice()
        noticeRemaining = 1
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
            notice = new
        }
    }

    /// Schließt die Kapsel ab. Ein Ausblenden geht erst jetzt an den Server.
    private func finalizeNotice() {
        guard let current = notice else { return }
        notice = nil
        if current.kind == .hidden || current.kind == .thanks {
            let person = current.person
            let reason = current.reason
            Task { await store.sendDismissal(person, reason: reason, note: nil) }
        }
    }

    /// Läuft die Frist ab, schließt sie die Kapsel. Mit VoiceOver läuft sie nicht ab. Während das Grund-Blatt offen ist, pausiert sie.
    private func runNotice() async {
        guard let current = notice, !UIAccessibility.isVoiceOverRunning else { return }
        let key = current.timerKey
        let duration = current.duration
        var elapsed = 0.0
        while elapsed < duration {
            try? await Task.sleep(for: .milliseconds(50))
            guard !Task.isCancelled, notice?.timerKey == key else { return }
            if reasonTarget != nil { continue }
            elapsed += 0.05
            noticeRemaining = max(0, 1 - elapsed / duration)
        }
        guard notice?.timerKey == key else { return }
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
            finalizeNotice()
        }
    }

    /// Grund aus dem Blatt. Danach zwei Sekunden „Danke“, dann wird gesendet.
    private func chooseReason(_ reason: DismissReason, for person: MatchPerson) {
        reasonTarget = nil
        guard var current = notice, current.kind == .hidden, current.person.id == person.id else { return }
        current.reason = reason
        current.kind = .thanks
        current.duration = 2
        noticeRemaining = 1
        notice = current
    }

    /// Beim Verlassen des Tabs oder der App: die Kapsel schließen und alles Vorgemerkte senden.
    private func leaveDeck() {
        finalizeNotice()
        Task { await store.flushPendingDismissals() }
    }

    // MARK: - Erste Nachricht

    private func matchSheet(for person: MatchPerson) -> some View {
        let card = person.deckCard
        return MatchFoundSheet(personName: person.name,
                               personAvatar: person.avatar,
                               ownName: store.ownProfile?.displayName,
                               ownAvatar: store.ownProfile?.avatar,
                               looking: card.looking,
                               topSkill: card.skills.first,
                               reason: person.reason,
                               onSend: { text in
                                   await sendFirstMessage(to: person, text: text)
                               },
                               onLater: {
                                   matchPerson = nil
                               })
    }

    /// Legt die Direktnachricht an (oder holt die bestehende) und sendet den Text. Gleiches Muster wie MatchDetailView.
    private func sendFirstMessage(to person: MatchPerson, text: String) async -> Bool {
        do {
            var conversation = try await session.withAccess { token in
                try await session.api.createDirectConversation(userId: person.id, token: token)
            }
            if !conversation.isDirect {
                conversation.kind = "dm"
                conversation.partnerId = person.id
            }
            conversations.cache(Profile(id: person.id,
                                        displayName: person.displayName,
                                        handle: person.handle,
                                        headline: person.headline,
                                        avatar: person.avatar))
            conversations.upsert(conversation)
            let conversationId = conversation.id
            try await session.withAccess { token in
                try await session.api.sendMessage(conversationId: conversationId, body: text, replyToId: nil, token: token)
            }
            matchPerson = nil
            setNotice(DeckNotice(id: decisionCount, kind: .sent, person: person, duration: 6, conversation: conversation))
            return true
        } catch {
            return false
        }
    }

    // MARK: - Ansagen

    /// Ansage für VoiceOver, mit der nächsten Person, falls es eine gibt. Nach dem Entfernen aufrufen.
    private func announceNext(_ text: String) {
        var message = text
        if let next = store.suggestions.first {
            message += " Nächste Person: \(next.name)."
        }
        AccessibilityNotification.Announcement(message).post()
    }
}
