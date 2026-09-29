import AuthenticationServices
import SwiftUI

struct AccountView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.openURL) private var openURL

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
                            } else {
                                ProgressView()
                            }
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
                        SignInCard(message: "Sign in with Apple, Google or email. New Apple and Google accounts start with free credit.")
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    }
                }
                SwiftUI.Section {
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

struct SignInCard: View {
    var message: String
    @EnvironmentObject private var session: Session
    @Environment(\.webAuthenticationSession) private var webAuth
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(message)
            Button {
                Task {
                    do {
                        try await session.connect(using: webAuth)
                        error = nil
                    } catch ASWebAuthenticationSessionError.canceledLogin {
                        error = nil
                    } catch {
                        self.error = error.localizedDescription
                    }
                }
            } label: {
                Text("Sign in").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(Theme.color("violet"))
            if let error { Text(error).font(.footnote).foregroundStyle(.red) }
        }
        .padding(18)
        .background(Theme.color("violet").opacity(0.09), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private extension URL {
    func withFragment(_ fragment: String) -> URL {
        var c = URLComponents(url: self, resolvingAgainstBaseURL: false)!
        c.fragment = fragment
        return c.url!
    }
}
