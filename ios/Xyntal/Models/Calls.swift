import Foundation

// Anrufe im Direktgespräch (Server: messaging/calls.ts). Die Medien laufen in der Anruf-Seite (CallPageHost),
// diese Modelle beschreiben nur Antworten des Servers und den Ausschnitt, den die App von der Seite liest.

/// Anruf, wie ihn der Server in Nachrichten, GET /conversations/:id/call und Antworten liefert (callJson).
struct CallInfo: Decodable, Identifiable, Hashable {
    let id: String
    var conversationId: String?
    /// "audio" oder "video".
    var kind: String?
    /// "active" oder "ended".
    var status: String?
    var startedById: String?
    var startedBy: String?
    var startedAt: String?
    var endedAt: String?
    var participantIds: [String]
    var participants: [String]

    var isActive: Bool { status == "active" }
    var isVideo: Bool { kind == "video" }

    private enum CodingKeys: String, CodingKey {
        case id, conversationId, kind, status, startedById, startedBy, startedAt, endedAt, participantIds, participants
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIdentifier(forKey: .id)
        conversationId = container.lenient(String.self, .conversationId)
        kind = container.lenient(String.self, .kind)
        status = container.lenient(String.self, .status)
        startedById = container.lenient(String.self, .startedById)
        startedBy = container.lenient(String.self, .startedBy)
        startedAt = container.lenient(String.self, .startedAt)
        endedAt = container.lenient(String.self, .endedAt)
        participantIds = container.lenient(LossyArray<String>.self, .participantIds)?.elements ?? []
        participants = container.lenient(LossyArray<String>.self, .participants)?.elements ?? []
    }
}

/// Beliebiges JSON. Damit wird das Sitzungsobjekt unverändert an die Anruf-Seite weitergereicht.
enum CallJSONValue: Codable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([CallJSONValue])
    case object([String: CallJSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([CallJSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: CallJSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unbekannter Wert")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}

/// Sitzung eines Anrufs (session aus POST /conversations/:id/calls und POST /calls/:id/join).
/// json ist das Objekt exakt wie vom Server, für window.XyntalCall.start(session, prefs).
struct CallSessionPayload: Decodable {
    let callId: String
    let json: String

    init(from decoder: Decoder) throws {
        let value = try CallJSONValue(from: decoder)
        guard case .object(let fields) = value, case .string(let id)? = fields["callId"] else {
            throw DecodingError.dataCorrupted(DecodingError.Context(codingPath: decoder.codingPath,
                                                                    debugDescription: "Sitzung ohne callId"))
        }
        callId = id
        json = String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
    }
}

/// Jemand, bei dem es beim Start nicht geklingelt hat. Der Server nennt nur einen groben Grund, für Fremde gar keinen.
struct CallHoldNote: Decodable, Hashable {
    let userId: String
    let name: String?
    /// "busy", "dnd", "focus" oder "quiet_hours". Fehlt bei Fremden.
    let reason: String?
}

/// Antwort von POST /conversations/:id/calls. joined ist false, wenn ein laufender Anruf nur betreten wurde.
struct CallStartResult: Decodable {
    let call: CallInfo?
    let joined: Bool
    let session: CallSessionPayload
    let held: [CallHoldNote]
}

/// Antwort von POST /calls/:id/join.
struct CallJoinResult: Decodable {
    let call: CallInfo?
    let session: CallSessionPayload
}

/// Antwort von GET /conversations/:id/call.
struct CallActiveResult: Decodable {
    let call: CallInfo?
}

/// Antwort von GET /calls/info.
struct CallsInfo: Decodable {
    let available: Bool
    let maxParticipants: Int?
}

/// Ausschnitt aus window.XyntalCall.snapshot(). Jedes Feld ist lenient gelesen: ein unbekanntes oder
/// anders geformtes Feld lässt den Rest unberührt. Die Oberfläche zeigt nur, was hier steht.
struct CallPageSnapshot: Decodable {
    struct Me: Decodable, Hashable {
        var muted = false
        var deafened = false
        var camera = false
        var serverMuted = false

        init() {}

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            muted = container.lenient(Bool.self, .muted) ?? false
            deafened = container.lenient(Bool.self, .deafened) ?? false
            camera = container.lenient(Bool.self, .camera) ?? false
            serverMuted = container.lenient(Bool.self, .serverMuted) ?? false
        }

        private enum CodingKeys: String, CodingKey {
            case muted, deafened, camera, serverMuted
        }
    }

    struct Peer: Decodable, Identifiable, Hashable {
        let userId: String
        var name: String
        var muted = false
        var deafened = false
        var camera = false
        var sharing = false
        var speaking = false

        var id: String { userId }

        private enum CodingKeys: String, CodingKey {
            case userId, name, muted, deafened, camera, sharing, speaking
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            userId = container.lenient(String.self, .userId) ?? ""
            name = container.lenient(String.self, .name) ?? ""
            muted = container.lenient(Bool.self, .muted) ?? false
            deafened = container.lenient(Bool.self, .deafened) ?? false
            camera = container.lenient(Bool.self, .camera) ?? false
            sharing = container.lenient(Bool.self, .sharing) ?? false
            speaking = container.lenient(Bool.self, .speaking) ?? false
        }
    }

    /// Nur der Typ zählt. Die übrigen Felder der Ereignisse werden nicht gelesen.
    struct Event: Decodable {
        let type: String?
    }

    /// Status der Seite: "idle", "connecting", "live", "lost" oder "ended".
    let status: String
    let me: Me
    let peers: [Peer]
    let error: String?
    let events: [Event]

    private enum CodingKeys: String, CodingKey {
        case status, me = "self", peers, error, events
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = container.lenient(String.self, .status) ?? "idle"
        me = container.lenient(Me.self, .me) ?? Me()
        peers = container.lenient(LossyArray<Peer>.self, .peers)?.elements ?? []
        error = container.lenient(String.self, .error)
        events = container.lenient(LossyArray<Event>.self, .events)?.elements ?? []
    }
}
