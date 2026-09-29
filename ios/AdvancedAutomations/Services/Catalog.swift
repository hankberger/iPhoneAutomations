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

    var id: String { slug }
    var isBlock: Bool { block ?? false }

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

    init() {
        catalog = Self.load(Self.cacheURL) ?? Self.load(Bundle.main.url(forResource: "catalog", withExtension: "json")) ?? Catalog(categories: [], automations: [])
    }

    func refresh() async {
        guard let data = try? await API.shared.catalogData(),
              let fresh = try? JSONDecoder().decode(Catalog.self, from: data) else { return }
        catalog = fresh
        try? data.write(to: Self.cacheURL, options: .atomic)
    }

    func automations(in category: String?) -> [Automation] {
        guard let category else { return catalog.automations.filter { !$0.isBlock } }
        return catalog.automations.filter { $0.category == category }
    }

    var blocks: [Automation] { catalog.automations.filter(\.isBlock) }

    // Categories for the browse filter; building blocks have their own tab.
    var browseCategories: [String] { catalog.categories.filter { c in !blocks.contains { $0.category == c } } }

    private static func load(_ url: URL?) -> Catalog? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Catalog.self, from: data)
    }
}
