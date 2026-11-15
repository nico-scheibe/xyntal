import Network
import Observation

/// Ob die iOS-Datenreduzierung (Low Data Mode) aktiv ist. Dann lädt die App Fotos nur auf Tippen.
@MainActor
@Observable
final class LowDataMonitor {
    static let shared = LowDataMonitor()

    private(set) var isConstrained = false
    private let monitor = NWPathMonitor()

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let constrained = path.isConstrained
            Task { @MainActor in
                self?.isConstrained = constrained
            }
        }
        monitor.start(queue: DispatchQueue(label: "de.xyntal.lowdata"))
    }
}
