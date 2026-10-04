import Foundation

// Mirrors publicCatalog() in src/catalog.js. Prompts and models stay on the server.
struct Catalog: Codable {
    var categories: [String]
    var automations: [Automation]
}

struct Automation: Codable, Identifiable, Hashable {
    struct Step: Codable, Hashable {
        var action: String
        var detail: String?
    }

    var slug: String
    var name: String
    var tagline: String
    var category: String
    var icon: String
    var color: String
    var trigger: String
    var runTip: String
    var inside: [Step]
    var typicalCost: Double
    var icloudUrl: URL?
    var block: Bool?
    var tags: [String]?
    var input: String?
    var output: String?
    var pairWith: [String]?

    var id: String { slug }
    var isBlock: Bool { block ?? false }

    var searchableText: String {
        [name, tagline, category, trigger, input, output, tags?.joined(separator: " ")]
            .compactMap { $0 }
            .joined(separator: " ")
            .lowercased()
    }

    // Same rounding as cents() in src/views.js.
    var typicalCostLabel: String {
        let c = typicalCost * 100
        if c < 0.01 { return "<0.01¢" }
        let twoDigits = Double(String(format: "%.2g", c)) ?? c
        return "~\(twoDigits.formatted())¢"
    }
}

// Loads the live catalog, falling back to the last one fetched and then to the copy bundled
// with the app (npm run ios:catalog), so the list is never empty.
@MainActor
final class CatalogStore: ObservableObject {
    @Published private(set) var catalog: Catalog

    private static let cacheURL = URL.cachesDirectory.appending(path: "catalog.json")

    // Website-only shortcuts. Log My Meal writes AI estimates to Apple Health, which App Review
    // treats as inaccurate health data (5.1.3), so the app doesn't offer it.
    private static let hiddenInApp: Set<String> = ["snap-calories"]

    init() {
        catalog = Self.visible(Self.load(Self.cacheURL) ?? Self.load(Bundle.main.url(forResource: "catalog", withExtension: "json")) ?? Catalog(categories: [], automations: []))
    }

    func refresh() async {
        guard let data = try? await API.shared.catalogData(),
              let fresh = try? JSONDecoder().decode(Catalog.self, from: data) else { return }
        catalog = Self.visible(fresh)
        try? data.write(to: Self.cacheURL, options: .atomic)
    }

    private static func visible(_ catalog: Catalog) -> Catalog {
        var c = catalog
        c.automations.removeAll { hiddenInApp.contains($0.slug) }
        c.categories.removeAll { category in !c.automations.contains { $0.category == category } }
        return c
    }

    func automations(in category: String?) -> [Automation] {
        guard let category else { return catalog.automations.filter { !$0.isBlock } }
        return catalog.automations.filter { $0.category == category }
    }

    func matching(_ text: String, in category: String? = nil, blocksOnly: Bool = false) -> [Automation] {
        let query = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return catalog.automations.filter { automation in
            (!blocksOnly || automation.isBlock) &&
            (category == nil || automation.category == category) &&
            (query.isEmpty || automation.searchableText.contains(query) || (automation.tags ?? []).contains { $0.lowercased().contains(query) })
        }
    }

    func automation(slug: String) -> Automation? {
        catalog.automations.first { $0.slug == slug }
    }

    func related(to automation: Automation) -> [Automation] {
        (automation.pairWith ?? []).compactMap { self.automation(slug: $0) }
    }

    var featured: [Automation] {
        let preferred = ["summarize-anything", "smart-reminders", "voice-to-notes", "explain-this"]
        return preferred.compactMap { automation(slug: $0) }
    }

    var blocks: [Automation] { catalog.automations.filter(\.isBlock) }

    // Categories for the browse filter; building blocks have their own tab.
    var browseCategories: [String] { catalog.categories.filter { c in !blocks.contains { $0.category == c } } }

    private static func load(_ url: URL?) -> Catalog? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Catalog.self, from: data)
    }
}
