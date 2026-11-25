// Where the indexer's events come from and where they are kept.
// - `pull(rpc, programId, cursor)`: the program's transactions since `cursor` (getSignaturesForAddress, newest first, paged back to the
//   cursor), each read once, failed ones dropped, events parsed with the invoke stack (an inner program cannot fake an ia event),
//   returned oldest first. A log truncated by the runtime is reported, never guessed around.
// - stores: memory (tests), a JSON file (local), Vercel Blob (production). The store keeps the raw event list and the cursor; the fold
//   is rebuilt from it on load, so a new index version never needs a migration.
import fs from "node:fs";
import path from "node:path";
import * as sdk from "../sdk/dist/index.js";

/** JSON with bigints kept exact: {"$n":"123"} */
export const toJson = (v) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? { $n: x.toString() } : x));
export const fromJson = (s) => JSON.parse(s, (_, x) => (x && typeof x === "object" && typeof x.$n === "string" && Object.keys(x).length === 1 ? BigInt(x.$n) : x));

/**
 * @param {sdk.RpcLike} rpc  needs getSignaturesForAddress and getTransaction
 * @returns {Promise<{ events: object[], cursor: string|null, transactions: number, truncated: string[] }>}
 */
export async function pull(rpc, programId, cursor, { maxPages = 50, concurrency = 8, limit = 1000 } = {}) {
  const sigs = [];
  let before;
  let reached = !cursor;
  for (let page = 0; page < maxPages; page++) {
    const list = await rpc.getSignaturesForAddress(programId, { before, limit });
    if (!list.length) { reached = true; break; }
    let stop = false;
    for (const s of list) {
      if (s.signature === cursor) { stop = true; reached = true; break; }
      sigs.push(s);
    }
    // a short page is not proof of the end on every RPC: only an empty page or the cursor ends the walk
    if (stop) break;
    before = list[list.length - 1].signature;
  }
  if (!reached) throw new Error(`more than ${maxPages} pages of history since the cursor: raise maxPages for a first sync`);
  sigs.reverse(); // oldest first; within a slot the RPC lists newest first, so the reverse is chain order
  const ok = sigs.filter((s) => !s.err);
  const txs = new Array(ok.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, ok.length) }, async () => {
    while (i < ok.length) {
      const k = i++;
      txs[k] = await rpc.getTransaction(ok[k].signature);
    }
  }));
  const events = [];
  const truncated = [];
  for (const t of txs) {
    if (!t || t.err) continue;
    if (t.logs.some((l) => l === "Log truncated")) truncated.push(t.signature);
    for (const e of sdk.parseEvents(t.logs, programId)) events.push({ ...e, signature: t.signature, slot: t.slot, blockTime: t.blockTime });
  }
  return { events, cursor: sigs.length ? sigs[sigs.length - 1].signature : cursor, transactions: ok.length, truncated };
}

export class MemoryStore {
  constructor() { this.v = null; }
  async load() { return this.v ? fromJson(this.v) : null; }
  async save(doc) { this.v = toJson(doc); }
}

export class FileStore {
  constructor(file) { this.file = file; }
  async load() {
    try { return fromJson(fs.readFileSync(this.file, "utf8")); } catch { return null; }
  }
  async save(doc) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, toJson(doc));
    fs.renameSync(tmp, this.file);
  }
}

/** Vercel Blob (production): one JSON document, overwritten by the writer (the cron or the instance that synced). The store is
 *  PRIVATE (the verifier keeps sealed plants there), so the document is written with access "private" and read with get(), never by a
 *  public URL (as log/src/store.ts). */
export class BlobStore {
  constructor(key = "ia-index/events.json", token = process.env.BLOB_READ_WRITE_TOKEN) { this.key = key; this.token = token; }
  async load() {
    const { get } = await import("@vercel/blob");
    let r;
    try { r = await get(this.key, { access: "private", token: this.token, useCache: false }); }
    catch (e) { if (e?.name === "BlobNotFoundError" || /not.?found|404/i.test(String(e?.message))) return null; throw e; }
    if (!r || !r.stream) return null;
    return fromJson(await new Response(r.stream).text());
  }
  async save(doc) {
    const { put } = await import("@vercel/blob");
    await put(this.key, toJson(doc), { access: "private", token: this.token, contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
  }
}

/** The store for an environment: IA_INDEX_FILE, else Blob when its token is set, else ia/.data/index/events.json. */
export function storeFor(env = process.env) {
  if (env.IA_INDEX_FILE) return new FileStore(env.IA_INDEX_FILE);
  if (env.BLOB_READ_WRITE_TOKEN && env.IA_INDEX_BLOB !== "0") return new BlobStore(env.IA_INDEX_BLOB_KEY || "ia-index/events.json", env.BLOB_READ_WRITE_TOKEN);
  return new FileStore(path.resolve(new URL("..", import.meta.url).pathname, ".data/index/events.json"));
}
