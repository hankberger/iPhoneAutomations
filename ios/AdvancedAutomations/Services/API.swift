import Foundation

// A message from the server, written for the person holding the phone, with an optional page
// that fixes it (top up, sign in again). Shortcuts shows it as the action's error.
struct APIError: LocalizedError {
    var message: String
    var actionURL: URL?
    var status: Int?
    var errorDescription: String? { message }

    static let signedOut = APIError(message: "Open Advanced Automations and sign in to use its AI actions.")
}

// Talks to the Worker in src/worker.js. The AI actions call /api/v1/run/<slug>, the same
// endpoint the installed shortcuts use, so prompts and models come from the catalog there.
final class API: Sendable {
    static let shared = API()

    // Point at http://localhost:8787 to try the app against `npm run dev:local` in the simulator.
    static let baseURL = URL(string: "https://iphoneadvanced.com")!

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        // Meeting-length recordings take a while to transcribe and summarize.
        config.timeoutIntervalForRequest = 300
        return URLSession(configuration: config)
    }()

    static func page(_ path: String) -> URL { baseURL.appending(path: path) }

    // MARK: Catalog and account

    func catalogData() async throws -> Data {
        let (data, response) = try await session.data(from: Self.page("api/v1/catalog"))
        try Self.check(data, response)
        return data
    }

    func balance() async throws -> Double {
        struct Balance: Decodable { var balance_usd: Double }
        let data = try await send(try request("api/v1/balance", method: "GET"))
        return try JSONDecoder().decode(Balance.self, from: data).balance_usd
    }

    // A fresh key for a shortcut being installed; Shortcuts asks for it on import.
    func makeKey(named name: String) async throws -> String {
        struct Key: Decodable { var key: String }
        var req = try request("api/v1/keys")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["name": name])
        return try JSONDecoder().decode(Key.self, from: try await send(req)).key
    }

    // MARK: Building blocks

    struct RunResult: Decodable {
        var text: String
        var cost_usd: Double?
        var balance_usd: Double?
    }

    func run(_ slug: String, _ body: [String: String]) async throws -> RunResult {
        var req = try request("api/v1/run/\(slug)")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        return try JSONDecoder().decode(RunResult.self, from: try await send(req))
    }

    // Audio blocks post the recording itself as the body.
    func run(_ slug: String, audio: Data) async throws -> RunResult {
        var req = try request("api/v1/run/\(slug)")
        req.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        req.httpBody = audio
        return try JSONDecoder().decode(RunResult.self, from: try await send(req))
    }

    // MARK: Plumbing

    private func request(_ path: String, method: String = "POST") throws -> URLRequest {
        guard let key = Keychain.apiKey else { throw APIError.signedOut }
        var req = URLRequest(url: Self.page(path))
        req.httpMethod = method
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return req
    }

    private func send(_ req: URLRequest) async throws -> Data {
        let data: Data, response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError(message: "Couldn’t reach Advanced Automations. Check your connection and try again.")
        }
        try Self.check(data, response)
        return data
    }

    private static func check(_ data: Data, _ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) else { return }
        struct Failure: Decodable { var error: String?; var action_url: URL? }
        let failure = try? JSONDecoder().decode(Failure.self, from: data)
        if http.statusCode == 401, failure?.action_url == nil {
            throw APIError(message: "This app’s key isn’t working anymore. Open Advanced Automations and sign in again.", status: 401)
        }
        throw APIError(message: failure?.error ?? "Something went wrong (\(http.statusCode)). Please try again.", actionURL: failure?.action_url, status: http.statusCode)
    }
}
