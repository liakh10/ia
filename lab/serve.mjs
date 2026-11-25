#!/usr/bin/env node
// node lab/serve.mjs [--port 5791]: the IA lab server, local only (binds 127.0.0.1). It serves the built site from the repo root
// (clean URLs, the same rewrites as vercel.json) and stands in for the services the site talks to, on the lab's local chain:
//   /lab                              the lab page (a plain harness for one whole test)
//   POST /lab/api/<action>            setup, deposit, unbond, withdraw, open, quote, plant, commit, dockets, run, settle,
//                                     close-empty, claim, auto, backfill; GET /lab/api/state
//   GET  /lab/api/stream              SSE: program events, transcript entries and the lab's log lines as they happen
//   GET  /api/runner/stream?seq=      SSE in the runner's shape (BUILD interface 3): {seq, agent, run, entry}; the real runner's own
//                                     stream while POST /lab/api/runner-commit|runner-run has it working on the lab chain
//   /api/plant/*, /api/log/*          the real plant registry and log (verifier bundle) with lab keys; IA_LAB_REGISTRY=stub plays them
//   ANY  /v1/*                        the read API (CONTRACT §9): devx's router (api/v1) on the lab chain, or a proxy to IA_API
//   POST /api/rpc                     JSON-RPC to the lab chain, so pages read the chain from the same origin
//   GET  /lab/wallet, POST /lab/wallet/sign   a dev wallet the site pages can sign with (a throwaway key in lab/.run/keys)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Lab, SCRIPTS, LINEUP, CLASSES, MEDIA, STATE, plain } from './engine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const port = Number(arg('--port', process.env.IA_LAB_PORT || 5791));
const API = process.env.IA_API || '';
const REGISTRY = process.env.IA_REGISTRY || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.jsonl': 'text/plain; charset=utf-8' };
const REWRITES = [[/^\/cases\/([\w-]+)$/, '/case.html'], [/^\/agents\/(\d+)$/, '/agent.html']];

const lines = [];
const lab = new Lab({ log: s => { lines.push(s); if (lines.length > 500) lines.shift(); broadcast('log', { line: s }); } });
const clients = new Set();       // lab stream
const runnerClients = new Set(); // { res, seq }
function broadcast(kind, payload) {
  const data = `event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) c.write(data);
  if (kind === 'entry') for (const c of runnerClients) if (c.seq == null || c.seq === payload.seq) c.res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
lab.listeners.add((kind, payload) => broadcast(kind, payload));

let ready = false;
(async () => {
  for (let i = 0; i < 60; i++) { try { await lab.slot(); break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
  try { const n = await lab.backfill(); lab.watch(); console.log(`lab: ${n} program events loaded from ${lab.rpc}`); } catch (e) { console.log('lab: chain not reachable yet (' + e.message + ')'); }
  ready = true;
})();

/* one chain action at a time: the lab's keys sign in sequence, so two clicks never race on a blockhash or a round */
let queue = Promise.resolve();
const serial = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

/* the real runner (ia/runner/cli.mjs) on the lab chain: its own commit (the real harness) and its own runs with the models through
   the adapters and their budget guard. Model calls spend the owner's API credits, so this runs only when a button asks for it. */
import { spawn } from 'node:child_process';
const RUNNER_STREAM_PORT = Number(process.env.IA_LAB_RUNNER_STREAM || port + 1);
let runnerBusy = false;
function runnerCli(cmd, seq) {
  if (runnerBusy) throw Error('the runner is already working');
  runnerBusy = true;
  const env = { ...process.env, IA_RPC: lab.rpc, IA_RUNNER_KEY: path.join(STATE, 'keys', 'runner.json'), IA_DATA: STATE, IA_STREAM_PORT: String(RUNNER_STREAM_PORT), ...(lab.registry ? { IA_SERVICES_URL: lab.registry } : {}) };
  delete env.IA_LOG_KEY; delete env.IA_SEAL_KEY;
  return new Promise((ok, no) => {
    const ch = spawn(process.execPath, [path.join(root, 'runner/cli.mjs'), cmd, String(seq)], { env, cwd: root });
    const tail = [];
    const line = b => String(b).split('\n').filter(Boolean).forEach(l => { lines.push('runner: ' + l); broadcast('log', { line: 'runner: ' + l }); tail.push(l); if (tail.length > 20) tail.shift(); });
    ch.stdout.on('data', line); ch.stderr.on('data', line);
    ch.on('close', code => { runnerBusy = false; code === 0 ? ok({ cmd, seq, code }) : no(Error(`runner ${cmd} exited ${code}: ${tail.slice(-3).join(' | ')}`)); });
  });
}

const ACTIONS = {
  'runner-commit': async () => { const c = await lab.current(); return runnerCli('commit', c.seq); },
  'runner-run': async () => { const c = await lab.current(); const r = await runnerCli('run', c.seq); await lab.backfill(); return r; },
  setup: b => lab.setup(b),
  deposit: b => lab.deposit(b), unbond: b => lab.unbond(b), withdraw: b => lab.withdraw(b),
  open: () => lab.open(), quote: b => lab.quote(b), plant: b => lab.plant(b), commit: () => lab.commit(), dockets: () => lab.dockets(),
  run: b => lab.run(b), settle: () => lab.settle(), 'close-empty': () => lab.closeEmpty(), claim: b => lab.claim(b), auto: b => lab.auto(b),
  backfill: () => lab.backfill(),
};

const json = (res, code, v) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(v, (k, x) => typeof x === 'bigint' ? x.toString() : x)); };
const body = req => new Promise((ok, no) => { let s = ''; req.on('data', c => { s += c; if (s.length > 1e6) req.destroy(); }); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); });
const sse = res => { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }); res.write(': ok\n\n'); };

/* the read API: devx's own /v1 router (api/v1/_core.js) run in this process against the lab chain, the lab's transcripts and
   the lab's registry stand-in, so the pages are tested against the real API code; or a proxy to IA_API when that is set */
process.env.RPC_URL = lab.rpc;
process.env.IA_TRANSCRIPT_DIR ??= path.join(STATE, 'transcripts');
process.env.IA_REGISTRY_URL ??= `http://127.0.0.1:${port}`;
process.env.IA_FORECAST_FILE ??= path.join(STATE, 'forecasts.json');
process.env.IA_INDEX_INTERVAL_MS ??= '1500';
let handleV1 = null;

/* the real plant registry and transparency log (verifier's bundle, registry/dist), with lab-only keys and an fs store in lab/.run;
   IA_CONFIG_DIR points into the lab so the bundle never reads ~/.config/ia. IA_LAB_REGISTRY=stub keeps the lab's own stand-in. */
let verifier = null;
if (process.env.IA_LAB_REGISTRY !== 'stub') {
  try {
    const keyDir = path.join(STATE, 'keys');
    lab.key('log');
    const seal = path.join(keyDir, 'seal.hex');
    if (!fs.existsSync(seal)) fs.writeFileSync(seal, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    process.env.IA_CONFIG_DIR = keyDir;
    process.env.IA_LOG_KEY = fs.readFileSync(path.join(keyDir, 'log.json'), 'utf8');
    process.env.IA_SEAL_KEY = fs.readFileSync(seal, 'utf8').trim();
    process.env.IA_STORE = 'fs:' + path.join(STATE, 'registry');
    process.env.SOLANA_RPC = lab.rpc;
    process.env.IA_PROGRAM = lab.PID.toBase58();
    process.env.CRON_SECRET = lab.cronSecret = crypto.randomBytes(16).toString('hex');
    process.env.IA_LOG_URL ??= `http://127.0.0.1:${port}/api/log`;
    // readers pin the log's PUBLIC key; the secret keypair stays with the verifier routes only (devx's env below drops it)
    process.env.IA_LOG_KEYS = lab.key('log').publicKey.toBase58();
    const V = await import('../registry/dist/ia-verifier.mjs');
    verifier = { plant: V.node(V.plantRoutes), log: V.node(V.logRoutes) };
    lab.registry = `http://127.0.0.1:${port}`;
  } catch (e) { console.log('lab: the verifier bundle did not load (' + e.message + '); using the lab stand-in for /api/plant'); }
}
async function v1(req, res, url) {
  if (API) {
    const r = await fetch(API.replace(/\/$/, '') + url.pathname + url.search, { method: req.method, headers: { 'content-type': 'application/json' }, body: req.method === 'POST' ? JSON.stringify(await body(req)) : undefined });
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  handleV1 ??= (await import('../api/v1/_core.js')).handleV1;
  const env = { ...process.env }; delete env.IA_LOG_KEY; delete env.IA_SEAL_KEY;
  const out = await handleV1({ env, method: req.method, path: url.pathname.replace(/^\/v1\/?/, ''), query: Object.fromEntries(url.searchParams), body: req.method === 'POST' ? await new Promise(ok => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => ok(b)); }) : undefined, ip: '127.0.0.1', origin: `http://127.0.0.1:${port}` });
  res.writeHead(out.status, { 'content-type': 'application/json', ...out.headers, 'cache-control': 'no-store' });
  res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body));
}

async function plantApi(req, res, url) {
  if (REGISTRY) {
    const r = await fetch(REGISTRY.replace(/\/$/, '') + url.pathname + url.search, { method: req.method, headers: { 'content-type': 'application/json' }, body: req.method === 'POST' ? JSON.stringify(await body(req)) : undefined });
    res.writeHead(r.status, { 'content-type': 'application/json' }); return res.end(Buffer.from(await r.arrayBuffer()));
  }
  if (url.pathname === '/api/plant/quote' && req.method === 'POST') {
    const b = await body(req);
    const cls = CLASSES.indexOf(String(b.class).toUpperCase()), medium = MEDIA.indexOf(String(b.medium));
    try {
      const q = await serial(() => lab.quote({ class: cls >= 0 ? cls : b.class, medium: medium >= 0 ? medium : 0, text: b.text || '', target: b.target || 0 }));
      return json(res, q.filter === 'ok' ? 200 : 422, q);
    } catch (e) { return json(res, 409, { error: e.message }); }
  }
  const m = /^\/api\/plant\/(\d+)\/(\d+)$/.exec(url.pathname);
  if (m) {
    const seq = Number(m[1]), idx = Number(m[2]);
    const r = await lab.fetch('round', lab.roundPda(seq));
    if (!r || idx >= r.plantCount) return json(res, 404, { error: 'no such plant' });
    const delivered = lab.texts.has(`${seq}.${idx}`);
    if (r.state !== 2) return json(res, 200, { round: seq, idx, delivered, sealed: true });
    return json(res, 200, lab.reveal(seq).find(p => p.idx === idx) || { round: seq, idx, delivered: false });
  }
  return json(res, 404, { error: 'no such route' });
}

function serveFile(res, rel) {
  const f = path.join(root, rel);
  if (!f.startsWith(root) || /(^|\/)\.(run|git|env)/.test(rel) || /^\/?program\//.test(rel)) return false;
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return false;
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/lab' || p === '/lab/') return serveFile(res, 'lab/index.html');
    if (p === '/lab/api/stream') {
      sse(res); clients.add(res);
      for (const l of lines.slice(-60)) res.write(`event: log\ndata: ${JSON.stringify({ line: l })}\n\n`);
      req.on('close', () => clients.delete(res)); return;
    }
    if (p === '/lab/api/state') return json(res, 200, { ready, scripts: SCRIPTS, lineup: LINEUP, classes: CLASSES, media: MEDIA, ...(await lab.state()) });
    if (p === '/lab/api/transcript') { const k = `${url.searchParams.get('seq')}.${url.searchParams.get('agent')}.${url.searchParams.get('run')}`; return json(res, 200, { entries: lab.transcripts.get(k) || [] }); }
    if (p.startsWith('/lab/api/') && req.method === 'POST') {
      const name = p.slice('/lab/api/'.length);
      if (!ACTIONS[name]) return json(res, 404, { error: 'no such action' });
      const b = await body(req);
      try { return json(res, 200, { ok: true, result: plain(await serial(() => ACTIONS[name](b))) }); }
      catch (e) { const logs = (e.logs || e.transactionLogs || []).filter(l => /Error|failed/i.test(l)); return json(res, 400, { ok: false, error: e.message.split('\n')[0], logs }); }
    }
    if (p === '/lab/wallet') return json(res, 200, { address: lab.wallet.publicKey.toBase58() });
    if (p === '/lab/wallet/sign' && req.method === 'POST') {
      const b = await body(req);
      return json(res, 200, { signature: Buffer.from(lab.signWithWallet(Buffer.from(b.message, 'base64'))).toString('base64') });
    }
    if (p === '/api/runner/stream' && runnerBusy) {
      // the real runner is working: its own stream (entries redacted until settlement)
      const up = await fetch(`http://127.0.0.1:${RUNNER_STREAM_PORT}${url.pathname}${url.search}`).catch(() => null);
      if (up && up.ok) { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' }); for await (const ch of up.body) res.write(ch); return res.end(); }
    }
    if (p === '/api/runner/stream') {
      sse(res);
      const seq = url.searchParams.has('seq') ? Number(url.searchParams.get('seq')) : null;
      for (const [k, entries] of lab.transcripts) { const [s, agent, run] = k.split('.').map(Number); if (seq == null || s === seq) for (const entry of entries) res.write(`data: ${JSON.stringify({ seq: s, agent, run, entry })}\n\n`); }
      const c = { res, seq }; runnerClients.add(c); req.on('close', () => runnerClients.delete(c)); return;
    }
    if (p === '/api/rpc' && req.method === 'POST') {
      const r = await fetch(lab.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(await body(req)) });
      res.writeHead(r.status, { 'content-type': 'application/json' }); return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (verifier && (p === '/api/plant' || p.startsWith('/api/plant/'))) return await verifier.plant(req, res);
    if (verifier && (p === '/api/log' || p.startsWith('/api/log/'))) return await verifier.log(req, res);
    if (p.startsWith('/api/plant/')) return await plantApi(req, res, url);
    if (p === '/v1' || p.startsWith('/v1/')) return await v1(req, res, url);
    if (p === '/ui/idl.json' && fs.existsSync(path.join(STATE, 'ia.json'))) { res.writeHead(200, { 'content-type': 'application/json' }); return fs.createReadStream(path.join(STATE, 'ia.json')).pipe(res); }
    for (const [re, to] of REWRITES) if (re.test(p)) return serveFile(res, to.slice(1)) || json(res, 404, {});
    const rel = p.replace(/^\/+/, '');
    if (serveFile(res, rel || 'index.html') || serveFile(res, rel + '.html') || serveFile(res, path.join(rel, 'index.html'))) return;
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    fs.existsSync(path.join(root, '404.html')) ? fs.createReadStream(path.join(root, '404.html')).pipe(res) : res.end('not found');
  } catch (e) { json(res, 500, { error: e.message }); }
});
server.listen(port, '127.0.0.1', () => console.log(`ia lab on http://127.0.0.1:${port}/lab · chain ${lab.rpc}${API ? ' · /v1 → ' + API : ''}${verifier ? ' · registry and log: verifier bundle' : REGISTRY ? ' · registry → ' + REGISTRY : ' · registry: lab stand-in'}`));
