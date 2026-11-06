/** Adapts node:sqlite (Node 22.5+) to the D1-style SqlDatabase interface, for self-hosting and tests */
import type { SqlDatabase, SqlStatement } from "./types.js";
import { MIGRATIONS, SCHEMA } from "./sql.js";

export async function openSqlite(path: string): Promise<SqlDatabase> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  for (const sql of Object.values(MIGRATIONS)) {
    try {
      db.exec(sql);
    } catch (e) {
      // already applied to this database file
      if (!/duplicate column/i.test((e as Error).message)) throw e;
    }
  }
  const stmt = (sql: string, values: unknown[] = []): SqlStatement => ({
    bind: (...v) => stmt(sql, v),
    run: async () => db.prepare(sql).run(...(values as any[])),
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as any[])) as T[] }),
    first: async <T>() => (db.prepare(sql).get(...(values as any[])) as T | undefined) ?? null,
  });
  return {
    prepare: (sql) => stmt(sql),
    exec: async (sql) => db.exec(sql),
    batch: async (stmts) => {
      db.exec("BEGIN");
      try {
        for (const s of stmts) await s.run();
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
