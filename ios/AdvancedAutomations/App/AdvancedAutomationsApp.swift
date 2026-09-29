import SwiftUI

@main
struct AdvancedAutomationsApp: App {
    @StateObject private var catalog = CatalogStore()
    @StateObject private var session = Session()

    var body: some Scene {
        WindowGroup {
            TabView {
                BrowseView()
                    .tabItem { Label("Automations", systemImage: "square.grid.2x2") }
                ActionsView()
                    .tabItem { Label("AI Actions", systemImage: "sparkles") }
                AccountView()
                    .tabItem { Label("Account", systemImage: "person.crop.circle") }
            }
            .tint(.primary)
            .environmentObject(catalog)
            .environmentObject(session)
            .task { await catalog.refresh() }
        }
    }
}
