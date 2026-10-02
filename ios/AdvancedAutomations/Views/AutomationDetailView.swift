import SwiftUI
import UniformTypeIdentifiers

struct AutomationDetailView: View {
    var automation: Automation
    @EnvironmentObject private var catalog: CatalogStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 14) {
                    IconTile(automation: automation, size: 64)
                    Text(automation.name).font(.display(34))
                    Text(automation.tagline).font(.title3).foregroundStyle(.secondary)
                    HStack(spacing: 8) {
                        Label(automation.isBlock ? "Shortcuts action" : automation.trigger, systemImage: automation.isBlock ? "square.stack.3d.up" : "hand.tap")
                        Text("·")
                        Text("\(automation.typicalCostLabel) a run")
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)

                    if let input = automation.input, let output = automation.output {
                        HStack(spacing: 6) {
                            Label(input, systemImage: "arrow.down.to.line")
                            Image(systemName: "arrow.right")
                            Label(output, systemImage: "arrow.up.from.line")
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Theme.color(automation.color))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(Theme.color(automation.color).opacity(0.10), in: Capsule())
                    }
                }

                if automation.isBlock {
                    NativeActionSection(automation: automation)
                } else {
                    GetButton(automation: automation)
                    Section(title: "How to run it") { Text(automation.runTip) }
                    steps
                }

                RelatedAutomationsSection(automation: automation)
            }
            .padding(20)
            .frame(maxWidth: 640, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(alignment: .top) {
            LinearGradient(colors: [Theme.color(automation.color).opacity(0.14), .clear], startPoint: .top, endPoint: .bottom)
                .frame(height: 320)
                .ignoresSafeArea()
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    // The installed shortcut's actions. Blocks skip this: their steps describe the Run Shortcut
    // version, not the native action.
    private var steps: some View {
        Section(title: "What’s inside") {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(Array(automation.inside.enumerated()), id: \.offset) { i, step in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text("\(i + 1)")
                            .font(.footnote.weight(.bold))
                            .frame(width: 24, height: 24)
                            .background(Theme.color(automation.color).opacity(0.15), in: Circle())
                        VStack(alignment: .leading, spacing: 2) {
                            Text(step.action).fontWeight(.semibold)
                            if let detail = step.detail { Text(detail).foregroundStyle(.secondary) }
                        }
                    }
                }
            }
        }
    }
}

private struct RelatedAutomationsSection: View {
    var automation: Automation
    @EnvironmentObject private var catalog: CatalogStore

    var body: some View {
        let related = catalog.related(to: automation)
        if !related.isEmpty {
            Section(title: automation.isBlock ? "Good next steps" : "You might also like") {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(related) { item in
                        NavigationLink(value: item) {
                            HStack(spacing: 12) {
                                IconTile(automation: item, size: 38)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.name).fontWeight(.semibold)
                                    Text(item.output ?? item.tagline)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(.vertical, 10)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

private struct Section<Content: View>: View {
    var title: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.display(20))
            content
        }
    }
}

// Building blocks don't need installing: the app adds them to Shortcuts as native actions.
private struct NativeActionSection: View {
    var automation: Automation
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Built into Shortcuts", systemImage: "checkmark.seal.fill")
                .font(.headline)
                .foregroundStyle(Theme.color(automation.color))
            Text("In the Shortcuts app, tap + to make a shortcut, then search for “\(automation.name)”, or scroll to Advanced Automations under Apps. Drop it in like any other action and pass its result along.")
            Button {
                openURL(URL(string: "shortcuts://")!)
            } label: {
                Label("Open Shortcuts", systemImage: "arrow.up.forward.app")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(.primary)
        }
    }
}

// Installs a shortcut the way the site's install page does: a fresh key on the clipboard, then
// its iCloud link, where Shortcuts asks for the key. Shortcuts without an iCloud link can only
// be imported from a downloaded file, which Safari hands over, so those go to the install page.
private struct GetButton: View {
    var automation: Automation
    @EnvironmentObject private var session: Session
    @Environment(\.openURL) private var openURL
    @State private var working = false
    @State private var status: String?

    var body: some View {
        VStack(spacing: 10) {
            Button {
                Task { await get() }
            } label: {
                HStack {
                    if working { ProgressView().tint(Color(uiColor: .systemBackground)) }
                    Text(automation.icloudUrl == nil ? "Get it in Safari" : "Get")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(.primary)
            .disabled(working)

            Text(status ?? (automation.icloudUrl == nil
                ? "Copies a key, then opens the shortcut file in Safari. Paste the key when importing into Shortcuts."
                : "Copies a key for this shortcut and opens Shortcuts. Paste it when asked, then tap Add Shortcut."))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private func get() async {
        guard session.isSignedIn else {
            status = "Open the Account tab and sign in to add this shortcut."
            return
        }
        guard AIConsent.isAllowed else {
            status = "Open Account → AI Privacy and review data sharing before adding AI shortcuts."
            return
        }
        working = true
        defer { working = false }
        do {
            let key = try await API.shared.makeKey(named: automation.name)
            // Kept off other devices and cleared after a few minutes.
            UIPasteboard.general.setItems([[UTType.plainText.identifier: key]], options: [.localOnly: true, .expirationDate: Date().addingTimeInterval(300)])
            status = "Key copied. Paste it when Shortcuts asks."
            openURL(automation.icloudUrl ?? API.page("download/\(automation.slug)"))
        } catch {
            status = error.localizedDescription
        }
    }
}
