// The verifier's own reading of CONTRACT §1–§4 against the other implementations: the program's vectors (when present), the
// runner's task rules, and the Anchor coder for accounts and events (the IDL-driven Borsh reader).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { V, PROGRAM } from './helpers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ia = path.resolve(here, '../..');
const { rules, hex, toB58 } = V;

test('the plant price and split follow rules.rs (unit-test values)', () => {
  assert.equal(rules.plantPrice(100_000_000n, 0n, 25, 1000, 0), 100_000_000n);
  assert.equal(rules.plantPrice(100_000_000n, 0n, 25, 1000, 2), 121_000_000n);
  assert.equal(rules.plantPrice(100_000_000n, 1_000_000_000_000n, 25, 1000, 1), 2_750_000_000n);
  const s = rules.split(100_000_001n, 1200, 500, false);
  assert.equal(s.purses + s.runner + s.treasury, 100_000_001n);
  assert.equal(rules.split(100n, 1200, 500, true).treasury, 0n);
});

test('task numbers and house decoys agree with runner/task/rules.mjs for 200 random seeds', async t => {
  let R;
  try { R = await import(pathToFileURL(path.join(ia, 'runner/task/rules.mjs')).href); } catch { return t.skip('runner/task not installed'); }
  for (let k = 0; k < 200; k++) {
    const seed = new Uint8Array(crypto.randomBytes(32));
    const a = rules.task(seed), b = R.task(Buffer.from(seed));
    assert.equal(a.n, b.n); assert.deepEqual(a.amounts, b.amounts); assert.equal(a.operating, b.operating);
    assert.deepEqual(a.vendors, b.vendors.map(v => v.toBase58()));
    assert.deepEqual(rules.decoys(seed), R.decoys(Buffer.from(seed)).map(d => d.address.toBase58()));
  }
  const s = new Uint8Array(32).fill(9);
  assert.equal(hex(rules.seedOf(3n, 77n, s)), R.seedOf(3, 77, s).toString('hex'));
});

test('the program vectors (ia/program/test/vectors.json): seeds, h, task, prices, splits, tiers, report hits', async t => {
  const f = path.join(ia, 'program/test/vectors.json');
  if (!fs.existsSync(f)) return t.skip('ia/program/test/vectors.json not published yet');
  const v = JSON.parse(fs.readFileSync(f, 'utf8'));
  let n = 0;
  for (const x of v.seeds || []) {
    const seed = rules.seedOf(BigInt(x.seq), BigInt(x.slot), V.unhex(x.hash));
    assert.equal(hex(seed), x.seed);
    const got = rules.task(seed);
    assert.equal(got.n, x.task.n); assert.deepEqual(got.amounts.map(String), x.task.amounts);
    assert.deepEqual(got.vendors, x.task.vendors.slice(0, got.n)); assert.equal(got.operating.toString(), String(x.task.operating)); n++;
  }
  for (const x of v.h || []) { assert.equal(hex(rules.h(x.tag, V.unhex(x.seed), x.i)), x.out); n++; }
  for (const x of v.prices || []) { assert.equal(rules.plantPrice(BigInt(x.min_plant), BigInt(x.lineup_assets), x.price_bps, x.step_bps, x.n).toString(), x.price); n++; }
  for (const x of v.splits || []) { const s = rules.split(BigInt(x.price), x.runner_bps, x.treasury_bps, x.holder); assert.deepEqual([s.purses, s.runner, s.treasury].map(String), [x.purses, x.runner, x.treasury]); n++; }
  const ledger = r => ({ started: r.started, trail: new Uint8Array(32), opLeft: BigInt(r.op_left), reserveMoved: BigInt(r.reserve_moved), totalMoved: BigInt(r.total_moved),
    repOperating: BigInt(r.rep_operating), repReserve: BigInt(r.rep_reserve), declTotal: BigInt(r.decl_total), taken: r.taken, flagged: r.flagged, reportTaken: r.report_taken,
    acts: 0, payments: r.payments, paidMask: r.paid_mask, wrongPays: r.wrong_pays, strays: r.strays, reported: !!r.reported, declPayments: r.decl_payments });
  for (const x of v.tiers || []) {
    const d = { seq: 0n, purseAtOpen: BigInt(x.purse_at_open), task: { n: x.invoice_count, amounts: [], vendors: [], operating: 0n }, plants: [] };
    assert.equal(rules.tierOf(ledger(x.run), d), x.tier, x.name); n++;
  }
  for (const x of v.report_hits || []) {
    const d = { seq: 0n, purseAtOpen: BigInt(x.purse_at_open), task: { n: 3, amounts: [], vendors: [], operating: 0n }, plants: x.classes.map((c, j) => ({ class: c, address: 'p' + j, canary: null, target: BigInt(x.targets[j]) })) };
    assert.equal(rules.reportHits(ledger(x.run), d), x.hits); n++;
  }
  assert.ok(n > 10);
  t.diagnostic(`${n} vectors checked`);
});

test('accounts and events decode as the Anchor coder encodes them; events from other programs are ignored', async t => {
  let anchor;
  try { anchor = createRequire(path.join(ia, 'program/package.json'))('@coral-xyz/anchor'); } catch { return t.skip('program node_modules missing'); }
  const idl = JSON.parse(fs.readFileSync(path.join(here, '../idl/ia.json'), 'utf8'));
  const coder = new anchor.BorshCoder(idl);
  const { BN, web3 } = anchor;
  const pk = () => web3.Keypair.generate().publicKey;
  const th = [...crypto.randomBytes(32)];
  const plant = { round: new BN(9), idx: 3, planter: pk(), class: 1, medium: 2, textHash: th, text_hash: th, target: new BN(0), canary: pk(), price: new BN(123456789), bump: 254 };
  const enc = await coder.accounts.encode('Plant', plant);
  const dec = V.decodeAccount('Plant', new Uint8Array(enc));
  assert.equal(dec.round, 9n); assert.equal(dec.idx, 3); assert.equal(dec.planter, plant.planter.toBase58()); assert.equal(hex(dec.textHash), Buffer.from(plant.textHash).toString('hex'));
  assert.throws(() => V.decodeAccount('Round', new Uint8Array(enc)), /not a Round/);
  // an event line: Acted with an enum action
  const acted = { round: new BN(9), agent: 2, run: 1, act: 4, step: [...crypto.randomBytes(32)], trail: [...crypto.randomBytes(32)], action: { Pay: { source: 1, to: pk(), amount: new BN(5000) } }, moved: new BN(5000), hit: 32, keyPlants: 0, key_plants: 0 };
  const disc = idl.events.find(e => e.name === 'Acted').discriminator;
  const body = coder.types.encode('Acted', acted);
  const line = 'Program data: ' + Buffer.concat([Buffer.from(disc), body]).toString('base64');
  const logs = [`Program ${PROGRAM} invoke [1]`, line, `Program ${PROGRAM} success`, 'Program Evil1111111111111111111111111111111111 invoke [1]', line, 'Program Evil1111111111111111111111111111111111 success'];
  const evs = V.eventsFromLogs(logs, PROGRAM);
  assert.equal(evs.length, 1);
  assert.equal(evs[0].name, 'Acted'); assert.equal(evs[0].data.action.kind, 'Pay'); assert.equal(evs[0].data.action.amount, 5000n); assert.equal(evs[0].data.action.to, acted.action.Pay.to.toBase58());
  // a CPI from ia into another program that logs ia's discriminator is not an ia event
  const nested = [`Program ${PROGRAM} invoke [1]`, 'Program Evil1111111111111111111111111111111111 invoke [2]', line, 'Program Evil1111111111111111111111111111111111 success', `Program ${PROGRAM} success`];
  assert.equal(V.eventsFromLogs(nested, PROGRAM).length, 0);
});

test('program-derived addresses match @solana/web3.js', async t => {
  let web3;
  try { web3 = createRequire(path.join(ia, 'program/package.json'))('@solana/web3.js'); } catch { return t.skip('program node_modules missing'); }
  const pid = new web3.PublicKey(PROGRAM);
  const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
  for (const [seq, j] of [[0, 0], [7, 3], [123456, 15]]) {
    const want = web3.PublicKey.findProgramAddressSync([Buffer.from('plant'), u64(seq), Buffer.from([j])], pid)[0].toBase58();
    assert.equal(V.pdas(PROGRAM).plant(seq, j), want);
  }
  assert.equal(V.pdas(PROGRAM).config(), web3.PublicKey.findProgramAddressSync([Buffer.from('config')], pid)[0].toBase58());
  assert.ok(V.isOnCurve(web3.Keypair.generate().publicKey.toBytes()));
});
