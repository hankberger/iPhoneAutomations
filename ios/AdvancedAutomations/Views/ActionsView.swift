import SwiftUI

// The building blocks, which this app adds to Shortcuts as native actions.
struct ActionsView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @State private var searchText = ""

    private let columns = [GridItem(.adaptive(minimum: 300), spacing: 14)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Composable AI actions for your own shortcuts. Pass in an input, get a predictable result, and chain it into the next action.")
                        .foregroundStyle(.secondary)
                    SectionHeader(title: "Start with an input", subtitle: "Search for the kind of thing you have")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(Set(catalog.blocks.compactMap(\.input)).sorted()), id: \.self) { input in
                                Chip(title: input, selected: searchText == input) { searchText = searchText == input ? "" : input }
                            }
                        }
                    }
                    .scrollClipDisabled()

                    SectionHeader(title: searchText.isEmpty ? "Building blocks" : "Matching blocks", subtitle: "These show up as actions under Advanced Automations in Shortcuts")
                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(catalog.matching(searchText)) { a in
                            NavigationLink(value: a) { AutomationCard(automation: a) }
                                .buttonStyle(.plain)
                        }
                    }
                }
                .padding([.horizontal, .bottom])
            }
            .navigationTitle("AI Actions")
            .searchable(text: $searchText, prompt: "Search blocks, inputs, or outcomes")
            .navigationDestination(for: Automation.self) { AutomationDetailView(automation: $0) }
            .refreshable { await catalog.refresh() }
        }
    }
}
