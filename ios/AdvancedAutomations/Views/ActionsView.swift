import SwiftUI

// The building blocks, which this app adds to Shortcuts as native actions.
struct ActionsView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @EnvironmentObject private var session: Session

    private let columns = [GridItem(.adaptive(minimum: 300), spacing: 14)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Build your own shortcuts with AI. These show up as actions in the Shortcuts app, under Advanced Automations.")
                        .foregroundStyle(.secondary)
                    if !session.isSignedIn {
                        SignInCard(message: "Sign in once and every action runs on your credit. Most runs cost under a cent.")
                    }
                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(catalog.blocks) { a in
                            NavigationLink(value: a) { AutomationCard(automation: a) }
                                .buttonStyle(.plain)
                        }
                    }
                }
                .padding([.horizontal, .bottom])
            }
            .navigationTitle("AI Actions")
            .navigationDestination(for: Automation.self) { AutomationDetailView(automation: $0) }
            .refreshable { await catalog.refresh() }
        }
    }
}
