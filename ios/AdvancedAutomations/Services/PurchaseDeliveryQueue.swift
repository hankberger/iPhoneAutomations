import Foundation

// StoreKit can report the same transaction through purchase(), updates and
// unfinished at once. Every caller must await the same delivery result: merely
// skipping a duplicate would incorrectly tell the purchase UI it succeeded.
@MainActor
final class PurchaseDeliveryQueue {
    private var pending: [UInt64: Task<Void, Error>] = [:]

    func deliver(id: UInt64, operation: @escaping @MainActor () async throws -> Void) async throws {
        if let delivery = pending[id] {
            try await delivery.value
            return
        }
        let delivery = Task { try await operation() }
        pending[id] = delivery
        defer { pending[id] = nil }
        try await delivery.value
    }
}
