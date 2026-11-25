/* Closing Internal Affairs, run with the dev wallet (the admin and the program's upgrade authority). One run, at any moment, no waiting
   on anyone; a second run says there is nothing to do:
     1. close_begin: no round, plant, run, deposit or registration from now on
     2. the newest round, if open: an empty one closes; otherwise every lineup docket is opened (if missing) and settled at once (the
        ledger as it stands: bounties for plants already taken, VOID for runs never started; the purse shares to the agents)
     3. every round reaped: every unclaimed bounty straight to its planter with its plant's rent, the round's rent to its payer
     4. every surety paid its share of the purse, and its account's rent
     5. every agent closed: what is left in it (fees no surety owned, rounding dust, rent) to the dev (house) or the operator (league)
     6. withdraw_fees and close_config: the treasury's fees, the runner fund and the rents to the dev
     7. the program closed through sol-ops (its rent back to the dev); --keep-program skips this
   Nobody's money stays in IA: every lamport goes to the planter, surety, operator or payer it belongs to, the rest to the dev.
   The runner key's own float is the runner's: `node _solkit/ops/sol-ops.mjs send <dev> all --keypair ~/.config/ia/runner.json`.

     node program/wind-down.mjs --keypair ~/keys/ia-dev.json
     node program/wind-down.mjs --dry --as <dev pubkey>       what it would do, nothing sent
     --url http://127.0.0.1:52899 for a local chain (test/closing.mjs) */
import { web3, flag, has, home, sol, t, guard, pickUrl, isLocal, connOf, loadKey, makeIa, makeSender, solOps, authorityOf } from './ops.mjs';
guard();
const { PublicKey } = web3;

const DRY = has('dry');
const url = await pickUrl();
const LOCAL = isLocal(url);
const conn = connOf(url);
const keyFile = home(flag('keypair', '~/keys/ia-dev.json'));
let signer = null, dev;
if (DRY) dev = new PublicKey(flag('as'));
else { try { signer = loadKey(keyFile); } catch { console.log('\n  could not read the dev key file (pass --keypair)\n'); process.exit(1); } dev = signer.publicKey; }
const ia = makeIa(conn, dev);
const { K, PID, m } = ia;
const start = DRY ? 0 : await conn.getBalance(dev, 'confirmed');
const send = makeSender(conn, dev, { local: LOCAL, dry: DRY, signer });
console.log(`\n  closing Internal Affairs · program ${PID.toBase58()}\n  dev ${dev.toBase58()} (${sol(start)} SOL)${DRY ? ' (simulation)' : ''}${LOCAL ? ' · local' : ''}`);
const run = async (ixs, label, units = 400_000) => { try { return await send(ixs, label, { units }); } catch (e) { console.log('  ' + e.message.split('\n')[0]); if (!DRY) process.exit(1); return null; } };

let c = await ia.fetch('config', K.config);
if (!c) console.log('  no config: the program state is already closed');
else {
  if (!c.admin.equals(dev)) { console.log(`  the admin is ${c.admin.toBase58()}, not this wallet: stopped\n`); process.exit(1); }
  const admin = { admin: dev, config: K.config };
  /* 1 */
  if (!c.closing) await run([await m.closeBegin().accountsPartial(admin).instruction()], 'close_begin: no new round, plant, run or deposit');
  else console.log('  closing already begun');
  const closing = c.closing || !DRY; // in a dry run the windows still apply: the steps below are simulated as far as they can be
  /* 2: the newest round, if it is not settled */
  const rounds = (await ia.all('round')).sort((a, b) => Number(a.account.seq) - Number(b.account.seq));
  for (const { account: r } of rounds) {
    if (r.state === 2) continue;
    const seq = Number(r.seq), ids = r.lineup.slice(0, r.lineupLen);
    const lineupAccs = ids.map(id => ({ pubkey: K.agent(id), isWritable: true, isSigner: false }));
    if (r.plantCount === 0) { await run([await m.closeEmptyRound().accountsPartial({ config: K.config, round: K.round(seq) }).remainingAccounts(lineupAccs).instruction()], `round ${seq}: closed (no plant)`); continue; }
    if (!closing) { console.log(`  round ${seq}: its dockets would be opened and settled at once`); continue; }
    for (const [pos, id] of ids.entries()) {
      if (r.settledMask & (1 << pos)) continue;
      let d = await ia.fetch('docket', K.docket(seq, id));
      if (!d) { await run([await m.openDocket().accountsPartial({ payer: dev, config: K.config, round: K.round(seq), agent: K.agent(id), docket: K.docket(seq, id) }).instruction()], `round ${seq}: docket of agent ${id} opened`); d = await ia.fetch('docket', K.docket(seq, id)); }
      await run([await m.settleDocket().accountsPartial({ caller: dev, config: K.config, round: K.round(seq), agent: K.agent(id), docket: K.docket(seq, id), payer: d ? d.payer : dev, runnerFund: K.fund }).instruction()], `round ${seq}: agent ${id} settled (its ledger as it stands)`);
    }
  }
  /* 3: every round reaped (unclaimed bounties to their planters while closing) */
  for (const { account: r0 } of (await ia.all('round')).sort((a, b) => Number(a.account.seq) - Number(b.account.seq))) {
    const seq = Number(r0.seq);
    const r = await ia.fetch('round', K.round(seq));
    if (!r || (r.state !== 2 && !DRY)) continue;
    const pairs = [];
    for (let j = 0; j < r.plantCount; j++) {
      if (r.claimedMask & (1 << j)) continue;
      const p = await ia.fetch('plant', K.plant(seq, j));
      if (p) pairs.push({ pubkey: K.plant(seq, j), isWritable: true, isSigner: false }, { pubkey: p.planter, isWritable: true, isSigner: false });
    }
    const owed = r.owed.slice(0, r.plantCount).reduce((a, b) => a + BigInt(b.toString()), 0n);
    await run([await m.reapRound().accountsPartial({ config: K.config, round: K.round(seq), payer: r.payer, runnerFund: K.fund }).remainingAccounts(pairs).instruction()], `round ${seq} reaped: ${pairs.length / 2} plant(s) and ${sol(owed)} SOL of bounties to their planters, its rent to its payer`, 1_000_000);
  }
  /* 4: sureties */
  for (const s of await ia.all('surety')) {
    await run([await m.closeSurety().accountsPartial({ ...admin, agent: K.agent(s.account.agent), surety: s.publicKey, owner: s.account.owner }).instruction()], `surety ${s.account.owner.toBase58().slice(0, 8)}… of agent ${s.account.agent} paid out`);
  }
  /* 5: agents */
  for (const a of await ia.all('agent')) {
    const to = a.account.kind === 0 ? c.dev : a.account.operator;
    await run([await m.closeAgent().accountsPartial({ ...admin, agent: a.publicKey, recipient: to }).instruction()], `agent ${a.account.id} closed (${sol(await conn.getBalance(a.publicKey))} SOL to ${a.account.kind === 0 ? 'the dev' : 'its operator'})`);
  }
  /* 6 */
  await run([await m.withdrawFees().accountsPartial({ ...admin, treasury: K.treasury, dev: c.dev }).instruction()], 'withdraw_fees: the treasury to the dev');
  await run([await m.closeConfig().accountsPartial({ ...admin, treasury: K.treasury, runnerFund: K.fund, dev: c.dev }).instruction()], 'close_config: config, treasury and runner fund to the dev');
}
if (!DRY) {
  const left = await conn.getProgramAccounts(PID).catch(() => []);
  console.log(left.length ? `  WARNING: the program still owns ${left.length} account(s)` : '  the program owns no account');
}

/* 7 */
if (!has('keep-program')) {
  const auth = await authorityOf(conn, PID);
  if (auth === undefined) console.log('  program: already closed');
  else if (DRY) console.log('  program: would be closed through sol-ops (its rent back to the dev)');
  else {
    console.log(`  ${t()}  sol-ops close ia…`);
    const r = solOps('close', keyFile, url);
    console.log(r.tail);
  }
}
if (!DRY) console.log(`\n  done: ${sol((await conn.getBalance(dev, 'confirmed')) - start)} SOL back to the dev in this run\n`);
process.exit(0);
