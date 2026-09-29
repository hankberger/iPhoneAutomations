import AppIntents
import UniformTypeIdentifiers

// The building blocks from src/catalog.js as native Shortcuts actions. Each one calls
// /api/v1/run/<slug> with the app's key, the same request the Run Shortcut versions make,
// so their prompts and models still live on the server.

struct AskAIIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask AI"
    static let description = IntentDescription(
        "Text in, answer out. Tell it what to do, and optionally give it text to work on, like your clipboard or an email.",
        categoryName: "Text",
        searchKeywords: ["chat", "gpt", "llm", "summarize", "rewrite", "prompt"]
    )

    @Parameter(title: "Instructions", description: "What to do, like “Summarize in three lines”.", inputOptions: String.IntentInputOptions(multiline: true))
    var instructions: String

    @Parameter(title: "Text", description: "What to work on. Leave empty to just ask a question.", inputOptions: String.IntentInputOptions(multiline: true))
    var text: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Ask AI to \(\.$instructions)") {
            \.$text
        }
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let text = text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        // With nothing to work on, the instructions are the whole question.
        let body = text.isEmpty ? ["input": instructions] : ["input": text, "instructions": instructions]
        return .result(value: try await API.shared.run("ask-ai", body).text)
    }
}

struct AskAboutImageIntent: AppIntent {
    static let title: LocalizedStringResource = "Ask AI About an Image"
    static let description = IntentDescription(
        "A photo or screenshot plus a question, answered in words. With no question, it describes the image, including any text in it.",
        categoryName: "Images",
        searchKeywords: ["photo", "screenshot", "vision", "describe", "look"]
    )

    @Parameter(title: "Image", supportedTypeIdentifiers: ["public.image"])
    var image: IntentFile

    @Parameter(title: "Question", inputOptions: String.IntentInputOptions(multiline: true))
    var question: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Ask AI about \(\.$image)") {
            \.$question
        }
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        var body = ["image": try ImagePrep.base64JPEG(image)]
        if let question, !question.isEmpty { body["instructions"] = question }
        return .result(value: try await API.shared.run("ask-about-image", body).text)
    }
}

struct TranscribeAudioIntent: AppIntent {
    static let title: LocalizedStringResource = "Transcribe Audio"
    static let description = IntentDescription(
        "A recording or voice memo in, the words out. Pair it with Ask AI to summarize what was said. Up to about 45 minutes.",
        categoryName: "Audio",
        searchKeywords: ["speech", "dictation", "voice memo", "whisper", "transcript"]
    )

    @Parameter(title: "Recording", supportedTypeIdentifiers: ["public.audio"])
    var recording: IntentFile

    static var parameterSummary: some ParameterSummary {
        Summary("Transcribe \(\.$recording)")
    }

    // Matches MAX_AUDIO_BYTES in src/inference.js.
    private static let maxBytes = 25 * 1024 * 1024

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let data = recording.data
        guard !data.isEmpty else { throw APIError(message: "The recording was empty. Record again, then stop when you’re done.") }
        guard data.count <= Self.maxBytes else { throw APIError(message: "That recording is too long. Recordings up to about 45 minutes work.") }
        return .result(value: try await API.shared.run("transcribe-audio", audio: data).text)
    }
}

struct PullOutDetailsIntent: AppIntent {
    static let title: LocalizedStringResource = "Pull Out Details"
    static let description = IntentDescription(
        "Name the details you want, like “total, date, store”, and get them back from text or a photo. Use Get Dictionary Value on the result to read each one.",
        categoryName: "Text",
        searchKeywords: ["extract", "parse", "receipt", "json", "dictionary", "fields"]
    )

    @Parameter(title: "Details", description: "Comma-separated names, like “total, date, store”.")
    var details: String

    @Parameter(title: "Text", inputOptions: String.IntentInputOptions(multiline: true))
    var text: String?

    @Parameter(title: "Image", supportedTypeIdentifiers: ["public.image"])
    var image: IntentFile?

    static var parameterSummary: some ParameterSummary {
        Summary("Pull out \(\.$details) from \(\.$text)") {
            \.$image
        }
    }

    // Returns the JSON text, which Get Dictionary Value and Get Dictionary from Input read directly.
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        var body = ["instructions": details]
        if let image {
            body["image"] = try ImagePrep.base64JPEG(image)
        } else if let text, !text.isEmpty {
            body["input"] = text
        } else {
            throw APIError(message: "Give it some text or a photo to pull the details out of.")
        }
        return .result(value: try await API.shared.run("pull-out-details", body).text)
    }
}

struct PickCategoryIntent: AppIntent {
    static let title: LocalizedStringResource = "Pick a Category"
    static let description = IntentDescription(
        "Give it text and a list of choices; it answers with exactly one, written as you gave it, ready for an If. Add a description after a colon if it helps, like “Urgent: needs action today”.",
        categoryName: "Text",
        searchKeywords: ["classify", "sort", "label", "triage", "choose"]
    )

    @Parameter(title: "Text", inputOptions: String.IntentInputOptions(multiline: true))
    var text: String

    @Parameter(title: "Choices", description: "At least two.")
    var choices: [String]

    static var parameterSummary: some ParameterSummary {
        Summary("Sort \(\.$text) into \(\.$choices)")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let choices = choices.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard choices.count >= 2 else { throw APIError(message: "Give it at least two choices, like Work, Personal and Errands.") }
        // One per line, so the server keeps commas inside a choice's description.
        let body = ["input": text, "instructions": choices.joined(separator: "\n")]
        return .result(value: try await API.shared.run("pick-a-category", body).text)
    }
}

struct MakeImageIntent: AppIntent {
    static let title: LocalizedStringResource = "Make an Image"
    static let description = IntentDescription(
        "Describe a picture and get a 1024 pixel image back. Save it to Photos or set it as your wallpaper.",
        categoryName: "Images",
        searchKeywords: ["generate", "draw", "picture", "art", "dall-e", "wallpaper"]
    )

    @Parameter(title: "Description", inputOptions: String.IntentInputOptions(multiline: true))
    var prompt: String

    static var parameterSummary: some ParameterSummary {
        Summary("Make an image of \(\.$prompt)")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<IntentFile> {
        let base64 = try await API.shared.run("make-an-image", ["input": prompt]).text
        guard let jpeg = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
            throw APIError(message: "The image didn’t come through. Please try again.")
        }
        return .result(value: IntentFile(data: jpeg, filename: "Image.jpg", type: .jpeg))
    }
}
