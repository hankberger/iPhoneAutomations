import SwiftUI

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
                        Label("Shortcuts action", systemImage: "square.stack.3d.up")
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

                NativeActionSection(automation: automation)

                RelatedAutomationsSection(automation: automation)
            }
            .padding(.horizontal)
            .padding(.vertical, 20)
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
}

private struct RelatedAutomationsSection: View {
    var automation: Automation
    @EnvironmentObject private var catalog: CatalogStore

    var body: some View {
        let related = catalog.related(to: automation)
        if !related.isEmpty {
            Section(title: "Good next steps") {
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
