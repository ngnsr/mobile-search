import { useState, useEffect } from 'react';
import { open, DB } from '@op-engineering/op-sqlite';
import { SearchService } from '../services/SearchService';
import { DocumentService } from '../services/DocumentService';
import { FileIndexingService } from '../services/FileIndexingService';
import { embeddingService } from '../services/EmbeddingService';
import { Logger } from '../utils/logger';

async function ensureTableColumns(db: DB, table: string, columns: Array<{ name: string; ddl: string }>) {
  const info = await db.execute(`PRAGMA table_info(${table});`);
  const existing = new Set((info?.rows || []).map((r: any) => String(r.name)));
  for (const col of columns) {
    if (!existing.has(col.name)) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col.ddl};`);
    }
  }
}

export function useAppInitialization() {
  const [status, setStatus] = useState('Initializing Application...');
  const [isReady, setIsReady] = useState(false);
  const [db, setDb] = useState<DB | null>(null);
  const [searchService, setSearchService] = useState<SearchService | null>(null);
  const [documentService, setDocumentService] = useState<DocumentService | null>(null);
  const [fileIndexingService, setFileIndexingService] = useState<FileIndexingService | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 1. Load ONNX embedding model
        setStatus('Loading embedding model...');
        await embeddingService.initialize();

        // 2. Instantiate op-sqlite DB instance
        const database = open({
          name: 'documents.sqlite',
        });

        // 3. Configure WAL and Synchronous modes for performance
        await database.execute('PRAGMA journal_mode = WAL;');
        await database.execute('PRAGMA synchronous = NORMAL;');

        // 4. Create tables
        await database.execute(`
          CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await ensureTableColumns(database, 'documents', [
          { name: 'status', ddl: "status TEXT NOT NULL DEFAULT 'READY'" },
          { name: 'indexed_chunks', ddl: 'indexed_chunks INTEGER NOT NULL DEFAULT 0' },
          { name: 'total_chunks', ddl: 'total_chunks INTEGER NOT NULL DEFAULT 0' },
          { name: 'error_message', ddl: 'error_message TEXT' },
          // SQLite does not allow ALTER TABLE ... ADD COLUMN with non-constant defaults like CURRENT_TIMESTAMP.
          // Keep it nullable and backfill manually.
          { name: 'updated_at', ddl: 'updated_at DATETIME' },
          { name: 'fingerprint', ddl: 'fingerprint TEXT' },
          { name: 'source_uri', ddl: 'source_uri TEXT' },
          { name: 'source_local_uri', ddl: 'source_local_uri TEXT' },
          { name: 'source_name', ddl: 'source_name TEXT' },
          { name: 'source_kind', ddl: 'source_kind TEXT' }, // 'txt'|'md'|'pdf'
          { name: 'source_mtime', ddl: 'source_mtime TEXT' },
          { name: 'source_size', ddl: 'source_size INTEGER' },
        ]);

        // Backfill updated_at for existing rows if needed.
        await database.execute(
          "UPDATE documents SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP);",
        );

        await database.execute(`
          CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
          );
        `);

        await ensureTableColumns(database, 'chunks', [{ name: 'page_number', ddl: 'page_number INTEGER' }]);

        // 5. Create FTS5 virtual table
        await database.execute(`
          CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            content,
            content='chunks',
            content_rowid='id'
          );
        `);

        // 6. Create sqlite-vec virtual table
        await database.execute(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING vec0(
            chunk_rowid INTEGER PRIMARY KEY,
            embedding int8[384]
          );
        `);

        // Check version of vec to verify static initialization worked
        const result = await database.execute('SELECT vec_version() as version;');
        const vecVersion = (result?.rows?.[0]?.version as string) || 'Unknown';

        setDb(database);
        setSearchService(new SearchService(database));
        const docSvc = new DocumentService(database);
        setDocumentService(docSvc);
        setFileIndexingService(new FileIndexingService(docSvc));
        setStatus(`Ready!  sqlite-vec: ${vecVersion}`);
        setIsReady(true);
      } catch (e: unknown) {
        if (e instanceof Error) {
          Logger.error('App', 'Startup error:', e.stack ?? e.message);
          setStatus(`Startup failed: ${e.message}`);
        } else {
          Logger.error('App', 'Startup error:', String(e));
          setStatus(`Startup failed: ${String(e)}`);
        }
      }
    })();
  }, []);

  return {
    isReady,
    status,
    db,
    searchService,
    documentService,
    fileIndexingService,
  };
}
