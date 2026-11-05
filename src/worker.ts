/** Cloudflare Workers entry: same app as the Node server, with D1 for storage */
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { createApp } from "./app.js";
import { MergedSource, StaticSource } from "./catalog.js";
import { SqlNeedStore, SqlProductStore, SqlStatsStore, SqlSubmissionStore } from "./sql.js";
import type { SqlDatabase } from "./types.js";
import bundled from "../data/products.json" with { type: "json" };

export interface Env {
  DB: SqlDatabase;
  PUBLIC_URL?: string;
  HIDE_NEEDS_LIST?: string;
  /** wrangler secret put ADMIN_TOKEN */
  ADMIN_TOKEN?: string;
  MCP_AUTH_TOKEN?: string;
}

let cached: { db: SqlDatabase; app: (req: Request) => Promise<Response> } | undefined;

function appFor(env: Env) {
  if (cached?.db === env.DB) return cached.app;
  const products = new SqlProductStore(env.DB);
  const app = createApp(
    {
      // reviewed products from D1 on top of the bundled catalog; if D1 is unavailable, still serve the bundled one
      catalog: new MergedSource([new StaticSource(bundled, "bundled"), products], true),
      needs: new SqlNeedStore(env.DB),
      stats: new SqlStatsStore(env.DB),
      submissions: new SqlSubmissionStore(env.DB),
      products,
      exposeNeedsList: env.HIDE_NEEDS_LIST !== "1",
    },
    {
      publicUrl: env.PUBLIC_URL,
      authToken: env.MCP_AUTH_TOKEN,
      adminToken: env.ADMIN_TOKEN,
      jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
    },
  );
  cached = { db: env.DB, app };
  return app;
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return appFor(env)(req);
  },
};
