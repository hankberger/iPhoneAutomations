import SwiftUI

@main
struct AdvancedAutomationsApp: App {
    @StateObject private var catalog = CatalogStore()
    @StateObject private var session = Session()
    @State private var browsing = false

    var body: some Scene {
        WindowGroup {
            Group {
                if session.isSignedIn || browsing {
                    tabs
                } else {
                    WelcomeView(onBrowse: { browsing = true })
                }
            }
            .animation(.default, value: session.isSignedIn)
            .environmentObject(catalog)
            .environmentObject(session)
            .task { await catalog.refresh() }
        }
    }

    private var tabs: some View {
        TabView {
            BrowseView()
                .tabItem { Label("Automations", systemImage: "square.grid.2x2") }
            ActionsView()
                .tabItem { Label("AI Actions", systemImage: "sparkles") }
            AccountView()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
        }
        .tint(.primary)
    }
}
