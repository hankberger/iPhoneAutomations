import SwiftUI
import StoreKit

struct CreditStoreView: View {
    @EnvironmentObject private var store: PurchaseStore
    @EnvironmentObject private var session: Session

    var body: some View {
        List {
            SwiftUI.Section {
                ForEach(store.products) { product in
                    Button {
                        Task { await store.buy(product); await session.refreshBalance() }
                    } label: {
                        HStack {
                            Text("\((store.credit[product.id] ?? 0).formatted(.currency(code: "USD"))) AI credit")
                            Spacer()
                            Text(product.displayPrice).fontWeight(.semibold)
                        }
                    }.disabled(store.busy)
                }
                if store.busy { ProgressView() }
                if let message = store.message { Text(message).font(.footnote) }
                if store.products.isEmpty && !store.busy {
                    Button("Reload credit packs") { Task { await store.load() } }
                }
            } header: { Text("Buy credit") } footer: {
                Text("One-time purchases, no subscription. The button shows Apple’s price in your currency; each pack adds the stated USD-denominated AI usage credit. Purchased credit does not expire and is available on devices signed in to this account.")
            }
            SwiftUI.Section {
                Button("Retry pending purchases") {
                    Task { await store.retryPending(); await session.refreshBalance() }
                }.disabled(store.busy)
                Link("Request an Apple refund", destination: URL(string: "https://reportaproblem.apple.com")!)
            } footer: {
                Text("Already delivered credit is kept in your account balance. Pending purchases are retried automatically. Apple handles refunds; refunded credit is removed from your available balance.")
            }
        }
        .navigationTitle("Add Credit")
        .task { await store.load(); await store.retryPending(); await session.refreshBalance() }
    }
}
