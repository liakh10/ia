#!/usr/bin/env node
// stdio ↔ Streamable HTTP bridge for the enrolment endpoint, so a stdio MCP client (a desktop agent, an agent framework) can play a run:
//   IA_ENROL_URL=http://127.0.0.1:PORT/mcp IA_ENROL_TOKEN=… node adapters/enrol/stdio.mjs
// Reads newline-delimited JSON-RPC on stdin, posts each message, writes each response as one line on stdout. Logs go to stderr only.
import readline from 'node:readline';

const url = process.env.IA_ENROL_URL, token = process.env.IA_ENROL_TOKEN;
if (!url || !token) { process.stderr.write('set IA_ENROL_URL and IA_ENROL_TOKEN\n'); process.exit(2); }
const rl = readline.createInterface({ input: process.stdin });
let pending = Promise.resolve();
rl.on('line', line => {
  if (!line.trim()) return;
  pending = pending.then(async () => {
    try {
      const r = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: line });
      if (r.status === 202) return;
      const text = await r.text();
      if (text) process.stdout.write(text.replace(/\n/g, ' ') + '\n');
    } catch (e) {
      let id = null;
      try { id = JSON.parse(line).id ?? null; } catch {}
      if (id !== null) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'enrol endpoint unreachable' } }) + '\n');
      process.stderr.write('ia-enrol bridge: ' + e.message + '\n');
    }
  });
});
rl.on('close', () => pending.then(() => process.exit(0)));
