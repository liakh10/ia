// The IA world on the fuzz chain: config, roles, the $IA mint, lineup agents, and one call per instruction (each returns the harness
// result {ok, err, events}, never throws), so audit tests and the fuzzer drive the program the same way.
import fs from 'node:fs';
import { harness, Keypair, PublicKey, BN, spl, sha256, big, SCRATCH } from './core.mjs';

export const QUICK = {
  plantWindow: new BN(14), runWindow: new BN(40), minPlant: new BN(100_000_000), priceBps: 25, stepBps: 1000, maxPlants: 8,
  purseBps: 8300, runnerBps: 1200, treasuryBps: 500, bountyBps: 500, docketCapBps: 2500, maxRuns: 3, minDeposit: new BN(100_000_000),
  unbondDelay: new BN(60), runnerDrawCap: new BN(200_000_000), holderMin: new BN(1_000_000).mul(new BN(1_000_000)), nudgeEvery: 2,
  rotationDelay: new BN(60), claimWindow: new BN(30), runnerFundCap: new BN(5_000_000_000), leagueBond: new BN(1_000_000_000), leagueSeats: 0, exitGap: new BN(10),
};

export async function world(o = {}) {
  const h = harness();
  const { program: P, K, send, admin, F } = h;
  const W = { h, K, admin };
  await h.fund([admin], 500);
  const cfg0 = await h.fetch('config', K.CONFIG);
  if (!cfg0) {
    W.runner = Keypair.generate(); W.dev = Keypair.generate();
    await h.fund([W.runner], 50); await h.fund([W.dev], 1);
    const r = await send([await P.methods.initConfig(W.runner.publicKey, W.dev.publicKey).accountsPartial({ admin: admin.publicKey, config: K.CONFIG, treasury: K.TREASURY, runnerFund: K.FUND, programData: K.PROGRAM_DATA }).instruction()], [admin]);
    if (!r.ok) throw Error('init_config: ' + r.err);
    // the world's runner and dev keys live in the scratchpad so later processes on the same chain reuse them
    fs.writeFileSync(SCRATCH + '/world.json', JSON.stringify({ runner: [...W.runner.secretKey], dev: [...W.dev.secretKey] }));
  } else {
    const j = JSON.parse(fs.readFileSync(SCRATCH + '/world.json', 'utf8'));
    W.runner = Keypair.fromSecretKey(Uint8Array.from(j.runner)); W.dev = Keypair.fromSecretKey(Uint8Array.from(j.dev));
  }
  W.config = () => F.config.fetch(K.CONFIG, 'confirmed');
  W.setParams = async (p = {}) => send([await P.methods.setParams({ ...QUICK, ...p }).accountsPartial({ admin: admin.publicKey, config: K.CONFIG }).instruction()], [admin]);
  if (!cfg0) {
    const r = await W.setParams(o.params || {}); if (!r.ok) throw Error('set_params: ' + r.err);
    W.mint = await spl.createMint(h.conn, admin, admin.publicKey, null, 6);
    const r2 = await send([await P.methods.setRoles(null).accountsPartial({ admin: admin.publicKey, config: K.CONFIG, rootMint: W.mint }).instruction()], [admin]);
    if (!r2.ok) throw Error('set_roles: ' + r2.err);
    for (let i = 0; i < (o.agents ?? 3); i++) {
      const r3 = await send([await P.methods.addAgent(`model-${i}@2026-11`).accountsPartial({ admin: admin.publicKey, config: K.CONFIG, agent: K.agent(i) }).instruction()], [admin]);
      if (!r3.ok) throw Error('add_agent: ' + r3.err);
    }
  } else W.mint = (await W.config()).rootMint;

  W.kp = async (sol = 20) => { const k = Keypair.generate(); await h.fund([k], sol); return k; };
  W.activeIds = async () => { const c = await W.config(); const ids = []; for (let i = 0; i < c.agentCount; i++) { const a = await F.agent.fetch(K.agent(i), 'confirmed'); if (a.active) ids.push(i); } return ids; };
  W.waitGap = async () => {
    const c = await W.config(); const seq = big(c.nextRound); if (seq === 0n || c.params.exitGap === undefined) return;
    const prev = await h.fetch('round', K.round(seq - 1n)); if (prev && prev.state === 2) await h.waitSlot(big(prev.settleSlot) + big(c.params.exitGap));
  };
  W.openRound = async (ids, payer = admin, o = {}) => {
    if (!o.noWait) await W.waitGap();
    const c = await W.config(); const seq = big(c.nextRound);
    ids = ids || await W.activeIds();
    const ix = await P.methods.openRound().accountsPartial({ payer: payer.publicKey, config: K.CONFIG, prevRound: seq > 0n ? K.round(seq - 1n) : null, round: K.round(seq), slotHashes: K.SLOT_HASHES })
      .remainingAccounts(ids.map(i => ({ pubkey: K.agent(i), isWritable: true, isSigner: false }))).instruction();
    const r = await send([ix], [payer]); r.seq = seq; return r;
  };
  W.round = seq => F.round.fetch(K.round(seq), 'confirmed');
  const plantArgs = h.idl.instructions.find(i => i.name === 'plant').args.length;
  W.plantIx = (kp, seq, j, cls, o = {}) => P.methods.plant(cls, o.medium ?? 0, [...(o.hash || sha256(Buffer.from(`plant ${seq}.${j}`)))], new BN((o.target ?? 0).toString()), o.canary || PublicKey.default, ...(plantArgs > 5 ? [new BN((o.maxPrice ?? (1n << 64n) - 1n).toString())] : []))
    .accountsPartial({ planter: kp.publicKey, config: K.CONFIG, round: K.round(seq), plant: K.plant(seq, j), treasury: K.TREASURY, runnerFund: K.FUND, holderToken: o.holder || null }).instruction();
  W.plant = async (kp, seq, cls, o = {}) => { const r = await W.round(seq); return send([await W.plantIx(kp, seq, r.plantCount, cls, o)], [kp]); };
  W.commit = async (seq, kp = W.runner) => send([await P.methods.commitHarness([...sha256(Buffer.from('harness ' + seq))]).accountsPartial({ runner: kp.publicKey, config: K.CONFIG, round: K.round(seq) }).instruction()], [kp]);
  W.openDocketIx = (seq, id, payer = W.runner) => P.methods.openDocket().accountsPartial({ payer: payer.publicKey, config: K.CONFIG, round: K.round(seq), agent: K.agent(id), docket: K.docket(seq, id) }).instruction();
  W.openDocket = async (seq, id, payer = W.runner) => send([await W.openDocketIx(seq, id, payer)], [payer]);
  W.docket = (seq, id) => F.docket.fetch(K.docket(seq, id), 'confirmed');
  W.sessions = {};
  W.startRunIx = (seq, id, run, session, auth = W.runner) => P.methods.startRun(run, session).accountsPartial({ authority: auth.publicKey, config: K.CONFIG, round: K.round(seq), agent: K.agent(id), docket: K.docket(seq, id) }).instruction();
  W.postIx = (seq, id, root, auth = W.runner) => P.methods.postTranscript([...(root || sha256(Buffer.from(`transcript ${seq}.${id}`)))]).accountsPartial({ authority: auth.publicKey, config: K.CONFIG, agent: K.agent(id), docket: K.docket(seq, id) }).instruction();
  W.post = async (seq, id, root, auth = W.runner) => send([await W.postIx(seq, id, root, auth)], [auth]);
  W.withhold = async (seq, mask) => send([await P.methods.withholdPlants(mask).accountsPartial({ runner: W.runner.publicKey, config: K.CONFIG, round: K.round(seq) }).instruction()], [W.runner]);
  W.startRun = async (seq, id, run, session = Keypair.generate()) => {
    W.sessions[`${seq}.${id}.${run}`] = session;
    return send([await W.startRunIx(seq, id, run, session.publicKey)], [W.runner]);
  };
  W.actIx = (seq, id, run, action, extra = [], session) => P.methods.act(run, [...sha256(Buffer.from(`${seq}.${id}.${run}.${Math.random()}`))], action)
    .accountsPartial({ session: (session || W.sessions[`${seq}.${id}.${run}`]).publicKey, round: K.round(seq), docket: K.docket(seq, id) })
    .remainingAccounts(extra.map(k => ({ pubkey: k.publicKey, isSigner: true, isWritable: false }))).instruction();
  W.act = async (seq, id, run, action, extra = [], session) => { const s = session || W.sessions[`${seq}.${id}.${run}`]; return send([await W.actIx(seq, id, run, action, extra, s)], [s, ...extra], { payer: W.runner }); };
  W.settleIx = (seq, id, payer = W.runner.publicKey, caller = W.runner) => P.methods.settleDocket().accountsPartial({ caller: caller.publicKey, config: K.CONFIG, round: K.round(seq), agent: K.agent(id), docket: K.docket(seq, id), payer, runnerFund: K.FUND }).instruction();
  W.settle = async (seq, id, caller = W.runner, payer) => { const d = payer || (await h.fetch('docket', K.docket(seq, id)))?.payer || W.runner.publicKey; return send([await W.settleIx(seq, id, d, caller)], [caller]); };
  W.claim = async (kp, seq, j) => send([await P.methods.claimPlant().accountsPartial({ planter: kp.publicKey, round: K.round(seq), plant: K.plant(seq, j) }).instruction()], [kp]);
  W.closeEmptyIx = async seq => { const r = await W.round(seq); return P.methods.closeEmptyRound().accountsPartial({ config: K.CONFIG, round: K.round(seq) }).remainingAccounts(r.lineup.slice(0, r.lineupLen).map(i => ({ pubkey: K.agent(i), isWritable: true, isSigner: false }))).instruction(); };
  W.closeEmpty = async seq => send([await W.closeEmptyIx(seq)], [admin]);
  W.deposit = async (kp, id, l) => send([await P.methods.deposit(new BN(l.toString())).accountsPartial({ owner: kp.publicKey, config: K.CONFIG, agent: K.agent(id), surety: K.surety(id, kp.publicKey) }).instruction()], [kp]);
  W.unbond = async (kp, id, shares) => send([await P.methods.requestUnbond(new BN(shares.toString())).accountsPartial({ owner: kp.publicKey, config: K.CONFIG, agent: K.agent(id), surety: K.surety(id, kp.publicKey) }).instruction()], [kp]);
  W.withdraw = async (kp, id) => send([await P.methods.withdraw().accountsPartial({ owner: kp.publicKey, config: K.CONFIG, agent: K.agent(id), surety: K.surety(id, kp.publicKey) }).instruction()], [kp]);
  W.draw = async (l, kp = W.runner) => send([await P.methods.draw(new BN(l.toString())).accountsPartial({ runner: kp.publicKey, config: K.CONFIG, runnerFund: K.FUND, round: null }).instruction()], [kp]);
  W.agent = id => F.agent.fetch(K.agent(id), 'confirmed');
  W.pay = (source, to, amount) => ({ pay: { source, to: new PublicKey(to), amount: new BN(amount.toString()) } });
  W.flag = target => ({ flag: { target: new PublicKey(target) } });
  W.report = (operating, reserve, payments, total) => ({ report: { operating: new BN(operating.toString()), reserve: new BN(reserve.toString()), payments, total: new BN(total.toString()) } });
  /** settle every open docket of the newest round and close it, so the next test starts from a clean slate */
  W.drain = async () => {
    const c = await W.config(); if (big(c.nextRound) === 0n) return;
    const seq = big(c.nextRound) - 1n; let r = await W.round(seq);
    if (r.state === 2) return;
    await h.waitSlot(big(r.plantClose));
    if (r.plantCount === 0) { await W.closeEmpty(seq); return; }
    for (const id of r.lineup.slice(0, r.lineupLen)) if (!(await h.fetch('docket', K.docket(seq, id)))) await W.openDocket(seq, id);
    await h.waitSlot(big(r.runClose));
    for (const id of r.lineup.slice(0, r.lineupLen)) if (await h.fetch('docket', K.docket(seq, id))) { if (big(await h.slot()) <= big(r.runClose) + big(r.params.runWindow)) await W.post(seq, id); await W.settle(seq, id); }
  };
  /** pay every invoice of a docket from operating; returns {n, tot, op} for a true report */
  W.payInvoices = async (seq, id, run) => {
    const d = await W.docket(seq, id); let tot = 0n;
    for (let i = 0; i < d.invoiceCount; i++) { const r = await W.act(seq, id, run, W.pay(0, d.vendors[i], big(d.invoices[i]))); if (!r.ok) throw Error('pay: ' + r.err); tot += big(d.invoices[i]); }
    return { n: d.invoiceCount, tot, op: big(d.operating) - tot, purse: big(d.purseAtOpen) };
  };
  return W;
}
