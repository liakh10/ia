// Shared test doubles: a temp FsStore, keys, and a chain double that answers like RpcChain (decoded accounts, ia events).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const V = await import(pathToFileURL(path.join(here, '../dist/ia-verifier.mjs')).href);
export const PROGRAM = V.IDL_ADDRESS;

export const tmpdir = (p = 'iav-t-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
export const store = () => new V.FsStore(tmpdir());
export const signer = () => V.signerFromSeed(new Uint8Array(crypto.randomBytes(32)));
export const sealKey = () => new Uint8Array(crypto.randomBytes(32));

export const PARAMS = { plantWindow: 3000n, runWindow: 1500n, minPlant: 100_000_000n, priceBps: 25, stepBps: 1000, maxPlants: 8, purseBps: 8300, runnerBps: 1200, treasuryBps: 500,
  bountyBps: 500, docketCapBps: 2500, maxRuns: 3, minDeposit: 100_000_000n, unbondDelay: 9000n, runnerDrawCap: 200_000_000n, holderMin: 1n, nudgeEvery: 2 };

/** a chain double with one round open at slot 1000 (plant close 4000, run close 5500), lineup [0, 1, 2] */
export function fakeChain(runner) {
  const seed = new Uint8Array(crypto.randomBytes(32));
  const c = {
    programId: PROGRAM, slotNow: 1000,
    cfg: { admin: '11111111111111111111111111111111', runner: runner.address, params: PARAMS, nextRound: 1n, paused: false },
    rounds: new Map(), plantAccts: new Map(), evs: new Map(),
    async slot() { return this.slotNow; },
    async config() { return this.cfg; },
    async round(seq) { return this.rounds.get(String(seq)) || null; },
    async plants(seq, n) { return Array.from({ length: n }, (_, j) => this.plantAccts.get(`${seq}/${j}`) || null); },
    async events(addr) { return this.evs.get(addr) || []; },
    emit(addr, name, data, slot = this.slotNow, signature = V.toB58(new Uint8Array(crypto.randomBytes(64)))) {
      this.evs.set(addr, [...(this.evs.get(addr) || []), { name, data, slot, signature, blockTime: null }]);
    },
    /** what `plant` does: the next index, the account, the event */
    plant(seq, { class: cls, medium = 0, textHash, target = 0n, canary = '11111111111111111111111111111111', planter = V.toB58(new Uint8Array(crypto.randomBytes(32))) }) {
      const r = this.rounds.get(String(seq));
      const idx = r.plantCount;
      const pl = { round: BigInt(seq), idx, planter, class: cls, medium, textHash, target: cls === 2 ? BigInt(target) : 0n, canary: cls === 1 ? canary : '11111111111111111111111111111111', price: 100_000_000n, bump: 255 };
      this.plantAccts.set(`${seq}/${idx}`, pl);
      r.plantCount++; r.plantClass[idx] = cls; r.target[idx] = pl.target; r.canary[idx] = pl.canary;
      this.emit(V.pdas(PROGRAM).round(seq), 'Planted', { ...pl, toPurses: 0n, toRunner: 0n, toTreasury: 0n });
      return idx;
    },
  };
  c.rounds.set('0', { seq: 0n, state: 0, payer: runner.address, openSlot: 1000n, plantClose: 4000n, runClose: 5500n, seed, nudge: false, lineupLen: 3, lineup: [0, 1, 2, ...Array(13).fill(0)],
    lineupAssets: 0n, plantCount: 0, plantClass: new Uint8Array(16), plantBump: new Uint8Array(16), canary: Array(16).fill('11111111111111111111111111111111'), target: Array(16).fill(0n),
    owed: Array(16).fill(0n), caught: Array(16).fill(0), harness: new Uint8Array(32), harnessSet: false, runsPerDocket: 0, pursePool: 0n, purseLeft: 0n, settledMask: 0, settledCount: 0, bump: 255 });
  c.emit(V.pdas(PROGRAM).round(0), 'RoundOpened', { seq: 0n, seed, openSlot: 1000n, plantClose: 4000n, runClose: 5500n, nudge: false, lineup: [0, 1, 2], lineupAssets: 0n });
  return c;
}

export function ctxFor(chain, o = {}) {
  const st = o.store || store();
  const sg = o.signer || signer();
  const sk = o.sealKey || sealKey();
  const ctx = V.makeContext({ programId: PROGRAM, signer: sg, sealKey: sk, store: st, chain, env: { CRON_SECRET: 'cron-test' }, now: o.now });
  V.setContext(ctx);
  return ctx;
}

export const req = (method, url, body, headers = {}) => new Request('https://ia.test' + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
export const call = async (h, ...a) => { const r = await h(req(...a)); return { status: r.status, body: await r.json() }; };
