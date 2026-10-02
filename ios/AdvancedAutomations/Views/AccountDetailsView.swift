import SwiftUI

struct AccountDetailsView: View {
    @EnvironmentObject private var session: Session
    @Environment(\.dismiss) private var dismiss
    @State private var account: API.Account?
    @State private var error: String?
    @State private var selectedKey: API.Account.Key?
    @State private var revoking = false

    var body: some View {
        List {
            if let account {
                SwiftUI.Section { Text(account.email) }
                SwiftUI.Section("Active keys") {
                    ForEach(account.keys) { key in
                        Button(role: .destructive) { selectedKey = key } label: {
                            VStack(alignment: .leading) {
                                Text(key.name)
                                Text("\(key.prefix)… · Tap to revoke").font(.caption).foregroundStyle(.secondary)
                            }
                        }.disabled(revoking)
                    }
                }
                SwiftUI.Section("Recent balance changes") {
                    ForEach(account.history) { entry in
                        VStack(alignment: .leading) {
                            Text(entry.description)
                            Text(Double(entry.amount_micros) / 1_000_000, format: .currency(code: "USD"))
                            Text(Date(timeIntervalSince1970: entry.created_at / 1000), style: .date).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            } else if error == nil { ProgressView() }
            if let error { Text(error).foregroundStyle(.red); Button("Retry") { Task { await load() } } }
        }
        .navigationTitle("Keys and History")
        .task { await load() }
        .refreshable { await load() }
        .confirmationDialog("Revoke this key?", isPresented: Binding(get: { selectedKey != nil }, set: { if !$0 { selectedKey = nil } })) {
            if let key = selectedKey {
                Button("Revoke \(key.name)", role: .destructive) {
                    Task {
                        revoking = true
                        defer { revoking = false }
                        do {
                            if try await API.shared.revokeKey(key.id) { session.signOut(); dismiss() }
                            else { await load() }
                        } catch { self.error = error.localizedDescription }
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Anything using this key will stop working. Revoking this app’s key signs you out.") }
    }
    private func load() async {
        do { account = try await API.shared.account(); error = nil }
        catch { self.error = error.localizedDescription }
    }
}
