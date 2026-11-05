/** Stores on a D1-compatible SQL database (Cloudflare D1 in production, node:sqlite for Node and tests) */
import type {
  NeedRecord, NeedStore, Product, ProductStore, SqlDatabase, StatsStore, Submission, SubmissionStatus, SubmissionStore,
} from "./types.js";
import { toProduct, urlKey } from "./catalog.js";

/** Keep in sync with migrations/0001_init.sql (a test checks this) */
export const SCHEMA = `-- Anonymous unmet needs: no user identity, IP, user agent or exact time
CREATE TABLE IF NOT EXISTS needs (
  id TEXT PRIMARY KEY,
  need TEXT NOT NULL,
  category TEXT,
  platform TEXT,
  budget TEXT,
  day TEXT NOT NULL,
  fingerprint TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS needs_fingerprint ON needs (fingerprint);

-- Anonymous daily counters
CREATE TABLE IF NOT EXISTS stats (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);

-- Products submitted by makers
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  day TEXT NOT NULL,
  url TEXT NOT NULL,
  product TEXT NOT NULL,
  contact TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS submissions_status ON submissions (status);
CREATE INDEX IF NOT EXISTS submissions_url ON submissions (url);

-- Approved products, merged on top of the bundled catalog
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
`;

const today = () => new Date().toISOString().slice(0, 10);
const undef = <T>(v: T | null) => (v === null ? undefined : v);

export class SqlNeedStore implements NeedStore {
  readonly name = "sql:needs";
  constructor(private db: SqlDatabase) {}
  async append(r: NeedRecord): Promise<void> {
    await this.db
      .prepare("INSERT INTO needs (id, need, category, platform, budget, day, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(r.id, r.need, r.category ?? null, r.platform ?? null, r.budget ?? null, r.day, r.fingerprint)
      .run();
  }
  async list(): Promise<NeedRecord[]> {
    const { results } = await this.db.prepare("SELECT * FROM needs ORDER BY day").all<any>();
    return results.map((r) => ({
      id: r.id, need: r.need, category: undef(r.category), platform: undef(r.platform), budget: undef(r.budget), day: r.day, fingerprint: r.fingerprint,
    }));
  }
}

export class SqlStatsStore implements StatsStore {
  readonly name = "sql:stats";
  constructor(private db: SqlDatabase) {}
  async record(keys: string[], day = today()): Promise<void> {
    const stmts = [...new Set(keys)].map((k) =>
      this.db.prepare("INSERT INTO stats (day, key, n) VALUES (?, ?, 1) ON CONFLICT (day, key) DO UPDATE SET n = n + 1").bind(day, k),
    );
    if (!stmts.length) return;
    if (this.db.batch) await this.db.batch(stmts);
    else for (const s of stmts) await s.run();
  }
  async summary(days: number) {
    const since = new Date(Date.now() - (days - 1) * 86400_000).toISOString().slice(0, 10);
    const { results } = await this.db
      .prepare("SELECT day, key, n FROM stats WHERE day >= ? ORDER BY day DESC, n DESC")
      .bind(since)
      .all<{ day: string; key: string; n: number }>();
    return results.map((r) => ({ day: r.day, key: r.key, n: Number(r.n) }));
  }
}

export class SqlSubmissionStore implements SubmissionStore {
  readonly name = "sql:submissions";
  constructor(private db: SqlDatabase) {}
  private row(r: any): Submission {
    return { id: r.id, status: r.status, day: r.day, product: JSON.parse(r.product), contact: undef(r.contact), note: undef(r.note) };
  }
  async add(s: Submission): Promise<void> {
    await this.db
      .prepare("INSERT INTO submissions (id, status, day, url, product, contact, note) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(s.id, s.status, s.day, urlKey(s.product.url), JSON.stringify(s.product), s.contact ?? null, s.note ?? null)
      .run();
  }
  async get(id: string) {
    const r = await this.db.prepare("SELECT * FROM submissions WHERE id = ?").bind(id).first();
    return r ? this.row(r) : undefined;
  }
  async list(status?: SubmissionStatus) {
    const q = status
      ? this.db.prepare("SELECT * FROM submissions WHERE status = ? ORDER BY day").bind(status)
      : this.db.prepare("SELECT * FROM submissions ORDER BY day");
    return (await q.all()).results.map((r) => this.row(r));
  }
  async setStatus(id: string, status: SubmissionStatus, note?: string) {
    await this.db.prepare("UPDATE submissions SET status = ?, note = COALESCE(?, note) WHERE id = ?").bind(status, note ?? null, id).run();
  }
  async hasUrl(url: string) {
    return Boolean(await this.db.prepare("SELECT 1 AS x FROM submissions WHERE url = ? AND status != 'rejected' LIMIT 1").bind(urlKey(url)).first());
  }
}

export class SqlProductStore implements ProductStore {
  readonly name = "sql:products";
  constructor(private db: SqlDatabase) {}
  async load(): Promise<Product[]> {
    const { results } = await this.db.prepare("SELECT data FROM products").all<{ data: string }>();
    return results.map((r) => toProduct(JSON.parse(r.data))).filter((p): p is Product => Boolean(p));
  }
  async upsert(p: Product) {
    await this.db
      .prepare("INSERT INTO products (id, data) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data")
      .bind(p.id, JSON.stringify(p))
      .run();
  }
  async remove(id: string) {
    await this.db.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  }
}
