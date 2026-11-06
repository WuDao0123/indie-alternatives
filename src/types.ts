export type Pricing = "free" | "freemium" | "paid" | "commission" | "open-source" | string;

/** One indie-made product in the catalog */
export interface Product {
  id: string;
  name: string;
  url: string;
  tagline: string;
  description: string;
  categories: string[];
  tags: string[];
  pricing?: Pricing;
  platforms?: string[];
  maker?: string;
}

/** Pluggable catalog source: anything that can return a product list */
export interface CatalogSource {
  readonly name: string;
  load(): Promise<Product[]>;
}

/** One anonymous need record: only the need itself, no field that identifies the user */
export interface NeedRecord {
  id: string;
  need: string;
  category?: string;
  platform?: string;
  budget?: string;
  /** Day precision only, so timestamps cannot be used to link users */
  day: string;
  /** Hash of the normalized need text, used to group similar needs */
  fingerprint: string;
  /** "missing": no tool exists (default); "partial": tools came back but none fit */
  kind?: NeedKind;
}
export type NeedKind = "missing" | "partial";

export interface NeedStore {
  readonly name: string;
  append(record: NeedRecord): Promise<void>;
  list(): Promise<NeedRecord[]>;
}

/** Anonymous daily counters: only (day, key) → count, never anything about a person */
export interface StatsStore {
  readonly name: string;
  record(keys: string[], day?: string): Promise<void>;
  /** rows for the last `days` days, newest first */
  summary(days: number): Promise<{ day: string; key: string; n: number }[]>;
}

export type SubmissionStatus = "pending" | "approved" | "rejected";

/** A product submitted by its maker, waiting for review */
export interface Submission {
  id: string;
  status: SubmissionStatus;
  /** day only */
  day: string;
  product: Omit<Product, "id"> & { id?: string };
  /** optional, only used to contact the maker about the review; never published */
  contact?: string;
  note?: string;
}

export interface SubmissionStore {
  readonly name: string;
  add(s: Submission): Promise<void>;
  get(id: string): Promise<Submission | undefined>;
  list(status?: SubmissionStatus): Promise<Submission[]>;
  setStatus(id: string, status: SubmissionStatus, note?: string): Promise<void>;
  /** true if a pending or approved submission already uses this URL */
  hasUrl(url: string): Promise<boolean>;
}

/** Products added after review (on top of the bundled catalog) */
export interface ProductStore extends CatalogSource {
  upsert(p: Product): Promise<void>;
  remove(id: string): Promise<void>;
}

/** The subset of the Cloudflare D1 API we use; node:sqlite is adapted to it for Node and tests */
export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  batch?(stmts: SqlStatement[]): Promise<unknown>;
  exec(sql: string): Promise<unknown>;
}
export interface SqlStatement {
  bind(...values: unknown[]): SqlStatement;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}
