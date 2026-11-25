// Shared server helpers for /v1, the hosted MCP endpoint and the bots: one IaClient and one Indexer per warm instance, a single-flight
// memo, the forecast store, and readers for the verifier's log, registry and transcripts. Everything is derived from chain + log.
import fs from "node:fs";
import path from "node:path";
import * as sdk from "../../sdk/dist/index.js";
import { Indexer, storeFor, MemoryStore, BlobStore, toJson, fromJson } from "../../indexer/index.js";

export { sdk };

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/* ---------- one client and one indexer per instance (tests inject their own) ---------- */

let injected = null;
let client = null;
let indexer = null;
export function setBackends(b) {
  injected = b;
  client = null;
  indexer = null;
  memo.clear();
}

function programIdOf(env) {
  return env.IA_PROGRAM_ID || sdk.IA_PROGRAM_ID;
}
function rpcUrl(env) {
  const u = env.SOLANA_RPC || env.RPC_URL;
  if (!u) throw new HttpError(503, "rpc_not_configured", "the server has no Solana RPC configured (SOLANA_RPC)");
  return u;
}

export function getClient(env = process.env) {
  if (injected?.client) return injected.client;
  if (!client) {
    client = new sdk.IaClient({
      rpc: new sdk.Rpc(rpcUrl(env), { commitment: "confirmed", timeoutMs: 15_000 }),
      programId: programIdOf(env),
      // an operator who sets IA_PROGRAM_ID runs another deployment (a local validator) on purpose
      allowOtherDeployment: !!env.IA_PROGRAM_ID,
    });
  }
  return client;
}

export function getIndexer(env = process.env) {
  if (injected?.indexer) return injected.indexer;
  if (!indexer) {
    indexer = new Indexer({
      rpc: new sdk.Rpc(rpcUrl(env), { commitment: "confirmed", timeoutMs: 20_000 }),
      programId: programIdOf(env),
      store: storeFor(env),
      minIntervalMs: Number(env.IA_INDEX_INTERVAL_MS || 5_000),
      // API instances catch up in memory; the cron (or the CLI) writes the shared snapshot
      readOnly: env.IA_INDEX_WRITE !== "1",
    });
  }
  return indexer;
}

export async function getIndex(env = process.env) {
  try {
    return await getIndexer(env).get();
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e instanceof sdk.RpcError) throw new HttpError(502, "rpc_error", "the Solana RPC did not answer, try again");
    throw e;
  }
}

/* ---------- single-flight memo ---------- */

const memo = new Map();
export const memoStats = { hits: 0, misses: 0 };
/** Concurrent callers of the same key share ONE upstream call (the promise is cached, not only the value). */
export function remember(key, ms, fn) {
  if (process.env.IA_MEMO_OFF === "1") return fn();
  const hit = memo.get(key);
  if (hit && hit.until > Date.now()) {
    memoStats.hits++;
    return hit.promise;
  }
  memoStats.misses++;
  const promise = Promise.resolve().then(fn);
  memo.set(key, { promise, until: Date.now() + ms });
  if (memo.size > 500) memo.delete(memo.keys().next().value);
  promise.catch(() => {
    if (memo.get(key)?.promise === promise) memo.delete(key);
  });
  return promise;
}
export function clearMemo() {
  memo.clear();
  logCache.clear();
}

/* ---------- params ---------- */

export function parseIntParam(v, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (v === undefined || v === null || v === "") return undefined;
  if (!/^\d+$/.test(String(v))) throw new HttpError(400, "bad_param", `${name} must be a whole number`);
  const n = Number(v);
  if (n < min || n > max) throw new HttpError(400, "bad_param", `${name} must be between ${min} and ${max}`);
  return n;
}
export function parseSeq(v, name = "seq") {
  if (!/^\d{1,20}$/.test(String(v ?? ""))) throw new HttpError(400, "bad_param", `${name} must be a round number`);
  return BigInt(v);
}

/* ---------- internal reads of the verifier (log, registry, transcripts) ---------- */

/** server-to-server reads skip the verifier's public per-IP limit with the shared internal secret (env only, never in a browser) */
export function internalHeaders(env = process.env) {
  return env.IA_INTERNAL_SECRET ? { accept: "application/json", "x-ia-internal": env.IA_INTERNAL_SECRET } : { accept: "application/json" };
}

export function logBase(env = process.env) {
  if (env.IA_LOG_URL) return env.IA_LOG_URL.replace(/\/$/, "");
  throw new HttpError(503, "log_not_configured", "the transparency log URL is not configured (IA_LOG_URL)");
}

/** the log keys a head may be signed with: pinned in env (IA_LOG_KEYS, comma separated), never taken from the log itself */
export function trustedLogKeys(env = process.env) {
  return String(env.IA_LOG_KEYS || env.IA_LOG_KEY || "").split(",").map((s) => s.trim()).filter(Boolean);
}

const logCache = new Map();
const immutable = (qs) => /^(entry=\d+|proof=\d+&size=\d+|consistency=\d+&size=\d+)$/.test(qs);
export async function logGet(base, qs, f = fetch, env = process.env) {
  if (qs === "head") return remember(`loghead:${base}`, 3_000, () => logFetch(base, qs, f, env));
  if (!immutable(qs)) return logFetch(base, qs, f, env);
  const key = `${base}?${qs}`;
  if (logCache.has(key)) return logCache.get(key);
  const p = logFetch(base, qs, f, env);
  logCache.set(key, p);
  p.catch(() => logCache.delete(key));
  if (logCache.size > 5000) logCache.delete(logCache.keys().next().value);
  return p;
}
async function logFetch(base, qs, f, env) {
  let res;
  try {
    res = await f(`${base}?${qs}`, { headers: internalHeaders(env) });
  } catch {
    throw new HttpError(502, "log_unreachable", "the transparency log did not answer");
  }
  const body = await res.json().catch(() => null);
  if (res.status === 404) throw new HttpError(404, "not_found", body?.error?.message ?? body?.message ?? "no such log entry");
  if (res.status === 429) throw new HttpError(503, "log_busy", "the transparency log is rate limiting this server; retry in a few seconds", { retryAfter: 5 });
  if (!res.ok || !body) throw new HttpError(502, "log_error", `the transparency log answered ${res.status}`);
  return body;
}

export async function verifiedHead(env, programId, f = fetch) {
  const head = await logGet(logBase(env), "head", f, env);
  const keys = trustedLogKeys(env);
  const keyTrusted = keys.length ? keys.includes(head.logKey) : null;
  const signatureValid = await sdk.verifyTreeHead(head, programId);
  return { ...head, signatureValid, keyTrusted, trustedKeys: keys };
}

export async function verifiedProof(env, programId, index, f = fetch) {
  const base = logBase(env);
  const head = await logGet(base, "head", f, env);
  if (index >= head.treeSize) throw new HttpError(404, "not_found", `log entry ${index} does not exist yet (the log has ${head.treeSize})`);
  const [entry, proof] = await Promise.all([logGet(base, `entry=${index}`, f, env), logGet(base, `proof=${index}&size=${head.treeSize}`, f, env)]);
  const keys = trustedLogKeys(env);
  const check = await sdk.verifyLogEntry({ leaf: entry.leaf, index, proof, head, programId, logKeys: keys.length ? keys : undefined });
  let leaf = null;
  try {
    leaf = plainLeaf(sdk.decodeLeaf(sdk.fromHex(entry.leaf)));
  } catch (e) {
    leaf = { error: e.message };
  }
  if (!check.ok) logCache.delete(`${base}?entry=${index}`), logCache.delete(`${base}?proof=${index}&size=${head.treeSize}`);
  return { index, leaf: entry.leaf, decoded: leaf, proof: { treeSize: proof.treeSize, rootHash: proof.rootHash, path: proof.path }, head, verified: check.ok, checks: check.checks };
}
const plainLeaf = (l) => JSON.parse(JSON.stringify(l, (_, x) => (typeof x === "bigint" ? x.toString() : x)));

/** Find log entries by kind (and seq/agent/idx): pages through the log, entries cached (they never change). */
export async function findLogEntries(env, { kind, seq, agent, idx }, f = fetch) {
  const base = logBase(env);
  const head = await logGet(base, "head", f, env);
  const out = [];
  for (let a = 0; a < head.treeSize; a += 256) {
    const page = await remember(`logrange:${base}:${a}:${Math.min(head.treeSize, a + 256)}`, a + 256 <= head.treeSize ? 3_600_000 : 3_000,
      () => logFetch(base, `from=${a}&to=${Math.min(head.treeSize, a + 256)}`, f, env));
    for (const e of page.entries ?? []) {
      let d;
      try { d = sdk.decodeLeaf(sdk.fromHex(e.leaf)); } catch { continue; }
      if (kind && d.kind !== kind) continue;
      if (seq !== undefined && d.seq !== undefined && d.seq !== seq) continue;
      if (agent !== undefined && d.agent !== undefined && d.agent !== agent) continue;
      if (idx !== undefined && d.idx !== undefined && d.idx !== idx) continue;
      out.push({ index: e.index, kind: d.kind, data: plainLeaf(d), proof: `/v1/log/proof/${e.index}` });
    }
  }
  return { treeSize: head.treeSize, entries: out };
}

/** The registry's reveal of a plant (CONTRACT §7), or null when no registry is configured or it does not answer. */
export async function readReveal(env, seq, idx, f = fetch) {
  if (!env.IA_REGISTRY_URL) return null;
  return remember(`reveal:${seq}:${idx}`, 15_000, async () => {
    try {
      const r = await f(`${env.IA_REGISTRY_URL.replace(/\/$/, "")}/api/plant/${seq}/${idx}`, { headers: internalHeaders(env) });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  });
}

/** A run's published transcript (JSONL text) or null: IA_TRANSCRIPT_DIR (local) or IA_TRANSCRIPT_URL (`<base>/<seq>/<agent>/<run>.jsonl`). */
export async function readTranscript(env, seq, agent, run, f = fetch) {
  if (env.IA_TRANSCRIPT_DIR) {
    const file = path.join(env.IA_TRANSCRIPT_DIR, String(seq), String(agent), `${run}.jsonl`);
    try { return fs.readFileSync(file, "utf8"); } catch { return null; }
  }
  if (!env.IA_TRANSCRIPT_URL) return null;
  return remember(`transcript:${seq}:${agent}:${run}`, 60_000, async () => {
    try {
      const r = await f(`${env.IA_TRANSCRIPT_URL.replace(/\/$/, "")}/${seq}/${agent}/${run}.jsonl`, { headers: { accept: "application/x-ndjson, text/plain" } });
      return r.ok ? await r.text() : null;
    } catch {
      return null;
    }
  });
}

/* ---------- forecasts (SPEC §4): one per wallet per docket, first one stands ---------- */

export class ForecastStore {
  constructor(backend) {
    this.backend = backend;
    this.cache = null;
  }
  async all() {
    if (!this.cache) this.cache = (await this.backend.load())?.forecasts ?? [];
    return this.cache;
  }
  /** false when this wallet already called this docket */
  async add(rec) {
    const list = await this.all();
    if (list.some((x) => x.wallet === rec.wallet && x.seq === rec.seq && x.agent === rec.agent)) return false;
    list.push(rec);
    await this.backend.save({ forecasts: list });
    return true;
  }
}
let forecasts = null;
export function getForecasts(env = process.env) {
  if (injected?.forecasts) return injected.forecasts;
  if (!forecasts) {
    const be = env.IA_FORECAST_FILE ? new (class { load() { try { return fromJson(fs.readFileSync(env.IA_FORECAST_FILE, "utf8")); } catch { return null; } } save(d) { fs.mkdirSync(path.dirname(env.IA_FORECAST_FILE), { recursive: true }); fs.writeFileSync(env.IA_FORECAST_FILE, toJson(d)); } })()
      : env.BLOB_READ_WRITE_TOKEN ? new BlobStore(env.IA_FORECAST_BLOB_KEY || "ia-index/forecasts.json", env.BLOB_READ_WRITE_TOKEN)
        : new MemoryStore();
    forecasts = new ForecastStore(be);
  }
  return forecasts;
}

/* ---------- a per-instance token bucket (the Vercel Firewall rule bounds the fleet) ---------- */

const buckets = new Map();
export function allow(ip, { perMinute = 30, burst = 10 } = {}, now = Date.now()) {
  const b = buckets.get(ip) ?? { tokens: burst, at: now };
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  const ok = b.tokens >= 1;
  if (ok) b.tokens -= 1;
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.delete(buckets.keys().next().value);
  return ok;
}
export function resetBuckets() {
  buckets.clear();
}
