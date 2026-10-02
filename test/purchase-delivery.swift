import Foundation

// Compiled with the actual queue. No StoreKit account, payments or server calls.
@MainActor private final class Gate {
    private var opened = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    func wait() async {
        if opened { return }
        await withCheckedContinuation { waiters.append($0) }
    }
    func open() {
        opened = true
        for waiter in waiters { waiter.resume() }
        waiters = []
    }
}
private enum SyntheticFailure: Error { case offline }

@main struct PurchaseDeliveryChecks {
    @MainActor static func main() async throws {
        let queue = PurchaseDeliveryQueue()
        for fails in [false, true] {
            let started = Gate(), release = Gate(), joined = Gate()
            var deliveries = 0
            var completed = 0
            let first = Task {
                try await queue.deliver(id: 42) {
                    deliveries += 1
                    started.open()
                    await release.wait()
                    if fails { throw SyntheticFailure.offline }
                }
                completed += 1
            }
            await started.wait()
            let duplicate = Task {
                joined.open()
                try await queue.deliver(id: 42) { fatalError("Duplicate delivery must share the pending result") }
                completed += 1
            }
            await joined.wait()
            // Let both callers reach the pending task without any wall-clock sleep.
            await Task.yield()
            precondition(completed == 0, "A duplicate must not report success before delivery completes")
            release.open()
            for task in [first, duplicate] {
                switch await task.result {
                case .success: precondition(!fails)
                case .failure(let error): precondition(fails && error is SyntheticFailure)
                }
            }
            precondition(deliveries == 1)
            precondition(completed == (fails ? 0 : 2))
            // Failed work is not cached forever; a later retry runs and can finish.
            try await queue.deliver(id: 42) { deliveries += 1 }
            precondition(deliveries == 2)
        }
        let blocked = Gate(), started = Gate()
        let slow = Task {
            try await queue.deliver(id: 1) { started.open(); await blocked.wait() }
        }
        await started.wait()
        var independentFinished = false
        try await queue.deliver(id: 2) { independentFinished = true }
        precondition(independentFinished, "Different purchases must not block one another")
        blocked.open()
        try await slow.value
        print("Purchase delivery checks passed: shared completion/error, no early success, retry and independent transactions")
    }
}
