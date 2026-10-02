import SwiftUI

struct AIPrivacyView: View {
    @EnvironmentObject private var session: Session
    @State private var allowed = AIConsent.isAllowed

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
                            AIConsent.setAllowed(false)
                            allowed = false
                        }
                    } else {
                        Button("Allow AI data sharing") {
                            AIConsent.setAllowed(true)
                            allowed = true
                        }
                    }
                } else {
                    Text("Sign in to choose whether to allow AI data sharing. You can browse the library without allowing it.")
                }
            } footer: {
                Text("This controls native AI actions on this device. Downloaded shortcuts run separately in Apple Shortcuts; inspect their actions and permissions before using them.")
            }
            SwiftUI.Section("Provider policies") {
                Link("Cloudflare Privacy Policy", destination: URL(string: "https://www.cloudflare.com/privacypolicy/")!)
                Link("OpenAI Privacy Policy", destination: URL(string: "https://openai.com/policies/privacy-policy/")!)
            }
        }
        .navigationTitle("AI Privacy")
    }
}
