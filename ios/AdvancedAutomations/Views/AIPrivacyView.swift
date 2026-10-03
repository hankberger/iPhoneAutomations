import SwiftUI

struct AIPrivacyView: View {
    @EnvironmentObject private var session: Session
    @State private var allowed = AIConsent.isAllowed
    @State private var working = false
    @State private var error: String?
    @State private var withdrawalPending = false

    var body: some View {
        List {
            SwiftUI.Section("Before you use AI") {
                Text(AIConsent.disclosure)
                Text("AI can make mistakes. Check important results before using them. Nutrition estimates from photos are approximate and are not medical advice.")
            }
            SwiftUI.Section {
                if session.isSignedIn {
                    if allowed {
                        Label("AI data sharing is allowed", systemImage: "checkmark.circle")
                        Button("Turn off AI data sharing", role: .destructive) {
                            Task { await setPermission(false) }
                        }
                    } else {
                        if withdrawalPending {
                            Button("Retry turning off sharing for all shortcuts", role: .destructive) {
                                Task { await setPermission(false) }
                            }
                        }
                        Button("Allow AI data sharing") {
                            Task { await setPermission(true) }
                        }
                    }
                } else {
                    Text("Sign in to choose whether to allow AI data sharing. You can browse the library without allowing it.")
                }
            } footer: {
                Text("Turning sharing off blocks future AI calls for this account, including downloaded shortcuts. A request already sent cannot be recalled. Review each shortcut’s actions and Apple permissions before using it.")
            }
            .disabled(working)
            if working { ProgressView() }
            if let error { Text(error).foregroundStyle(.red) }
            SwiftUI.Section("Provider policies") {
                Link("Cloudflare Privacy Policy", destination: URL(string: "https://www.cloudflare.com/privacypolicy/")!)
                Link("OpenAI Privacy Policy", destination: URL(string: "https://openai.com/policies/privacy-policy/")!)
            }
        }
        .navigationTitle("AI Privacy")
        .task {
            guard session.isSignedIn else { return }
            do {
                let choice = try await API.shared.privacy()
                if !choice.allowed || choice.version != 1 { AIConsent.setAllowed(false); allowed = false }
            } catch { self.error = error.localizedDescription }
        }
    }
    private func setPermission(_ value: Bool) async {
        let key = Keychain.apiKey
        working = true
        defer { working = false }
        // Local withdrawal takes effect even while offline. Report a failed remote
        // update explicitly so the user knows their other shortcuts still need it.
        if !value { AIConsent.setAllowed(false); allowed = false }
        do {
            try await API.shared.setPrivacy(allowed: value)
            guard key == Keychain.apiKey else { return }
            AIConsent.setAllowed(value)
            allowed = value
            error = nil
            withdrawalPending = false
        } catch {
            withdrawalPending = !value
            self.error = value ? error.localizedDescription : "Blocked on this phone, but the account-wide change failed. Check your connection and turn sharing off again. \(error.localizedDescription)"
        }
    }
}
