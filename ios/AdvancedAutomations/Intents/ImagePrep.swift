import AppIntents
import UIKit

// Same as the shortcuts' Resize Image step: a 1024 pixel JPEG, so every run costs about the same.
enum ImagePrep {
    static func base64JPEG(_ file: IntentFile, longestEdge: CGFloat = 1024) throws -> String {
        guard let image = UIImage(data: file.data) else {
            throw APIError(message: "That file isn’t an image this can read. Try a photo or screenshot.")
        }
        let scale = min(1, longestEdge / max(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let jpeg = resized.jpegData(compressionQuality: 0.7) else {
            throw APIError(message: "Couldn’t prepare that image. Try another one.")
        }
        return jpeg.base64EncodedString()
    }
}
