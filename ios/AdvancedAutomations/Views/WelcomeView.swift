import AuthenticationServices
import SwiftUI

// Browsing is free and does not require an account. AI execution uses account credit.
struct WelcomeView: View {
    var onBrowse: (() -> Void)?
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var session: Session
    @Environment(\.webAuthenticationSession) private var webAuth
    @Environment(\.openURL) private var openURL
    @State private var working = false
    @State private var error: String?

    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 24)
            TileCloud(automations: catalog.blocks)
                .frame(maxWidth: .infinity)
            Spacer(minLength: 32)

            VStack(alignment: .leading, spacing: 14) {
                Text("AI actions for Shortcuts")
                    .font(.display(40))
                    .fixedSize(horizontal: false, vertical: true)
                Text("Ask questions, read photos, transcribe audio and more, right inside the Shortcuts app. Most runs cost under a cent.")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: 12) {
                Button {
                    Task { await signIn() }
                } label: {
                    HStack {
                        if working { ProgressView().tint(.white) }
                        Text("Get started")
                    }
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .tint(Theme.color("violet"))
                .disabled(working)

                if let onBrowse {
                    Button("Browse without an account", action: onBrowse)
                        .font(.subheadline.weight(.semibold))
                }

                Text(error ?? "Sign in with Apple, Google or email. New Apple and Google accounts start with free credit.")
                    .font(.footnote)
                    .foregroundStyle(error == nil ? .secondary : Color.red)
                    .multilineTextAlignment(.center)

                HStack(spacing: 16) {
                    Button("Terms") { openURL(API.page("app/terms")) }
                    Button("Privacy") { openURL(API.page("app/privacy")) }
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
            }
            .padding(.top, 32)
        }
        .padding(24)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
        .background {
            LinearGradient(colors: [Theme.color("violet").opacity(0.18), .clear], startPoint: .top, endPoint: .center)
                .ignoresSafeArea()
        }
        }
    }

    private func signIn() async {
        working = true
        defer { working = false }
        do {
            try await session.connect(using: webAuth)
            error = nil
        } catch ASWebAuthenticationSessionError.canceledLogin {
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// The building blocks' icons, scattered at slight angles.
private struct TileCloud: View {
    var automations: [Automation]

    private let tilts: [Double] = [-8, 6, -4, 9, -10, 5]
    private let offsets: [CGFloat] = [12, -10, 18, -6, 8, -14]

    var body: some View {
        HStack(spacing: -6) {
            ForEach(Array(automations.prefix(6).enumerated()), id: \.element.id) { i, a in
                IconTile(automation: a, size: 56)
                    .shadow(color: Theme.color(a.color).opacity(0.35), radius: 12, y: 6)
                    .rotationEffect(.degrees(tilts[i]))
                    .offset(y: offsets[i])
            }
        }
        .accessibilityHidden(true)
    }
}
