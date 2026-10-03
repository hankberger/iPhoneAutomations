import SwiftUI
import AuthenticationServices

struct AccountView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.openURL) private var openURL
    @Environment(\.webAuthenticationSession) private var webAuth
    @State private var error: String?
    @State private var signingIn = false
    @State private var confirmingDeletion = false
    @State private var deleting = false
    @State private var needsAppleSignIn = false

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
                    NavigationLink("Add credit") { CreditStoreView() }
                }
                SwiftUI.Section {
                    NavigationLink("Keys and history") { AccountDetailsView() }
                    Button("Sign out", role: .destructive) { session.signOut() }
                        .disabled(deleting)
                    Button(deleting ? "Deleting account…" : "Delete account", role: .destructive) { confirmingDeletion = true }
                        .disabled(deleting)
                    if needsAppleSignIn {
                        Button("Reconnect Sign in with Apple") {
                            Task {
                                do { try await session.connect(using: webAuth, provider: "apple"); needsAppleSignIn = false; error = nil }
                                catch { self.error = error.localizedDescription }
                            }
                        }
                    }
                    if let error { Text(error).font(.footnote).foregroundStyle(.red) }
                } footer: {
                    Text("Signing out forgets this phone’s key. Deleting your account permanently removes account data, invalidates every key and forfeits remaining credit. It does not request an Apple refund.")
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
                    Button("Terms of Service") { openURL(API.page("terms")) }
                    Button("Privacy Policy") { openURL(API.page("privacy")) }
                }
            }
            .navigationTitle("Account")
            .task { await session.refreshBalance() }
            .refreshable { await session.refreshBalance() }
            .confirmationDialog("Permanently delete your account?", isPresented: $confirmingDeletion, titleVisibility: .visible) {
                Button("Delete account and remaining credit", role: .destructive) {
                    Task {
                        deleting = true
                        defer { deleting = false }
                        do { try await API.shared.deleteAccount(); session.signOut() }
                        catch { self.error = error.localizedDescription; needsAppleSignIn = (error as? APIError)?.status == 409 }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This cannot be undone. All your shortcuts will lose access. Payment identifiers are retained without account linkage to prevent replay. For Apple purchase refunds, use Add credit → Request an Apple refund before deleting.")
            }
        }
    }
}
