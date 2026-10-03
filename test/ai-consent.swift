import Foundation

// Compile alongside the real AIConsent.swift to verify permission checks without
// sending a request or depending on a live keychain/account.
enum Keychain { static var apiKey: String? }
struct APIError: Error {
    var message: String
    static let signedOut = APIError(message: "Signed out")
}
@main struct ConsentChecks {
    static func main() throws {
        func denied() {
            do { try AIConsent.requirePermission(); fatalError("Input upload was allowed without consent") }
            catch {}
        }
        denied()
        Keychain.apiKey = "test-only-consent-account-a"
        AIConsent.setAllowed(false)
        denied()
        AIConsent.setAllowed(true)
        try AIConsent.requirePermission()
        Keychain.apiKey = "test-only-consent-account-b"
        AIConsent.setAllowed(false)
        denied()
        Keychain.apiKey = "test-only-consent-account-a"
        try AIConsent.requirePermission()
        AIConsent.setAllowed(false)
        denied()
        Keychain.apiKey = nil
        denied()
        print("Consent checks passed: signed out, denied, allowed, account change, withdrawal")
    }
}
