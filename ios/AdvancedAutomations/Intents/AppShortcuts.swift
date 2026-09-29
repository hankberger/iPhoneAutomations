import AppIntents

// Surfaces the blocks in Spotlight and Siri, and at the top of the app's section in Shortcuts.
// Every action in BlockIntents.swift shows up in Shortcuts whether or not it is listed here.
struct AdvancedAutomationsShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskAIIntent(),
            phrases: ["Ask AI in \(.applicationName)", "Ask \(.applicationName)"],
            shortTitle: "Ask AI",
            systemImageName: "sparkles"
        )
        AppShortcut(
            intent: AskAboutImageIntent(),
            phrases: ["Ask \(.applicationName) about an image"],
            shortTitle: "Ask About an Image",
            systemImageName: "eye"
        )
        AppShortcut(
            intent: TranscribeAudioIntent(),
            phrases: ["Transcribe audio with \(.applicationName)"],
            shortTitle: "Transcribe Audio",
            systemImageName: "mic"
        )
        AppShortcut(
            intent: PullOutDetailsIntent(),
            phrases: ["Pull out details with \(.applicationName)"],
            shortTitle: "Pull Out Details",
            systemImageName: "list.bullet.rectangle"
        )
        AppShortcut(
            intent: PickCategoryIntent(),
            phrases: ["Pick a category with \(.applicationName)"],
            shortTitle: "Pick a Category",
            systemImageName: "tag"
        )
        AppShortcut(
            intent: MakeImageIntent(),
            phrases: ["Make an image with \(.applicationName)"],
            shortTitle: "Make an Image",
            systemImageName: "photo"
        )
    }

    static let shortcutTileColor: ShortcutTileColor = .purple
}
