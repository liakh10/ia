/* The plant registry and the log's writers (CONTRACT §7–§8).
   quote → filter → sealed store → (the planter pays on chain) → delivery read from the Plant accounts → at plant close a
   delivery MANIFEST leaf (the sealed commitment: which plant hashes the agents will see) → the runner fetches the texts →
   transcripts (TRANSCRIPT leaves, sealed files) → settlement → VERDICT leaves from DocketSettled → REVEAL leaves and the
   texts and canary secrets public. Plant texts, canary seeds and transcripts rest AES-256-GCM sealed under the seal key
   (the store key is the associated data) until the round settles. Every decision is create-if-absent, so it is final. */
import { IaError, b58decode, concat, equal, fromB58, hex, sha256, text, toB58, unhex } from '../../log/src/codec.js';
import { open, seal, type Store } from '../../log/src/store.js';
import { encodeLeaf, type Leaf } from '../../log/src/leaves.js';
import { TransparencyLog, keyHash } from '../../log/src/log.js';
import { publicKeyOf, randomSeed, verifySig, type Signer } from '../../log/src/keys.js';
import { docketRoot, parseRun } from '../../log/src/transcript.js';
import { findProgramAddress } from '../../log/src/rpc.js';
import { CLASS, MEDIA, decoys, plantPrice, split, task } from './rules.js';
import { FILTER_VERSION, filterPlant } from './filter.js';
import { checkRunnerAuth } from './auth.js';
import { pdas, type IaChain } from './chain.js';

const ROUND_SETTLED = 2;
const PLACE_PLANT = /\{\{\s*PLANT\s*\}\}/g, PLACE_CANARY = /\{\{\s*CANARY\s*\}\}/g;
export const MAX_QUOTES_PER_ROUND = 5_000;

interface QuoteRec { seq: string; idx: number; class: number; medium: number; target: string; text: string; canary: string | null; canarySeed: string | null; boundToIndex: boolean; at: number }
interface PlantRec { seq: string; idx: number; delivered: boolean; reason?: string; class: number; medium: number; target: string; textHash: string; canary: string | null; canarySeed?: string | null; text?: string; planter?: string }

export interface RegistryOpts { store: Store; chain: IaChain; log: TransparencyLog; sealKey: Uint8Array; bundle: Uint8Array; now?: () => number }

export class Registry {
  readonly pda;
  constructor(private o: RegistryOpts) { this.pda = pdas(o.chain.programId); }
  private now() { return this.o.now ? this.o.now() : Math.floor(Date.now() / 1000); }

  // ------------------------------------------------------------------------------------------------ sealed JSON store
  private async getSealed<T>(key: string): Promise<T | null> {
    const b = await this.o.store.get(key);
    return b ? JSON.parse(Buffer.from(open(this.o.sealKey, key, b)).toString('utf8')) : null;
  }
  private putSealed(key: string, v: unknown) { return this.o.store.put(key, seal(this.o.sealKey, key, text(JSON.stringify(v)))); }
  private createSealed(key: string, v: unknown) { return this.o.store.create(key, seal(this.o.sealKey, key, text(JSON.stringify(v)))); }

  // ------------------------------------------------------------------------------------------------ chain reads
  private async roundOrThrow(seq: bigint) {
    const r = await this.o.chain.round(seq);
    if (!r) throw new IaError('NO_ROUND', `round ${seq} does not exist (or was reaped)`, 404);
    return r;
  }
  private params(r: any, c: any) { return r.params ?? c.params; }
  /** settled = state 2, or the round account is gone (reaped) while the program counted past it */
  async settled(seq: bigint): Promise<{ settled: boolean; round: any | null }> {
    const r = await this.o.chain.round(seq);
    if (r) return { settled: r.state === ROUND_SETTLED, round: r };
    const c = await this.o.chain.config();
    if (c && BigInt(c.nextRound) > seq) return { settled: true, round: null };
    throw new IaError('NO_ROUND', `round ${seq} does not exist`, 404);
  }
  /** this round's own addresses: vendors, house decoys, every possible plant address */
  private ownAddresses(r: any, maxPlants: number): Set<string> {
    const t = task(r.seed);
    const s = new Set<string>([...t.vendors, ...decoys(r.seed)]);
    for (let j = 0; j < Math.max(maxPlants, 16); j++) s.add(this.pda.plant(r.seq, j));
    return s;
  }

  // ------------------------------------------------------------------------------------------------ quote
  async quote(body: any) {
    const seq = intField(body?.round, 'round');
    const cls = smallInt(body?.class, 'class', 0, 2, ['TRANSFER', 'KEY', 'REPORT']);
    const medium = smallInt(body?.medium, 'medium', 0, 4, MEDIA);
    if (typeof body?.text !== 'string') throw new IaError('BAD_TEXT', 'text must be a string');
    if (Buffer.byteLength(body.text, 'utf8') > 1024) throw new IaError('TOO_LARGE', 'text is at most 1,024 bytes', 413);
    let target = 0n;
    if (cls === CLASS.REPORT) {
      if (body.target === undefined || body.target === null) throw new IaError('BAD_TARGET', 'a REPORT plant needs target: the false balance (lamports) the agent should report');
      target = intField(body.target, 'target');
      // the program refuses a REPORT target that is a multiple of 1,000 lamports (every task number is): an honest balance can never hit
      if (target % 1000n === 0n) throw new IaError('BAD_TARGET', 'a REPORT target must not be a multiple of 1,000 lamports (task numbers are), e.g. 4321007');
    }
    const [c, r, slot] = await Promise.all([this.o.chain.config(), this.roundOrThrow(seq), this.o.chain.slot()]);
    if (!c) throw new IaError('NOT_CONFIGURED', 'the program has no config yet', 503);
    const p = this.params(r, c);
    if (r.state !== 0 || slot >= Number(r.plantClose)) throw new IaError('PLANT_CLOSED', `round ${seq}'s plant window is closed`, 409);
    if (r.plantCount >= p.maxPlants) throw new IaError('PLANTS_FULL', `round ${seq} already has ${r.plantCount} plants (the maximum)`, 409);
    const idx = r.plantCount as number;
    const address = this.pda.plant(seq, idx);
    let canarySeed: Uint8Array | null = null, canary: string | null = null, secretB58 = '';
    if (cls === CLASS.KEY) { canarySeed = randomSeed(); const pub = publicKeyOf(canarySeed); canary = toB58(pub); secretB58 = toB58(concat(canarySeed, pub)); }
    const boundToIndex = PLACE_PLANT.test(body.text); PLACE_PLANT.lastIndex = 0;
    const finalText = body.text.replace(PLACE_PLANT, address).replace(PLACE_CANARY, secretB58);
    const allowed = this.ownAddresses(r, p.maxPlants);
    if (canary) allowed.add(canary);
    const f = filterPlant({ class: cls, text: body.text, allowedAddresses: allowed }, finalText);
    if (!f.ok) throw new IaError('FILTER_REJECTED', f.reason, 422, { filter: 'rejected', rule: f.rule, filterVersion: FILTER_VERSION });
    const textHash = sha256(text(finalText));
    // a rough per-round ceiling against store spam (the per-client limits sit in front of this)
    const ck = `reg/qc/${seq}`;
    const count = Number(Buffer.from((await this.o.store.get(ck)) || text('0')).toString()) || 0;
    if (count >= MAX_QUOTES_PER_ROUND) throw new IaError('RATE_LIMITED', `round ${seq} has had too many quotes; try the next round`, 429);
    const rec: QuoteRec = { seq: String(seq), idx, class: cls, medium, target: target.toString(), text: finalText, canary, canarySeed: canarySeed ? hex(canarySeed) : null, boundToIndex, at: this.now() };
    await this.createSealed(`reg/q/${seq}/${hex(textHash)}`, rec);
    await this.o.store.put(ck, text(String(count + 1))).catch(() => {});
    const price = plantPrice(BigInt(p.minPlant), BigInt(r.lineupAssets), p.priceBps, p.stepBps, idx);
    const sp = split(price, p.runnerBps, p.treasuryBps, false);
    return {
      round: Number(seq), index: idx, plant: address, class: cls, medium, target: cls === CLASS.REPORT ? target.toString() : null,
      textHash: hex(textHash), canary, price: price.toString(), split: { purses: sp.purses.toString(), runner: sp.runner.toString(), treasury: sp.treasury.toString(), holderTreasury: '0' },
      expiresSlot: Number(r.plantClose), maxPrice: price.toString(), filter: 'ok', filterVersion: FILTER_VERSION,
      note: boundToIndex ? `the text names the plant address ${address}: plant it as index ${idx}; if another plant lands first, quote again` : 'send plant with this text_hash (and max_price = maxPrice) before the plant window closes',
    };
  }

  // ------------------------------------------------------------------------------------------------ delivery
  /** what the registry would decide now for each plant of the round (no writes) */
  async deliveryNow(seq: bigint, r: any): Promise<PlantRec[]> {
    const n = r.plantCount as number;
    const accounts = await this.o.chain.plants(seq, n);
    let events: any[] | null = null;
    const out: PlantRec[] = [];
    for (let j = 0; j < n; j++) {
      let pl = accounts[j];
      if (!pl) { // closed after a claim: read its Planted event instead
        events ??= (await this.o.chain.events(this.pda.round(seq))).filter(e => e.name === 'Planted');
        pl = events.find(e => BigInt(e.data.round) === seq && e.data.idx === j)?.data;
      }
      if (!pl) { out.push({ seq: String(seq), idx: j, delivered: false, reason: 'plant not readable', class: r.plantClass[j], medium: 0, target: '0', textHash: '', canary: null }); continue; }
      const th = hex(pl.textHash);
      const base = { seq: String(seq), idx: j, class: pl.class, medium: pl.medium, target: BigInt(pl.target).toString(), textHash: th, canary: pl.class === CLASS.KEY ? pl.canary : null, planter: pl.planter };
      const q = await this.getSealed<QuoteRec>(`reg/q/${seq}/${th}`);
      let reason = '';
      if (!q) reason = 'the registry holds no text with this hash';
      else if (q.class !== pl.class) reason = 'class differs from the quote';
      else if (pl.class === CLASS.REPORT && q.target !== BigInt(pl.target).toString()) reason = 'target differs from the quote';
      else if (pl.class === CLASS.KEY && q.canary !== pl.canary) reason = 'canary differs from the quote';
      else if (q.boundToIndex && q.idx !== j) reason = 'the text names another plant address';
      else if (!equal(sha256(text(q.text)), pl.textHash)) reason = 'hash mismatch';
      out.push(reason ? { ...base, delivered: false, reason } : { ...base, medium: q!.medium, delivered: true, text: q!.text, canarySeed: q!.canarySeed });
    }
    return out;
  }

  /** the delivery manifest: final once the plant window is closed; logged once. Returns the final records and the leaf index. */
  async manifest(seq: bigint): Promise<{ index: number; plants: PlantRec[]; fresh: boolean }> {
    const [r, slot] = await Promise.all([this.roundOrThrow(seq), this.o.chain.slot()]);
    if (slot < Number(r.plantClose)) throw new IaError('PLANT_OPEN', `round ${seq}'s plant window is still open (closes at slot ${r.plantClose})`, 409);
    const now = await this.deliveryNow(seq, r);
    const final: PlantRec[] = [];
    for (const p of now) {
      const k = `reg/p/${seq}/${p.idx}`;
      await this.createSealed(k, p);
      final.push((await this.getSealed<PlantRec>(k))!);
    }
    const leaf = encodeLeaf({ kind: 'manifest', seq, plantClose: BigInt(r.plantClose), bundle: this.o.bundle,
      plants: final.map(p => ({ idx: p.idx, delivered: p.delivered, textHash: p.textHash ? unhex(p.textHash, 32) : new Uint8Array(32) })) });
    const { index, fresh } = await this.o.log.appendOnce(`manifest:${seq}`, leaf);
    return { index, plants: final, fresh };
  }

  /** the runner's inbox feed: delivered plants with their texts, only after plant close and the manifest */
  async internalPlants(seq: bigint, auth: { header: string | null; method: string; path: string; body: Uint8Array }) {
    const c = await this.o.chain.config();
    if (!c) throw new IaError('NOT_CONFIGURED', 'the program has no config yet', 503);
    checkRunnerAuth(auth.header, auth.method, auth.path, auth.body, c.runner, this.now());
    const m = await this.manifest(seq);
    const ix = await this.o.log.raw(m.index);
    return {
      seq: Number(seq), manifest: { index: m.index, leafHash: hex(sha256(Uint8Array.of(0), ix)) },
      // the mask the runner sends with withhold_plants before the first run (undelivered plants)
      withheldMask: m.plants.filter(p => !p.delivered).reduce((a, p) => a | (1 << p.idx), 0),
      plants: m.plants.filter(p => p.delivered).map(p => ({ idx: p.idx, class: p.class, medium: p.medium, target: p.target, textHash: p.textHash, address: this.pda.plant(seq, p.idx), text: p.text })),
    };
  }

  // ------------------------------------------------------------------------------------------------ reveal
  async plantStatus(seq: bigint, idx: number) {
    if (!Number.isInteger(idx) || idx < 0 || idx > 15) throw new IaError('BAD_QUERY', 'idx is 0..15');
    const { settled, round } = await this.settled(seq);
    if (round && idx >= round.plantCount) throw new IaError('NOT_FOUND', `round ${seq} has no plant ${idx}`, 404);
    const manifestIndex = await this.o.log.indexOf(`manifest:${seq}`);
    if (!settled) {
      const rec = manifestIndex !== null ? await this.getSealed<PlantRec>(`reg/p/${seq}/${idx}`) : null;
      return { round: Number(seq), idx, status: 'sealed', delivered: rec ? rec.delivered : null, manifest: manifestIndex, revealAfter: 'RoundSettled' };
    }
    let rec = await this.getSealed<PlantRec>(`reg/p/${seq}/${idx}`);
    if (!rec) { await this.manifest(seq); rec = await this.getSealed<PlantRec>(`reg/p/${seq}/${idx}`); }
    if (!rec) throw new IaError('NOT_FOUND', `no record of plant ${seq}/${idx}`, 404);
    const base = { round: Number(seq), idx, status: 'revealed', delivered: rec.delivered, class: rec.class, medium: rec.medium, textHash: rec.textHash, target: rec.target, canary: rec.canary, manifest: await this.o.log.indexOf(`manifest:${seq}`) };
    if (!rec.delivered) return { ...base, reason: rec.reason, text: null };
    const reveal = await this.revealLeaf(seq, rec);
    const red = await this.redaction(`plant:${seq}:${idx}`);
    const canarySecret = rec.canarySeed ? toB58(concat(unhex(rec.canarySeed, 32), publicKeyOf(unhex(rec.canarySeed, 32)))) : null;
    return { ...base, log: reveal, canarySecret, ...(red ? { text: null, redacted: red } : { text: rec.text }) };
  }

  private async revealLeaf(seq: bigint, rec: PlantRec) {
    const leaf = encodeLeaf({ kind: 'reveal', seq, idx: rec.idx, class: rec.class, medium: rec.medium, target: BigInt(rec.target), textHash: unhex(rec.textHash, 32),
      canary: rec.canary ? fromB58(rec.canary) : new Uint8Array(32), canarySeed: rec.canarySeed ? unhex(rec.canarySeed, 32) : new Uint8Array(32), textLen: Buffer.byteLength(rec.text || '', 'utf8') });
    return (await this.o.log.appendOnce(`reveal:${seq}:${rec.idx}`, leaf)).index;
  }

  // ------------------------------------------------------------------------------------------------ transcripts, harness, verdicts, forecasts
  private async runnerCheck(auth: { header: string | null; method: string; path: string; body: Uint8Array }) {
    const c = await this.o.chain.config();
    if (!c) throw new IaError('NOT_CONFIGURED', 'the program has no config yet', 503);
    checkRunnerAuth(auth.header, auth.method, auth.path, auth.body, c.runner, this.now());
    return c;
  }

  async postTranscript(body: any, auth: { header: string | null; method: string; path: string; body: Uint8Array }) {
    await this.runnerCheck(auth);
    const seq = intField(body?.seq, 'seq'), agent = smallInt(body?.agent, 'agent', 0, 65535), r = await this.roundOrThrow(seq);
    const pos = (r.lineup as number[]).slice(0, r.lineupLen).indexOf(agent);
    if (pos < 0) throw new IaError('NOT_IN_LINEUP', `agent ${agent} is not in round ${seq}'s lineup`);
    if (body.close !== true && await this.o.log.indexOf(`transcript:${seq}:${agent}`) !== null) throw new IaError('ALREADY_LOGGED', `docket ${seq}/${agent}'s transcripts are already logged`, 409);
    if (body.close === true) {
      const runs = smallInt(body.runs, 'runs', 1, 8);
      const recs: { root: Uint8Array; entries: number; fileHash: Uint8Array }[] = [];
      for (let k = 0; k < runs; k++) {
        const b = await this.o.store.get(`tx/${seq}/${agent}/${k}`);
        if (!b) throw new IaError('MISSING_RUN', `run ${k} of docket ${seq}/${agent} was not posted`, 409);
        const pr = parseRun(Buffer.from(open(this.o.sealKey, `tx/${seq}/${agent}/${k}`, b)).toString('utf8'), { seq: Number(seq), agent, run: k });
        recs.push({ root: pr.runRoot, entries: pr.entries.length, fileHash: pr.fileHash });
      }
      const dr = docketRoot(recs.map(x => x.root));
      const { index } = await this.o.log.appendOnce(`transcript:${seq}:${agent}`, encodeLeaf({ kind: 'transcript', seq, agent, docketRoot: dr, runs: recs }));
      return { seq: Number(seq), agent, docketRoot: hex(dr), runRoots: recs.map(x => hex(x.root)), index };
    }
    const run = smallInt(body.run, 'run', 0, 7);
    if (typeof body.jsonl !== 'string') throw new IaError('BAD_TRANSCRIPT', 'jsonl must be the run file as a string');
    const pr = parseRun(body.jsonl, { seq: Number(seq), agent, run });
    const k = `tx/${seq}/${agent}/${run}`;
    if (!(await this.o.store.create(k, seal(this.o.sealKey, k, text(body.jsonl))))) {
      const was = Buffer.from(open(this.o.sealKey, k, (await this.o.store.get(k))!)).toString('utf8');
      if (was !== body.jsonl) throw new IaError('CONFLICT', `run ${seq}/${agent}/${run} was already posted with other content`, 409);
    }
    return { seq: Number(seq), agent, run, runRoot: hex(pr.runRoot), entries: pr.entries.length, fileHash: hex(pr.fileHash) };
  }

  async transcript(seq: bigint, agent: number, run: number) {
    const { settled } = await this.settled(seq);
    if (!settled) throw new IaError('SEALED', `transcripts of round ${seq} are published when it settles`, 403);
    const k = `tx/${seq}/${agent}/${run}`;
    const b = await this.o.store.get(k);
    if (!b) throw new IaError('NOT_FOUND', `no transcript ${seq}/${agent}/${run}`, 404);
    const red = await this.redaction(`transcript:${seq}:${agent}:${run}`);
    if (red) return { redacted: red, jsonl: null, index: await this.o.log.indexOf(`transcript:${seq}:${agent}`) };
    return { jsonl: Buffer.from(open(this.o.sealKey, k, b)).toString('utf8'), index: await this.o.log.indexOf(`transcript:${seq}:${agent}`) };
  }

  async postHarness(body: any, auth: { header: string | null; method: string; path: string; body: Uint8Array }) {
    await this.runnerCheck(auth);
    const seq = intField(body?.seq, 'seq'), r = await this.roundOrThrow(seq);
    const harness = unhex(body?.harness, 32, 'harness');
    if (r.harnessSet && !equal(r.harness, harness)) throw new IaError('HARNESS_MISMATCH', 'the round committed another harness hash on chain', 409);
    if (!body.manifest || typeof body.manifest !== 'object') throw new IaError('BAD_MANIFEST', 'manifest must be an object');
    const { canon } = await import('../../log/src/jcs.js');
    const { index } = await this.o.log.appendOnce(`harness:${seq}`, encodeLeaf({ kind: 'harness', seq, harness, manifest: canon(body.manifest) }));
    return { seq: Number(seq), index };
  }

  /** forecasts (SPEC §4): `ia-forecast:<round>:<agent>:<CLEAN|BENT>` signed by any wallet before plant close; first per wallet wins */
  async postForecast(body: any) {
    const msg = typeof body?.message === 'string' ? body.message : '';
    const m = /^ia-forecast:(\d{1,19}):(\d{1,5}):(CLEAN|BENT)$/.exec(msg);
    if (!m) throw new IaError('BAD_FORECAST', 'message must be ia-forecast:<round>:<agent>:<CLEAN|BENT>');
    const signer = fromB58(body.signer, 32, 'signer'), sig = unhex(body.signature, 64, 'signature');
    if (!verifySig(sig, text(msg), signer)) throw new IaError('BAD_SIGNATURE', 'the signature does not verify for that signer');
    const seq = BigInt(m[1]), agent = Number(m[2]);
    const [r, slot] = await Promise.all([this.roundOrThrow(seq), this.o.chain.slot()]);
    if (slot >= Number(r.plantClose)) throw new IaError('FORECAST_CLOSED', `forecasts for round ${seq} closed at slot ${r.plantClose}`, 409);
    if (!(r.lineup as number[]).slice(0, r.lineupLen).includes(agent)) throw new IaError('NOT_IN_LINEUP', `agent ${agent} is not in round ${seq}'s lineup`);
    const leaf = encodeLeaf({ kind: 'forecast', seq, agent, call: m[3] === 'BENT' ? 1 : 0, signer, signature: sig, slot: BigInt(slot) });
    try {
      const { index } = await this.o.log.appendOnce(`forecast:${seq}:${agent}:${toB58(signer)}`, leaf);
      return { index, slot };
    } catch (e: any) {
      if (e?.code === 'LOG_CONFLICT') throw new IaError('ALREADY_FORECAST', 'this wallet already forecast this agent in this round', 409);
      throw e;
    }
  }

  /** VERDICT leaves from the round's DocketSettled events (anyone may trigger; idempotent) */
  async verdicts(seq: bigint) {
    const { settled } = await this.settled(seq);
    if (!settled) throw new IaError('NOT_SETTLED', `round ${seq} has not settled`, 409);
    const evs = (await this.o.chain.events(this.pda.round(seq))).filter(e => e.name === 'DocketSettled' && BigInt(e.data.round) === seq);
    const out: { agent: number; index: number }[] = [];
    for (const e of evs) {
      const d = e.data;
      const leaf = encodeLeaf({ kind: 'verdict', seq, agent: d.agent, epoch: d.epoch, slot: BigInt(e.slot), tx: b58decode(e.signature), purseAtOpen: BigInt(d.purseAtOpen),
        bountyTotal: BigInt(d.bountyTotal), transcriptRoot: d.transcriptRoot, runs: Array.from(d.tiers as Uint8Array).map((t, k) => ({ tier: t, taken: d.taken[k], trail: d.trails[k] })) });
      out.push({ agent: d.agent, index: (await this.o.log.appendOnce(`verdict:${seq}:${d.agent}`, leaf)).index });
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------------ redaction
  private async redaction(key: string): Promise<{ reason: string; index: number } | null> {
    const b = await this.o.store.get(`redact/${hex(keyHash(key))}`);
    return b ? JSON.parse(Buffer.from(b).toString('utf8')) : null;
  }
  /** withholds a plant text or a transcript (harmful content that slipped through). Public: a REDACTION leaf; hashes stay. */
  async redact(key: string, reason: string) {
    const m = /^(plant|transcript):\d+:\d+(:\d+)?$/.exec(key);
    if (!m) throw new IaError('BAD_QUERY', 'key is plant:<seq>:<idx> or transcript:<seq>:<agent>:<run>');
    let content: Uint8Array = new Uint8Array(32);
    const parts = key.split(':');
    if (parts[0] === 'plant') { const r = await this.getSealed<PlantRec>(`reg/p/${parts[1]}/${parts[2]}`); if (r?.textHash) content = unhex(r.textHash, 32); }
    else { const b = await this.o.store.get(`tx/${parts[1]}/${parts[2]}/${parts[3]}`); if (b) content = sha256(open(this.o.sealKey, `tx/${parts[1]}/${parts[2]}/${parts[3]}`, b)); }
    const { index } = await this.o.log.appendOnce(`redact:${key.replace(/:/g, '.')}`, encodeLeaf({ kind: 'redaction', target: parts[0] === 'plant' ? 1 : 2, keyHash: keyHash(key), contentHash: content, reason: reason.slice(0, 200) }));
    await this.o.store.put(`redact/${hex(keyHash(key))}`, text(JSON.stringify({ reason: reason.slice(0, 200), index })));
    return { index };
  }

  // ------------------------------------------------------------------------------------------------ the crank
  /** idempotent: manifests for closed plant windows, verdicts and reveals for settled rounds, quote cleanup */
  async crank(lookback = 4) {
    const c = await this.o.chain.config();
    if (!c) return { rounds: [] };
    const next = BigInt(c.nextRound), slot = await this.o.chain.slot();
    const done: any[] = [];
    for (let s = next - 1n; s >= 0n && s >= next - BigInt(lookback); s--) {
      const r = await this.o.chain.round(s);
      if (!r) continue;
      const row: any = { seq: Number(s) };
      if (slot >= Number(r.plantClose) && r.plantCount > 0) {
        const m = await this.manifest(s);
        row.manifest = m.index;
        await this.sweepQuotes(s);
      }
      if (r.state === ROUND_SETTLED && r.plantCount > 0) {
        row.verdicts = (await this.verdicts(s)).length;
        row.reveals = 0;
        for (let j = 0; j < r.plantCount; j++) { const st: any = await this.plantStatus(s, j); if (st.delivered) row.reveals++; }
      }
      done.push(row);
    }
    return { rounds: done };
  }
  /** after the manifest, quotes are dropped: undelivered texts are never kept or revealed */
  private async sweepQuotes(seq: bigint) {
    for (const k of await this.o.store.list(`reg/q/${seq}/`)) await this.o.store.del(k);
  }
}

function intField(v: unknown, name: string): bigint {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^\d{1,20}$/.test(v) && BigInt(v) < 1n << 64n) return BigInt(v);
  throw new IaError('BAD_QUERY', `${name} must be a non-negative integer (u64)`);
}
function smallInt(v: unknown, name: string, lo: number, hi: number, names?: string[]): number {
  if (typeof v === 'string' && names) { const i = names.indexOf(v.toUpperCase()) >= 0 ? names.indexOf(v.toUpperCase()) : names.indexOf(v.toLowerCase()); if (i >= 0) return i; }
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < lo || n > hi) throw new IaError('BAD_QUERY', `${name} must be ${lo}..${hi}${names ? ' or one of ' + names.join(', ') : ''}`);
  return n;
}
export const _test = { intField, smallInt, findProgramAddress };
