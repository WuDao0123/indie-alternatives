#!/usr/bin/env node
/** Self-hosted HTTP server on Node: adapts node:http to the shared web-standard app in app.ts */
import { createServer as createHttpServer, type IncomingMessage } from "node:http";
import { createApp } from "./app.js";
import { fromEnv } from "./sources.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const deps = await fromEnv(process.env, "server");
const app = createApp(deps, {
  publicUrl: process.env.PUBLIC_URL,
  authToken: process.env.MCP_AUTH_TOKEN,
  adminToken: process.env.ADMIN_TOKEN,
});

function toRequest(req: IncomingMessage, body: Buffer): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v !== undefined) headers.set(k, v);
  }
  const method = req.method ?? "GET";
  return new Request(`http://${req.headers.host ?? `localhost:${PORT}`}${req.url ?? "/"}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" || !body.length ? undefined : new Uint8Array(body),
  });
}

const http = createHttpServer(async (req, res) => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1_000_000) return void res.writeHead(413, { "content-type": "application/json" }).end('{"error":"Request body too large"}');
    chunks.push(c as Buffer);
  }
  const out = await app(toRequest(req, Buffer.concat(chunks)));
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(req.method === "HEAD" ? undefined : Buffer.from(await out.arrayBuffer()));
});

http.listen(PORT, HOST, () => {
  console.error(
    `[indie-alternatives] HTTP listening on http://${HOST}:${PORT}  MCP=/mcp  OpenAPI=/openapi.json  REST=/api/*  ` +
      `catalog=${deps.catalog.name}; needs=${deps.needs.name}${deps.stats ? "; stats on" : ""}`,
  );
});
