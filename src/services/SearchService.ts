import { DB } from '@op-engineering/op-sqlite';
import { embeddingService } from './EmbeddingService';
import { Logger } from '../utils/logger';

export interface SearchResult {
  id: number;
  document_id: number;
  document_title?: string;
  content: string;
  page_number?: number | null;
  fts_rank?: number;
  vec_distance?: number;
  rrf_score?: number;
}

export interface SearchDocumentResult {
  document_id: number;
  document_title: string;
  best_chunk_id: number;
  snippet: string;
  page_number?: number | null;
  hit_chunks: number;
  fts_rank?: number;
  vec_distance?: number;
  rrf_score?: number;
}

export type SearchMode = 'bm25' | 'semantic' | 'hybrid';

export interface SearchResponse {
  results: SearchResult[];
  metrics: {
    embeddingMs: number;
    searchMs: number;
  };
}

export interface SearchDocumentsResponse {
  results: SearchDocumentResult[];
  metrics: SearchResponse['metrics'];
}

export type SearchFilters = {
  kind?: 'all' | 'pdf' | 'txt' | 'md' | 'manual';
  dateRangeDays?: number | null; // e.g. 7, 30; null/undefined = all time
};

export class SearchService {
  private db: DB;
  private readonly K_FACTOR = 60;
  private schemaChecked = false;
  private hasDocumentsStatus = false;
  private hasChunksPageNumber = false;

  constructor(db: DB) {
    this.db = db;
  }

  private async ensureSchemaCheckedOnce(): Promise<void> {
    if (this.schemaChecked) return;
    this.schemaChecked = true;
    try {
      const docsInfo = await this.db.execute('PRAGMA table_info(documents);');
      const docsCols = new Set((docsInfo?.rows || []).map((r: any) => String(r.name)));
      this.hasDocumentsStatus = docsCols.has('status');

      const chunksInfo = await this.db.execute('PRAGMA table_info(chunks);');
      const chunksCols = new Set((chunksInfo?.rows || []).map((r: any) => String(r.name)));
      this.hasChunksPageNumber = chunksCols.has('page_number');
    } catch (e) {
      Logger.warn('SearchService', 'Schema detection failed, continuing with minimal queries', e);
    }
  }

  private sanitizeFts5Query(query: string): string {
    const cleaned = query.replace(/[^\w\s]/g, ' ').trim();
    if (!cleaned) return '""';
    return `"${cleaned}"`;
  }

  public async search(
    query: string,
    mode: SearchMode,
    limit: number = 10,
    offset: number = 0,
  ): Promise<SearchResponse> {
    Logger.info('SearchService', `Searching [${mode}]: "${query}"`);

    let embeddingMs = 0;
    let queryEmbedding = '';

    if (mode === 'semantic' || mode === 'hybrid') {
      const t0 = Date.now();
      queryEmbedding = await embeddingService.embed(query, true);
      embeddingMs = Date.now() - t0;
    }

    let sql = '';
    let params: any[] = [];

    if (mode === 'bm25') {
      sql = `
        SELECT c.*, d.title as document_title, bm25(chunks_fts) as fts_rank
        FROM chunks_fts
        JOIN chunks c ON c.id = chunks_fts.rowid
        JOIN documents d ON d.id = c.document_id
        WHERE chunks_fts MATCH ?
        ORDER BY fts_rank
        LIMIT ?
        OFFSET ?;
      `;
      params = [this.sanitizeFts5Query(query), limit, offset];
    } else if (mode === 'semantic') {
      sql = `
        SELECT c.*, d.title as document_title, r.distance as vec_distance
        FROM vec_items r
        JOIN chunks c ON c.id = r.chunk_rowid
        JOIN documents d ON d.id = c.document_id
        WHERE embedding MATCH vec_int8(?) AND k = ?
        ORDER BY distance
        LIMIT ?
        OFFSET ?;
      `;
      params = [queryEmbedding, limit, limit, offset];
    } else if (mode === 'hybrid') {
      // Proper RRF using window functions for positional ranks
      sql = `
        WITH 
        fts_matches AS (
            SELECT rowid,
                   row_number() OVER (ORDER BY bm25(chunks_fts)) as rank_pos
            FROM chunks_fts
            WHERE chunks_fts MATCH ?
            LIMIT 50
        ),
        vec_matches AS (
            SELECT chunk_rowid as rowid, 
                   row_number() OVER (ORDER BY distance) as rank_pos
            FROM vec_items 
            WHERE embedding MATCH vec_int8(?) AND k = 50
            ORDER BY distance
        ),
        combined AS (
            SELECT rowid, rank_pos as fts_pos, NULL as vec_pos FROM fts_matches
            UNION ALL
            SELECT rowid, NULL as fts_pos, rank_pos as vec_pos FROM vec_matches
        ),
        ranked AS (
            SELECT
                rowid,
                (
                    COALESCE(1.0 / (? + MIN(fts_pos)), 0) + 
                    COALESCE(1.0 / (? + MIN(vec_pos)), 0)
                ) as rrf_score
            FROM combined
            GROUP BY rowid
        )
        SELECT c.*, d.title as document_title, r.rrf_score
        FROM ranked r
        JOIN chunks c ON c.id = r.rowid
        JOIN documents d ON d.id = c.document_id
        ORDER BY r.rrf_score DESC
        LIMIT ?
        OFFSET ?;
      `;
      params = [
        this.sanitizeFts5Query(query),
        queryEmbedding,
        this.K_FACTOR,
        this.K_FACTOR,
        limit,
        offset,
      ];
    }

    const tSearch0 = Date.now();
    const dbResults = await this.db.execute(sql, params);
    const searchMs = Date.now() - tSearch0;

    const results = (dbResults?.rows || []) as unknown as SearchResult[];
    return { results, metrics: { embeddingMs, searchMs } };
  }

  public async searchDocuments(
    query: string,
    mode: SearchMode,
    limit: number = 10,
    offset: number = 0,
    filters?: SearchFilters,
  ): Promise<SearchDocumentsResponse> {
    Logger.info('SearchService', `Searching documents [${mode}]: "${query}"`);
    await this.ensureSchemaCheckedOnce();

    const statusFilter = this.hasDocumentsStatus ? "AND d.status = 'READY'" : '';
    const pageExpr = this.hasChunksPageNumber ? 'c.page_number' : 'NULL';

    const kind = filters?.kind ?? 'all';
    const dateDays = filters?.dateRangeDays ?? null;
    const docWhereParts: string[] = [];
    const docParams: any[] = [];
    if (kind !== 'all') {
      if (kind === 'manual') docWhereParts.push('d.source_kind IS NULL');
      else {
        docWhereParts.push('d.source_kind = ?');
        docParams.push(kind);
      }
    }
    if (dateDays && Number.isFinite(dateDays)) {
      docWhereParts.push("d.created_at >= datetime('now', ?)");
      docParams.push(`-${dateDays} days`);
    }
    const docWhere = docWhereParts.length ? `AND ${docWhereParts.join(' AND ')}` : '';

    let embeddingMs = 0;
    let queryEmbedding = '';

    if (mode === 'semantic' || mode === 'hybrid') {
      const t0 = Date.now();
      queryEmbedding = await embeddingService.embed(query, true);
      embeddingMs = Date.now() - t0;
    }

    let sql = '';
    let params: any[] = [];

    if (mode === 'bm25') {
      sql = `
        WITH matches AS (
          SELECT c.id AS chunk_id,
                 c.document_id,
                 c.content AS snippet,
                 ${pageExpr} AS page_number,
                 bm25(chunks_fts) AS fts_rank
          FROM chunks_fts
          JOIN chunks c ON c.id = chunks_fts.rowid
          JOIN documents d ON d.id = c.document_id
          WHERE chunks_fts MATCH ? ${statusFilter} ${docWhere}
        ),
        ranked AS (
          SELECT *,
                 row_number() OVER (PARTITION BY document_id ORDER BY fts_rank) AS rn,
                 count(*) OVER (PARTITION BY document_id) AS hit_chunks
          FROM matches
        )
        SELECT
          d.id AS document_id,
          d.title AS document_title,
          r.chunk_id AS best_chunk_id,
          r.snippet,
          r.page_number,
          r.hit_chunks,
          r.fts_rank
        FROM ranked r
        JOIN documents d ON d.id = r.document_id
        WHERE r.rn = 1
        ORDER BY r.fts_rank
        LIMIT ?
        OFFSET ?;
      `;
      params = [this.sanitizeFts5Query(query), ...docParams, limit, offset];
    } else if (mode === 'semantic') {
      // Pull more candidates than the doc limit so grouping still returns enough docs.
      const k = Math.max(100, limit * 20);
      sql = `
        WITH matches AS (
          SELECT c.id AS chunk_id,
                 c.document_id,
                 c.content AS snippet,
                 ${pageExpr} AS page_number,
                 r.distance AS vec_distance
          FROM vec_items r
          JOIN chunks c ON c.id = r.chunk_rowid
          JOIN documents d ON d.id = c.document_id
          WHERE embedding MATCH vec_int8(?) AND k = ? ${statusFilter} ${docWhere}
          ORDER BY distance
        ),
        ranked AS (
          SELECT *,
                 row_number() OVER (PARTITION BY document_id ORDER BY vec_distance) AS rn,
                 count(*) OVER (PARTITION BY document_id) AS hit_chunks
          FROM matches
        )
        SELECT
          d.id AS document_id,
          d.title AS document_title,
          r.chunk_id AS best_chunk_id,
          r.snippet,
          r.page_number,
          r.hit_chunks,
          r.vec_distance
        FROM ranked r
        JOIN documents d ON d.id = r.document_id
        WHERE r.rn = 1
        ORDER BY r.vec_distance
        LIMIT ?
        OFFSET ?;
      `;
      params = [queryEmbedding, k, ...docParams, limit, offset];
    } else if (mode === 'hybrid') {
      sql = `
        WITH 
        fts_matches AS (
            SELECT chunks_fts.rowid AS rowid,
                   row_number() OVER (ORDER BY bm25(chunks_fts)) as rank_pos
            FROM chunks_fts
            JOIN chunks c ON c.id = chunks_fts.rowid
            JOIN documents d ON d.id = c.document_id
            WHERE chunks_fts MATCH ? ${statusFilter} ${docWhere}
            LIMIT 80
        ),
        vec_matches AS (
            SELECT chunk_rowid as rowid, 
                   row_number() OVER (ORDER BY distance) as rank_pos
            FROM vec_items 
            JOIN chunks c ON c.id = vec_items.chunk_rowid
            JOIN documents d ON d.id = c.document_id
            WHERE embedding MATCH vec_int8(?) AND k = 80 ${statusFilter} ${docWhere}
            ORDER BY distance
        ),
        combined AS (
            SELECT rowid, rank_pos as fts_pos, NULL as vec_pos FROM fts_matches
            UNION ALL
            SELECT rowid, NULL as fts_pos, rank_pos as vec_pos FROM vec_matches
        ),
        ranked_chunks AS (
            SELECT
                rowid,
                (
                    COALESCE(1.0 / (? + MIN(fts_pos)), 0) + 
                    COALESCE(1.0 / (? + MIN(vec_pos)), 0)
                ) as rrf_score
            FROM combined
            GROUP BY rowid
        ),
        chunk_rows AS (
          SELECT
            c.id AS chunk_id,
            c.document_id,
            c.content AS snippet,
            ${pageExpr} AS page_number,
            r.rrf_score
          FROM ranked_chunks r
          JOIN chunks c ON c.id = r.rowid
        ),
        doc_ranked AS (
          SELECT *,
                 row_number() OVER (PARTITION BY document_id ORDER BY rrf_score DESC) AS rn,
                 count(*) OVER (PARTITION BY document_id) AS hit_chunks
          FROM chunk_rows
        )
        SELECT
          d.id AS document_id,
          d.title AS document_title,
          r.chunk_id AS best_chunk_id,
          r.snippet,
          r.page_number,
          r.hit_chunks,
          r.rrf_score
        FROM doc_ranked r
        JOIN documents d ON d.id = r.document_id
        WHERE r.rn = 1
        ORDER BY r.rrf_score DESC
        LIMIT ?
        OFFSET ?;
      `;
      // Note: docWhere placeholders appear twice (fts_matches + vec_matches), so docParams must be duplicated and
      // placed right after the corresponding MATCH placeholders to match SQLite parameter order.
      params = [
        this.sanitizeFts5Query(query),
        ...docParams,
        queryEmbedding,
        ...docParams,
        this.K_FACTOR,
        this.K_FACTOR,
        limit,
        offset,
      ];
    }

    const tSearch0 = Date.now();
    const dbResults = await this.db.execute(sql, params);
    const searchMs = Date.now() - tSearch0;

    const results = (dbResults?.rows || []) as unknown as SearchDocumentResult[];
    try {
      await this.db.execute(
        'INSERT INTO search_events (query_text, mode, embedding_ms, search_ms, results_count) VALUES (?, ?, ?, ?, ?);',
        [query, mode, embeddingMs, searchMs, results.length],
      );
    } catch {
      // ignore (table may not exist yet if user fast-refreshed)
    }
    return { results, metrics: { embeddingMs, searchMs } };
  }

  public async hybridSearch(query: string, limit: number = 20, offset: number = 0): Promise<SearchResponse> {
    return this.search(query, 'hybrid', limit, offset);
  }
}
