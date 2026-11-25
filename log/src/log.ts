/* The transparency log (CONTRACT §8), the POF technique: entries at log/e/<index>, each append a create-if-absent of the
   next index, so two function instances never write the same index and the log never has a gap; log/hashes caches the leaf
   hashes (a prefix of the true log: if behind, a read probes forward). Nothing is rewritten or deleted.
   appendOnce(key, leaf) makes an append idempotent per logical record (a round's manifest, a docket's transcript, a plant's
   reveal, …): a marker at log/k/<key> holds the index, so a retried crank never logs the same record twice. */
import { IaError, concat, equal, hex, sha256, text } from './codec.js';
import { decodeLeaf, leafJson, KIND_NAME } from './leaves.js';
import { leafHash, root, inclusionPath, consistencyProof } from './merkle.js';
import { sthBytes, type Signer } from './keys.js';
import type { Store } from './store.js';

const ek = (i: number) => 'log/e/' + String(i).padStart(12, '0');
export const MAX_LEAF = 70_000;

export interface SignedHead { treeSize: number; rootHash: string; signature: string; logKey: string; programId: string }

export class TransparencyLog {
  private hashes: Uint8Array[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private store: Store, private signer: Signer, private programId: Uint8Array) {}
  get logKey() { return this.signer.address; }

  private serial<T>(f: () => Promise<T>): Promise<T> { const r = this.chain.then(f, f); this.chain = r.catch(() => {}); return r; }
  sync(): Promise<number> { return this.serial(() => this.syncNow()); }

  private async syncNow(): Promise<number> {
    if (!this.hashes.length) {
      const c = await this.store.get('log/hashes');
      if (c) for (let o = 0; o + 32 <= c.length; o += 32) this.hashes.push(c.slice(o, o + 32));
    }
    const before = this.hashes.length;
    for (;;) {
      const base = this.hashes.length;
      const got = await Promise.all(Array.from({ length: 8 }, (_, k) => this.store.get(ek(base + k))));
      let k = 0;
      for (; k < got.length && got[k]; k++) this.hashes.push(leafHash(got[k]!));
      if (k < got.length) break;
    }
    if (this.hashes.length > before) await this.store.put('log/hashes', concat(...this.hashes)).catch(() => {});
    return this.hashes.length;
  }

  async append(leaf: Uint8Array): Promise<number> {
    if (leaf.length > MAX_LEAF) throw new IaError('INTERNAL', 'leaf too large', 500);
    decodeLeaf(leaf); // only well-formed leaves
    return this.serial(() => this.appendNow(leaf));
  }

  private async appendNow(leaf: Uint8Array): Promise<number> {
    let i = await this.syncNow();
    for (let tries = 0; tries < 64; tries++, i++) {
      if (await this.store.create(ek(i), leaf)) {
        while (this.hashes.length < i) { const e = await this.store.get(ek(this.hashes.length)); if (!e) break; this.hashes.push(leafHash(e)); }
        if (this.hashes.length === i) this.hashes.push(leafHash(leaf));
        await this.store.put('log/hashes', concat(...this.hashes)).catch(() => {});
        return i;
      }
    }
    throw new IaError('LOG_BUSY', 'the log is busy, try again in a moment', 503);
  }

  /** appends `leaf` once per `key`; returns its index. A marker stuck at "appending" (an instance died mid-way) is resolved by
   *  looking the leaf up in the log after 120 s. */
  async appendOnce(key: string, leaf: Uint8Array): Promise<{ index: number; fresh: boolean }> {
    if (!/^[a-z0-9:_.-]{1,160}$/i.test(key)) throw new IaError('INTERNAL', 'bad log key', 500);
    const mark = `log/k/${key}`;
    const lh = hex(leafHash(leaf));
    for (let attempt = 0; attempt < 3; attempt++) {
      const was = await this.store.get(mark);
      if (was) {
        const m = JSON.parse(Buffer.from(was).toString('utf8')) as { state: string; index?: number; leafHash: string; at: number };
        if (m.state === 'done') {
          if (m.leafHash !== lh) throw new IaError('LOG_CONFLICT', `${key} is already logged with other content (entry ${m.index})`, 409, { index: m.index });
          return { index: m.index!, fresh: false };
        }
        if (Date.now() - m.at < 120_000) throw new IaError('LOG_BUSY', `${key} is being logged; retry`, 503);
        const n = await this.sync();
        const found = this.hashes.slice(0, n).findIndex(h => hex(h) === m.leafHash);
        if (found >= 0) { await this.putMark(mark, { state: 'done', index: found, leafHash: m.leafHash, at: Date.now() }); continue; }
        await this.store.del(mark);
        continue;
      }
      if (!(await this.store.create(mark, text(JSON.stringify({ state: 'appending', leafHash: lh, at: Date.now() }))))) continue;
      try {
        const index = await this.append(leaf);
        await this.putMark(mark, { state: 'done', index, leafHash: lh, at: Date.now() });
        return { index, fresh: true };
      } catch (e) { await this.store.del(mark).catch(() => {}); throw e; }
    }
    throw new IaError('LOG_BUSY', `${key}: could not log; retry`, 503);
  }
  private putMark(mark: string, v: object) { return this.store.put(mark, text(JSON.stringify(v))); }
  async indexOf(key: string): Promise<number | null> {
    const was = await this.store.get(`log/k/${key}`);
    if (!was) return null;
    const m = JSON.parse(Buffer.from(was).toString('utf8'));
    return m.state === 'done' ? m.index : null;
  }

  async head(): Promise<SignedHead> {
    const n = await this.sync();
    const r = root(this.hashes, 0, n);
    return { treeSize: n, rootHash: hex(r), signature: hex(this.signer.sign(sthBytes(this.programId, n, r))), logKey: this.signer.address, programId: Buffer.from(this.programId).toString('hex') };
  }
  /** root at an earlier size (for anchoring and witnesses) */
  async rootAt(size: number): Promise<Uint8Array> {
    const n = await this.sync();
    if (!Number.isInteger(size) || size < 0 || size > n) throw new IaError('BAD_RANGE', `no tree of size ${size} (the log has ${n})`, 404);
    return root(this.hashes, 0, size);
  }

  async raw(i: number): Promise<Uint8Array> {
    const e = Number.isInteger(i) && i >= 0 ? await this.store.get(ek(i)) : null;
    if (!e) throw new IaError('NOT_FOUND', `log entry ${i} does not exist`, 404);
    return e;
  }
  async entry(i: number) {
    const e = await this.raw(i);
    const d = decodeLeaf(e);
    return { index: i, kind: KIND_NAME[e[1]], leaf: hex(e), leafHash: hex(leafHash(e)), data: leafJson(d) };
  }

  async proof(i: number, size?: number) {
    const n = await this.sync();
    const s = size ?? n;
    if (!Number.isInteger(i) || i < 0 || !Number.isInteger(s) || i >= s || s > n) throw new IaError('BAD_RANGE', `entry ${i} is not inside a log of size ${s} (the log has ${n})`, 404);
    return { index: i, treeSize: s, rootHash: hex(root(this.hashes, 0, s)), leafHash: hex(this.hashes[i]), path: inclusionPath(this.hashes.slice(0, s), i).map(hex) };
  }

  async consistency(m: number, n2?: number) {
    const n = await this.sync();
    const s = n2 ?? n;
    if (!Number.isInteger(m) || m < 0 || !Number.isInteger(s) || m > s || s > n) throw new IaError('BAD_RANGE', `no consistency proof from ${m} to ${s} (the log has ${n})`, 404);
    return { first: m, second: s, firstRoot: hex(root(this.hashes, 0, m)), secondRoot: hex(root(this.hashes, 0, s)), path: consistencyProof(this.hashes.slice(0, s), m).map(hex) };
  }

  async range(from: number, to: number) {
    const n = await this.sync();
    const a = Math.max(0, from | 0), b = Math.min(n, to | 0, a + 256);
    const idx = Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k);
    const out: any[] = [];
    for (let k = 0; k < idx.length; k += 16) out.push(...await Promise.all(idx.slice(k, k + 16).map(i => this.entry(i))));
    return { treeSize: n, entries: out };
  }

  /** the index of a leaf with these exact bytes, if logged */
  async find(leaf: Uint8Array): Promise<number | null> {
    const n = await this.sync();
    const h = leafHash(leaf);
    const i = this.hashes.slice(0, n).findIndex(x => equal(x, h));
    return i < 0 ? null : i;
  }
}

/** a stable short id for content keys in REDACTION leaves */
export const keyHash = (key: string) => sha256(text(key));
