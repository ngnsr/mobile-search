import { DB } from '@op-engineering/op-sqlite';

export type DocumentKind = 'pdf' | 'txt' | 'md' | 'manual';

export class StatsService {
  constructor(private db: DB) {}

  async getDocumentCountsByKind(): Promise<Array<{ kind: DocumentKind; count: number }>> {
    const res = await this.db.execute(`
      SELECT
        CASE
          WHEN source_kind IS NULL THEN 'manual'
          ELSE source_kind
        END AS kind,
        COUNT(*) AS count
      FROM documents
      GROUP BY kind
      ORDER BY count DESC;
    `);
    return (res?.rows || []) as unknown as Array<{ kind: DocumentKind; count: number }>;
  }

  async getSearchCountsByMode(): Promise<Array<{ mode: string; count: number }>> {
    const res = await this.db.execute(`
      SELECT mode, COUNT(*) AS count
      FROM search_events
      GROUP BY mode
      ORDER BY count DESC;
    `);
    return (res?.rows || []) as unknown as Array<{ mode: string; count: number }>;
  }

  async getSearchCountsByDay(days: number = 7): Promise<Array<{ day: string; count: number }>> {
    const res = await this.db.execute(
      `
        SELECT date(created_at) AS day, COUNT(*) AS count
        FROM search_events
        WHERE created_at >= datetime('now', ?)
        GROUP BY day
        ORDER BY day ASC;
      `,
      [`-${days} days`],
    );
    return (res?.rows || []) as unknown as Array<{ day: string; count: number }>;
  }

  async getAvgLatencyByMode(): Promise<Array<{ mode: string; avg_total_ms: number }>> {
    const res = await this.db.execute(`
      SELECT
        mode,
        AVG(embedding_ms + search_ms) AS avg_total_ms
      FROM search_events
      GROUP BY mode
      ORDER BY avg_total_ms DESC;
    `);
    return (res?.rows || []) as unknown as Array<{ mode: string; avg_total_ms: number }>;
  }

  async getLatencySeries(limit: number = 30): Promise<Array<{ total_ms: number; created_at: string }>> {
    const res = await this.db.execute(
      `
        SELECT (embedding_ms + search_ms) AS total_ms, created_at
        FROM search_events
        ORDER BY id DESC
        LIMIT ?;
      `,
      [limit],
    );
    return (res?.rows || []) as unknown as Array<{ total_ms: number; created_at: string }>;
  }
}
