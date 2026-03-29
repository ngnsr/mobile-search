import { errorCodes, isErrorWithCode, keepLocalCopy, pick, pickDirectory, types } from '@react-native-documents/picker';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { DocumentService, DocumentSource } from './DocumentService';
import { Logger } from '../utils/logger';
import { PDFService } from './PDFService';

export class FileIndexingService {
  private documentService: DocumentService;

  constructor(documentService: DocumentService) {
    this.documentService = documentService;
  }

  private sanitizeFileName(name: string, index: number): string {
    const parts = name.split('.');
    const extension = parts.length > 1 ? parts.pop()!.toLowerCase() : '';
    const base = parts.join('.').trim();
    const safeBase = base
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 60);
    const finalBase = safeBase.length ? safeBase : `file_${Date.now()}_${index}`;
    return extension ? `${finalBase}.${extension}` : finalBase;
  }

  private stripFileScheme(pathOrUri: string): string {
    return pathOrUri.startsWith('file://') ? pathOrUri.slice('file://'.length) : pathOrUri;
  }

  async selectAndIndexFolder(): Promise<{ success: number; failed: number }> {
    try {
      if (Platform.OS === 'android') {
        Logger.warn('FileIndexingService', 'Folder indexing is not supported on Android. Please use "Select Files".');
        return { success: 0, failed: 0 };
      }

      // @react-native-documents/picker usage might differ slightly.
      // Usually pickDirectory returns the directory URI.
      const result = await pickDirectory({ requestLongTermAccess: false });
      Logger.info('FileIndexingService', `Selected directory: ${result.uri}`);
      
      // Indexing a whole folder on Android SAF is still complex.
      // For now we inform that it's experimental.
      // We can try to list files if RNFS supports the returned URI.
      
      let success = 0;
      let failed = 0;

      try {
        const files = await RNFS.readDir(result.uri);
        for (const file of files) {
          if (file.isFile()) {
            try {
              await this.indexFile(file.path, file.name || 'Untitled');
              success++;
            } catch {
              failed++;
            }
          }
        }
      } catch (e) {
        Logger.error('FileIndexingService', 'Failed to read directory content', e);
        // Fallback or error
      }
      
      return { success, failed };
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        Logger.info('FileIndexingService', 'User cancelled directory picker');
        return { success: 0, failed: 0 };
      }
      Logger.error('FileIndexingService', 'Error picking directory', err);
      throw err;
    }
  }

  async selectAndIndexFiles(): Promise<{ success: number; failed: number }> {
    try {
      const results = await pick({
        mode: 'open',
        requestLongTermAccess: true,
        type: [types.allFiles],
        allowMultiSelection: true,
      });

      let success = 0;
      let failed = 0;

      // Convert content:// URIs to local files on Android for RNFS compatibility.
      const copyResponses = await keepLocalCopy({
        files: results
          .filter((r) => !!r.uri && !!r.name)
          .map((r, idx) => ({ uri: r.uri, fileName: this.sanitizeFileName(r.name!, idx) })) as any,
        destination: 'documentDirectory',
      });
      const localUriBySource = new Map<string, string>();
      for (const c of copyResponses) {
        if (c.status === 'success') localUriBySource.set(c.sourceUri, c.localUri);
      }

      for (const res of results) {
        try {
          const localUri = localUriBySource.get(res.uri) ?? res.uri;
          await this.indexFile(localUri, res.name || 'Untitled', {
            uri: res.uri,
            localUri,
            name: res.name ?? null,
            kind: (res.name?.split('.').pop()?.toLowerCase() as any) ?? null,
          });
          success++;
        } catch (e) {
          Logger.error('FileIndexingService', `Failed to index file: ${res.name}`, e);
          failed++;
        }
      }

      return { success, failed };
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        Logger.info('FileIndexingService', 'User cancelled file picker');
        return { success: 0, failed: 0 };
      }
      Logger.error('FileIndexingService', 'Error picking files', err);
      throw err;
    }
  }

  private async indexFile(uri: string, name: string, source?: DocumentSource): Promise<void> {
    const extension = name.split('.').pop()?.toLowerCase();
    let content = '';

    if (extension === 'txt' || extension === 'md') {
      content = await this.readTextFile(uri);
      await this.documentService.addDocument(name, content, {
        ...source,
        kind: extension,
        ...(await this.readFileStat(uri)),
      });
      return;
    } else if (extension === 'pdf') {
      const pages = await this.readPdfPages(uri);
      content = pages.join('\n\n');
      if (content.trim()) {
        const prepared = pages.flatMap((pageText, idx) => {
          const chunks = this.chunkText(pageText, 300);
          return chunks.map((c) => ({ content: c, page_number: idx + 1 }));
        });
        await this.documentService.addDocumentFromPreparedChunks(name, content, prepared, {
          ...source,
          kind: 'pdf',
          ...(await this.readFileStat(uri)),
        });
        return;
      }
    } else {
      Logger.warn('FileIndexingService', `Unsupported file type: ${extension}`);
      return;
    }
    Logger.warn('FileIndexingService', `File ${name} is empty, skipping`);
  }

  private async readFileStat(uri: string): Promise<Pick<DocumentSource, 'mtime' | 'size'>> {
    try {
      const stat = await RNFS.stat(this.stripFileScheme(uri));
      const mtime = (stat.mtime instanceof Date ? stat.mtime.toISOString() : stat.mtime) as any;
      const size = typeof stat.size === 'number' ? stat.size : Number(stat.size);
      return { mtime: mtime ?? null, size: Number.isFinite(size) ? size : null };
    } catch {
      return { mtime: null, size: null };
    }
  }

  async reindexDocument(docId: number): Promise<void> {
    const doc = await this.documentService.getDocument(docId);
    if (!doc) throw new Error('Document not found');

    // For manual documents: just reindex stored text.
    if (!doc.source_uri && !doc.source_local_uri) {
      const chunks = this.chunkText(doc.content, 300).map((c) => ({ content: c, page_number: null }));
      await this.documentService.reindexDocumentFromPreparedChunks(doc.id, doc.title, doc.content, chunks);
      return;
    }

    // For imported files: try to refresh local copy from source_uri; fallback to source_local_uri.
    let localUri = doc.source_local_uri ?? null;
    if (doc.source_uri && doc.source_name) {
      try {
        const copyResponses = await keepLocalCopy({
          files: [{ uri: doc.source_uri, fileName: this.sanitizeFileName(doc.source_name, 0) }] as any,
          destination: 'documentDirectory',
        });
        const first = copyResponses?.[0];
        if (first?.status === 'success' && first.localUri) {
          localUri = first.localUri;
        }
      } catch {
        // ignore and fallback to localUri
      }
    }

    if (!localUri) {
      throw new Error('Cannot access the original file anymore. Please re-import it.');
    }

    const kind = doc.source_kind ?? (doc.source_name?.split('.').pop()?.toLowerCase() as any) ?? null;
    if (kind === 'pdf') {
      const pages = await this.readPdfPages(localUri);
      const content = pages.join('\n\n');
      const prepared = pages.flatMap((pageText, idx) => {
        const chunks = this.chunkText(pageText, 300);
        return chunks.map((c) => ({ content: c, page_number: idx + 1 }));
      });
      await this.documentService.reindexDocumentFromPreparedChunks(doc.id, doc.title, content, prepared, {
        uri: doc.source_uri,
        localUri,
        name: doc.source_name,
        kind: 'pdf',
        ...(await this.readFileStat(localUri)),
      });
    } else {
      const content = await this.readTextFile(localUri);
      const chunks = this.chunkText(content, 300).map((c) => ({ content: c, page_number: null }));
      await this.documentService.reindexDocumentFromPreparedChunks(doc.id, doc.title, content, chunks, {
        uri: doc.source_uri,
        localUri,
        name: doc.source_name,
        kind: (kind === 'md' ? 'md' : 'txt') as any,
        ...(await this.readFileStat(localUri)),
      });
    }
  }

  private async readTextFile(uri: string): Promise<string> {
    try {
      const decodedUri = decodeURIComponent(uri);
      return await RNFS.readFile(this.stripFileScheme(decodedUri), 'utf8');
    } catch {
       return await RNFS.readFile(this.stripFileScheme(uri), 'utf8');
    }
  }

  private chunkText(text: string, wordsPerChunk: number): string[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const words = trimmed.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    return chunks;
  }

  private async readPdfPages(uri: string): Promise<string[]> {
    try {
      Logger.info('FileIndexingService', `Reading PDF: ${uri}`);
      return await PDFService.extractPagesFromFileUri(uri);
    } catch (e) {
      Logger.error('FileIndexingService', `Failed to extract PDF text: ${uri}`, e);
      return [];
    }
  }
}
