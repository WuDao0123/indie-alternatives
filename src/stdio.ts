#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { fromEnv } from "./sources.js";

const deps = await fromEnv();
const server = createServer(deps);
await server.connect(new StdioServerTransport());
console.error(`[indie-alternatives] stdio ready; catalog=${deps.catalog.name}; needs=${deps.needs.name}`);
