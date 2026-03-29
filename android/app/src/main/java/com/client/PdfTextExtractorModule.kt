package com.client

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.bridge.Arguments
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File

@ReactModule(name = PdfTextExtractorModule.NAME)
class PdfTextExtractorModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "PdfTextExtractor"
  }

  init {
    // Required by pdfbox-android to access bundled resources.
    PDFBoxResourceLoader.init(reactContext)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun extractText(filePathOrUri: String, promise: Promise) {
    try {
      val filePath =
        if (filePathOrUri.startsWith("file://")) filePathOrUri.substring("file://".length)
        else filePathOrUri

      val file = File(filePath)
      if (!file.exists()) {
        promise.reject("ENOENT", "PDF file does not exist: $filePath")
        return
      }

      PDDocument.load(file).use { document ->
        val stripper = PDFTextStripper()
        val text = stripper.getText(document) ?: ""
        promise.resolve(text)
      }
    } catch (e: Exception) {
      promise.reject("PDF_EXTRACT_FAILED", e.message, e)
    }
  }

  @ReactMethod
  fun extractPages(filePathOrUri: String, promise: Promise) {
    try {
      val filePath =
        if (filePathOrUri.startsWith("file://")) filePathOrUri.substring("file://".length)
        else filePathOrUri

      val file = File(filePath)
      if (!file.exists()) {
        promise.reject("ENOENT", "PDF file does not exist: $filePath")
        return
      }

      PDDocument.load(file).use { document ->
        val pageCount = document.numberOfPages
        val arr = Arguments.createArray()
        val stripper = PDFTextStripper()
        for (i in 1..pageCount) {
          stripper.startPage = i
          stripper.endPage = i
          val text = stripper.getText(document) ?: ""
          arr.pushString(text)
        }
        promise.resolve(arr)
      }
    } catch (e: Exception) {
      promise.reject("PDF_EXTRACT_FAILED", e.message, e)
    }
  }
}
