import SwiftUI

struct BrowseView: View {
    @EnvironmentObject private var catalog: CatalogStore
    @State private var category: String?
    @State private var searchText = ""

    private let columns = [GridItem(.adaptive(minimum: 300), spacing: 14)]

    private var results: [Automation] {
        catalog.matching(searchText, in: category)
    }

    private var isSearching: Bool {
        !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Ready-made shortcuts for the moments you repeat. Add one to Shortcuts, or search by what you want to do.")
                        .foregroundStyle(.secondary)
                        .padding(.horizontal)

                    if !isSearching && category == nil {
                        SectionHeader(title: "Start here", subtitle: "Useful automations you can install in a tap")
                            .padding(.horizontal)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(alignment: .top, spacing: 12) {
                                ForEach(catalog.featured) { a in
                                    NavigationLink(value: a) { CompactAutomationCard(automation: a) }
                                        .buttonStyle(.plain)
                                }
                            }
                        }
                        .contentMargins(.horizontal, 16, for: .scrollContent)
                    }

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            Chip(title: "All", selected: category == nil) { category = nil }
                            ForEach(catalog.browseCategories, id: \.self) { c in
                                Chip(title: c, selected: category == c) { category = c }
                            }
                        }
                    }
                    .contentMargins(.horizontal, 16, for: .scrollContent)

                    if results.isEmpty {
                        ContentUnavailableView.search(text: searchText.isEmpty ? "these filters" : searchText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 36)
                    } else {
                        SectionHeader(title: isSearching || category != nil ? "Results" : "All automations", subtitle: "Each one runs in Apple Shortcuts")
                            .padding(.horizontal)

                        LazyVGrid(columns: columns, spacing: 14) {
                            ForEach(results) { a in
                                NavigationLink(value: a) { AutomationCard(automation: a) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal)
                    }
                }
                .padding(.bottom, 24)
            }
            .navigationTitle("Automations")
            .searchable(text: $searchText, prompt: "Search by task, input, or outcome")
            .navigationDestination(for: Automation.self) { AutomationDetailView(automation: $0) }
            .refreshable { await catalog.refresh() }
        }
    }
}

struct SectionHeader: View {
    var title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.display(22))
            if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(.secondary) }
        }
    }
}

struct CompactAutomationCard: View {
    var automation: Automation

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            IconTile(automation: automation, size: 42)
            Text(automation.name).font(.headline).foregroundStyle(.primary)
            Text(automation.tagline)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(3)
        }
        .multilineTextAlignment(.leading)
        .padding(14)
        .frame(width: 196, height: 164, alignment: .topLeading)
        .background(Theme.color(automation.color).opacity(0.09), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
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
