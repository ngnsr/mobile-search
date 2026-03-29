// EmbeddingService exports a singleton `embeddingService`.
// We replace it by mocking the whole module.
const mockEmbed = jest.fn();

jest.mock('../services/EmbeddingService', () => ({
  embeddingService: { embed: (...args: unknown[]) => mockEmbed(...args) },
}));
jest.mock('../utils/logger', () => ({
  Logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { SearchService } from '../services/SearchService';
import { DB } from '@op-engineering/op-sqlite';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDb(rows: object[] = []) {
  return { execute: jest.fn().mockResolvedValue({ rows }) };
}

const FAKE_EMBEDDING = JSON.stringify(new Array(384).fill(1));

describe('SearchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEmbed.mockResolvedValue(FAKE_EMBEDDING);
  });

  // ──────────────────────────────────────────────────────────────
  // sanitizeFts5Query — tested indirectly via hybridSearch params
  // ──────────────────────────────────────────────────────────────
  describe('sanitizeFts5Query (via hybridSearch)', () => {
    it('wraps a clean query in double-quotes', async () => {
      const db = makeDb();
      const svc = new SearchService(db as unknown as DB);
      await svc.hybridSearch('military doctrine');
      const [, params] = db.execute.mock.calls[0];
      expect(params[0]).toBe('"military doctrine"');
    });

    it('strips FTS5 special characters from query', async () => {
      const db = makeDb();
      const svc = new SearchService(db as unknown as DB);
      await svc.hybridSearch('MEDEVAC: "procedure" -abort');
      const [, params] = db.execute.mock.calls[0];
      expect(params[0]).toMatch(/^"[^"]*"$/);
      expect(params[0]).not.toContain(':');
      expect(params[0]).not.toContain('-');
    });

    it('returns empty double-quoted string when query reduces to empty after stripping', async () => {
      const db = makeDb();
      const svc = new SearchService(db as unknown as DB);
      await svc.hybridSearch('---:::"""');
      const [, params] = db.execute.mock.calls[0];
      expect(params[0]).toBe('""');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // hybridSearch()
  // ──────────────────────────────────────────────────────────────
  describe('hybridSearch()', () => {
    it('returns results and timing metrics on success', async () => {
      const fakeRow = { id: 1, content: 'hello', rrf_score: 0.5 };
      const db = makeDb([fakeRow]);
      const svc = new SearchService(db as unknown as DB);

      const { results, metrics } = await svc.hybridSearch('hello');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(fakeRow);
      expect(metrics.embeddingMs).toBeGreaterThanOrEqual(0);
      expect(metrics.searchMs).toBeGreaterThanOrEqual(0);
    });

    it('returns empty array when DB returns no rows', async () => {
      const db = makeDb([]);
      const svc = new SearchService(db as unknown as DB);
      const { results } = await svc.hybridSearch('nothing relevant');
      expect(results).toHaveLength(0);
    });

    it('passes the correct limit and offset to the SQL query', async () => {
      const db = makeDb();
      const svc = new SearchService(db as unknown as DB);
      await svc.hybridSearch('query', 5, 10);
      const [, params] = db.execute.mock.calls[0];
      expect(params[4]).toBe(5);
      expect(params[5]).toBe(10);
    });

    it('passes the embedding result to the DB execute call', async () => {
      const db = makeDb();
      const svc = new SearchService(db as unknown as DB);
      await svc.hybridSearch('tanks');
      const [, params] = db.execute.mock.calls[0];
      expect(params[1]).toBe(FAKE_EMBEDDING);
    });

    it('uses default limit of 20 when not specified', async () => {
      const db = makeDb();
      const svc = new SearchService(db as unknown as DB);
      await svc.hybridSearch('query');
      const [, params] = db.execute.mock.calls[0];
      expect(params[4]).toBe(20);
    });

    it('uses default offset of 0 when not specified', async () => {
      const db = makeDb();
      const svc = new SearchService(db as unknown as DB);
      await svc.hybridSearch('query');
      const [, params] = db.execute.mock.calls[0];
      expect(params[5]).toBe(0);
    });

    it('re-throws DB errors', async () => {
      const db = { execute: jest.fn().mockRejectedValue(new Error('sqlite error')) };
      const svc = new SearchService(db as unknown as DB);
      await expect(svc.hybridSearch('boom')).rejects.toThrow('sqlite error');
    });

    it('re-throws embedding errors before hitting the DB', async () => {
      mockEmbed.mockRejectedValue(new Error('ONNX failure'));
      const db = makeDb();
      const svc = new SearchService(db as unknown as DB);
      await expect(svc.hybridSearch('query')).rejects.toThrow('ONNX failure');
      expect(db.execute).not.toHaveBeenCalled();
    });
  });
});
