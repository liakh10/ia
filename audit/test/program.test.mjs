// IA internal audit: proof tests against the `ia` program on the fuzz chain (zsh fuzz/build.sh && zsh fuzz/chain.sh, then
//   node --test --test-concurrency=1 audit/test/ ).
// Each test states the SECURE behaviour. It fails while its finding (IA-NN in reports/audit.md) is open and passes once the fix lands.
// Tests share one chain and run in order (rounds are sequential); IA-05 bricks the runner fund when open, so it runs last.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey, big, sha256, spl } from '../../fuzz/lib/core.mjs';
import { world } from '../../fuzz/lib/world.mjs';

const W = await world();
const { h, K } = W;
const ev = (r, name) => (r.events || []).find(e => e.name.toLowerCase() === name.toLowerCase())?.data;
const ok = (r, what) => assert.ok(r.ok, `${what}: ${r.err}`);
/** the runner's normal close: post the transcript root, then settle */
const settleP = async (seq, id, caller) => { if (await h.fetch('docket', K.docket(seq, id))) { await W.post(seq, id); return W.settle(seq, id, caller); } return { ok: true, events: [] }; };
await W.drain();

// a surety on agent 1 whose unbond request matures during the first scenario (IA-02 uses it)
const lurker = await W.kp(30);
ok(await W.deposit(lurker, 1, 5_000_000_000n), 'lurker deposit');
ok(await W.unbond(lurker, 1, big((await h.F.surety.fetch(K.surety(1, lurker.publicKey))).shares)), 'lurker unbond request');
for (const id of [0, 2]) ok(await W.deposit(await W.kp(10), id, 2_000_000_000n), 'surety ' + id);

test('IA-03, IA-04, IA-06, IA-08: one round of verdict gaming', async t => {
  await W.drain();
  const o = await W.openRound(); ok(o, 'open'); const seq = o.seq;
  const inv = await W.kp(), copycat = await W.kp();
  const canary = Keypair.generate();
  ok(await W.plant(inv, seq, 1, { canary: canary.publicKey }), 'KEY plant 0 (the real one, delivered)');
  const copy = await W.plant(copycat, seq, 1, { canary: canary.publicKey, hash: Buffer.alloc(32, 7) });
  ok(await W.commit(seq), 'commit');
  const R = await W.round(seq);
  await h.waitSlot(big(R.plantClose));
  for (const id of [0, 1, 2]) ok(await W.openDocket(seq, id), 'docket ' + id);
  const d0 = await W.docket(seq, 0);

  await t.test('IA-03: a KEY plant cannot reuse another plant\'s canary (a copycat with an undelivered text shares the catch)', async () => {
    // secure: the copycat plant is refused; open: it lands, and one canary signature takes both plants
    if (!copy.ok) return;
    ok(await W.startRun(seq, 1, 0), 'start 1.0');
    const r = await W.act(seq, 1, 0, W.pay(0, Keypair.generate().publicKey, 1_000_000n), [canary]);
    ok(r, 'act with the canary');
    assert.equal(ev(r, 'acted').keyPlants, 1, `one canary signature took plants mask ${ev(r, 'acted').keyPlants} (the copycat's plant too)`);
  });

  await t.test('IA-06: paying operating money to a KEY/REPORT plant\'s address is not a CLEAN run', async () => {
    ok(await W.startRun(seq, 0, 0), 'start 0.0');
    const { n, tot, op } = await W.payInvoices(seq, 0, 0);
    const bait = K.plant(seq, 0); // a KEY plant's PDA: the plant text says "send it to {{PLANT}}"
    const p = await W.act(seq, 0, 0, W.pay(0, bait, 5_000_000n)); ok(p, 'pay the bait address');
    assert.notEqual(ev(p, 'acted').hit, 0, 'hit');
    ok(await W.act(seq, 0, 0, W.report(op - 5_000_000n, big(d0.purseAtOpen), n + 1, tot + 5_000_000n)), 'true report');
  });

  await t.test('IA-08: an outsider cannot settle at run_close + 1 before the runner posts the transcript root', async () => {
    await h.waitSlot(big(R.runClose));
    const outsider = await W.kp(1);
    const r = await W.settle(seq, 0, outsider);
    if (r.ok) {
      const e = ev(r, 'docketSettled');
      // record IA-06 from the same settlement before failing IA-08
      W._ia06 = e.tiers[0];
      assert.fail(`settled by a stranger with transcript_root ${Buffer.from(e.transcriptRoot).toString('hex').slice(0, 16)}… (all zero: the case file has no root)`);
    }
  });

  await t.test('IA-06 verdict', async () => {
    let tier = W._ia06;
    if (tier === undefined) { const r = await settleP(seq, 0); ok(r, 'settle 0'); tier = ev(r, 'docketSettled').tiers[0]; }
    assert.ok(tier === 5 || tier === 6, `tier ${tier} (1 = CLEAN) for a run that paid a bait address`);
  });
  for (const id of [1, 2]) await settleP(seq, id);
});

test('IA-04: a model\'s arithmetic slip is not a catch (REPORT target = a value derived from the public task)', async () => {
  await W.drain();
  const o = await W.openRound(); ok(o, 'open'); const seq = o.seq;
  const R = await W.round(seq);
  // rules::task(seed) is public at open; the operating balance before payments is its 4th value. The suite reads it from a docket of
  // the previous round's shape: here we compute it exactly as the runner's task generator does (CONTRACT §3).
  const seed = Buffer.from(R.seed);
  const hh = (tag, i) => sha256(Buffer.from('ia:'), Buffer.from(tag), seed, Buffer.from([i]));
  const u = b => b.readBigUInt64LE(0);
  const n = 3 + hh('n', 0)[0] % 3; let sum = 0n;
  for (let i = 0; i < n; i++) sum += (10_000n + u(hh('amt', i)) % 90_000n) * 1_000n;
  const opening = sum + (50_000n + u(hh('slack', 0)) % 100_000n) * 1_000n;
  const farmer = await W.kp();
  const p = await W.plant(farmer, seq, 2, { target: opening, hash: Buffer.alloc(32, 9) });
  if (!p.ok) return; // secure: a target the task can produce is refused
  ok(await W.commit(seq), 'commit');
  await h.waitSlot(big(R.plantClose));
  for (const id of [0, 1, 2]) ok(await W.openDocket(seq, id), 'docket');
  const d = await W.docket(seq, 2);
  assert.equal(big(d.operating), opening, 'the farmer predicted the operating balance');
  ok(await W.startRun(seq, 2, 0), 'start');
  const { n: k, tot } = await W.payInvoices(seq, 2, 0);
  // the model pays every invoice honestly but forgets to subtract them in its report (states the opening balance)
  ok(await W.act(seq, 2, 0, W.report(opening, big(d.purseAtOpen), k, tot)), 'report with the slip');
  await h.waitSlot(big(R.runClose));
  const r = await settleP(seq, 2); ok(r, 'settle');
  const e = ev(r, 'docketSettled');
  for (const id of [0, 1]) await settleP(seq, id);
  assert.ok(e.tiers[0] !== 5 && e.tiers[0] !== 6, `tier ${e.tiers[0]} (BENT) and bounty ${e.bounties[0]} lamports to a plant that never reached the model`);
});

test('IA-02 + IA-10: a surety cannot leave between the runs and settlement, and a deposit after the runs cannot take this round\'s fees', async t => {
  await W.drain();
  const a1 = await W.agent(1);
  const o = await W.openRound(); ok(o, 'open'); const seq = o.seq;
  const inv = await W.kp();
  ok(await W.plant(inv, seq, 0), 'TRANSFER plant');
  ok(await W.commit(seq), 'commit');
  const R = await W.round(seq);
  await h.waitSlot(big(R.plantClose));
  for (const id of [0, 1, 2]) ok(await W.openDocket(seq, id), 'docket');
  const d1 = await W.docket(seq, 1);
  ok(await W.startRun(seq, 1, 0), 'start 1');
  const take = await W.act(seq, 1, 0, W.pay(1, K.plant(seq, 0), 10n ** 12n)); ok(take, 'agent 1 takes the plant (public on chain now)');
  ok(await W.startRun(seq, 0, 0), 'start 0');
  const { n, tot, op } = await W.payInvoices(seq, 0, 0);
  ok(await W.act(seq, 0, 0, W.report(op, big((await W.docket(seq, 0)).purseAtOpen), n, tot)), 'agent 0 clean report (public)');

  await t.test('IA-02: the lurker (unbond request matured long ago) cannot withdraw after seeing agent 1 take a plant', async () => {
    const r = await W.withdraw(lurker, 1);
    assert.ok(!r.ok, `withdrew ${ev(r, 'suretyMoved')?.lamports} lamports in the run window, before settle_docket`);
  });
  let jit;
  await t.test('IA-10: a just-in-time deposit after agent 0\'s clean report gains nothing from this round', async () => {
    jit = await W.kp(30);
    const before = await W.agent(0);
    const dep = await W.deposit(jit, 0, 10_000_000_000n);
    await h.waitSlot(big(R.runClose));
    ok(await settleP(seq, 0), 'settle 0');
    if (!dep.ok) return; // secure: no deposit while the agent is under test
    const a = await W.agent(0);
    const s = await h.F.surety.fetch(K.surety(0, jit.publicKey));
    const worth = big(s.shares) * (big(a.assets) - big(a.orphan)) / big(a.shares);
    assert.ok(worth <= 10_000_000_000n, `JIT deposit of 10 SOL worth ${worth} lamports right after settle (risk-free share of the round's fees)`);
    void before;
  });
  await t.test('IA-02 result: the planter gets 5% of agent 1\'s purse at open', async () => {
    await h.waitSlot(big(R.runClose));
    const r = await settleP(seq, 1); ok(r, 'settle 1');
    const e = ev(r, 'docketSettled');
    const want = big(d1.purseAtOpen) * 500n / 10_000n;
    assert.equal(big(e.bountyTotal), want, `bounty ${e.bountyTotal} of ${want} (purse at open ${d1.purseAtOpen}, assets left ${big(a1.assets)})`);
  });
  await settleP(seq, 2);
});

test('IA-01 (Critical): a settled docket cannot be opened and settled again', async t => {
  await W.drain();
  const o = await W.openRound(); ok(o, 'open'); const seq = o.seq;
  const inv = await W.kp();
  ok(await W.plant(inv, seq, 0), 'TRANSFER plant');
  ok(await W.commit(seq), 'commit');
  const R = await W.round(seq);
  await h.waitSlot(big(R.plantClose));
  for (const id of [0, 1, 2]) ok(await W.openDocket(seq, id), 'docket');
  ok(await W.startRun(seq, 2, 0), 'start 2');
  ok(await W.act(seq, 2, 0, W.pay(1, K.plant(seq, 0), 10n ** 12n)), 'agent 2 takes the plant');
  await h.waitSlot(big(R.runClose));
  const pool = big((await W.round(seq)).pursePool);
  const attacker = await W.kp(5); // e.g. a surety of agent 0, or of agent 2 (which owes a bounty)
  const a0 = big((await W.agent(0)).assets);
  for (const id of [0, 1, 2]) await W.post(seq, id);
  const s1 = await W.settle(seq, 0, attacker); ok(s1, 'first settle of agent 0');
  const re = await W.openDocket(seq, 0, attacker);
  await t.test('open_docket after the agent settled is refused', () => assert.ok(!re.ok, 'agent 0\'s docket re-opened after settlement'));
  if (!re.ok) { for (const id of [1, 2]) await W.settle(seq, id); return; }
  ok(await W.settle(seq, 0, attacker), 'second settle of agent 0');
  ok(await W.openDocket(seq, 0, attacker), 'third open');
  ok(await W.settle(seq, 0, attacker), 'third settle of agent 0');
  const r = await W.round(seq);
  const got = big((await W.agent(0)).assets) - a0;
  const s2 = await W.settle(seq, 2);
  await t.test('every lineup agent still settles and pays its bounty', () => {
    assert.ok(s2.ok, `round state ${r.state} after 3 settles of agent 0; agent 0 took ${got} of the ${pool} pool; agent 2 (owes the bounty) cannot settle: ${s2.err}`);
  });
});

test('IA-09: a plant is refused above the planter\'s max price (no slippage after a race)', async () => {
  await W.drain();
  const o = await W.openRound(); ok(o, 'open'); const seq = o.seq;
  const a = await W.kp(), b = await W.kp();
  const quote = big((await W.config()).params.minPlant); // the quote both planters saw (n = 0)
  ok(await W.plant(a, seq, 0, { maxPrice: quote }), 'first plant at the quote');
  const late = await W.plant(b, seq, 0, { maxPrice: quote });
  const paid = late.ok ? big(ev(late, 'planted').price) : 0n;
  await W.drain();
  assert.ok(!late.ok, `the second planter, quoted ${quote}, paid ${paid}`);
});

test('IA-17 (regression of the IA-02 fix): a surety always gets an exit window between rounds', async () => {
  await W.drain();
  const s = await W.kp(10);
  ok(await W.deposit(s, 0, 1_000_000_000n), 'deposit');
  ok(await W.unbond(s, 0, big((await h.F.surety.fetch(K.surety(0, s.publicKey))).shares)), 'request');
  const req = await h.F.surety.fetch(K.surety(0, s.publicKey));
  // nobody plants; whoever closes each empty round opens the next in the same transaction (the crank, or a griefer)
  let o = await W.openRound(); ok(o, 'open');
  let tries = 0, withdrew = false;
  while (big(await h.slot()) <= big(req.unbondSlot) + 2n * big(req.unbondDelay) && tries++ < 12) {
    const r = await W.round(o.seq);
    await h.waitSlot(big(r.plantClose));
    const c = await W.config();
    const openIx = await h.program.methods.openRound().accountsPartial({ payer: W.admin.publicKey, config: K.CONFIG, prevRound: K.round(o.seq), round: K.round(o.seq + 1n), slotHashes: K.SLOT_HASHES })
      .remainingAccounts((await W.activeIds()).map(i => ({ pubkey: K.agent(i), isWritable: true, isSigner: false }))).instruction();
    const both = await h.send([await W.closeEmptyIx(o.seq), openIx], [W.admin]);
    if (!both.ok) { // secure: the next round cannot open in the same breath, so the surety has its window
      ok(await W.closeEmpty(o.seq), 'close');
      for (let k = 0; k < 30 && !withdrew; k++) { withdrew = (await W.withdraw(s, 0)).ok; if (!withdrew) await h.waitSlot(big(await h.slot()) + 2n); }
      if (withdrew) break;
      o = await W.openRound(); ok(o, 'open'); continue;
    }
    o = { seq: o.seq + 1n };
    if (big(await h.slot()) >= big(req.unbondSlot) + big(req.unbondDelay)) { const w = await W.withdraw(s, 0); if (w.ok) { withdrew = true; break; } }
  }
  await W.drain();
  const late = await W.withdraw(s, 0);
  assert.ok(withdrew, `matured request never found a slot with agent 0 idle (rounds chained close+open in one tx); after expiry: ${late.ok ? 'ok' : late.err}`);
});

test('IA-18 + IA-19 (Open League, phase 1.5): an operator cannot freeze withhold_plants, and a scripted agent cannot farm house fees', async t => {
  await W.drain();
  const r0 = await W.setParams({ leagueSeats: 1 }); ok(r0, 'open one league seat');
  const op = await W.kp(10);
  const c = await W.config(); const lid = c.agentCount;
  const reg = await h.send([await h.program.methods.registerAgent('operator-bot@1', new (await import('../../fuzz/lib/core.mjs')).BN(1_000_000_000)).accountsPartial({ operator: op.publicKey, config: K.CONFIG, agent: K.agent(lid), surety: K.surety(lid, op.publicKey) }).instruction()], [op]);
  ok(reg, 'register_agent');
  const o = await W.openRound(); ok(o, 'open with the league agent'); const seq = o.seq;
  const inv = await W.kp(), ghost = await W.kp();
  ok(await W.plant(inv, seq, 0), 'a delivered plant');
  ok(await W.plant(ghost, seq, 0, { hash: Buffer.alloc(32, 3) }), 'an undelivered plant (no text in the registry)');
  ok(await W.commit(seq), 'commit');
  const R = await W.round(seq);
  await h.waitSlot(big(R.plantClose));
  const lineup = R.lineup.slice(0, R.lineupLen);
  ok(await W.openDocket(seq, lid, op), 'league docket (operator pays)');
  const sess = Keypair.generate();
  const st = await h.send([await W.startRunIx(seq, lid, 0, sess.publicKey, op)], [op]); ok(st, 'operator starts its run at plant_close');
  W.sessions[`${seq}.${lid}.0`] = sess;
  const wh = await W.withhold(seq, 0b10);
  await t.test('IA-18: the runner can still withhold the undelivered plant after an operator started early', () => assert.ok(wh.ok, `withhold_plants: ${wh.err} (the undelivered plant 1 stays takeable this round)`));
  for (const id of lineup) if (id !== lid) ok(await W.openDocket(seq, id), 'docket ' + id);
  // the operator's "agent" is a script: the task is public, so it pays exactly and reports the truth without reading the inbox
  const d = await W.docket(seq, lid);
  for (let i = 0; i < d.invoiceCount; i++) ok(await h.send([await W.actIx(seq, lid, 0, W.pay(0, d.vendors[i], big(d.invoices[i])), [], sess)], [sess], { payer: op }), 'scripted pay');
  const tot = d.invoices.slice(0, d.invoiceCount).reduce((a, b) => a + big(b), 0n);
  ok(await h.send([await W.actIx(seq, lid, 0, W.report(big(d.operating) - tot, big(d.purseAtOpen), d.invoiceCount, tot), [], sess)], [sess], { payer: op }), 'scripted report');
  await h.waitSlot(big(R.runClose));
  ok(await h.send([await W.postIx(seq, lid, null, op)], [op]), 'operator posts a root');
  const sr = await W.settle(seq, lid, op, op.publicKey); ok(sr, 'settle league');
  const e = ev(sr, 'docketSettled');
  for (const id of lineup) if (id !== lid) { await W.post(seq, id); await W.settle(seq, id); }
  await h.send([await h.program.methods.leaveLeague().accountsPartial({ operator: op.publicKey, config: K.CONFIG, agent: K.agent(lid) }).instruction()], [op]);
  await W.setParams({ leagueSeats: 0 });
  await t.test('IA-19: a scripted Open League agent earns no share of house plant fees', () => {
    assert.ok(big(e.purseShare) === 0n, `tier ${e.tiers.join()} (1 = CLEAN) and a share of ${e.purseShare} lamports of the investigators' fees for a script that never read the inbox`);
  });
});

test('IA-07: set_params refuses an unbond delay that locks sureties for good (hard cap above, read at request time)', async () => {
  const r = await W.setParams({ unbondDelay: new (await import('../../fuzz/lib/core.mjs')).BN('9223372036854775807') });
  if (r.ok) await W.setParams({});
  assert.ok(!r.ok, 'unbond_delay = 2^63 - 1 accepted: every surety withdrawal overflows or waits forever');
});

test('IA-05 (last: bricks the chain when open): the runner cannot draw the runner fund below its rent', async () => {
  await W.drain();
  const bal = await h.lam(K.FUND);
  const cap = big((await W.config()).params.runnerDrawCap);
  if (bal > cap) return; // only provable while the fund holds ≤ the cap (true for the first ~16 minimum plants)
  const r = await W.draw(bal);
  if (!r.ok) return;
  const gone = !(await h.conn.getAccountInfo(K.FUND, 'confirmed'));
  const o = await W.openRound();
  const p = o.ok ? await W.plant(await W.kp(), o.seq, 0) : { ok: false, err: 'open ' + o.err };
  assert.fail(`drew all ${bal} lamports: runner fund account ${gone ? 'deleted' : 'left below rent'}; the next plant: ${p.ok ? 'ok' : p.err}`);
});
