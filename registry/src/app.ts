/* The wiring: configuration from the environment, one set of singletons per function instance, and the HTTP handlers the
   Vercel functions in ia/api/plant and ia/api/log export. Every answer is JSON; every rejection is
   { error: { code, message, details? } } with its status. Keys are never logged or echoed. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IaError, fromB58, hex, sha256, text, unhex } from '../../log/src/codec.js';
import { signerFromJson, type Signer } from '../../log/src/keys.js';
import { BlobStore, FsStore, type Store } from '../../log/src/store.js';
import { TransparencyLog } from '../../log/src/log.js';
import { jsonRpc, type Rpc } from '../../log/src/rpc.js';
import { findAnchors, sendAnchor } from '../../log/src/anchor.js';
import { RpcChain, type IaChain } from './chain.js';
import { Registry } from './registry.js';
import { IDL_ADDRESS } from './idl.js';
import { FILTER_VERSION } from './filter.js';
import { bucket, sweepLimits, windowCap } from './limits.js';

export const VERSION = '0.1.0';

let selfHash: Uint8Array | null = null;
/** sha256 of the running bundle file (the published hash in registry/dist/BUILD.json), zeros when run from sources */
export function bundleHash(): Uint8Array {
  if (selfHash) return selfHash;
  try { selfHash = sha256(new Uint8Array(fs.readFileSync(fileURLToPath(import.meta.url)))); } catch { selfHash = new Uint8Array(32); }
  return selfHash;
}

const cfgDir = () => process.env.IA_CONFIG_DIR || path.join(os.homedir(), '.config', 'ia');
function secret(envName: string, file: string): string | null {
  if (process.env[envName]) return process.env[envName]!;
  try { return fs.readFileSync(path.join(cfgDir(), file), 'utf8').trim(); } catch { return null; }
}

export interface Ctx { programId: string; signer: Signer; store: Store; chain: IaChain; rpc: Rpc | null; log: TransparencyLog; registry: Registry; sealKey: Uint8Array; env: Record<string, string | undefined> }
let ctx: Ctx | null = null;
export function setContext(c: Ctx | null) { ctx = c; }

/** builds a context; tests pass a store and a chain double */
export function makeContext(o: { programId?: string; signer: Signer; sealKey: Uint8Array; store: Store; chain?: IaChain; rpc?: Rpc | null; env?: Record<string, string | undefined>; now?: () => number }): Ctx {
  const programId = o.programId || IDL_ADDRESS;
  const rpc = o.rpc ?? null;
  const chain = o.chain || new RpcChain(rpc!, programId);
  const log = new TransparencyLog(o.store, o.signer, fromB58(programId));
  const registry = new Registry({ store: o.store, chain, log, sealKey: o.sealKey, bundle: bundleHash(), now: o.now });
  return { programId, signer: o.signer, store: o.store, chain, rpc, log, registry, sealKey: o.sealKey, env: o.env || process.env };
}

export function context(): Ctx {
  if (ctx) return ctx;
  const env = process.env;
  const lk = secret('IA_LOG_KEY', 'log.json');
  if (!lk) throw new IaError('NOT_CONFIGURED', 'the log key is not configured (IA_LOG_KEY or ~/.config/ia/log.json)', 503);
  const sk = secret('IA_SEAL_KEY', 'seal.hex');
  if (!sk) throw new IaError('NOT_CONFIGURED', 'the seal key is not configured (IA_SEAL_KEY or ~/.config/ia/seal.hex)', 503);
  const store: Store = env.IA_STORE?.startsWith('fs:') ? new FsStore(env.IA_STORE.slice(3)) : new BlobStore(env.IA_BLOB_PREFIX || 'ia/');
  const rpc = jsonRpc(String(env.SOLANA_RPC || 'http://127.0.0.1:8899').split(',').map(s => s.trim()).filter(Boolean));
  ctx = makeContext({ programId: env.IA_PROGRAM || IDL_ADDRESS, signer: signerFromJson(lk, 'log key'), sealKey: unhex(sk, 32, 'IA_SEAL_KEY'), store, rpc, env });
  return ctx;
}

// ---------------------------------------------------------------------------------------------------- HTTP plumbing
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' };
const json = (v: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x instanceof Uint8Array ? hex(x) : x), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extra } });
export function fail(e: unknown): Response {
  if (e instanceof IaError) return json({ error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } }, e.status, e.code === 'RATE_LIMITED' && e.details?.retryAfterSec ? { 'retry-after': String(e.details.retryAfterSec) } : {});
  console.error('internal error', (e as any)?.name, String((e as any)?.message || '').slice(0, 200));
  return json({ error: { code: 'INTERNAL', message: 'internal error; nothing was decided' } }, 500);
}
const client = (req: Request) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
async function readBody(req: Request, max = 9 * 1024 * 1024): Promise<{ raw: Uint8Array; json: any }> {
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.length > max) throw new IaError('TOO_LARGE', `the body is at most ${max} bytes`, 413);
  try { return { raw, json: raw.length ? JSON.parse(Buffer.from(raw).toString('utf8')) : {} }; } catch { throw new IaError('BAD_JSON', 'the body is not JSON'); }
}
const wrap = (f: (req: Request, c: Ctx) => Promise<Response>) => async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try { return await f(req, context()); } catch (e) { return fail(e); }
};

// ---------------------------------------------------------------------------------------------------- /api/plant/*
export const plantRoutes = wrap(async (req, c) => {
  const u = new URL(req.url);
  const parts = u.pathname.replace(/^\/api\/plant\/?/, '').split('/').filter(Boolean);
  const ip = client(req);
  if (req.method === 'POST' && parts[0] === 'quote') {
    bucket(`quote:${ip}`, 20);
    await windowCap(c.store, 'quote', ip, Number(c.env.IA_QUOTES_PER_10MIN || 60), c.sealKey);
    const { json: b } = await readBody(req, 16_384);
    return json(await c.registry.quote(b));
  }
  if (req.method !== 'GET') throw new IaError('METHOD', 'GET or POST /api/plant/quote', 405);
  if (parts.length === 0) return json({ service: 'ia plant registry', version: VERSION, programId: c.programId, filterVersion: FILTER_VERSION, logKey: c.signer.address, bundleHash: hex(bundleHash()), routes: ['POST /api/plant/quote', 'GET /api/plant/:round/:idx', 'GET /api/plant/internal/:seq (runner)', 'GET /api/plant/crank (cron)'] });
  if (parts[0] === 'internal' && parts.length === 2) {
    const r = await c.registry.internalPlants(BigInt(num(parts[1], 'seq')), { header: req.headers.get('authorization'), method: 'GET', path: u.pathname, body: new Uint8Array() });
    return json(r);
  }
  if (parts[0] === 'crank') {
    if (!c.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${c.env.CRON_SECRET}`) throw new IaError('FORBIDDEN', 'cron only', 403);
    const out: any = await c.registry.crank();
    out.limitsSwept = await sweepLimits(c.store).catch(() => 0);
    if (c.env.IA_ANCHOR === '1') out.anchor = await anchorIfGrown(c).catch(e => ({ error: e?.code || 'ANCHOR_FAILED' }));
    return json(out);
  }
  if (parts.length === 2) {
    bucket(`plant:${ip}`, 120);
    return json(await c.registry.plantStatus(BigInt(num(parts[0], 'round')), num(parts[1], 'idx')), 200, { 'cache-control': 'public, max-age=5' });
  }
  throw new IaError('NOT_FOUND', 'no such route under /api/plant', 404);
});

// ---------------------------------------------------------------------------------------------------- /api/log/*
export const logRoutes = wrap(async (req, c) => {
  const u = new URL(req.url);
  const parts = u.pathname.replace(/^\/api\/log\/?/, '').split('/').filter(Boolean);
  const q = u.searchParams, ip = client(req);
  if (req.method === 'POST') {
    const { raw, json: b } = await readBody(req);
    const auth = { header: req.headers.get('authorization'), method: 'POST', path: u.pathname, body: raw };
    if (parts[0] === 'transcript') return json(await c.registry.postTranscript(b, auth));
    if (parts[0] === 'harness') return json(await c.registry.postHarness(b, auth));
    if (parts[0] === 'forecast') { bucket(`forecast:${ip}`, 10); await windowCap(c.store, 'forecast', ip, 60, c.sealKey); return json(await c.registry.postForecast(b)); }
    throw new IaError('NOT_FOUND', 'POST /api/log/{transcript,harness,forecast}', 404);
  }
  if (req.method !== 'GET') throw new IaError('METHOD', 'GET or POST', 405);
  bucket(`log:${ip}`, 240);
  if (parts[0] === 'transcript' && parts.length === 4) return json(await c.registry.transcript(BigInt(num(parts[1], 'seq')), num(parts[2], 'agent'), num(parts[3], 'run')));
  if (parts[0] === 'anchors') {
    if (!c.rpc) throw new IaError('NOT_CONFIGURED', 'no RPC', 503);
    return json({ logKey: c.signer.address, anchors: await findAnchors(c.rpc, c.signer.address, c.programId, 50) }, 200, { 'cache-control': 'public, max-age=30' });
  }
  if (q.has('head') || parts[0] === 'head') return json(await c.log.head());
  if (q.has('entry')) return json(await c.log.entry(num(q.get('entry'), 'entry')));
  if (q.has('proof')) return json(await c.log.proof(num(q.get('proof'), 'proof'), q.has('size') ? num(q.get('size'), 'size') : undefined));
  if (q.has('consistency')) return json(await c.log.consistency(num(q.get('consistency'), 'consistency'), q.has('size') ? num(q.get('size'), 'size') : undefined));
  if (q.has('from')) return json(await c.log.range(num(q.get('from'), 'from'), q.has('to') ? num(q.get('to'), 'to') : num(q.get('from'), 'from') + 256));
  if (q.has('key')) { const i = await c.log.indexOf(String(q.get('key'))); if (i === null) throw new IaError('NOT_FOUND', 'nothing logged under that key', 404); return json(await c.log.entry(i)); }
  return json({ service: 'ia transparency log', logKey: c.signer.address, programId: c.programId, bundleHash: hex(bundleHash()), routes: ['?head', '?entry=i', '?proof=i&size=n', '?consistency=m&size=n', '?from=i&to=j', '?key=<manifest:seq|transcript:seq:agent|verdict:seq:agent|reveal:seq:idx|harness:seq>', '/anchors', '/transcript/:seq/:agent/:run'] });
});

/** sends a memo anchor when the log grew since the last one */
export async function anchorIfGrown(c: Ctx) {
  if (!c.rpc) throw new IaError('NOT_CONFIGURED', 'no RPC', 503);
  const h = await c.log.head();
  const last = await c.store.get('anchor/last');
  const prev = last ? JSON.parse(Buffer.from(last).toString('utf8')) : null;
  if (prev && prev.treeSize >= h.treeSize) return { skipped: true, treeSize: h.treeSize };
  const signature = await sendAnchor(c.rpc, c.signer, c.programId, h.treeSize, h.rootHash);
  await c.store.put('anchor/last', text(JSON.stringify({ treeSize: h.treeSize, rootHash: h.rootHash, signature })));
  return { treeSize: h.treeSize, rootHash: h.rootHash, signature };
}

function num(v: unknown, name: string): number {
  const s = String(v ?? '');
  if (!/^\d{1,15}$/.test(s)) throw new IaError('BAD_QUERY', `${name} must be a non-negative integer`);
  return Number(s);
}

/** Node (req, res) adapter for Vercel functions */
export function node(handler: (req: Request) => Promise<Response>) {
  return async (req: any, res: any) => {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const url = `${proto}://${req.headers.host || 'localhost'}${req.url}`;
    let body: Buffer | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      // the raw bytes (never req.body: Vercel's lazy parser would re-serialize JSON and break the runner's body signature)
      const chunks: Buffer[] = []; let n = 0;
      for await (const ch of req) { n += ch.length; if (n > 9.5 * 1024 * 1024) break; chunks.push(ch); }
      body = Buffer.concat(chunks);
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const r = await handler(new Request(url, { method: req.method, headers, body: body as any }));
    res.statusCode = r.status;
    r.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(req.method === 'HEAD' ? '' : Buffer.from(await r.arrayBuffer()));
  };
}
