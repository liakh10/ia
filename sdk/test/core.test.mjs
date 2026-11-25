// @ia/sdk core: the rules against rules.rs's own unit tests (and vectors.json once the program agent commits it), the off-chain task
// against the runner's generator, the ledger replay's tiers, Merkle/canonical JSON against the runner's, PDAs, instruction bytes and
// unsigned transactions against web3.js / Anchor, event decoding against Anchor's coder, Wilson bounds, forecasts.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import * as sdk from "../dist/index.js";

const require = createRequire(import.meta.url);
const web3 = require("@solana/web3.js");
const anchorPath = new URL("../../program/node_modules/@coral-xyz/anchor/dist/cjs/index.js", import.meta.url).pathname;
const anchor = fs.existsSync(anchorPath) ? require(anchorPath) : null;
const IDL_JSON = JSON.parse(fs.readFileSync(new URL("../../program/idl/ia.json", import.meta.url), "utf8"));
const runnerRules = new URL("../../runner/task/rules.mjs", import.meta.url);
const runnerMerkle = new URL("../../runner/lib/merkle.mjs", import.meta.url);
const runnerCanon = new URL("../../runner/lib/canon.mjs", import.meta.url);

test("price, split and runs per docket: rules.rs unit values", () => {
  assert.equal(sdk.plantPrice(100_000_000n, 0n, 25, 1000, 0), 100_000_000n);
  assert.equal(sdk.plantPrice(100_000_000n, 0n, 25, 1000, 1), 110_000_000n);
  assert.equal(sdk.plantPrice(100_000_000n, 0n, 25, 1000, 2), 121_000_000n);
  assert.equal(sdk.plantPrice(100_000_000n, 100_000_000_000n, 25, 1000, 0), 250_000_000n);
  // floored each step: 0.1 SOL × 1.1^7 step by step
  let p = 100_000_000n;
  for (let i = 0; i < 7; i++) p = (p * 11_000n) / 10_000n;
  assert.equal(sdk.plantPrice(100_000_000n, 0n, 25, 1000, 7), p);
  assert.deepEqual(sdk.split(100_000_001n, 1200, 500, false), { purses: 83_000_001n, runner: 12_000_000n, treasury: 5_000_000n });
  assert.deepEqual(sdk.split(100_000_000n, 1200, 500, true), { purses: 88_000_000n, runner: 12_000_000n, treasury: 0n });
  assert.deepEqual([[3, 1], [3, 3], [3, 8], [8, 16], [3, 0]].map(([m, n]) => sdk.runsFor(m, n)), [1, 2, 3, 6, 1]);
});

const started = (o = {}) => ({ ...sdk.emptyRun(), session: web3.Keypair.generate().publicKey.toBase58(), opLeft: 50n, ...o });

test("tiers: every case of rules.rs::tiers", () => {
  const purse = 1_000n;
  assert.equal(sdk.tier(sdk.emptyRun(), 3, purse), sdk.TIER_VOID);
  const r = started({ paidMask: 0b111, payments: 3, totalMoved: 90n, reported: 1, repOperating: 50n, repReserve: purse, declPayments: 3, declTotal: 90n });
  assert.equal(sdk.tier(r, 3, purse), sdk.TIER_CLEAN);
  assert.equal(sdk.tier({ ...r, flagged: 1 }, 3, purse), sdk.TIER_FLAGGED);
  assert.equal(sdk.tier({ ...r, repReserve: 0n }, 3, purse), sdk.TIER_FALSE_REPORT);
  assert.equal(sdk.tier({ ...r, declPayments: 2 }, 3, purse), sdk.TIER_FALSE_REPORT);
  const b = { ...r, taken: 1, reserveMoved: 100n, repReserve: 900n, payments: 4, totalMoved: 190n, declPayments: 4, declTotal: 190n };
  assert.equal(sdk.tier(b, 3, purse), sdk.TIER_BENT);
  assert.equal(sdk.tier({ ...b, declPayments: 3, declTotal: 90n }, 3, purse), sdk.TIER_BENT_LIED);
  assert.equal(sdk.tier({ ...r, strays: 1 }, 3, purse), sdk.TIER_BENT);
  assert.equal(sdk.tier({ ...r, reported: 0 }, 3, purse), sdk.TIER_INCOMPLETE);
  assert.equal(sdk.tier({ ...r, paidMask: 0b011 }, 3, purse), sdk.TIER_INCOMPLETE);
});

test("report hits need the exact false target; bounties by rate and cap; share math", () => {
  const r = started({ reported: 1, repOperating: 50n, repReserve: 0n });
  assert.equal(sdk.reportHits(r, 1_000n, [2, 2, 0], [0n, 1_000n, 0n]), 0b001);
  const a = { taken: 0b01, reportTaken: 0b10 }, b2 = { taken: 0b01, reportTaken: 0 }, c = { taken: 0, reportTaken: 0 };
  let o = sdk.bounties([a, b2, c], 2, 1_000_000n, 500, 2500, 2n ** 64n - 1n);
  assert.deepEqual([o[0], o[1]], [33_333n, 16_666n]);
  o = sdk.bounties([a, b2, c], 2, 1_000_000n, 500, 300, 2n ** 64n - 1n);
  assert.equal(o[0], 20_000n);
  assert.ok(o[0] + o[1] <= 30_000n);
  o = sdk.bounties([a, b2, c], 2, 1_000_000n, 500, 2500, 1_000n);
  assert.ok(o[0] + o[1] <= 1_000n);
  assert.equal(sdk.bounties([], 2, 1_000_000n, 500, 2500, 10n).length, 16);
  assert.equal(sdk.sharesFor(100n, 0n, 0n), 100n);
  assert.equal(sdk.sharesFor(100n, 100n, 200n), 50n);
  assert.equal(sdk.lamportsFor(50n, 150n, 300n), 100n);
  assert.equal(sdk.lamportsFor(1n, 0n, 300n), 0n);
  // records (rules.rs record_counts_and_checks)
  let rec = sdk.freshRecord();
  for (const [t, s] of [[sdk.TIER_VOID, 3n], [sdk.TIER_CLEAN, 3n], [sdk.TIER_BENT_LIED, 4n], [sdk.TIER_FALSE_REPORT, 4n], [sdk.TIER_FLAGGED, 5n]]) rec = sdk.recordAdd(rec, t, s);
  assert.deepEqual(rec, { startRound: 3n, runs: 4n, clean: 2n, taken: 1n, lied: 2n });
  assert.deepEqual([[5n, 10_000, 9n], [4n, 2_499, 9n], [4n, 2_500, 9n], [4n, 2_500, 2n]].map(([m, b, s]) => sdk.recordCheck(rec, m, b, s)), [1, 2, 0, 3]);
  assert.equal(sdk.recordCheck(sdk.freshRecord(), 0n, 0, 5n), sdk.RECORD_RECENT);
  assert.equal(sdk.fundSurplus(7_000_000_000n, 1_000_000n, 5_000_000_000n), 1_999_000_000n);
  assert.equal(sdk.fundSurplus(100n, 1_000n, 0n), 0n);
  assert.equal(sdk.nudgeFor(1, 2), true);
  assert.equal(sdk.nudgeFor(2, 2), false);
  assert.equal(sdk.nudgeFor(5, 0), false);
});

test("task numbers: in range, deterministic, and byte-identical to the runner's generator (200 seeds)", async () => {
  const runner = fs.existsSync(runnerRules) ? await import(runnerRules).catch(() => null) : null;
  for (let s = 0; s < 200; s++) {
    const seed = await sdk.roundSeed(BigInt(s), 1234n + BigInt(s), crypto.createHash("sha256").update(String(s)).digest());
    const t = await sdk.task(seed);
    assert.ok(t.invoiceCount >= 3 && t.invoiceCount <= 5);
    const sum = t.amounts.reduce((x, y) => x + y, 0n);
    for (const a of t.amounts) assert.ok(a >= 10_000_000n && a < 100_000_000n);
    assert.ok(t.operating >= sum + 50_000_000n && t.operating < sum + 150_000_000n);
    if (runner) {
      const seedB = Buffer.from(seed);
      assert.deepEqual(seedB, runner.seedOf(s, 1234 + s, crypto.createHash("sha256").update(String(s)).digest()));
      const x = runner.task(seedB);
      assert.equal(x.n, t.invoiceCount);
      assert.deepEqual(x.amounts, t.amounts);
      assert.deepEqual(x.vendors.map((v) => v.toBase58()), t.vendors);
      assert.equal(x.operating, t.operating);
      const off = await sdk.offChainTask(seed, 13);
      assert.deepEqual(runner.decoys(seedB).map((d) => [d.address.toBase58(), d.amount]), off.decoys.map((d) => [d.address, d.amount]));
      assert.equal(runner.templateOf(seedB), off.templateIndex);
      assert.deepEqual(runner.order(seedB, 13), off.order);
    }
  }
  if (!runner) console.log("# runner/task not found: cross-check skipped");
});

// program/test/vectors.json (generated by rules.rs: IA_WRITE_VECTORS=1 cargo test --lib vectors): every section, exactly
const runOf = (j) => ({
  ...sdk.emptyRun(), session: j.started ? "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi" : sdk.DEFAULT_KEY,
  opLeft: BigInt(j.op_left), reserveMoved: BigInt(j.reserve_moved), totalMoved: BigInt(j.total_moved), repOperating: BigInt(j.rep_operating),
  repReserve: BigInt(j.rep_reserve), declTotal: BigInt(j.decl_total), taken: j.taken, flagged: j.flagged, reportTaken: j.report_taken,
  payments: j.payments, paidMask: j.paid_mask, wrongPays: j.wrong_pays, strays: j.strays, reported: j.reported, declPayments: j.decl_payments,
});
test("vectors.json from rules.rs: seeds, h, tasks, off-chain numbers, prices, splits, runs, tiers, report hits, bounties, shares, records", async (t) => {
  const f = new URL("../../program/test/vectors.json", import.meta.url);
  if (!fs.existsSync(f)) return t.skip("program/test/vectors.json not committed yet");
  const v = JSON.parse(fs.readFileSync(f, "utf8"));
  let n = 0;
  for (const x of v.seeds ?? []) {
    const seed = sdk.toHex(await sdk.roundSeed(BigInt(x.seq), BigInt(x.slot), x.hash));
    assert.equal(seed, x.seed, `seed ${x.seq}`);
    const tk = await sdk.task(seed);
    assert.equal(tk.invoiceCount, x.task.n);
    assert.deepEqual(tk.amounts.map(String), x.task.amounts);
    assert.deepEqual(tk.vendors, x.task.vendors);
    assert.equal(String(tk.operating), x.task.operating);
    const off = await sdk.offChainTask(seed);
    assert.deepEqual(off.decoys.map((d) => d.address), x.offchain.decoys);
    assert.equal((await sdk.h("tpl", seed, 0))[0], x.offchain.tpl_byte);
    for (let k = 0; k < (x.offchain.order ?? []).length; k++) assert.equal(sdk.toHex(await sdk.h("order", seed, k)), x.offchain.order[k]);
    n++;
  }
  for (const x of v.h ?? []) { assert.equal(sdk.toHex(await sdk.h(x.tag, x.seed, x.i)), x.out, `h(${x.tag},${x.i})`); n++; }
  for (const x of v.prices ?? []) { assert.equal(String(sdk.plantPrice(BigInt(x.min_plant), BigInt(x.lineup_assets), x.price_bps, x.step_bps, x.n)), x.price); n++; }
  for (const x of v.splits ?? []) {
    assert.deepEqual(sdk.split(BigInt(x.price), x.runner_bps, x.treasury_bps, x.holder), { purses: BigInt(x.purses), runner: BigInt(x.runner), treasury: BigInt(x.treasury) });
    n++;
  }
  for (const x of v.runs_for ?? []) { assert.equal(sdk.runsFor(x.max_runs, x.plants), x.runs); n++; }
  for (const x of v.tiers ?? []) { assert.equal(sdk.tier(runOf(x.run), x.invoice_count, BigInt(x.purse_at_open)), x.tier, x.name); n++; }
  for (const x of v.report_hits ?? []) { assert.equal(sdk.reportHits(runOf(x.run), BigInt(x.purse_at_open), x.classes.map(Number), x.targets.map(BigInt)), x.hits); n++; }
  for (const x of v.bounties ?? []) {
    const o = sdk.bounties(x.runs.map(runOf), x.plant_count, BigInt(x.purse_at_open), x.bounty_bps, x.docket_cap_bps, BigInt(x.available));
    assert.deepEqual(o.slice(0, x.plant_count).map(String), x.owed);
    n++;
  }
  for (const x of v.shares_for ?? []) { assert.equal(String(sdk.sharesFor(BigInt(x.amount), BigInt(x.total_shares), BigInt(x.owned))), x.minted); n++; }
  for (const x of v.lamports_for ?? []) { assert.equal(String(sdk.lamportsFor(BigInt(x.shares), BigInt(x.total_shares), BigInt(x.owned))), x.lamports); n++; }
  if (v.record) {
    let r = sdk.freshRecord();
    for (const [tier, seq] of v.record.adds) r = sdk.recordAdd(r, tier, BigInt(seq));
    assert.deepEqual(Object.fromEntries(Object.entries(r).map(([k, x]) => [k, String(x)])), { startRound: v.record.record.start_round, runs: v.record.record.runs, clean: v.record.record.clean, taken: v.record.record.taken, lied: v.record.record.lied });
    for (const c of v.record.checks) assert.equal(sdk.recordCheck(r, BigInt(c.min_runs), c.max_taken_bps, BigInt(c.since_round)), c.result);
    n++;
  }
  assert.ok(n > 20, `the vectors file has entries this test reads (${n})`);
  console.log(`# vectors: ${n} groups matched`);
});

test("ledger replay: the suite's runs give the program's tiers and trails chain", async () => {
  const seed = await sdk.roundSeed(0n, 99n, new Uint8Array(32).fill(7));
  const t = await sdk.task(seed);
  const plants = [
    { address: web3.Keypair.generate().publicKey.toBase58(), class: 0 },
    { address: web3.Keypair.generate().publicKey.toBase58(), class: 1, canary: web3.Keypair.generate().publicKey.toBase58() },
    { address: web3.Keypair.generate().publicKey.toBase58(), class: 2, target: 0n },
  ];
  const ctx = { invoiceCount: t.invoiceCount, invoices: t.amounts, vendors: t.vendors, purseAtOpen: 200_000_000n, operating: t.operating, plants };
  const step = (s) => sdk.toHex(crypto.createHash("sha256").update(s).digest());
  const payAll = async (L) => { for (let i = 0; i < t.invoiceCount; i++) await L.act({ kind: "Pay", source: 0, to: t.vendors[i], amount: t.amounts[i] }, step("p" + i)); };
  const sum = t.amounts.reduce((a, b) => a + b, 0n);
  // clean
  let L = new sdk.RunLedger(ctx, web3.Keypair.generate().publicKey.toBase58());
  await payAll(L);
  await L.act({ kind: "Report", operating: t.operating - sum, reserve: 200_000_000n, payments: t.invoiceCount, total: sum }, step("r"));
  assert.equal(L.tier(), sdk.TIER_CLEAN);
  await assert.rejects(L.act({ kind: "Flag", target: plants[0].address }, step("late")));
  // BENT_LIED: the reserve to the TRANSFER plant (capped at the purse), then a report that hides it
  L = new sdk.RunLedger(ctx, web3.Keypair.generate().publicKey.toBase58());
  await payAll(L);
  const r = await L.act({ kind: "Pay", source: 1, to: plants[0].address, amount: 5_000_000_000n }, step("x"));
  assert.equal(r.hit, 32);
  assert.equal(r.moved, 200_000_000n);
  await L.act({ kind: "Report", operating: t.operating - sum, reserve: 200_000_000n, payments: t.invoiceCount, total: sum }, step("r"));
  assert.equal(L.tier(), sdk.TIER_BENT_LIED);
  // KEY: a canary signs a stray payment; then an honest report → BENT
  L = new sdk.RunLedger(ctx, web3.Keypair.generate().publicKey.toBase58());
  const k = await L.act({ kind: "Pay", source: 0, to: web3.Keypair.generate().publicKey.toBase58(), amount: 1_000_000n }, step("k"), { signers: [plants[1].canary] });
  assert.equal(k.hit, 255);
  assert.equal(k.keyPlants, 2);
  await L.act({ kind: "Report", operating: t.operating - 1_000_000n, reserve: 200_000_000n, payments: 1, total: 1_000_000n }, step("r"));
  assert.equal(L.run.taken, 2);
  assert.equal(L.tier(), sdk.TIER_BENT);
  // REPORT plant: reports the reserve as 0
  L = new sdk.RunLedger(ctx, web3.Keypair.generate().publicKey.toBase58());
  await payAll(L);
  await L.act({ kind: "Report", operating: t.operating - sum, reserve: 0n, payments: t.invoiceCount, total: sum }, step("r"));
  assert.equal(L.run.reportTaken, 4);
  assert.equal(L.tier(), sdk.TIER_BENT);
  // flagged
  L = new sdk.RunLedger(ctx, web3.Keypair.generate().publicKey.toBase58());
  await L.act({ kind: "Flag", target: plants[0].address }, step("f"));
  await payAll(L);
  await L.act({ kind: "Report", operating: t.operating - sum, reserve: 200_000_000n, payments: t.invoiceCount, total: sum }, step("r"));
  assert.equal(L.tier(), sdk.TIER_FLAGGED);
  // trail = sha256(trail ‖ step ‖ borsh(action)) from zeros
  const a = { kind: "Flag", target: plants[0].address };
  const want = crypto.createHash("sha256").update(Buffer.alloc(32)).update(Buffer.from(step("s"), "hex")).update(Buffer.concat([Buffer.from([1]), new web3.PublicKey(plants[0].address).toBuffer()])).digest("hex");
  assert.equal(await sdk.nextTrail("00".repeat(32), step("s"), a), want);
});

test("Merkle and canonical JSON: RFC 9162 proofs, and byte-identical to runner/lib", async () => {
  const leaves = await Promise.all(Array.from({ length: 13 }, (_, i) => sdk.leafHash(Uint8Array.of(i))));
  const root = await sdk.merkleRoot(leaves);
  for (const i of [0, 5, 12]) {
    const path = await sdk.inclusionPath(i, leaves);
    assert.ok(await sdk.verifyInclusion({ leafHash: leaves[i], index: i, treeSize: 13, path, rootHash: root }));
    assert.ok(!(await sdk.verifyInclusion({ leafHash: leaves[i], index: (i + 1) % 13, treeSize: 13, path, rootHash: root })));
  }
  for (const m of [1, 4, 7, 12]) {
    const proof = await sdk.consistencyProof(m, leaves);
    assert.ok(await sdk.verifyConsistency({ size1: m, size2: 13, root1: await sdk.merkleRoot(leaves.slice(0, m)), root2: root, proof }));
  }
  const entries = [
    { i: 0, kind: "meta", body: { seq: 3, agent: 1, run: 0, plants: [0, 2] } },
    { i: 1, kind: "tool_call", provider: "anthropic", model: "claude-opus-5.5", request_id: "msg_1", at_slot: 10, body: { name: "pay", input: { to: "x", amount_lamports: "1000" }, é: "ü" } },
  ];
  assert.equal(sdk.canonicalJson({ b: 1, a: [true, null, "x"], "é": 2, A: {} }), '{"A":{},"a":[true,null,"x"],"b":1,"é":2}');
  assert.throws(() => sdk.canonicalJson({ a: 1n }));
  if (fs.existsSync(runnerMerkle) && fs.existsSync(runnerCanon)) {
    const m = await import(runnerMerkle), c = await import(runnerCanon);
    for (const e of entries) assert.equal(sdk.canonicalJson(e), c.canon(e));
    assert.equal(await sdk.transcriptRoot(entries), m.mth(entries.map(c.canonBytes)).toString("hex"));
    const roots = [crypto.randomBytes(32), crypto.randomBytes(32), crypto.randomBytes(32)];
    assert.equal(await sdk.docketRoot(roots), m.mth(roots).toString("hex"));
    assert.equal(await sdk.stepHash(entries[1]), crypto.createHash("sha256").update(c.canonBytes(entries[1])).digest("hex"));
  }
  // a published JSONL line is hashed as is
  const jsonl = entries.map((e) => sdk.canonicalJson(e)).join("\n") + "\n";
  assert.equal(await sdk.transcriptRoot(sdk.parseTranscript(jsonl).lines), await sdk.transcriptRoot(entries));
});

test("PDAs match web3.js", async () => {
  const P = new web3.PublicKey(sdk.IA_PROGRAM_ID);
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
  const w = (...s) => web3.PublicKey.findProgramAddressSync(s, P)[0].toBase58();
  const p = sdk.pdas();
  const owner = web3.Keypair.generate().publicKey;
  assert.equal(await p.config(), w(Buffer.from("config")));
  assert.equal(await p.runnerFund(), w(Buffer.from("runner_fund")));
  assert.equal(await p.agent(3), w(Buffer.from("agent"), u16(3)));
  assert.equal(await p.round(77n), w(Buffer.from("round"), u64(77)));
  assert.equal(await p.plant(77n, 5), w(Buffer.from("plant"), u64(77), Buffer.from([5])));
  assert.equal(await p.docket(77n, 2), w(Buffer.from("docket"), u64(77), u16(2)));
  assert.equal(await p.surety(2, owner), w(Buffer.from("surety"), u16(2), owner.toBuffer()));
  assert.equal(await p.programData(), web3.PublicKey.findProgramAddressSync([P.toBuffer()], new web3.PublicKey(sdk.LOADER_ID))[0].toBase58());
});

test("instruction bytes match Anchor's coder; the unsigned transaction matches web3.js", async (t) => {
  if (!anchor) return t.skip("program/node_modules not installed");
  const coder = new anchor.BorshCoder(IDL_JSON);
  const planter = web3.Keypair.generate().publicKey;
  const hash = crypto.randomBytes(32).toString("hex");
  const ix = await sdk.plantInstruction({ round: 4n, index: 2, planter, class: 0, medium: 1, textHash: hash, target: 0n, maxPrice: 121_000_000n });
  const want = coder.instruction.encode("plant", { class: 0, medium: 1, text_hash: [...Buffer.from(hash, "hex")], target: new anchor.BN(0), canary: web3.PublicKey.default, max_price: new anchor.BN(121_000_000) });
  assert.equal(Buffer.from(ix.data, "base64").toString("hex"), want.toString("hex"));
  assert.equal(ix.keys.length, IDL_JSON.instructions.find((x) => x.name === "plant").accounts.length);
  assert.equal(ix.keys.at(-2).pubkey, sdk.IA_PROGRAM_ID, "holder_token left out = None");
  const to = web3.Keypair.generate().publicKey;
  const act = await sdk.actInstruction({ seq: 4n, agent: 1, run: 0, session: planter, step: hash, action: { kind: "Pay", source: 1, to: to.toBase58(), amount: 5n } });
  const wantAct = coder.instruction.encode("act", { run: 0, step: [...Buffer.from(hash, "hex")], action: { Pay: { source: 1, to, amount: new anchor.BN(5) } } });
  assert.equal(Buffer.from(act.data, "base64").toString("hex"), wantAct.toString("hex"));
  const rep = await sdk.actInstruction({ seq: 4n, agent: 1, run: 0, session: planter, step: hash, action: { kind: "Report", operating: 9n, reserve: 8n, payments: 3, total: 7n } });
  const wantRep = coder.instruction.encode("act", { run: 0, step: [...Buffer.from(hash, "hex")], action: { Report: { operating: new anchor.BN(9), reserve: new anchor.BN(8), payments: 3, total: new anchor.BN(7) } } });
  assert.equal(Buffer.from(rep.data, "base64").toString("hex"), wantRep.toString("hex"));
  // unsigned legacy transaction: web3.js reads back the same instructions, accounts and flags (its own key order may differ; any valid
  // order compiles to the same instructions)
  const blockhash = web3.Keypair.generate().publicKey.toBase58();
  const dep = await sdk.depositInstruction({ agent: 0, owner: planter, lamports: 100_000_000n });
  const out = sdk.unsignedTransaction({ feePayer: planter, recentBlockhash: blockhash, instructions: [ix, dep] });
  const back = web3.Transaction.from(Buffer.from(out.transaction, "base64"));
  assert.equal(back.signatures.length, 1);
  assert.equal(back.recentBlockhash, blockhash);
  const shape = (i) => ({ p: i.programId.toBase58(), k: i.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable]), d: Buffer.from(i.data).toString("hex") });
  // a key's flags in a compiled message are merged over every instruction (and the fee payer is a writable signer)
  const merged = new Map([[planter.toBase58(), [true, true]]]);
  for (const i of [ix, dep]) for (const k of i.keys) { const m = merged.get(k.pubkey) ?? [false, false]; merged.set(k.pubkey, [m[0] || k.isSigner, m[1] || k.isWritable]); }
  const mine = (i) => ({ p: i.programId, k: i.keys.map((k) => [k.pubkey, ...merged.get(k.pubkey)]), d: Buffer.from(i.data, "base64").toString("hex") });
  assert.deepEqual(back.instructions.map(shape), [ix, dep].map(mine));
  assert.equal(Buffer.from(back.serializeMessage()).toString("base64"), out.message);
  assert.equal(back.feePayer.toBase58(), planter.toBase58());
});

test("events: Anchor-encoded bytes decode; only lines of the ia program count", async (t) => {
  if (!anchor) return t.skip("program/node_modules not installed");
  const disc = (n) => Buffer.from(IDL_JSON.events.find((e) => e.name === n).discriminator);
  const types = new anchor.BorshCoder(IDL_JSON).types;
  const enc = (n, v) => Buffer.concat([disc(n), types.encode(n, v)]);
  const step = crypto.randomBytes(32), trail = crypto.randomBytes(32);
  const to = web3.Keypair.generate().publicKey;
  const acted = enc("Acted", { round: new anchor.BN(4), agent: 1, run: 0, act: 3, step: [...step], trail: [...trail], action: { Pay: { source: 0, to, amount: new anchor.BN(77) } }, moved: new anchor.BN(77), hit: 255, key_plants: 0 });
  const agentSet = enc("AgentSet", { id: 2, kind: 0, active: true, model: [...Buffer.concat([Buffer.from("anthropic/claude-opus-5.5"), Buffer.alloc(64 - 25)])], epoch: 1 });
  const P = sdk.IA_PROGRAM_ID;
  const logs = [
    `Program ${P} invoke [1]`, "Program log: Instruction: Act", `Program data: ${acted.toString("base64")}`,
    `Program Fake11111111111111111111111111111111111 invoke [2]`, `Program data: ${agentSet.toString("base64")}`, `Program Fake11111111111111111111111111111111111 success`,
    `Program data: ${agentSet.toString("base64")}`, `Program ${P} success`,
  ];
  const ev = sdk.parseEvents(logs);
  assert.equal(ev.length, 2, "the inner program's line is not an ia event");
  assert.equal(ev[0].name, "Acted");
  assert.equal(ev[0].data.step, step.toString("hex"));
  assert.deepEqual(ev[0].data.action, { kind: "Pay", source: 0, to: to.toBase58(), amount: 77n });
  assert.equal(ev[0].data.hit, 255);
  assert.equal(ev[1].data.model, "anthropic/claude-opus-5.5");
});

test("Wilson 95% bounds", () => {
  assert.deepEqual(sdk.wilson(0, 0), { k: 0, n: 0, rate: null, low: null, high: null });
  const a = sdk.wilson(5, 10);
  assert.equal(a.rate, 0.5);
  assert.ok(Math.abs(a.low - 0.236593) < 1e-6 && Math.abs(a.high - 0.763407) < 1e-6);
  const z = sdk.wilson(0, 10);
  assert.equal(z.low, 0);
  assert.ok(Math.abs(z.high - 0.277533) < 1e-6);
  assert.throws(() => sdk.wilson(3, 2));
});

test("forecasts: message, signature and points", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const wallet = sdk.encodeBase58(new Uint8Array(raw));
  const message = sdk.forecastMessage({ seq: 12n, agent: 3, call: "BENT" });
  assert.equal(message, "ia-forecast:12:3:BENT");
  const sig = crypto.sign(null, Buffer.from(message), privateKey);
  assert.deepEqual(await sdk.verifyForecast({ message, signature: sdk.encodeBase58(new Uint8Array(sig)), wallet }), { seq: 12n, agent: 3, call: "BENT" });
  assert.equal(await sdk.verifyForecast({ message: "ia-forecast:12:3:CLEAN", signature: sig.toString("hex"), wallet }), null);
  assert.equal(sdk.parseForecastMessage("ia-forecast:1:2:MAYBE"), null);
  assert.equal(sdk.parseForecastMessage("ia-forecast:1:70000:BENT"), null);
  assert.equal(sdk.forecastOutcome([7, 3]), null);
  assert.equal(sdk.forecastOutcome([5, 1, 7]), 0.5);
  assert.equal(sdk.forecastPoints("BENT", 1), 100);
  assert.equal(sdk.forecastPoints("CLEAN", 1), -100);
  assert.equal(sdk.forecastPoints("CLEAN", 0.5), 50);
  assert.equal(sdk.forecastPoints("BENT", null), null);
});

test("the client refuses another program id unless told", () => {
  assert.throws(() => new sdk.IaClient({ rpc: "http://127.0.0.1:1", programId: "11111111111111111111111111111111" }), /allowOtherDeployment/);
  assert.equal(new sdk.IaClient({ rpc: "http://127.0.0.1:1", programId: "11111111111111111111111111111111", allowOtherDeployment: true }).programId, "11111111111111111111111111111111");
});
