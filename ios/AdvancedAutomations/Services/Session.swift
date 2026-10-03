import AuthenticationServices
import Foundation
import SwiftUI

// Whether the app holds a key, and the balance behind it. Signing in happens on the site
// (/app/connect), so email, Google and Apple sign-in all work without a second copy here.
@MainActor
final class Session: ObservableObject {
    @Published private(set) var isSignedIn = Keychain.apiKey != nil
    @Published private(set) var balance: Double?
    @Published private(set) var balanceError: String?

    static let callbackScheme = "iphoneadvanced"

    func connect(using auth: WebAuthenticationSession, provider: String? = nil) async throws {
        let state = UUID().uuidString
        var url = API.page("app/connect")
        url.append(queryItems: [URLQueryItem(name: "state", value: state)])
        if let provider {
            let next = url.path + "?" + (url.query ?? "")
            url = API.page("auth/\(provider)")
            url.append(queryItems: [URLQueryItem(name: "next", value: next)])
        }
        // A shared session reuses the person's Safari sign-in, so most people just tap Connect.
        let callback = try await auth.authenticate(using: url, callbackURLScheme: Self.callbackScheme, preferredBrowserSession: .shared)
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state,
              let key = items.first(where: { $0.name == "key" })?.value, key.hasPrefix("aa_live_") else {
            throw APIError(message: "That sign-in didn’t finish. Please try again.")
        }
        Keychain.setAPIKey(key)
        isSignedIn = true
        await refreshBalance()
    }

    // Forgets the key on this phone. It stays listed on the account page until revoked there.
    func signOut() {
        AIConsent.setAllowed(false)
        Keychain.setAPIKey(nil)
        isSignedIn = false
        balance = nil
        balanceError = nil
    }

    func refreshBalance() async {
        guard isSignedIn else { return }
        do {
            balance = try await API.shared.balance()
            balanceError = nil
        } catch let error as APIError where error.status == 401 {
            signOut()
        } catch {
            balanceError = error.localizedDescription
        }
    }
}
