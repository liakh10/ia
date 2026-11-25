#!/usr/bin/env node
// ia-mcp over stdio (newline-delimited JSON-RPC).
//   IA_API=https://<site>/v1 node mcp/stdio.js          reads a deployed /v1 (no RPC key needed)
//   SOLANA_RPC=<your RPC url> node mcp/stdio.js         indexes the chain itself (slow on first start: it reads the program's history)
import readline from "node:readline";
import { handlePayload, chainBackend, httpBackend } from "./core.js";

const backend = process.env.IA_API
  ? httpBackend(process.env.IA_API)
  : process.env.SOLANA_RPC || process.env.RPC_URL
    ? await chainBackend(process.env)
    : null;

if (!backend) {
  process.stderr.write("ia-mcp: set IA_API (a deployed /v1 base URL) or SOLANA_RPC (index the chain)\n");
  process.exit(1);
}

const write = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let pending = 0;
let closing = false;
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    return;
  }
  pending++;
  try {
    const out = await handlePayload(msg, backend);
    if (out) write(out);
  } finally {
    pending--;
    if (closing && pending === 0) process.exit(0);
  }
});
rl.on("close", () => {
  closing = true;
  if (pending === 0) process.exit(0);
});
