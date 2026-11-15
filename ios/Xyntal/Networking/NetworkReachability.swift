import Network
import Observation

/// Ob das Gerät gerade eine Verbindung hat. Nur für den Hinweis "Du bist offline" beim Senden von Anhängen.
@MainActor
@Observable
final class NetworkReachability {
    static let shared = NetworkReachability()

    /// Startet optimistisch mit true, bis der erste Pfad gemeldet ist.
    private(set) var isOnline = true
    private let monitor = NWPathMonitor()

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let online = path.status == .satisfied
            Task { @MainActor in
                self?.isOnline = online
            }
        }
        monitor.start(queue: DispatchQueue(label: "de.xyntal.reachability"))
    }
}
