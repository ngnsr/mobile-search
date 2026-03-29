import Foundation
import PDFKit
import React

@objc(PdfTextExtractor)
class PdfTextExtractor: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(extractText:resolver:rejecter:)
  func extractText(_ filePathOrUri: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let filePath: String
    if filePathOrUri.hasPrefix("file://") {
      filePath = String(filePathOrUri.dropFirst("file://".count))
    } else {
      filePath = filePathOrUri
    }

    let url = URL(fileURLWithPath: filePath)
    guard let document = PDFDocument(url: url) else {
      reject("PDF_OPEN_FAILED", "Unable to open PDF: \(filePath)", nil)
      return
    }

    var pages: [String] = []
    for index in 0..<document.pageCount {
      if let page = document.page(at: index), let text = page.string {
        let cleaned = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleaned.isEmpty {
          pages.append(cleaned)
        }
      }
    }

    resolve(pages.joined(separator: "\n\n"))
  }

  @objc(extractPages:resolver:rejecter:)
  func extractPages(_ filePathOrUri: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let filePath: String
    if filePathOrUri.hasPrefix("file://") {
      filePath = String(filePathOrUri.dropFirst("file://".count))
    } else {
      filePath = filePathOrUri
    }

    let url = URL(fileURLWithPath: filePath)
    guard let document = PDFDocument(url: url) else {
      reject("PDF_OPEN_FAILED", "Unable to open PDF: \(filePath)", nil)
      return
    }

    var pages: [String] = []
    for index in 0..<document.pageCount {
      if let page = document.page(at: index), let text = page.string {
        pages.append(text)
      } else {
        pages.append("")
      }
    }

    resolve(pages)
  }
}
