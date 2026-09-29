import SwiftUI

struct BrowseView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @State private var category: String?

    private let columns = [GridItem(.adaptive(minimum: 300), spacing: 14)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("All free. Each one runs in the Shortcuts app and calls our API with your key.")
                        .foregroundStyle(.secondary)
                        .padding(.horizontal)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Chip(title: "All", selected: category == nil) { category = nil }
                            ForEach(catalog.browseCategories, id: \.self) { c in
                                Chip(title: c, selected: category == c) { category = c }
                            }
                        }
                        .padding(.horizontal)
                    }

                    LazyVGrid(columns: columns, spacing: 14) {
                        ForEach(catalog.automations(in: category)) { a in
                            NavigationLink(value: a) { AutomationCard(automation: a) }
                                .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.bottom, 24)
            }
            .navigationTitle("Automations")
            .navigationDestination(for: Automation.self) { AutomationDetailView(automation: $0) }
            .refreshable { await catalog.refresh() }
        }
    }
}

struct Chip: View {
    var title: String
    var selected: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .foregroundStyle(selected ? Color(uiColor: .systemBackground) : .primary)
                .background(selected ? Color.primary : Color.secondary.opacity(0.12), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
