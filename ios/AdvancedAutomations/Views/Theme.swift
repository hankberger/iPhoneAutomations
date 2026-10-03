import SwiftUI

// The site's palette (.c-* in public/styles.css) and its icon set (ICONS in src/views.js),
// as SF Symbols.
enum Theme {
    static func color(_ name: String) -> Color {
        switch name {
        case "orange": Color(hex: 0xFF6B3D)
        case "violet": Color(hex: 0x7C5CFF)
        case "green": Color(hex: 0x10B981)
        case "yellow": Color(hex: 0xF5B400)
        case "pink": Color(hex: 0xEC4899)
        case "sky": Color(hex: 0x0EA5E9)
        case "amber": Color(hex: 0xF97316)
        case "indigo": Color(hex: 0x6366F1)
        case "teal": Color(hex: 0x14B8A6)
        case "red": Color(hex: 0xEF4444)
        case "lime": Color(hex: 0x65A30D)
        case "blue": Color(hex: 0x3B82F6)
        default: .accentColor
        }
    }

    static func symbol(_ icon: String) -> String {
        switch icon {
        case "doc": "doc.text"
        case "chat": "bubble.left"
        case "mic": "mic"
        case "bell": "bell"
        case "receipt": "receipt"
        case "globe": "globe"
        case "sun": "sun.max"
        case "wand": "wand.and.stars"
        case "key": "key"
        case "bolt": "bolt"
        case "bulb": "lightbulb"
        case "wave": "waveform"
        case "apple": "carrot"
        case "shield": "exclamationmark.shield"
        case "spark": "sparkles"
        case "eye": "eye"
        case "list": "list.bullet.rectangle"
        case "tag": "tag"
        case "image": "photo"
        default: "square.grid.2x2"
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

extension Font {
    // Stands in for Bricolage Grotesque, the site's display face.
    static func display(_ size: CGFloat) -> Font { .system(size: size, weight: .bold) }
}

struct IconTile: View {
    var automation: Automation
    var size: CGFloat = 44

    var body: some View {
        Image(systemName: Theme.symbol(automation.icon))
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Theme.color(automation.color), in: RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
    }
}

struct AutomationCard: View {
    var automation: Automation

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            IconTile(automation: automation)
            Text(automation.name)
                .font(.display(20))
                .foregroundStyle(.primary)
            Text(automation.tagline)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 4)
            HStack {
                Text(automation.isBlock ? "Shortcuts action" : automation.trigger)
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        .multilineTextAlignment(.leading)
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.color(automation.color).opacity(0.09), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}
