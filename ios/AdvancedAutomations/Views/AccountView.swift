import SwiftUI
import AuthenticationServices

struct AccountView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.openURL) private var openURL
    @Environment(\.webAuthenticationSession) private var webAuth
    @State private var error: String?
    @State private var signingIn = false

    var body: some View {
        NavigationStack {
            List {
                if session.isSignedIn {
                SwiftUI.Section("Balance") {
                    HStack {
                        Text("Credit")
                        Spacer()
                        if let balance = session.balance {
                            Text(balance, format: .currency(code: "USD")).fontWeight(.semibold)
                        } else if session.balanceError != nil {
                            Text("Unavailable").foregroundStyle(.secondary)
                        } else {
                            ProgressView()
                        }
                    }
                    if let error = session.balanceError {
                        Text(error).font(.footnote).foregroundStyle(.secondary)
                        Button("Retry balance") { Task { await session.refreshBalance() } }
                    }
                    // Credit is bought on the site, like the rest of the account.
                    Button("Top up on iphoneadvanced.com") { openURL(API.page("account").withFragment("balance")) }
                }
                SwiftUI.Section {
                    Button("Keys and history") { openURL(API.page("account")) }
                    Button("Sign out", role: .destructive) { session.signOut() }
                } footer: {
                    Text("Signing out forgets this phone’s key. Revoke it under Keys to turn it off everywhere.")
                }
                } else {
                    SwiftUI.Section {
                        Text("Sign in to run AI actions and manage your credit. The library is free to browse.")
                        Button(signingIn ? "Signing in…" : "Sign in or create account") {
                            Task {
                                signingIn = true
                                defer { signingIn = false }
                                do { try await session.connect(using: webAuth) }
                                catch ASWebAuthenticationSessionError.canceledLogin {}
                                catch { self.error = error.localizedDescription }
                            }
                        }
                        .disabled(signingIn)
                        if let error { Text(error).foregroundStyle(.red) }
                    }
                }
                SwiftUI.Section {
                    NavigationLink("AI Privacy") { AIPrivacyView() }
                    Link("Contact Support", destination: URL(string: "mailto:support@iphoneadvanced.com")!)
                    Button("Pricing") { openURL(API.page("pricing")) }
                    Button("Terms of Service") { openURL(API.page("terms")) }
                    Button("Privacy Policy") { openURL(API.page("privacy")) }
                }
            }
            .navigationTitle("Account")
            .task { await session.refreshBalance() }
            .refreshable { await session.refreshBalance() }
        }
    }
}

private extension URL {
    func withFragment(_ fragment: String) -> URL {
        var c = URLComponents(url: self, resolvingAgainstBaseURL: false)!
        c.fragment = fragment
        return c.url!
    }
}
