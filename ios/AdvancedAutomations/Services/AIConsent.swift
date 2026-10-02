import CryptoKit
import Foundation

// Consent is versioned and tied to the signed-in credential, so switching accounts or
// changing the disclosure cannot silently inherit an earlier permission.
enum AIConsent {
    static let disclosure = "The text, images, audio and instructions you choose are sent to Advanced Automations and Cloudflare to answer your request. Make an Image also sends your description to OpenAI through Cloudflare AI Gateway. Shared content may include personal information from your messages, documents, calendar or reminders. We do not store your inputs or AI outputs in our database. Providers may retain data under their policies. Only share content you have permission to send."

    private static var preference: String? {
        guard let key = Keychain.apiKey else { return nil }
        let fingerprint = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return "ai-sharing-v1-\(fingerprint)"
    }
    static var isAllowed: Bool {
        guard let preference else { return false }
        return UserDefaults.standard.bool(forKey: preference)
    }
    static func setAllowed(_ allowed: Bool) {
        guard let preference else { return }
        UserDefaults.standard.set(allowed, forKey: preference)
    }
    static func requirePermission() throws {
        guard Keychain.apiKey != nil else { throw APIError.signedOut }
        guard isAllowed else { throw APIError(message: "Open Advanced Automations → Account → AI Privacy to review and allow AI data sharing before running this action.") }
    }
}
