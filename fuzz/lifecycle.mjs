// IA fuzz, round 4: what fuzz.mjs did not reach. Seeded, against the fuzz chain running the snapshot build WITH the consumer program
// (zsh fuzz/build.sh && zsh fuzz/chain.sh). Four suites interleaved over a few rounds, then the whole closing path:
//   R  runner rotation (propose_runner / apply_runner) and the rotation-delay floor, judged at the slot each call ran at
//   S  spill: the runner fund's surplus above its cap into the newest round's purse pool (and every case where it must not move)
//   C  require_record through a CPI from fuzz/consumer (pinned, return data checked, compared with a direct read and the JS model),
//      the naive consumer and the fake ia, wrong accounts
//   D  closing: close_begin, everything that must stop, settlement and reaping at once, close_surety/close_agent/close_config,
//      every program account gone and every lamport accounted for
//   SEED=1 ROUNDS=4 node fuzz/lifecycle.mjs     → fuzz/results/lifecycle-<seed>.json
import fs from 'node:fs';
import path from 'node:path';
import { rng, Keypair, PublicKey, BN, big, sha256, FUZZ, web3 } from './lib/core.mjs';
import { world } from './lib/world.mjs';
import * as M from './model.mjs';

const SEED = BigInt(process.env.SEED || 1), ROUNDS = Number(process.env.ROUNDS || 4);
const R = rng(SEED);
const W = await world({ agents: 3 });
const { h, K, admin } = W;
const P = h.program;
const CONSUMER = new PublicKey(fs.readFileSync(path.join(FUZZ, 'consumer/src/lib.rs'), 'utf8').match(/declare_id!\("(\w+)"\)/)[1]);
const out = { seed: String(SEED), started: new Date().toISOString(), snapshot: JSON.parse(fs.readFileSync(path.join(FUZZ, 'results/snapshot.json'), 'utf8')), cases: 0, checks: 0, suites: {}, unexpected: [], log: [] };
let suite = 'setup';
const evn = (r, n) => (r.events || []).find(e => e.name.toLowerCase() === n.toLowerCase())?.data;
function bad(what) { out.unexpected.push({ suite, what: String(what).slice(0, 500) }); console.log(`  ✗ [${suite}] ${String(what).slice(0, 220)}`); }
function check(cond, what) { out.checks++; (out.suites[suite] ||= { cases: 0, checks: 0 }).checks++; if (!cond) bad(typeof what === 'function' ? what() : what); }
/** a call whose outcome is known: want = 'ok' or an error name ('*' = any refusal) */
function expect(name, r, want) {
  out.cases++; (out.suites[suite] ||= { cases: 0, checks: 0 }).cases++;
  const got = r.ok ? 'ok' : r.err;
  const pass = want === got || (want === '*' && !r.ok);
  if (!pass) bad(`${name}: want ${want}, got ${got}`);
  return r;
}
const txSlot = async sig => { const t = await h.getTx(sig); return t ? BigInt(t.slot) : null; }; // raw JSON-RPC, v1-safe (core.mjs)

/* ------------------------------------------------------------------ params: a small fund cap so spill happens, league seats open */
const PARAMS = { rotationDelay: new BN(60), runnerDrawCap: new BN(10_000_000), runnerFundCap: new BN(10_000_000), leagueSeats: 2, leagueBond: new BN(100_000_000), claimWindow: new BN(20) };
let cfg = await W.config();
const rot = { rot: big(cfg.params.rotationDelay), floor: big(cfg.delayFloor), floorUntil: big(cfg.delayFloorUntil) };
{
  const r = await W.setParams(PARAMS); expect('set_params', r, 'ok');
  M.setRotation(rot, await txSlot(r.sig), PARAMS.rotationDelay.toString());
  cfg = await W.config();
  check(big(cfg.delayFloor) === rot.floor && big(cfg.delayFloorUntil) === rot.floorUntil, () => `R: floor ${cfg.delayFloor}/${rot.floor} until ${cfg.delayFloorUntil}/${rot.floorUntil}`);
}
await W.drain();

// actors
const planters = []; for (let i = 0; i < 5; i++) planters.push(await W.kp(30));
const sureties = []; for (let i = 0; i < 4; i++) sureties.push(await W.kp(30));
const operator = await W.kp(10);
const feePayer = await W.kp(50); // pays the closing transactions' fees and receives nothing (D's conservation)
let leagueId = null;
const oldRunners = [];

/* ------------------------------------------------------------------ C: one battery of require_record calls on every agent */
const disc = n => sha256(Buffer.from('global:' + n)).subarray(0, 8);
const recArgs = (a, b, c, d) => { const x = Buffer.alloc(19); x.writeBigUInt64LE(BigInt(a), 0); x.writeUInt16LE(b, 8); x.writeBigUInt64LE(BigInt(c), 10); x[18] = d ? 1 : 0; return x; };
const ix = (programId, name, keys, args) => new web3.TransactionInstruction({ programId, keys, data: Buffer.concat([disc(name), args]) });
async function recordBattery(n) {
  suite = 'C';
  const c = await W.config();
  for (let id = 0; id < c.agentCount; id++) {
    const a = await h.fetch('agent', K.agent(id)); if (!a) continue;
    for (let k = 0; k < n; k++) {
      const runs = big(a.record.runs);
      const minRuns = R.pick([0n, 1n, runs, runs + 1n, R.big(0n, runs + 3n)]);
      const maxBps = R.pick([0, 10_000, R.int(10_001), Number(runs ? big(a.record.taken) * 10_000n / runs : 0n)]);
      const since = R.pick([0n, big(a.record.startRound), big(a.record.startRound) - 1n, (1n << 64n) - 1n, R.big(0n, big(c.nextRound) + 2n)].map(x => x < 0n ? 0n : x));
      const allow = R.bool();
      const want = M.recordCheck(a.record, a.kind, minRuns, maxBps, since, allow);
      const args = recArgs(minRuns, maxBps, since, allow);
      expect(`require_record direct (agent ${id})`, await h.sim([ix(h.PID, 'require_record', [{ pubkey: K.agent(id), isSigner: false, isWritable: false }], args)], [feePayer]), want);
      expect(`consumer gate (agent ${id})`, await h.sim([ix(CONSUMER, 'gate', [{ pubkey: K.agent(id), isSigner: false, isWritable: false }, { pubkey: h.PID, isSigner: false, isWritable: false }], args)], [feePayer]), want);
    }
    // the fake ia says yes to anything: only a consumer that does not pin ia believes it (documented, must stay "ok")
    expect('naive consumer + fake ia (believes a forged record)', await h.sim([ix(CONSUMER, 'naive_gate', [{ pubkey: K.agent(id), isSigner: false, isWritable: false }, { pubkey: CONSUMER, isSigner: false, isWritable: false }], recArgs(10 ** 6, 0, 0, false))], [feePayer]), 'ok');
    // the careful consumer pins ia: handing it the fake is refused
    expect('careful consumer handed the fake ia', await h.sim([ix(CONSUMER, 'gate', [{ pubkey: K.agent(id), isSigner: false, isWritable: false }, { pubkey: CONSUMER, isSigner: false, isWritable: false }], recArgs(0, 10_000, (1n << 64n) - 1n, true))], [feePayer]), '*');
  }
  // accounts that are not an Agent PDA
  for (const [what, acc] of [['config', K.CONFIG], ['runner fund', K.FUND], ['a round', K.round(0)], ['a wallet', feePayer.publicKey], ['an unused agent id', K.agent(200)]])
    expect(`require_record with ${what}`, await h.sim([ix(h.PID, 'require_record', [{ pubkey: acc, isSigner: false, isWritable: false }], recArgs(0, 10_000, (1n << 64n) - 1n, true))], [feePayer]), '*');
}

/* ------------------------------------------------------------------ R: rotation steps */
async function rotationStep() {
  suite = 'R';
  // occasionally move the rotation delay (up or down, inside the caps: ≥ unbond_delay, ≤ 1,512,000)
  if (R.bool(0.4)) {
    const c = await W.config();
    const nd = BigInt(R.pick([60, 61, 90, 150, 300]));
    const r = await W.setParams({ ...PARAMS, rotationDelay: new BN(nd.toString()) });
    expect('set_params rotation_delay ' + nd, r, 'ok');
    if (r.ok) {
      M.setRotation(rot, await txSlot(r.sig), nd);
      const c2 = await W.config();
      check(big(c2.delayFloor) === rot.floor && big(c2.delayFloorUntil) === rot.floorUntil && big(c2.params.rotationDelay) === nd, () => `floor ${c2.delayFloor}/${rot.floor} until ${c2.delayFloorUntil}/${rot.floorUntil}`);
    }
    void c;
  }
  expect('propose_runner by a stranger', await h.sim([await P.methods.proposeRunner(Keypair.generate().publicKey).accountsPartial({ admin: planters[0].publicKey, config: K.CONFIG }).instruction()], [planters[0]]), 'NotAdmin');
  expect('propose_runner the zero key', await h.sim([await P.methods.proposeRunner(PublicKey.default).accountsPartial({ admin: admin.publicKey, config: K.CONFIG }).instruction()], [admin]), 'NoPending');
  expect('apply_runner with nothing pending', await h.sim([await P.methods.applyRunner().accountsPartial({ config: K.CONFIG }).instruction()], [feePayer]), 'NoPending');
  const next = Keypair.generate(); await h.fund([next], 20);
  const pr = await h.send([await P.methods.proposeRunner(next.publicKey).accountsPartial({ admin: admin.publicKey, config: K.CONFIG }).instruction()], [admin]);
  expect('propose_runner', pr, 'ok');
  const at = big(evn(pr, 'runnerRotation').at);
  const s0 = await txSlot(pr.sig);
  check(at === s0 + M.delayAt(rot, s0), () => `runner_at ${at}, model ${s0} + ${M.delayAt(rot, s0)}`);
  if (R.bool(0.2)) { // cancel by proposing the current runner
    expect('cancel (propose the current runner)', await h.send([await P.methods.proposeRunner(W.runner.publicKey).accountsPartial({ admin: admin.publicKey, config: K.CONFIG }).instruction()], [admin]), 'ok');
    const c = await W.config(); check(c.pendingRunner.equals(PublicKey.default) && big(c.runnerAt) === 0n, 'cancel left a pending runner');
    return;
  }
  // before the slot: refused, judged at the slot the simulation ran at
  for (let k = 0; k < 3; k++) {
    const r = await h.sim([await P.methods.applyRunner().accountsPartial({ config: K.CONFIG }).instruction()], [feePayer]);
    expect(`apply_runner at slot ${r.slot} (runner_at ${at})`, r, BigInt(r.slot) >= at ? 'ok' : 'TooEarly');
  }
  // the old runner keeps the round's powers until the switch (trust point: rotation helps after a leak is noticed, not before)
  await h.waitSlot(at);
  const ap = await h.send([await P.methods.applyRunner().accountsPartial({ config: K.CONFIG }).instruction()], [feePayer]);
  expect('apply_runner after the slot', ap, 'ok');
  const old = W.runner;
  oldRunners.push(old);
  W.runner = next;
  check((await W.config()).runner.equals(next.publicKey), 'runner not switched');
  expect('the old runner draws', await h.sim([await P.methods.draw(new BN(1)).accountsPartial({ runner: old.publicKey, config: K.CONFIG, runnerFund: K.FUND, round: null }).instruction()], [old]), 'NotRunner');
  expect('the new runner cannot plant', await h.sim([await W.plantIx(next, big((await W.config()).nextRound), 0, 0)], [next]), '*');
  expect('the new runner cannot stand surety', await h.sim([await P.methods.deposit(new BN(1_000_000_000)).accountsPartial({ owner: next.publicKey, config: K.CONFIG, agent: K.agent(0), surety: K.surety(0, next.publicKey) }).instruction()], [next]), 'RunnerCannotDeposit');
  out.log.push(`round ${(await W.config()).nextRound}: runner rotated to ${next.publicKey.toBase58().slice(0, 8)}`);
}

/* ------------------------------------------------------------------ one round with S probes and real runs */
const rentOf = async a => BigInt(await h.conn.getMinimumBalanceForRentExemption((await h.conn.getAccountInfo(a, 'confirmed')).data.length));
async function spillCase(seq, label) {
  const was = suite; suite = 'S';
  const c = await W.config(); const r = await W.round(seq);
  const fundL = await h.lam(K.FUND), fr = await rentOf(K.FUND);
  const surplus = fundL > fr + big(c.params.runnerFundCap) ? fundL - fr - big(c.params.runnerFundCap) : 0n;
  const eligible = !c.closing && seq + 1n === big(c.nextRound) && r.state === 0 && r.plantCount > 0 && r.settledCount === 0;
  const want = eligible && surplus > 0n ? 'ok' : 'NoPending';
  const res = expect(`spill ${label} (surplus ${surplus}, eligible ${eligible})`, await h.send([await P.methods.spill().accountsPartial({ config: K.CONFIG, runnerFund: K.FUND, round: K.round(seq) }).instruction()], [R.pick(planters)]), want);
  if (res.ok) {
    const r2 = await W.round(seq);
    check(big(r2.pursePool) - big(r.pursePool) === surplus && big(r2.purseLeft) - big(r.purseLeft) === surplus && big(r2.spilled) - big(r.spilled) === surplus, 'spill: pool not raised by the surplus');
    check(await h.lam(K.FUND) === fr + big(c.params.runnerFundCap), 'spill: fund not at rent + cap');
  }
  suite = was;
  return res;
}

const plantsOf = {};
async function playRound(rn, closingHere) {
  suite = 'round';
  const o = await W.openRound(); expect('open_round', o, 'ok'); if (!o.ok) return null;
  const seq = o.seq;
  await spillCase(seq, 'before any plant');
  const n = R.range(1, 5); plantsOf[seq] = [];
  for (let j = 0; j < n; j++) {
    const kp = R.pick(planters); const cls = R.int(3);
    const r = await W.plant(kp, seq, cls, { canary: cls === 1 ? R.keypair().publicKey : undefined, target: cls === 2 ? 123_457n : 0n });
    if (r.ok) plantsOf[seq].push({ j: evn(r, 'planted').idx, kp, cls });
  }
  await spillCase(seq, 'after plants');
  if (closingHere) return seq; // D takes over mid-round
  expect('commit_harness', await W.commit(seq), 'ok');
  let rd = await W.round(seq);
  await h.waitSlot(big(rd.plantClose));
  rd = await W.round(seq);
  const lineup = rd.lineup.slice(0, rd.lineupLen);
  for (const id of lineup) {
    const isLeague = id === leagueId;
    expect('open_docket', await W.openDocket(seq, id, isLeague ? operator : W.runner), 'ok');
  }
  await spillCase(seq, 'after the dockets opened');
  // draw with the round: spills too (judged by spillCase's model on the next call)
  for (const id of lineup) {
    const isLeague = id === leagueId;
    const d = await W.docket(seq, id);
    const runs = R.range(0, d.runCount);
    for (let run = 0; run < runs; run++) {
      const s = R.keypair(); const auth = isLeague ? operator : W.runner;
      const st = await h.send([await W.startRunIx(seq, id, run, s.publicKey, auth)], [auth]);
      expect('start_run', st, 'ok'); if (!st.ok) continue;
      W.sessions[`${seq}.${id}.${run}`] = s;
      const style = R.pick(['honest', 'thief', 'idle', 'liar']);
      if (style === 'idle') continue;
      let tot = 0n, pays = 0;
      for (let i = 0; i < d.invoiceCount; i++) { await h.send([await W.actIx(seq, id, run, W.pay(0, d.vendors[i], big(d.invoices[i])), [], s)], [s], { payer: auth }); tot += big(d.invoices[i]); pays++; }
      let reserve = big(d.purseAtOpen);
      if (style !== 'honest' && plantsOf[seq].length) { const p = R.pick(plantsOf[seq]); await h.send([await W.actIx(seq, id, run, W.pay(1, K.plant(seq, p.j), 1_000_000n), [], s)], [s], { payer: auth }); const moved = reserve < 1_000_000n ? reserve : 1_000_000n; reserve -= moved; tot += moved; pays++; }
      const rep = style === 'liar' ? W.report(big(d.operating) - tot, big(d.purseAtOpen), pays - 1, tot - 1n) : W.report(big(d.operating) - tot, reserve, pays, tot);
      await h.send([await W.actIx(seq, id, run, rep, [], s)], [s], { payer: auth });
    }
  }
  await h.waitSlot(big(rd.runClose));
  let first = true;
  for (const id of R.shuffle(lineup)) {
    const auth = id === leagueId ? operator : W.runner;
    await h.send([await W.postIx(seq, id, null, auth)], [auth]);
    const d = await h.fetch('docket', K.docket(seq, id));
    const r = await W.settle(seq, id, R.pick(planters), d.payer);
    expect('settle_docket', r, 'ok');
    if (first) { await spillCase(seq, 'after the first settlement'); first = false; }
  }
  // some claims; the rest are reaped (now or at closing)
  rd = await W.round(seq);
  for (const p of plantsOf[seq]) if (R.bool(0.5)) { expect('claim', await W.claim(p.kp, seq, p.j), 'ok'); p.claimed = true; }
  await spillCase(seq, 'on a settled round');
  return seq;
}

/* ------------------------------------------------------------------ the run */
suite = 'setup';
for (let i = 0; i < sureties.length; i++) expect('deposit', await W.deposit(sureties[i], i % 3, R.big(100_000_000n, 3_000_000_000n)), 'ok');
{
  const c = await W.config(); leagueId = c.agentCount;
  const r = await h.send([await P.methods.registerAgent('operator-agent@1', new BN(500_000_000)).accountsPartial({ operator: operator.publicKey, config: K.CONFIG, agent: K.agent(leagueId), surety: K.surety(leagueId, operator.publicKey) }).instruction()], [operator]);
  expect('register_agent (Open League)', r, 'ok');
}
await recordBattery(10);
let lastSeq = null;
for (let rn = 0; rn < ROUNDS; rn++) {
  console.log(`round ${rn}`);
  if (rn === 1 || R.bool(0.3)) await rotationStep();
  lastSeq = await playRound(rn, false);
  await recordBattery(12);
}

/* ------------------------------------------------------------------ D: closing, from the middle of a round */
console.log('closing');
const closingSeq = await playRound(ROUNDS, true); // planted, not run: closing lands in its plant window
suite = 'D';
// a surety mid-unbond, to see that closing pays it anyway
{ const s = sureties[0]; const su = await h.fetch('surety', K.surety(0, s.publicKey)); if (su && big(su.shares) > 0n) await W.unbond(s, 0, big(su.shares) / 2n || 1n); }
expect('close_begin by a stranger', await h.sim([await P.methods.closeBegin().accountsPartial({ admin: planters[0].publicKey, config: K.CONFIG }).instruction()], [planters[0]]), 'NotAdmin');
expect('close_surety before closing', await h.sim([await P.methods.closeSurety().accountsPartial({ admin: admin.publicKey, config: K.CONFIG, agent: K.agent(0), surety: K.surety(0, sureties[0].publicKey), owner: sureties[0].publicKey }).instruction()], [admin]), 'NotClosing');
// every program account and every party's balance before closing
const parties = new Map();
const addParty = k => { if (k && !k.equals(feePayer.publicKey)) parties.set(k.toBase58(), k); };
[admin.publicKey, W.runner.publicKey, ...oldRunners.map(k => k.publicKey), W.dev.publicKey, operator.publicKey, ...planters.map(k => k.publicKey), ...sureties.map(k => k.publicKey)].forEach(addParty);
const progAccts = await h.conn.getProgramAccounts(h.PID, 'confirmed');
for (const a of progAccts) { // docket payers and round payers are parties too
  for (const kind of ['Docket', 'Round', 'docket', 'round']) { try { const d = h.program.coder.accounts.decode(kind, a.account.data); addParty(new PublicKey(d.payer)); break; } catch {} }
}
const inProgram = progAccts.reduce((s, a) => s + BigInt(a.account.lamports), 0n);
const before = new Map(); for (const [k, pk] of parties) before.set(k, await h.lam(pk));
expect('close_begin', await h.send([await P.methods.closeBegin().accountsPartial({ admin: admin.publicKey, config: K.CONFIG }).instruction()], [admin], { payer: feePayer }), 'ok');
// everything that must stop
const nr = big((await W.config()).nextRound);
expect('open_round while closing', await h.sim([await P.methods.openRound().accountsPartial({ payer: admin.publicKey, config: K.CONFIG, prevRound: K.round(nr - 1n), round: K.round(nr), slotHashes: K.SLOT_HASHES }).instruction()], [admin]), '*');
expect('plant while closing', await h.sim([await W.plantIx(planters[1], closingSeq, (await W.round(closingSeq)).plantCount, 0)], [planters[1]]), 'Closing');
expect('deposit while closing', await h.sim([await P.methods.deposit(new BN(1_000_000_000)).accountsPartial({ owner: sureties[1].publicKey, config: K.CONFIG, agent: K.agent(1), surety: K.surety(1, sureties[1].publicKey) }).instruction()], [sureties[1]]), '*');
expect('add_agent while closing', await h.sim([await P.methods.addAgent('late@1').accountsPartial({ admin: admin.publicKey, config: K.CONFIG, agent: K.agent((await W.config()).agentCount) }).instruction()], [admin]), 'Closing');
expect('spill while closing', await h.sim([await P.methods.spill().accountsPartial({ config: K.CONFIG, runnerFund: K.FUND, round: K.round(closingSeq) }).instruction()], [feePayer]), 'NoPending');
expect('close_config while accounts are open', await h.sim([await P.methods.closeConfig().accountsPartial({ admin: admin.publicKey, config: K.CONFIG, treasury: K.TREASURY, runnerFund: K.FUND, dev: W.dev.publicKey }).instruction()], [admin]), 'StillOpen');
// the open round settles at once: dockets, no runs, no transcript, no waiting
const rc = await W.round(closingSeq);
for (const id of rc.lineup.slice(0, rc.lineupLen)) {
  if (rc.plantCount === 0) break;
  expect('open_docket at once while closing', await h.send([await W.openDocketIx(closingSeq, id, feePayer)], [feePayer]), 'ok');
  expect('start_run while closing', await h.sim([await W.startRunIx(closingSeq, id, 0, Keypair.generate().publicKey)], [W.runner]), 'Closing');
  expect('settle at once while closing', await h.send([await W.settleIx(closingSeq, id, feePayer.publicKey, feePayer)], [feePayer]), 'ok');
}
if (rc.plantCount === 0) expect('close the empty round at once', await h.send([await W.closeEmptyIx(closingSeq)], [feePayer]), 'ok');
check((await W.round(closingSeq)).state === 2, 'the closing round did not settle');
// every round reaps at once; unclaimed bounties go to their planters (not to the fund)
const cnow = await W.config();
for (let s = 0n; s < big(cnow.nextRound); s++) {
  const ro = await h.fetch('round', K.round(s)); if (!ro) continue;
  const rem = []; let owedPlanters = 0n;
  for (let j = 0; j < ro.plantCount; j++) if (!((ro.claimedMask >> j) & 1)) { const pl = await h.F.plant.fetch(K.plant(s, j)); rem.push({ pubkey: K.plant(s, j), isWritable: true, isSigner: false }, { pubkey: pl.planter, isWritable: true, isSigner: false }); owedPlanters += big(ro.owed[j]); }
  const f0 = await h.F.runnerFund.fetch(K.FUND, 'confirmed');
  const r = await h.send([await P.methods.reapRound().accountsPartial({ config: K.CONFIG, round: K.round(s), payer: ro.payer, runnerFund: K.FUND }).remainingAccounts(rem).instruction()], [feePayer]);
  expect(`reap round ${s} at once`, r, 'ok');
  if (r.ok) { const e = evn(r, 'roundReaped'); check(big(e.toPlanters) === owedPlanters && big(e.toFund) === 0n && big((await h.F.runnerFund.fetch(K.FUND, 'confirmed')).reapedIn) === big(f0.reapedIn), () => `reap ${s}: to planters ${e.toPlanters}/${owedPlanters}, to fund ${e.toFund}`); }
}
// sureties out: each gets ⌊shares × owned / total⌋ of its agent, mid-unbond or not
const c2 = await W.config();
for (let id = 0; id < c2.agentCount; id++) {
  const owners = id === leagueId ? [operator] : sureties;
  for (const s of owners) {
    const su = await h.fetch('surety', K.surety(id, s.publicKey)); if (!su) continue;
    const a = await W.agent(id);
    const shares = su.shareEpoch === a.shareEpoch ? big(su.shares) : 0n;
    const want = M.lamportsFor(shares, big(a.shares), big(a.assets) - big(a.orphan));
    const r = await h.send([await P.methods.closeSurety().accountsPartial({ admin: admin.publicKey, config: K.CONFIG, agent: K.agent(id), surety: K.surety(id, s.publicKey), owner: s.publicKey }).instruction()], [admin], { payer: feePayer });
    expect(`close_surety agent ${id}`, r, 'ok');
    if (r.ok) check(big(evn(r, 'suretyMoved').lamports) === want, () => `close_surety ${id}: paid ${evn(r, 'suretyMoved').lamports}, model ${want}`);
  }
  const a = await W.agent(id);
  if (a.suretiesOpen !== undefined) check(a.suretiesOpen === 0, () => `agent ${id}: sureties_open ${a.suretiesOpen} after every surety closed`);
  if (big(a.shares) > 0n) bad(`agent ${id} still has ${a.shares} shares after every known surety closed`);
  const to = a.kind === 0 ? W.dev.publicKey : operator.publicKey;
  expect(`close_agent ${id} to a wrong recipient`, await h.sim([await P.methods.closeAgent().accountsPartial({ admin: admin.publicKey, config: K.CONFIG, agent: K.agent(id), recipient: planters[0].publicKey }).instruction()], [admin]), 'BadPayer');
  expect(`close_agent ${id}`, await h.send([await P.methods.closeAgent().accountsPartial({ admin: admin.publicKey, config: K.CONFIG, agent: K.agent(id), recipient: to }).instruction()], [admin], { payer: feePayer }), 'ok');
}
const c3 = await W.config();
check(c3.agentsLive === 0 && big(c3.roundsLive) === 0n, () => `agents_live ${c3.agentsLive}, rounds_live ${c3.roundsLive}`);
expect('close_config', await h.send([await P.methods.closeConfig().accountsPartial({ admin: admin.publicKey, config: K.CONFIG, treasury: K.TREASURY, runnerFund: K.FUND, dev: W.dev.publicKey }).instruction()], [admin], { payer: feePayer }), 'ok');
const left = await h.conn.getProgramAccounts(h.PID, 'confirmed');
check(left.length === 0, () => `${left.length} program accounts still open after close_config: ${left.slice(0, 5).map(a => a.pubkey.toBase58().slice(0, 8) + ':' + a.account.data.length).join(', ')}`);
let gained = 0n; for (const [k, pk] of parties) gained += await h.lam(pk) - before.get(k);
const stillHeld = left.reduce((s, a) => s + BigInt(a.account.lamports), 0n);
check(gained + stillHeld === inProgram, () => `closing: program held ${inProgram}, parties gained ${gained}, left in accounts ${stillHeld}`);
out.log.push(`closing: ${inProgram} lamports in ${progAccts.length} program accounts → parties gained ${gained}, ${left.length} accounts left (${stillHeld})`);
// after close_config: the upgrade authority could init again (wind-down/launch.mjs refuse it off chain)
expect('init_config after close_config (upgrade authority)', await h.sim([await P.methods.initConfig(W.runner.publicKey, W.dev.publicKey).accountsPartial({ admin: admin.publicKey, config: K.CONFIG, treasury: K.TREASURY, runnerFund: K.FUND, programData: K.PROGRAM_DATA }).instruction()], [admin]), 'ok');

out.finished = new Date().toISOString();
fs.mkdirSync(path.join(FUZZ, 'results'), { recursive: true });
fs.writeFileSync(path.join(FUZZ, `results/lifecycle-${SEED}.json`), JSON.stringify(out, (k, v) => typeof v === 'bigint' ? String(v) : v, 1));
console.log(`\nIA lifecycle fuzz · seed ${SEED} · ${out.cases} cases · ${out.checks} checks · unexpected ${out.unexpected.length}`);
for (const [k, v] of Object.entries(out.suites)) console.log(`  ${k}: ${v.cases} cases, ${v.checks} checks`);
for (const l of out.log) console.log('  ' + l);
process.exit(0);
