import SwiftUI

@main
struct AdvancedAutomationsApp: App {
    @StateObject private var catalog = CatalogStore()
    @StateObject private var session = Session()
    @StateObject private var purchases = PurchaseStore()
    @State private var browsing = false
    @Environment(\.scenePhase) private var scenePhase

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
            .environmentObject(purchases)
            .task { await catalog.refresh() }
            .task(id: session.isSignedIn) {
                if session.isSignedIn { await purchases.retryPending(); await session.refreshBalance() }
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active && session.isSignedIn {
                    Task { await purchases.retryPending(); await session.refreshBalance() }
                }
            }
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
