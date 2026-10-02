import StoreKit
import SwiftUI

@MainActor
final class PurchaseStore: ObservableObject {
    @Published private(set) var products: [Product] = []
    @Published private(set) var credit: [String: Double] = [:]
    @Published private(set) var busy = false
    @Published var message: String?
    private var configuration: API.StoreConfiguration?
    private var configurationKey: String?
    private var delivering: Set<UInt64> = []
    private var updates: Task<Void, Never>?

    init() {
        updates = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard let self else { return }
                do { try await self.deliver(result) }
                catch { self.message = error.localizedDescription }
            }
        }
    }
    deinit { updates?.cancel() }

    func load() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        products = []
        configuration = nil
        message = nil
        let key = Keychain.apiKey
        do {
            let config = try await API.shared.storeConfiguration()
            guard key == Keychain.apiKey else { return }
            guard config.enabled else { throw APIError(message: "Purchases are temporarily unavailable. Please try again later.") }
            let loaded = try await Product.products(for: config.products.map(\.id))
            guard key == Keychain.apiKey else { return }
            configuration = config
            configurationKey = key
            credit = Dictionary(uniqueKeysWithValues: config.products.map { ($0.id, $0.credit_usd) })
            products = loaded.filter { $0.type == .consumable }.sorted { (credit[$0.id] ?? 0) < (credit[$1.id] ?? 0) }
            if products.isEmpty { message = "No credit packs are available in the App Store right now. Please try again later." }
        } catch { message = error.localizedDescription }
    }

    func buy(_ product: Product) async {
        guard !busy, let configuration, configurationKey == Keychain.apiKey else { return }
        busy = true
        message = nil
        defer { busy = false }
        do {
            switch try await product.purchase(options: [.appAccountToken(configuration.app_account_token)]) {
            case .success(let result):
                try await deliver(result)
                message = "Purchase confirmed. Your account balance is up to date."
            case .pending: message = "Waiting for purchase approval. Your credit will be added once Apple confirms payment."
            case .userCancelled: break
            @unknown default: message = "The purchase hasn’t completed. Please try again."
            }
        } catch { message = error.localizedDescription }
    }

    func retryPending() async {
        guard Keychain.apiKey != nil else { return }
        for await result in StoreKit.Transaction.unfinished {
            do { try await deliver(result) }
            catch { message = error.localizedDescription }
        }
    }

    private func deliver(_ result: VerificationResult<StoreKit.Transaction>) async throws {
        guard case .verified(let transaction) = result else {
            throw APIError(message: "Apple could not verify the purchase. No credit has been added.")
        }
        guard !delivering.contains(transaction.id) else { return }
        delivering.insert(transaction.id)
        defer { delivering.remove(transaction.id) }
        let key = Keychain.apiKey
        guard key != nil else { throw APIError(message: "Sign in to the account used for this purchase to receive its credit.") }
        let config = try await API.shared.storeConfiguration()
        guard key == Keychain.apiKey, transaction.appAccountToken == config.app_account_token else {
            throw APIError(message: "A pending purchase belongs to another account. Sign in to the account that bought it to receive the credit.")
        }
        // Finish only after the server verifies with Apple and durably records the
        // credit (or refund). Failed delivery remains unfinished for the next launch.
        try await API.shared.deliverPurchase(result.jwsRepresentation)
        await transaction.finish()
    }
}
