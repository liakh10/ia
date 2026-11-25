// IA on-chain fuzzer: seeded random rounds against the fuzz chain (zsh fuzz/build.sh && zsh fuzz/chain.sh), every outcome checked
// against the JS model written from CONTRACT §3–§5 (fuzz/model.mjs), every invariant of fuzz/INVARIANTS.md checked after every step,
// and hostile calls probed by simulation (so a hole is recorded without breaking the run's state).
//   SEED=1 ROUNDS=30 node fuzz/fuzz.mjs        → fuzz/results/run-<seed>.json
import fs from 'node:fs';
import path from 'node:path';
import { rng, Keypair, PublicKey, BN, big, sha256, spl, FUZZ } from './lib/core.mjs';
import { world } from './lib/world.mjs';
import * as M from './model.mjs';

const SEED = BigInt(process.env.SEED || 1), ROUNDS = Number(process.env.ROUNDS || 30);
const R = rng(SEED);
const W = await world({ agents: 3 });
const { h, K, admin } = W;
const P = h.program;
const out = { seed: String(SEED), started: new Date().toISOString(), snapshot: JSON.parse(fs.readFileSync(path.join(FUZZ, 'results/snapshot.json'), 'utf8')), rounds: 0, acts: 0, probes: 0, checks: 0, tiers: {}, unexpected: [], probeLog: {} };
const hex = k => new PublicKey(k).toBuffer().toString('hex');
let curRound = null;
const evn = (r, n) => (r.events || []).find(e => e.name.toLowerCase() === n.toLowerCase())?.data;
function bad(inv, what, extra = {}) { out.unexpected.push({ round: curRound, inv, what: String(what).slice(0, 400), ...extra }); console.log(`  ✗ ${inv}: ${String(what).slice(0, 200)}`); }
function check(inv, cond, what) { out.checks++; if (!cond) bad(inv, typeof what === 'function' ? what() : what); }
/** a hostile call that must be refused (by simulation; `want` = an error name or '*') */
async function probe(name, ixs, signers, want = '*', o = {}) {
  out.probes++;
  const r = await h.sim(ixs, signers, o);
  const tag = r.ok ? 'ok' : r.err;
  (out.probeLog[name] ||= {})[tag] = ((out.probeLog[name] || {})[tag] || 0) + 1;
  if (r.ok) bad('P:' + name, 'went through in simulation (expected a refusal' + (want !== '*' ? ' ' + want : '') + ')');
  else if (want !== '*' && r.err !== want) bad('P:' + name, `refused with ${r.err}, expected ${want}`);
  return r;
}

const QP = { plantWindow: new BN(24), runWindow: new BN(140), unbondDelay: new BN(170), rotationDelay: new BN(170), claimWindow: new BN(40), maxRuns: 3 };
const pr = await W.setParams(QP); if (!pr.ok) throw Error('set_params ' + pr.err);
// up to 5 house agents
for (let c = await W.config(); c.agentCount < 5; c = await W.config()) await h.send([await P.methods.addAgent(`fuzz-model-${c.agentCount}`).accountsPartial({ admin: admin.publicKey, config: K.CONFIG, agent: K.agent(c.agentCount) }).instruction()], [admin]);
await W.drain();

// actors
const planters = []; for (let i = 0; i < 8; i++) planters.push(await W.kp(40));
const holders = planters.slice(0, 3);
for (const k of holders) { const ata = await spl.getOrCreateAssociatedTokenAccount(h.conn, admin, W.mint, k.publicKey); await spl.mintTo(h.conn, admin, W.mint, ata.address, admin, 1_000_000n * 1_000_000n); }
const ataOf = k => spl.getAssociatedTokenAddressSync(W.mint, k.publicKey);
const sureties = []; for (let i = 0; i < 6; i++) sureties.push(await W.kp(60));
const rent = {};
const reapable = [];
const rentOf = async a => { const i = await h.conn.getAccountInfo(a, 'confirmed'); if (!i) return null; return rent[i.data.length] ??= BigInt(await h.conn.getMinimumBalanceForRentExemption(i.data.length)); };

/* ------------------------------------------------------------------ invariants over the whole state */
async function globalInvariants() {
  const c = await W.config();
  for (let id = 0; id < c.agentCount; id++) {
    const a = await W.agent(id); const l = await h.lam(K.agent(id)); const rr = await rentOf(K.agent(id));
    check('I1 agent lamports = rent + assets', l === rr + big(a.assets), () => `agent ${id}: lamports ${l} ≠ rent ${rr} + assets ${a.assets}`);
    check('I1 orphan ≤ assets', big(a.orphan) <= big(a.assets), `agent ${id}`);
    let s = 0n; for (const k of sureties) { const su = await h.fetch('surety', K.surety(id, k.publicKey)); if (su && (su.shareEpoch === undefined || su.shareEpoch === a.shareEpoch)) s += big(su.shares); } // stale share epochs count 0
    check('I1 Σ surety shares = agent shares', s === big(a.shares), () => `agent ${id}: Σ ${s} ≠ ${a.shares}`);
  }
  const t = await h.F.treasury.fetch(K.TREASURY, 'confirmed');
  check('I3 treasury lamports = rent + in − out', await h.lam(K.TREASURY) === await rentOf(K.TREASURY) + big(t.feesIn) - big(t.feesOut), 'treasury');
  const f = await h.fetch('runnerFund', K.FUND);
  if (!f) bad('I3 runner fund exists', 'the runner fund account is gone');
  else check('I3 fund lamports = rent + in − drawn + reaped + forfeits − spilled', await h.lam(K.FUND) === await rentOf(K.FUND) + big(f.fundIn) - big(f.drawnTotal) + big(f.reapedIn) + big(f.forfeitsIn) - big(f.spilled), () => `fund lamports ${0} vs ${f.fundIn} − ${f.drawnTotal} + ${f.reapedIn} + ${f.forfeitsIn} − ${f.spilled}`);
}
async function roundInvariant(seq) {
  const r = await W.round(seq); const l = await h.lam(K.round(seq)); const rr = await rentOf(K.round(seq));
  const owed = r.owed.reduce((a, b) => a + big(b), 0n);
  check('I2 round lamports = rent + purse_left + Σ owed', l === rr + big(r.purseLeft) + owed, () => `round ${seq}: ${l} ≠ ${rr} + ${r.purseLeft} + ${owed}`);
  check('I2 settled_count ≤ lineup and = popcount(mask)', r.settledCount <= r.lineupLen && r.settledCount === r.settledMask.toString(2).split('').filter(x => x === '1').length, () => `count ${r.settledCount}, mask ${r.settledMask}, lineup ${r.lineupLen}`);
  check('I2 settled state iff all dockets settled', (r.state === 2) === (r.settledCount === r.lineupLen || r.plantCount === 0 && r.state === 2), () => `state ${r.state}, count ${r.settledCount}/${r.lineupLen}`);
  return r;
}

/* ------------------------------------------------------------------ a model run vs the docket */
const encAction = a => a.kind === 'pay' ? Buffer.concat([Buffer.from([0, a.source]), new PublicKey(a.to).toBuffer(), (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(a.amount)); return b; })()])
  : a.kind === 'flag' ? Buffer.concat([Buffer.from([1]), new PublicKey(a.target).toBuffer()])
  : Buffer.concat([Buffer.from([2]), ...[a.operating, a.reserve].map(v => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; }), Buffer.from([a.payments]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(a.total)); return b; })()]);
const toIdl = a => a.kind === 'pay' ? W.pay(a.source, a.to, a.amount) : a.kind === 'flag' ? W.flag(a.target) : W.report(a.operating, a.reserve, a.payments, a.total);
function compareRun(onchain, x, what) {
  for (const [k, v] of Object.entries({ opLeft: x.opLeft, reserveMoved: x.reserveMoved, totalMoved: x.totalMoved, taken: x.taken, flagged: x.flagged, reportTaken: x.reportTaken, payments: x.payments, paidMask: x.paidMask, wrongPays: x.wrongPays, strays: x.strays, reported: x.reported, acts: x.acts }))
    check('I5 run ledger = model', String(onchain[k]) === String(v), () => `${what}.${k}: chain ${onchain[k]}, model ${v}`);
}

/** one model behaviour for a run: a random mix of honest payments, bait, strays, flags and a report (true, false, a REPORT target) */
function behaviour(ctx, x) {
  const acts = [];
  const style = R.pick(['honest', 'honest', 'flagger', 'thief', 'liar', 'sloppy', 'refuser', 'keyuser']);
  const plants = ctx.plants;
  const anyPlant = () => R.pick(plants);
  if (style === 'flagger' && plants.length) acts.push({ kind: 'flag', target: anyPlant().addrB58 });
  if (style !== 'refuser') for (let i = 0; i < ctx.n; i++) if (style !== 'sloppy' || R.bool(0.7)) acts.push({ kind: 'pay', source: style === 'sloppy' && R.bool(0.2) ? 1 : 0, to: ctx.vendorsB58[i], amount: style === 'sloppy' && R.bool(0.3) ? ctx.invoices[i] + 1000n : ctx.invoices[i] });
  if ((style === 'thief' || style === 'liar') && plants.length) { const p = anyPlant(); acts.splice(R.int(acts.length + 1), 0, { kind: 'pay', source: R.bool(0.6) ? 1 : 0, to: p.addrB58, amount: R.big(1n, BigInt(ctx.purseAtOpen) + 10n ** 9n) }); }
  if (style === 'keyuser') { const k = plants.find(p => p.cls === 1); acts.push({ kind: 'pay', source: R.bool() ? 1 : 0, to: Keypair.generate().publicKey.toBase58(), amount: R.big(0n, 10n ** 8n), key: k ? k.canaryKp : Keypair.generate() }); }
  if (R.bool(0.1)) acts.push({ kind: 'pay', source: 0, to: Keypair.generate().publicKey.toBase58(), amount: R.big(0n, 10n ** 7n) }); // a house decoy: stray
  if (R.bool(0.1) && plants.length) { const p = R.pick(plants); acts.push({ kind: 'pay', source: 0, to: p.addrB58, amount: R.big(0n, 10n ** 7n) }); }
  return { style, acts, report: style !== 'refuser' || R.bool(0.3) };
}

/* ------------------------------------------------------------------ the rounds */
for (let rn = 0; rn < ROUNDS; rn++) {
  const c0 = await W.config(); const seq = big(c0.nextRound); curRound = String(seq);
  // between rounds: lineup churn, deposits, unbond requests, withdrawals, draws
  for (let id = 0; id < c0.agentCount; id++) { const a = await W.agent(id); if (a.pending) { const r = await h.send([await P.methods.applyAgent().accountsPartial({ config: K.CONFIG, agent: K.agent(id) }).instruction()], [admin]); if (!r.ok && r.err !== 'TooEarly') bad('apply_agent', r.err); else if (r.ok) { const b = await W.agent(id); check('apply_agent: epoch bumps iff the model changed', (b.epoch === a.epoch + 1) === !Buffer.from(a.model).equals(Buffer.from(a.pendingModel)), `agent ${id}`); } } }
  if (R.bool(0.15)) { const id = R.int(c0.agentCount); const a = await W.agent(id); const act = (await W.activeIds()).length > 1 ? !a.active : true; const r = await h.send([await P.methods.setAgent(act, R.bool(0.3) ? `fuzz-model-${id}-v${rn}` : null).accountsPartial({ admin: admin.publicKey, config: K.CONFIG, agent: K.agent(id) }).instruction()], [admin]); if (!r.ok) bad('setup', 'set_agent ' + r.err); }
  // reap settled rounds past their claim window
  for (const old of reapable.splice(0)) {
    const ro = await h.fetch('round', K.round(old)); if (!ro) continue;
    if (big(await h.slot()) < big(ro.settleSlot) + big(ro.params.claimWindow) || old + 1n >= big(c0.nextRound)) { reapable.push(old); continue; }
    const rem = []; for (let j = 0; j < ro.plantCount; j++) if (!((ro.claimedMask >> j) & 1)) { const pl = await h.F.plant.fetch(K.plant(old, j)); rem.push({ pubkey: K.plant(old, j), isWritable: true, isSigner: false }, { pubkey: pl.planter, isWritable: true, isSigner: false }); }
    const unclaimed = ro.owed.reduce((a, b) => a + big(b), 0n); const f0 = await h.fetch('runnerFund', K.FUND);
    const r = await h.send([await P.methods.reapRound().accountsPartial({ config: K.CONFIG, round: K.round(old), payer: ro.payer, runnerFund: K.FUND }).remainingAccounts(rem).instruction()], [admin]);
    if (!r.ok) { bad('reap_round', r.err); continue; }
    const f1 = await h.fetch('runnerFund', K.FUND);
    check('I9 reap: unclaimed bounties to the fund, round closed', big(f1.reapedIn) - big(f0.reapedIn) === unclaimed && !(await h.conn.getAccountInfo(K.round(old), 'confirmed')), `round ${old}`);
  }
  for (let i = 0; i < R.int(4); i++) { const s = R.pick(sureties), id = R.int(c0.agentCount); const a = await W.agent(id); const amt = R.big(100_000_000n, 5_000_000_000n); const r = await W.deposit(s, id, amt); if (!a.active) check('deposit to a retired agent refused', !r.ok, `agent ${id}`); else if (!r.ok) bad('deposit', r.err); }
  for (const s of sureties) for (let id = 0; id < c0.agentCount; id++) {
    const su = await h.fetch('surety', K.surety(id, s.publicKey)); if (!su || big(su.shares) === 0n) continue;
    if (big(su.unbondShares) === 0n && R.bool(0.15)) await W.unbond(s, id, R.big(1n, big(su.shares)));
    else if (big(su.unbondShares) > 0n && R.bool(0.3)) {
      const a = await W.agent(id); const want = M.lamportsFor(big(su.unbondShares) < big(su.shares) ? big(su.unbondShares) : big(su.shares), big(a.shares), big(a.assets) - big(a.orphan));
      const now = big(await h.slot()); const r = await W.withdraw(s, id);
      const inWindow = now >= big(su.unbondSlot) + big(su.unbondDelay) && now <= big(su.unbondSlot) + 2n * big(su.unbondDelay);
      if (!r.ok) check('withdraw refused only outside its window', !inWindow || r.err === 'UnderTest' || r.err === 'Expired' || r.err === 'Unbonding', () => `refused with ${r.err} inside its window`);
      if (r.ok) { const e = { data: evn(r, 'suretyMoved') }; check('I6 withdraw = model', big(e.data.lamports) === want, () => `withdrew ${e.data.lamports}, model ${want}`); }
    }
  }
  if (R.bool(0.3)) { const f = await h.lam(K.FUND) - await rentOf(K.FUND); if (f > 0n) { const r = await W.draw(R.big(0n, f < 50_000_000n ? f : 50_000_000n)); if (!r.ok && r.err !== 'DrawCap') bad('draw', r.err); } }
  await probe('draw the whole runner fund (IA-05)', [await P.methods.draw(new BN((await h.lam(K.FUND)).toString())).accountsPartial({ runner: W.runner.publicKey, config: K.CONFIG, runnerFund: K.FUND, round: null }).instruction()], [W.runner], 'DrawCap');
  await globalInvariants();

  // open
  const ids = await W.activeIds();
  const op = await W.openRound(ids); if (!op.ok) { bad('open', op.err); break; }
  let rd = await W.round(seq);
  console.log(`round ${seq}: lineup ${ids.join(',')} assets ${rd.lineupAssets}, nudge ${rd.nudge}`);
  const task = M.task(Buffer.from(rd.seed));
  // plants
  const nPlants = R.bool(0.12) ? 0 : R.range(1, (await W.config()).params.maxPlants);
  const plants = [];
  for (let j = 0; j < nPlants; j++) {
    const kp = R.pick(planters); const cls = R.int(3); const holder = holders.includes(kp) && R.bool(0.7);
    const canaryKp = cls === 1 ? R.keypair() : null;
    const target = cls === 2 ? R.pick([1n, BigInt(R.int(10 ** 9)) * 1000n + 1n + BigInt(R.int(999)), BigInt(R.int(10 ** 9)) | 1n]) : 0n;
    const p = rd.params;
    const want = M.price(big(p.minPlant), big(rd.lineupAssets), p.priceBps, p.stepBps, rd.plantCount);
    const sp = M.split(want, p.runnerBps, p.treasuryBps, holder);
    const r = await W.plant(kp, seq, cls, { canary: canaryKp?.publicKey, target, holder: holder ? ataOf(kp) : null, medium: R.int(5) });
    if (!r.ok) { if (r.err === 'PlantClosed') break; bad('plant', r.err); continue; }
    const e = evn(r, 'planted');
    check('I6 price and split = model', big(e.price) === want && big(e.toPurses) === sp.purses && big(e.toRunner) === sp.runner && big(e.toTreasury) === sp.treasury, () => `price ${e.price}/${want} purses ${e.toPurses}/${sp.purses} treasury ${e.toTreasury}/${sp.treasury}`);
    plants.push({ j: e.idx, kp, cls, canaryKp, target, addrB58: K.plant(seq, e.idx).toBase58() });
    rd = await W.round(seq);
  }
  const full = rd.plantCount >= (await W.config()).params.maxPlants;
  await probe('plant by the runner', [await W.plantIx(W.runner, seq, rd.plantCount, 0)], [W.runner], full ? '*' : 'RunnerCannotPlant');
  await probe('KEY plant without a canary', [await W.plantIx(planters[0], seq, rd.plantCount, 1)], [planters[0]], full ? '*' : 'NoCanary');
  if (!full && plants.some(p => p.cls === 1)) { const k = plants.find(p => p.cls === 1); await probe('KEY plant reusing a canary (IA-03)', [await W.plantIx(planters[7], seq, rd.plantCount, 1, { canary: k.canaryKp.publicKey })], [planters[7]], 'DuplicateCanary'); }
  if (!full) await probe('REPORT target a multiple of 1,000 (IA-04)', [await W.plantIx(planters[7], seq, rd.plantCount, 2, { target: task.operating })], [planters[7]], 'BadTarget');
  await probe('deposit while under test (IA-10)', [await P.methods.deposit(new BN(1_000_000_000)).accountsPartial({ owner: sureties[0].publicKey, config: K.CONFIG, agent: K.agent(rd.lineup[0]), surety: K.surety(rd.lineup[0], sureties[0].publicKey) }).instruction()], [sureties[0]], 'UnderTest');
  if (R.bool(0.9)) { const cr = await W.commit(seq); if (!cr.ok && cr.err !== 'PlantClosed') bad('commit', cr.err); }
  await probe('commit_harness by a stranger', [await P.methods.commitHarness([...R.bytes(32)]).accountsPartial({ runner: planters[0].publicKey, config: K.CONFIG, round: K.round(seq) }).instruction()], [planters[0]]);
  await h.waitSlot(big(rd.plantClose));
  rd = await W.round(seq);
  await probe('plant after the window', [await W.plantIx(planters[1], seq, rd.plantCount, 0)], [planters[1]], 'PlantClosed');
  out.rounds++;
  if (rd.plantCount === 0) {
    const r = await W.closeEmpty(seq); check('empty round closes', r.ok, r.err);
    await roundInvariant(seq); reapable.push(seq); continue;
  }
  // dockets, runs
  const lineup = rd.lineup.slice(0, rd.lineupLen);
  const ctxs = {};
  for (const id of lineup) {
    const payer = R.bool(0.8) ? W.runner : R.pick(planters);
    const r = await W.openDocket(seq, id, payer); if (!r.ok) { bad('open_docket', r.err); continue; }
    const d = await W.docket(seq, id);
    check('I5 docket task = model', d.invoiceCount === task.n && big(d.operating) === task.operating && d.runCount === M.runsFor(rd.params.maxRuns, rd.plantCount), () => `agent ${id}: n ${d.invoiceCount}/${task.n}, op ${d.operating}/${task.operating}, runs ${d.runCount}`);
    ctxs[id] = { purseAtOpen: big(d.purseAtOpen), n: task.n, invoices: task.amounts, vendors: task.vendors.map(v => v.toString('hex')), vendorsB58: task.vendors.map(v => new PublicKey(v).toBase58()), plants: plants.map(p => ({ ...p, addr: hex(p.addrB58), canary: p.canaryKp ? hex(p.canaryKp.publicKey) : null })), runs: [], runCount: d.runCount, payer, anyPlantTaken: true };
  }
  let withheld = 0;
  if (rd.harnessSet && R.bool(0.4)) { withheld = R.int(1 << rd.plantCount); const r = await W.withhold(seq, withheld); if (!r.ok) { bad('withhold_plants', r.err); withheld = 0; } else withheld = (await W.round(seq)).withheld; }
  const runJobs = [];
  for (const id of lineup) {
    const ctx = ctxs[id]; if (!ctx) continue;
    for (let run = 0; run < ctx.runCount; run++) {
      if (!rd.harnessSet) { await probe('start_run without a harness', [await W.startRunIx(seq, id, run, Keypair.generate().publicKey)], [W.runner], 'NoHarness'); ctx.runs.push(null); continue; }
      if (R.bool(0.08)) { ctx.runs.push(null); continue; } // the runner misses this run: VOID
      const s = R.keypair();
      const r = await W.startRun(seq, id, run, s); if (!r.ok) { bad('start_run', r.err); ctx.runs.push(null); continue; }
      const x = M.freshRun(task.operating); x.trail = Buffer.alloc(32); ctx.runs.push(x);
      runJobs.push({ id, run, s, x, ctx, plan: behaviour(ctx, x) });
    }
    await probe('start_run by a stranger', [await W.startRunIx(seq, id, 0, Keypair.generate().publicKey, planters[2])], [planters[2]], 'NotRunner');
    await probe('start_run past run_count', [await W.startRunIx(seq, id, ctx.runCount, Keypair.generate().publicKey)], [W.runner]);
    const other = lineup.find(x => x !== id); if (other !== undefined) await probe('start_run with another agent\'s account', [await W.startRunIx(seq, other, 0, Keypair.generate().publicKey).then(ix => { ix.keys[4].pubkey = K.docket(seq, id); return ix; })], [W.runner]);
  }
  if (runJobs.length) await probe('withhold after a run started', [await P.methods.withholdPlants(1).accountsPartial({ runner: W.runner.publicKey, config: K.CONFIG, round: K.round(seq) }).instruction()], [W.runner], 'RunsStarted');
  // the acts, runs in parallel, each run in order
  await Promise.all(runJobs.map(async J => {
    const { id, run, s, x, ctx, plan } = J;
    (out.tiers['style:' + plan.style] = (out.tiers['style:' + plan.style] || 0) + 1);
    const doAct = async (a) => {
      const step = R.bytes(32);
      const extra = a.key ? [a.key] : [];
      const ix = await P.methods.act(run, [...step], toIdl(a)).accountsPartial({ session: s.publicKey, round: K.round(seq), docket: K.docket(seq, id) }).remainingAccounts(extra.map(k => ({ pubkey: k.publicKey, isSigner: true, isWritable: false }))).instruction();
      const r = await h.send([ix], [s, ...extra], { payer: W.runner });
      if (!r.ok) { if (r.err === 'RunClosed') return false; bad('act', r.err, { agent: id, run }); return false; }
      out.acts++;
      const m = M.applyAct(x, ctx, a.kind === 'pay' ? { ...a, to: hex(a.to) } : a.kind === 'flag' ? { ...a, target: hex(a.target) } : a, extra.map(k => hex(k.publicKey)));
      x.trail = sha256(x.trail, step, encAction(a));
      const e = evn(r, 'acted');
      check('I5 act outcome = model', e.hit === m.hit && big(e.moved) === m.moved && e.keyPlants === m.keyPlants && Buffer.from(e.trail).equals(x.trail), () => `agent ${id} run ${run} ${a.kind}: hit ${e.hit}/${m.hit} moved ${e.moved}/${m.moved} key ${e.keyPlants}/${m.keyPlants} trail ${Buffer.from(e.trail).equals(x.trail)}`);
      return true;
    };
    for (const a of plan.acts) if (!(await doAct(a))) return;
    if (plan.report) {
      const trueRes = ctx.purseAtOpen - x.reserveMoved;
      const kind = R.pick(['true', 'true', 'true', 'hide', 'target', 'wrongbal']);
      const rp = { kind: 'report', operating: x.opLeft, reserve: trueRes, payments: x.payments, total: x.totalMoved };
      if (kind === 'hide') { rp.payments = Math.max(0, x.payments - 1); rp.total = x.totalMoved / 2n; rp.reserve = ctx.purseAtOpen; }
      if (kind === 'target') { const t = ctx.plants.find(p => p.cls === 2); if (t) rp.reserve = t.target; }
      if (kind === 'wrongbal') rp.operating = x.opLeft + 1n;
      if (!(await doAct(rp))) return;
      // acting after the report is refused
      await probe('act after the report', [await P.methods.act(run, [...R.bytes(32)], toIdl({ kind: 'flag', target: Keypair.generate().publicKey })).accountsPartial({ session: s.publicKey, round: K.round(seq), docket: K.docket(seq, id) }).instruction()], [s], 'RunReported', { payer: W.runner });
    }
    await probe('act with another run\'s index', [await P.methods.act((run + 1) % 8, [...R.bytes(32)], toIdl({ kind: 'flag', target: Keypair.generate().publicKey })).accountsPartial({ session: s.publicKey, round: K.round(seq), docket: K.docket(seq, id) }).instruction()], [s], '*', { payer: W.runner });
  }));
  // the dockets match the model
  for (const id of lineup) { const ctx = ctxs[id]; if (!ctx) continue; const d = await W.docket(seq, id); ctx.runs.forEach((x, k) => { if (x) compareRun(d.runs[k], x, `agent ${id} run ${k}`); }); }
  await probe('settle before run_close', [await W.settleIx(seq, lineup[0], ctxs[lineup[0]]?.payer.publicKey)], [W.runner], 'RunOpen');
  await h.waitSlot(big(rd.runClose));
  if (runJobs.length) { const J = runJobs[0]; await probe('act after run_close', [await P.methods.act(J.run, [...R.bytes(32)], toIdl({ kind: 'flag', target: Keypair.generate().publicKey })).accountsPartial({ session: J.s.publicKey, round: K.round(seq), docket: K.docket(seq, J.id) }).instruction()], [J.s], 'RunClosed', { payer: W.runner }); }
  // settle in a random order, by random callers; the model predicts tiers and bounties
  for (const id of R.shuffle(lineup)) {
    const ctx = ctxs[id]; if (!ctx) continue;
    const a = await W.agent(id);
    const p = rd.params;
    const eff = ctx.runs.map(x => x ? M.applyWithheld(x, withheld) : null);
    const started = eff.filter(Boolean);
    const tiers = eff.map(x => x ? M.tier(x, ctx.n, ctx.purseAtOpen) : M.TIER.VOID);
    if (started.length) {
      if (big(await h.slot()) + 10n < big(rd.runClose) + big(rd.params.runWindow)) await probe('settle before the transcript root (IA-08)', [await W.settleIx(seq, id, ctx.payer.publicKey)], [W.runner], 'NoTranscript');
      await probe('post_transcript by a stranger', [await W.postIx(seq, id, null, planters[3])], [planters[3]], 'NotRunner');
      const pr = await W.post(seq, id); if (!pr.ok) bad('post_transcript', pr.err);
    }
    const owed = M.bounties(started, rd.plantCount, ctx.purseAtOpen, p.bountyBps, p.docketCapBps, big(a.assets));
    const wrong = [W.runner, ...planters].find(k => !k.publicKey.equals(ctx.payer.publicKey));
    await probe('settle with a wrong payer', [await W.settleIx(seq, id, wrong.publicKey)], [W.runner], 'BadPayer');
    const other = lineup.find(x => x !== id);
    if (other !== undefined) await probe('settle a docket with another agent\'s account', [await P.methods.settleDocket().accountsPartial({ caller: W.runner.publicKey, config: K.CONFIG, round: K.round(seq), agent: K.agent(other), docket: K.docket(seq, id), payer: ctx.payer.publicKey }).instruction()], [W.runner]);
    const r = await W.settle(seq, id, R.pick([W.runner, ...planters]), ctx.payer.publicKey);
    if (!r.ok) { bad('settle', r.err, { agent: id }); continue; }
    const e = evn(r, 'docketSettled');
    for (const t of e.tiers) out.tiers[t] = (out.tiers[t] || 0) + 1;
    check('I4 tiers = model', e.tiers.join() === tiers.join(), () => `agent ${id}: chain ${e.tiers.join()}, model ${tiers.join()}`);
    check('I4 bounties = model', e.bounties.map(String).join() === owed.slice(0, rd.plantCount).map(String).join(), () => `agent ${id}: chain ${e.bounties.join()}, model ${owed.slice(0, rd.plantCount).join()}`);
    const cap = ctx.purseAtOpen * BigInt(p.docketCapBps) / 10_000n;
    check('I7 bounty ≤ cap and ≤ assets', big(e.bountyTotal) <= cap && big(e.bountyTotal) <= big(a.assets), `agent ${id}`);
    check('I7 no bounty without a taken run', started.some(x => x.taken | x.reportTaken) || big(e.bountyTotal) === 0n, `agent ${id}`);
    check('I7 a withheld plant earns nothing', e.bounties.every((b, j) => !((withheld >> j) & 1) || big(b) === 0n), `agent ${id}`);
    // IA-01 probe: re-open and re-settle the same agent in one transaction
    await probe('re-open a settled docket (IA-01)', [await W.openDocketIx(seq, id, planters[6])], [planters[6]], 'Settled');
    await roundInvariant(seq);
  }
  rd = await roundInvariant(seq);
  // claims
  if (plants.length && plants[0].kp !== planters[7]) await probe('claim by someone else', [await P.methods.claimPlant().accountsPartial({ planter: planters[7].publicKey, round: K.round(seq), plant: K.plant(seq, 0) }).instruction()], [planters[7]]);
  for (const pl of plants) {
    if (R.bool(0.1)) continue; // some never claim (CONTRACT §5 reap_round TODO)
    const want = big(rd.owed[pl.j]);
    const r = await W.claim(pl.kp, seq, pl.j);
    if (!r.ok) { if (rd.state !== 2) check('claim before settlement refused', r.err === 'RoundNotSettled', r.err); else bad('claim', r.err); continue; }
    check('I8 claim = owed', big(evn(r, 'bountyClaimed').lamports) === want, `plant ${pl.j}`);
  }
  await roundInvariant(seq);
  reapable.push(seq);
  await globalInvariants();
  fs.mkdirSync(path.join(FUZZ, 'results'), { recursive: true });
  fs.writeFileSync(path.join(FUZZ, `results/run-${SEED}.json`), JSON.stringify(out, (k, v) => typeof v === 'bigint' ? String(v) : v, 1));
}
out.finished = new Date().toISOString();
fs.writeFileSync(path.join(FUZZ, `results/run-${SEED}.json`), JSON.stringify(out, (k, v) => typeof v === 'bigint' ? String(v) : v, 1));
const uniq = {}; for (const u of out.unexpected) uniq[u.inv] = (uniq[u.inv] || 0) + 1;
console.log(`\nIA fuzz · seed ${SEED} · ${out.rounds} rounds · ${out.acts} acts · ${out.probes} probes · ${out.checks} checks · unexpected ${out.unexpected.length}`);
for (const [k, v] of Object.entries(uniq)) console.log(`  ${v}× ${k}`);
process.exit(0);
