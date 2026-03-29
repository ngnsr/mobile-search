import { DB } from '@op-engineering/op-sqlite';
import { embeddingService } from './EmbeddingService';
import { Logger } from '../utils/logger';

export interface Document {
  id: number;
  title: string;
  content: string;
  created_at: string;
  status?: 'READY' | 'INDEXING' | 'FAILED';
  indexed_chunks?: number;
  total_chunks?: number;
  error_message?: string | null;
  fingerprint?: string | null;
  source_uri?: string | null;
  source_local_uri?: string | null;
  source_name?: string | null;
  source_kind?: 'txt' | 'md' | 'pdf' | null;
  source_mtime?: string | null;
  source_size?: number | null;
}

export interface DocumentChunk {
  id: number;
  content: string;
  page_number?: number | null;
}

export interface PreparedChunk {
  content: string;
  page_number?: number | null;
}

export interface DocumentSource {
  uri?: string | null;
  localUri?: string | null;
  name?: string | null;
  kind?: 'txt' | 'md' | 'pdf' | null;
  mtime?: string | null;
  size?: number | null;
}

export class DocumentService {
  private db: DB;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(db: DB) {
    this.db = db;
  }

  private async withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.writeQueue;
    this.writeQueue = prev.then(() => next);

    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async listDocuments(): Promise<Document[]> {
    const res = await this.db.execute('SELECT * FROM documents ORDER BY created_at DESC');
    return (res?.rows || []) as unknown as Document[];
  }

  async getDocument(docId: number): Promise<Document | null> {
    const res = await this.db.execute('SELECT * FROM documents WHERE id = ? LIMIT 1', [docId]);
    return (res?.rows?.[0] as unknown as Document) ?? null;
  }

  async listChunksForDocument(docId: number): Promise<DocumentChunk[]> {
    try {
      const res = await this.db.execute(
        'SELECT id, content, page_number FROM chunks WHERE document_id = ? ORDER BY id ASC',
        [docId],
      );
      return (res?.rows || []) as unknown as DocumentChunk[];
    } catch {
      // Old DB schema after fast refresh: `page_number` might not exist yet.
      const res = await this.db.execute('SELECT id, content FROM chunks WHERE document_id = ? ORDER BY id ASC', [docId]);
      return (res?.rows || []).map((r: any) => ({ ...r, page_number: null })) as unknown as DocumentChunk[];
    }
  }

  private fnv1a32(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  private buildFingerprint(title: string, content: string): string {
    const t = title.trim();
    const c = content.trim();
    return `${this.fnv1a32(`${t}\n${c}`)}:${c.length}`;
  }

  async addDocument(title: string, content: string, source?: DocumentSource): Promise<number> {
    Logger.info('DocumentService', `Adding document: ${title}`);
    
    try {
      const fingerprint = this.buildFingerprint(title, content);
      const existing = await this.db.execute('SELECT id FROM documents WHERE fingerprint = ? LIMIT 1', [fingerprint]);
      const existingId = existing?.rows?.[0]?.id as number | undefined;
      if (existingId) {
        Logger.info('DocumentService', `Duplicate document skipped (fingerprint=${fingerprint})`);
        return existingId;
      }

      const chunks = this.chunkText(content, 300).filter((c) => c.trim().length > 0);
      const totalChunks = chunks.length + 1; // + title chunk

      const docId = await this.withWriteLock(async () => {
        await this.db.execute('SAVEPOINT add_document;');
        try {
          const res = await this.db.execute(
            "INSERT INTO documents (title, content, status, indexed_chunks, total_chunks, updated_at, fingerprint, source_uri, source_local_uri, source_name, source_kind, source_mtime, source_size) VALUES (?, ?, 'INDEXING', 0, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)",
            [
              title,
              content,
              totalChunks,
              fingerprint,
              source?.uri ?? null,
              source?.localUri ?? null,
              source?.name ?? null,
              source?.kind ?? null,
              source?.mtime ?? null,
              source?.size ?? null,
            ],
          );
          await this.db.execute('RELEASE add_document;');
          return res.insertId!;
        } catch (e) {
          await this.db.execute('ROLLBACK TO add_document;');
          await this.db.execute('RELEASE add_document;');
          throw e;
        }
      });

      // Fire-and-forget indexing so UI stays responsive. Progress is persisted in `documents`.
      void this.indexDocument(docId, title, content);
      return docId;
    } catch (e) {
      Logger.error('DocumentService', 'Failed to add document', e);
      throw e;
    }
  }

  async addDocumentFromPreparedChunks(
    title: string,
    fullContent: string,
    chunks: PreparedChunk[],
    source?: DocumentSource,
  ): Promise<number> {
    Logger.info('DocumentService', `Adding document with prepared chunks: ${title}`);

    try {
      const fingerprint = this.buildFingerprint(title, fullContent);
      const existing = await this.db.execute('SELECT id FROM documents WHERE fingerprint = ? LIMIT 1', [fingerprint]);
      const existingId = existing?.rows?.[0]?.id as number | undefined;
      if (existingId) {
        Logger.info('DocumentService', `Duplicate document skipped (fingerprint=${fingerprint})`);
        return existingId;
      }

      const prepared = chunks.filter((c) => c.content.trim().length > 0);
      const totalChunks = prepared.length + 1; // + title chunk

      const docId = await this.withWriteLock(async () => {
        await this.db.execute('SAVEPOINT add_document_prepared;');
        try {
          const res = await this.db.execute(
            "INSERT INTO documents (title, content, status, indexed_chunks, total_chunks, updated_at, fingerprint, source_uri, source_local_uri, source_name, source_kind, source_mtime, source_size) VALUES (?, ?, 'INDEXING', 0, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)",
            [
              title,
              fullContent,
              totalChunks,
              fingerprint,
              source?.uri ?? null,
              source?.localUri ?? null,
              source?.name ?? null,
              source?.kind ?? null,
              source?.mtime ?? null,
              source?.size ?? null,
            ],
          );
          await this.db.execute('RELEASE add_document_prepared;');
          return res.insertId!;
        } catch (e) {
          await this.db.execute('ROLLBACK TO add_document_prepared;');
          await this.db.execute('RELEASE add_document_prepared;');
          throw e;
        }
      });

      void this.indexDocumentPrepared(docId, title, prepared);
      return docId;
    } catch (e) {
      Logger.error('DocumentService', 'Failed to add document (prepared chunks)', e);
      throw e;
    }
  }

  async reindexDocumentFromPreparedChunks(
    docId: number,
    title: string,
    fullContent: string,
    chunks: PreparedChunk[],
    source?: DocumentSource,
  ): Promise<void> {
    Logger.info('DocumentService', `Reindexing document ${docId} from prepared chunks`);

    const fingerprint = this.buildFingerprint(title, fullContent);
    const prepared = chunks.filter((c) => c.content.trim().length > 0);
    const totalChunks = prepared.length + 1; // + title chunk

    await this.withWriteLock(async () => {
      await this.db.execute('SAVEPOINT reindex_document;');
      try {
        // Clear existing chunks + auxiliary indexes
        const chunkRows = await this.db.execute('SELECT id FROM chunks WHERE document_id = ?', [docId]);
        const chunkIds = (chunkRows?.rows || []).map((r: any) => r.id);
        if (chunkIds.length > 0) {
          const placeholders = chunkIds.map(() => '?').join(',');
          await this.db.execute(`DELETE FROM chunks_fts WHERE rowid IN (${placeholders})`, chunkIds);
          await this.db.execute(`DELETE FROM vec_items WHERE chunk_rowid IN (${placeholders})`, chunkIds);
        }
        await this.db.execute('DELETE FROM chunks WHERE document_id = ?', [docId]);

        // Update the document row
        await this.db.execute(
          "UPDATE documents SET title = ?, content = ?, status = 'INDEXING', indexed_chunks = 0, total_chunks = ?, error_message = NULL, updated_at = CURRENT_TIMESTAMP, fingerprint = ?, source_uri = ?, source_local_uri = ?, source_name = ?, source_kind = ?, source_mtime = ?, source_size = ? WHERE id = ?",
          [
            title,
            fullContent,
            totalChunks,
            fingerprint,
            source?.uri ?? null,
            source?.localUri ?? null,
            source?.name ?? null,
            source?.kind ?? null,
            source?.mtime ?? null,
            source?.size ?? null,
            docId,
          ],
        );

        await this.db.execute('RELEASE reindex_document;');
      } catch (e) {
        await this.db.execute('ROLLBACK TO reindex_document;');
        await this.db.execute('RELEASE reindex_document;');
        throw e;
      }
    });

    // Fire-and-forget indexing
    void this.indexDocumentPrepared(docId, title, prepared);
  }

  private async indexDocument(docId: number, title: string, content: string): Promise<void> {
    const chunks = this.chunkText(content, 300).filter((c) => c.trim().length > 0);
    const chunksToIndex = [`[TITLE] ${title}`, ...chunks];

    Logger.info('DocumentService', `Indexing document ${docId}: ${chunksToIndex.length} chunks`);

    try {
      for (let i = 0; i < chunksToIndex.length; i++) {
        // If the doc is deleted or no longer indexing, stop early.
        if (i % 5 === 0) {
          const res = await this.db.execute('SELECT status FROM documents WHERE id = ?', [docId]);
          const status = res?.rows?.[0]?.status as string | undefined;
          if (!status || status !== 'INDEXING') {
            Logger.warn('DocumentService', `Indexing stopped for doc ${docId} (status=${status})`);
            return;
          }
        }

        const chunkContent = chunksToIndex[i];

        await this.withWriteLock(async () => {
          await this.db.execute('SAVEPOINT index_chunk;');
          try {
            const chunkRes = await this.db.execute('INSERT INTO chunks (document_id, content) VALUES (?, ?)', [
              docId,
              chunkContent,
            ]);
            const rowId = chunkRes.insertId!;

            await this.db.execute('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)', [rowId, chunkContent]);

            const embeddingJSON = await embeddingService.embed(chunkContent);
            // sqlite-vec vec0 can behave differently than regular tables with respect to ROLLBACK/REPLACE.
            // Ensure idempotency by clearing any orphan row first (e.g., after a partial failure).
            await this.db.execute('DELETE FROM vec_items WHERE chunk_rowid = ?', [rowId]);
            await this.db.execute('INSERT INTO vec_items (chunk_rowid, embedding) VALUES (?, vec_int8(?))', [
              rowId,
              embeddingJSON,
            ]);

            await this.db.execute('RELEASE index_chunk;');
            return rowId;
          } catch (e) {
            await this.db.execute('ROLLBACK TO index_chunk;');
            await this.db.execute('RELEASE index_chunk;');
            throw e;
          }
        });

        await this.withWriteLock(async () => {
          await this.db.execute('UPDATE documents SET indexed_chunks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
            i + 1,
            docId,
          ]);
        });

        // Yield to UI/event loop every chunk to avoid long blocking.
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      await this.withWriteLock(async () => {
        await this.db.execute("UPDATE documents SET status = 'READY', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
          docId,
        ]);
      });
      Logger.info('DocumentService', `Indexing complete for doc ${docId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.error('DocumentService', `Indexing failed for doc ${docId}`, e);
      await this.withWriteLock(async () => {
        await this.db.execute("UPDATE documents SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
          msg,
          docId,
        ]);
      });
    }
  }

  private async indexDocumentPrepared(docId: number, title: string, chunks: PreparedChunk[]): Promise<void> {
    const chunksToIndex: PreparedChunk[] = [{ content: `[TITLE] ${title}`, page_number: null }, ...chunks];

    Logger.info('DocumentService', `Indexing document ${docId}: ${chunksToIndex.length} chunks (prepared)`);

    try {
      for (let i = 0; i < chunksToIndex.length; i++) {
        if (i % 5 === 0) {
          const res = await this.db.execute('SELECT status FROM documents WHERE id = ?', [docId]);
          const status = res?.rows?.[0]?.status as string | undefined;
          if (!status || status !== 'INDEXING') {
            Logger.warn('DocumentService', `Indexing stopped for doc ${docId} (status=${status})`);
            return;
          }
        }

        const { content, page_number } = chunksToIndex[i];

        await this.withWriteLock(async () => {
          await this.db.execute('SAVEPOINT index_chunk_prepared;');
          try {
            const chunkRes = await this.db.execute(
              'INSERT INTO chunks (document_id, content, page_number) VALUES (?, ?, ?)',
              [docId, content, page_number ?? null],
            );
            const chunkRowId = chunkRes.insertId!;

            await this.db.execute('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)', [chunkRowId, content]);

            const embeddingJSON = await embeddingService.embed(content);
            await this.db.execute('DELETE FROM vec_items WHERE chunk_rowid = ?', [chunkRowId]);
            await this.db.execute('INSERT INTO vec_items (chunk_rowid, embedding) VALUES (?, vec_int8(?))', [
              chunkRowId,
              embeddingJSON,
            ]);

            await this.db.execute('RELEASE index_chunk_prepared;');
          } catch (e) {
            await this.db.execute('ROLLBACK TO index_chunk_prepared;');
            await this.db.execute('RELEASE index_chunk_prepared;');
            throw e;
          }
        });

        await this.withWriteLock(async () => {
          await this.db.execute('UPDATE documents SET indexed_chunks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
            i + 1,
            docId,
          ]);
        });

        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }

      await this.withWriteLock(async () => {
        await this.db.execute("UPDATE documents SET status = 'READY', error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
          docId,
        ]);
      });
      Logger.info('DocumentService', `Indexing complete for doc ${docId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.error('DocumentService', `Indexing failed for doc ${docId}`, e);
      await this.withWriteLock(async () => {
        await this.db.execute("UPDATE documents SET status = 'FAILED', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
          msg,
          docId,
        ]);
      });
    }
  }

  async deleteDocument(docId: number): Promise<void> {
    // Chunks will be deleted via ON DELETE CASCADE in SQLite
    // but we need to manually clean up FTS and VEC because they are virtual tables 
    // and usually don't support automatic cascade if they are external content.
    
    try {
      await this.withWriteLock(async () => {
        await this.db.execute('SAVEPOINT delete_document;');
        try {
          const chunks = await this.db.execute('SELECT id FROM chunks WHERE document_id = ?', [docId]);
          const chunkIds = (chunks?.rows || []).map((r: any) => r.id);

          if (chunkIds.length > 0) {
            const placeholders = chunkIds.map(() => '?').join(',');
            await this.db.execute(`DELETE FROM chunks_fts WHERE rowid IN (${placeholders})`, chunkIds);
            await this.db.execute(`DELETE FROM vec_items WHERE chunk_rowid IN (${placeholders})`, chunkIds);
          }

          await this.db.execute('DELETE FROM documents WHERE id = ?', [docId]);
          await this.db.execute('RELEASE delete_document;');
        } catch (e) {
          await this.db.execute('ROLLBACK TO delete_document;');
          await this.db.execute('RELEASE delete_document;');
          throw e;
        }
      });
    } catch (e) {
      Logger.error('DocumentService', 'Failed to delete document', e);
      throw e;
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
}
