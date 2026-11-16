import SwiftUI
import WebKit

/// Wirt für die Anruf-Seite (https://api.xyntal.de/calls/app). Die Seite liefert Videobild und Verbindung,
/// die Bedienung ist nativ. Die App steuert die Seite über window.XyntalCall und fragt snapshot() ab.
/// Die Seite ruft die App nie von sich aus auf: es gibt keinen Rückkanal (kein WKScriptMessageHandler).
/// Pro Anruf eine eigene Instanz, damit kein Zustand aus einem früheren Anruf übrig bleibt.
@MainActor
final class CallPageHost: NSObject, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView

    private var loadContinuation: CheckedContinuation<Void, Error>?

    override init() {
        let configuration = WKWebViewConfiguration()
        // Kein Speicher, kein Cache: nichts von der Seite bleibt auf dem Gerät.
        configuration.websiteDataStore = .nonPersistent()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
    }

    /// Lädt die Anruf-Seite und wartet, bis sie fertig geladen ist. Danach ist window.XyntalCall da.
    func load() async throws {
        let url = AppConfig.apiBaseURL.appending(path: "calls/app")
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            loadContinuation = continuation
            webView.load(URLRequest(url: url))
        }
    }

    /// Übergibt Sitzung und Einstellungen. Die Sitzung geht als Argument, nie über die Adresse.
    func start(sessionJSON: String, prefs: [String: Any]) async throws {
        _ = try await webView.callAsyncJavaScript(
            "await window.XyntalCall.start(JSON.parse(sessionJSON), prefs); return null;",
            arguments: ["sessionJSON": sessionJSON, "prefs": prefs],
            in: nil,
            contentWorld: .page)
    }

    /// Neuer Sitzplatz nach Verlust des alten. Mikrofon, Kamera und Bildschirm laufen weiter.
    func resume(sessionJSON: String) async throws {
        _ = try await webView.callAsyncJavaScript(
            "await window.XyntalCall.resume(JSON.parse(sessionJSON)); return null;",
            arguments: ["sessionJSON": sessionJSON],
            in: nil,
            contentWorld: .page)
    }

    /// Schnappschuss der Oberfläche als JSON-Text, oder nil, wenn die Seite noch nicht bereit ist.
    func snapshotJSON() async -> String? {
        let result = try? await webView.callAsyncJavaScript(
            "return window.XyntalCall ? window.XyntalCall.snapshot() : null;",
            arguments: [:],
            in: nil,
            contentWorld: .page)
        return result as? String
    }

    /// Befehl an die Seite, z. B. ("mute", true), ("camera", true), ("hangUp", false). Wartet nicht.
    func command(_ name: String, _ argument: Any) {
        Task {
            _ = try? await commandAndWait(name, argument)
        }
    }

    /// Befehl an die Seite, der auf die Antwort wartet. Scheitert er, kommt der Fehler zurück.
    func commandAndWait(_ name: String, _ argument: Any) async throws {
        _ = try await webView.callAsyncJavaScript(
            "window.XyntalCall.command(name, arg); return null;",
            arguments: ["name": name, "arg": argument],
            in: nil,
            contentWorld: .page)
    }

    /// Gibt die Seite frei. Danach nimmt die Instanz keine Befehle mehr an. Die Seite wird auf eine leere Seite
    /// gesetzt: Damit endet jede Aufnahme (Mikrofon, Kamera), auch wenn der Befehl davor gescheitert ist.
    func close() {
        loadContinuation?.resume(throwing: CancellationError())
        loadContinuation = nil
        // Erst die Delegaten lösen, sonst lehnt die Richtlinie die leere Seite ab.
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.stopLoading()
        webView.loadHTMLString("", baseURL: nil)
    }

    // MARK: - WKNavigationDelegate

    /// Nur die Anruf-Seite des eigenen Servers, über https.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        let allowed = url?.scheme?.lowercased() == "https" && url?.host == AppConfig.apiBaseURL.host
        decisionHandler(allowed ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadContinuation?.resume()
        loadContinuation = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadContinuation?.resume(throwing: AppError.network)
        loadContinuation = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loadContinuation?.resume(throwing: AppError.network)
        loadContinuation = nil
    }

    // MARK: - WKUIDelegate

    /// Kamera und Mikrofon nur für den Hauptrahmen der eigenen Anruf-Seite über https. Das iPhone fragt den Nutzer
    /// beim ersten Mal selbst (Info.plist-Begründungen).
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let allowed = frame.isMainFrame
            && origin.protocol.lowercased() == "https"
            && origin.host == AppConfig.apiBaseURL.host
        decisionHandler(allowed ? .grant : .deny)
    }
}

/// Zeigt die Anruf-Seite. Die WKWebView gehört dem CallPageHost und wird nicht neu erzeugt,
/// damit der Anruf beim Minimieren und Zurückkehren weiterläuft.
struct CallPageView: UIViewRepresentable {
    let host: CallPageHost

    func makeUIView(context: Context) -> WKWebView {
        host.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
