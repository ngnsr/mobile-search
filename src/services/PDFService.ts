// src/services/PDFService.ts
import { NativeModules } from 'react-native';
import { Logger } from '../utils/logger';

type NativePdfTextExtractor = {
  extractText: (filePathOrUri: string) => Promise<string>;
  extractPages: (filePathOrUri: string) => Promise<string[]>;
};

const NativeExtractor = NativeModules.PdfTextExtractor as NativePdfTextExtractor | undefined;

export class PDFService {
  private static normalizeFilePathOrUri(filePathOrUri: string): string {
    try {
      return decodeURIComponent(filePathOrUri);
    } catch {
      return filePathOrUri;
    }
  }

  static async extractTextFromFileUri(filePathOrUri: string): Promise<string> {
    const t0 = Date.now();
    if (!NativeExtractor?.extractText) {
      throw new Error('PdfTextExtractor native module is unavailable');
    }

    const normalized = this.normalizeFilePathOrUri(filePathOrUri);
    const text = ((await NativeExtractor.extractText(normalized)) ?? '').trim();
    Logger.info('PDFService', `Extracted ${text.length} chars in ${Date.now() - t0}ms`);
    return text;
  }

  static async extractPagesFromFileUri(filePathOrUri: string): Promise<string[]> {
    const t0 = Date.now();
    if (!NativeExtractor?.extractPages) {
      // Fallback to single blob.
      const text = await this.extractTextFromFileUri(filePathOrUri);
      return text ? [text] : [];
    }

    const normalized = this.normalizeFilePathOrUri(filePathOrUri);
    const pages = (await NativeExtractor.extractPages(normalized)) ?? [];
    const cleaned = pages
      .map((p) => (p ?? '').replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 0);
    Logger.info('PDFService', `Extracted ${cleaned.length} pages in ${Date.now() - t0}ms`);
    return cleaned;
  }
}
