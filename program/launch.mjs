/* Launch day for Internal Affairs, run with the dev wallet (the program's upgrade authority, the config's admin, the wallet withdraw_fees
   pays, the creator of the root coin). In one run, every step skipped when already done (a second run finishes a half-done launch and
   changes nothing on a finished one):
     0. crons parked in vercel.crons.json go back into vercel.json (restoreCrons), pushed and deployed before anything else
     1. `ia` deployed through sol-ops when missing (from a staging folder), then init_config(runner, dev) with the runner's PUBLIC key
        (read from ~/.config/ia/runner.json, made by `node runner/cli.mjs keygen`; or --runner). The launch parameters are in the program
        (plant window 3,000 slots, run window 1,500, min plant 0.1 SOL, 83/12/5, bounty 5% capped 25%, unbond 9,000, rotation 216,000,
        claim window 1,512,000, Open League closed). It STOPS if a config already names another runner (rotation = propose_runner,
        which waits the delay)
     2. the coin's address first: a mint key ending in "pump" (made once into --mint-key, or taken from there), or the owner's own CA
        (in config.js or --ca): CA and PROGRAM into config.js, coin.json written, pushed, the live site checked until it shows the CA
     3. the root coin on pump.fun (NAME and TICKER from config.js): a plain create_v2 from this wallet, 100% of its creator fees to this
        wallet, no fee sharing, no buy unless --buy <SOL>; with the owner's own CA the script waits for his create and checks its creator;
        START (the create's block time) into config.js
     4. set_roles(root mint): a planter holding 1,000,000 $IA pays no treasury share
     5. the lineup: program/lineup.json's exact model versions as agents 0, 1, … (add_agent); an agent already on chain must carry the
        same string (else STOP: a change is set_agent, which waits the rotation delay)
     6. the site's lookup table (the program, config, treasury, runner fund, every agent, the SlotHashes sysvar, the system, compute
        budget and token programs, the runner, the root mint) at a free slot about 20 back, its address into config.js ALT
     7. the runner's float topped up to --runner-float SOL (default 0.1: docket rent, which comes back at each settlement, and act fees;
        later refilled by its public draws from the runner fund)
     8. LIVE: true pushed; a commit is pushed even when nothing changed, so production always redeploys
   Nothing optional is spent: no dev buy, no plant, no surety and no purse money from the dev.

     node program/launch.mjs --keypair ~/keys/ia-dev.json [--mint-key ~/keys/ia-mint.json] [--ca <CA>] [--buy 0]
     node program/launch.mjs --dry --as <dev pubkey>        what it would do, nothing sent
     --url http://127.0.0.1:52899 [--config <file>] [--host http://127.0.0.1:<port>] [--runner <pubkey>] is a rehearsal on a local
     clone: nothing pushed, Vercel untouched.
   Needs `npm ci` in program/ once (pump.fun's SDK for the create; run-launch.sh does it when node_modules is missing). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { web3, anchor, here, SITE, flag, has, home, sleep, t, sol, guard, pickUrl, isLocal, connOf, loadKey, pubOf, makeIa, makeSender, solOps, authorityOf } from './ops.mjs';
guard();
const require = createRequire(import.meta.url);
const P = require('@pump-fun/pump-sdk');
const BN = require('bn.js');
const { Keypair, PublicKey, SystemProgram, ComputeBudgetProgram, AddressLookupTableProgram, LAMPORTS_PER_SOL } = web3;

const DRY = has('dry');
const url = await pickUrl();
const conn = connOf(url);
const LOCAL = isLocal(url);
const NO_PUSH = LOCAL || has('no-push');
const cfgFile = path.resolve(home(flag('config', path.join(SITE, 'config.js'))));
const coinFile = path.join(path.dirname(cfgFile), 'coin.json');
const readCfg = () => fs.readFileSync(cfgFile, 'utf8');
const field = (k, text = readCfg()) => (new RegExp(`\\b${k}\\s*:\\s*"([^"]*)"`).exec(text) || [])[1] || '';
// config.js is `window.IA = { … };`: a field that is not there yet goes in before the object's closing brace
const insert = (b, k, lit) => { const i = b.lastIndexOf('}'); return b.slice(0, i).replace(/\s*$/, '') + `, ${k}: ${lit} ` + b.slice(i); };
const setField = (k, v) => { const b = readCfg(); const re = new RegExp(`(\\b${k}\\s*:\\s*")[^"]*(")`); const a = re.test(b) ? b.replace(re, `$1${v}$2`) : insert(b, k, JSON.stringify(v)); if (a !== b) fs.writeFileSync(cfgFile, a); return a !== b; };
const setBool = (k, v) => { const b = readCfg(); const re = new RegExp(`(\\b${k}\\s*:\\s*)(true|false)`); const a = re.test(b) ? b.replace(re, `$1${v}`) : insert(b, k, String(v)); if (a !== b) fs.writeFileSync(cfgFile, a); return a !== b; };
const NAME = field('NAME') || 'Internal Affairs', TICKER = field('TICKER') || 'IA';
const SITE_URL = `https://${(field('DOMAIN') || 'ia-sol.vercel.app').replace(/^https?:\/\//, '')}`;
const BUY = Math.round(Number(flag('buy', '0')) * LAMPORTS_PER_SOL);
const sdk = new P.PumpSdk();
const curveOf = m => P.bondingCurvePda(new PublicKey(m));

let signer = null, dev;
const devFile = home(flag('keypair', '~/keys/ia-dev.json'));
if (DRY) dev = new PublicKey(flag('as'));
else { try { signer = loadKey(devFile); } catch { console.log('\n  could not read the dev key file (pass --keypair)\n'); process.exit(1); } dev = signer.publicKey; }

// step 0: crons parked until launch go back into vercel.json, pushed and deployed before anything else
{
  const { restoreCrons } = await import(new URL('../../_solkit/ops/keeper-cron.mjs', import.meta.url));
  await restoreCrons(new URL('..', import.meta.url));
}

const ia = makeIa(conn, dev);
const { K, PID, m } = ia;
const start = DRY ? 0 : await conn.getBalance(dev, 'confirmed');
console.log(`\n  ${NAME} · program ${PID.toBase58()}\n  dev ${dev.toBase58()} (${sol(start)} SOL)${DRY ? ' (simulation)' : ''}${LOCAL ? ' · local rehearsal' : ''}`);
const spentSoFar = async () => (DRY ? '' : ` · dev spent ${sol(start - (await conn.getBalance(dev, 'confirmed')))} SOL so far`);
const sendRaw = makeSender(conn, dev, { local: LOCAL, dry: DRY, signer, spent: spentSoFar });
const send = async (...a) => { try { return await sendRaw(...a); } catch (e) { console.log('  ' + e.message); process.exit(1); } };
const git = (...a) => spawnSync('git', ['-C', SITE, ...a], { encoding: 'utf8' });
function push(files, message) {
  if (NO_PUSH || cfgFile !== path.join(SITE, 'config.js')) { console.log(`  (not pushed: ${LOCAL ? 'local rehearsal' : '--no-push or a scratch config'})`); return; }
  git('add', '--', ...files);
  const dirty = git('diff', '--cached', '--name-only', '--', ...files).stdout.trim();
  // an empty commit when nothing changed: production redeploys
  const c = dirty ? git('commit', '-m', message, '--', ...files) : git('commit', '--allow-empty', '-m', message);
  const p = git('push', 'origin', 'HEAD');
  console.log(c.status === 0 && p.status === 0 ? `  pushed: ${message}` : `  git: ${(c.stderr + p.stderr).trim().slice(0, 200)}`);
}

/* 1. the program and init_config */
const RUNNER = flag('runner', '') ? new PublicKey(flag('runner')) : pubOf('~/.config/ia/runner.json');
if (!RUNNER) { console.log('  no runner key: run node runner/cli.mjs keygen (or pass --runner <pubkey>)\n'); process.exit(1); }
console.log(`  runner ${RUNNER.toBase58()}`);
{
  let auth = await authorityOf(conn, PID);
  if (auth === 'closed') { console.log('  this program id was closed for good: it cannot be deployed again (a new program id is needed)\n'); process.exit(1); }
  if (auth === undefined) {
    const so = fs.statSync(path.join(here, 'target/deploy/ia.so')).size;
    const rent = await conn.getMinimumBalanceForRentExemption(so + 45) + await conn.getMinimumBalanceForRentExemption(36);
    if (DRY) console.log(`  ia: would be deployed by sol-ops (${(so / 1024).toFixed(0)} KB, ${sol(rent)} SOL rent)`);
    else {
      console.log(`  ${t()}  sol-ops deploy ia (${(so / 1024).toFixed(0)} KB, ${sol(rent)} SOL rent)…`);
      const r = solOps('deploy', devFile, url);
      console.log(r.tail);
      auth = await authorityOf(conn, PID);
      if (r.status !== 0 || auth === undefined) { console.log('  the deploy did not finish: run the same command again (it resumes)\n'); process.exit(1); }
      // a program becomes callable from the slot after its deployment
      const pd = await conn.getAccountInfo(new PublicKey((await conn.getAccountInfo(PID)).data.subarray(4, 36)));
      const at = Number(Buffer.from(pd.data).readBigUInt64LE(4));
      for (let i = 0; i < 60 && (await conn.getSlot('confirmed')) <= at + 1; i++) await sleep(500);
      console.log(`  ia deployed${await spentSoFar()}`);
    }
  }
  if (auth !== undefined && (!auth || !auth.equals(dev))) { console.log(`  this wallet is not the program's upgrade authority (${auth ? auth.toBase58() : 'none'}): stopped\n`); process.exit(1); }
}
const readConfig = () => ia.fetch('config', K.config);
let h = await readConfig();
if (!h) {
  if (DRY) console.log('  init_config(runner, dev = this wallet) would run');
  else {
    await send([await m.initConfig(RUNNER, dev).accountsPartial({ admin: dev, config: K.config, treasury: K.treasury, runnerFund: K.fund, programData: K.programData }).instruction()], 'init_config: the runner key, fees to the dev, the launch parameters', { units: 200_000 });
    h = await readConfig();
  }
}
if (h) {
  if (!h.admin.equals(dev)) { console.log(`  the admin is ${h.admin.toBase58()}, not this wallet: stopped\n`); process.exit(1); }
  if (!h.runner.equals(RUNNER)) { console.log(`  STOPPED: the config names runner ${h.runner.toBase58()}, but this machine's runner key is ${RUNNER.toBase58()}. Its start_run calls would be refused. Bring the right ~/.config/ia/runner.json (or rotate: propose_runner, then apply_runner after the rotation delay), then run again.\n`); process.exit(1); }
  console.log(`  config: runner ${h.runner.toBase58().slice(0, 8)}…, fees to ${h.dev.equals(dev) ? 'the dev' : h.dev.toBase58()}, plant window ${h.params.plantWindow} slots, min plant ${sol(h.params.minPlant)} SOL`);
}

/* 2. the CA first */
const rootSet = h && !h.rootMint.equals(PublicKey.default);
const mintFile = home(flag('mint-key', LOCAL ? path.join(here, 'test/.run/root-mint.json') : '~/keys/ia-mint.json'));
let mintKp = null, MINT;
// the owner's own CA (the address pump.fun's create form offers): in config.js before this run, or --ca; then no key is ground here and
// the coin is created by him on pump.fun from this same wallet
const ownCa = flag('ca', !fs.existsSync(mintFile) && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(field('CA')) ? field('CA') : '');
if (rootSet) MINT = h.rootMint;
else if (ownCa) MINT = new PublicKey(ownCa);
else if (DRY && !fs.existsSync(mintFile)) MINT = Keypair.generate().publicKey;
else {
  if (!fs.existsSync(mintFile)) {
    const secs = Number(flag('grind-secs', LOCAL ? '20' : '300'));
    console.log(`  ${t()}  making the coin's address: a key ending in "pump" (up to ${Math.round(secs / 60) || 1} min, a plain key after that)…`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-grind-'));
    const made = await new Promise(res => {
      const g = spawn('solana-keygen', ['grind', '--ends-with', 'pump:1'], { cwd: dir, stdio: 'ignore' });
      const stop = setTimeout(() => g.kill('SIGKILL'), secs * 1000);
      g.on('exit', () => { clearTimeout(stop); res(fs.readdirSync(dir).find(f => f.endsWith('pump.json')) || null); });
    });
    fs.mkdirSync(path.dirname(mintFile), { recursive: true });
    if (made) { fs.copyFileSync(path.join(dir, made), mintFile); fs.unlinkSync(path.join(dir, made)); }
    else fs.writeFileSync(mintFile, JSON.stringify(Array.from(Keypair.generate().secretKey)));
    fs.chmodSync(mintFile, 0o600);
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
    fs.rmdirSync(dir);
    console.log(made ? '  a "pump" address found' : '  no "pump" address in time: a plain address instead');
  }
  mintKp = loadKey(mintFile);
  MINT = mintKp.publicKey;
}
console.log(`  $${TICKER} ${MINT.toBase58()}`);
if (ownCa && !DRY && !rootSet && !(await conn.getAccountInfo(curveOf(MINT)).catch(() => null))) console.log(`  ${t()}  waiting for ${MINT.toBase58()} to be created on pump.fun from ${dev.toBase58()}…: create it NOW (a plain create: name ${NAME}, ticker ${TICKER}, no fee sharing)`);
const xUrl = field('X_URL'), domain = field('DOMAIN');
/* the site's build may rename files on prod: the public path of a source file comes from the build's own map when it has one
   (`node site/build.mjs --map --json`), else the file's own name */
function servedPath(file) {
  for (const dir of [SITE, path.join(SITE, 'site')]) {
    if (!fs.existsSync(path.join(dir, 'build.mjs'))) continue;
    const r = spawnSync('node', ['build.mjs', '--map', '--json'], { cwd: dir, encoding: 'utf8', timeout: 60_000 });
    try { const j = JSON.parse(r.stdout); return '/' + ((j.files || {})[file] || file); } catch {}
  }
  return null;
}
const statusOf = u => fetch(u, { cache: 'no-store', redirect: 'follow' }).then(r => r.status).catch(() => 0);
// --host serves the local rehearsal only: on mainnet the live domain is always the one checked
const HOST = LOCAL && flag('host', '') ? flag('host', '') : domain ? `https://${domain.replace(/^https?:\/\//, '')}` : SITE_URL;
if (DRY) {
  const cfgPath = servedPath('config.js') || '/config.js', imgPath = servedPath('coin.png') || '/coin.png';
  const [a, b] = await Promise.all([statusOf(`${HOST}${cfgPath}?t=${Date.now()}`), statusOf(`${HOST}${imgPath}`)]);
  console.log(`  site: ${HOST}${cfgPath}: ${a}; coin.png at ${HOST}${imgPath}: ${b}${b === 200 ? '' : ' (the create would be REFUSED until it is 200)'}`);
}
if (!DRY) {
  const host = LOCAL && flag('host', '') ? flag('host', '') : domain ? `https://${domain.replace(/^https?:\/\//, '')}` : flag('site', SITE_URL);
  const posts = (() => { try { return JSON.parse(fs.readFileSync(path.resolve(SITE, '../_x/ia/x/posts.json'), 'utf8')); } catch { return null; } })();
  const bio = posts && posts.bios && posts.bios[0] ? String(posts.bios[0]).split('\n')[0].trim() : 'AI agents work real tasks with real SOL in reach. Plant the bait; the chain records which models take it';
  const meta = { name: NAME, symbol: TICKER, description: bio, image: `${host}/coin.png`, showName: true, createdOn: 'https://pump.fun', ...(xUrl ? { twitter: xUrl } : {}), website: host };
  const before = fs.existsSync(coinFile) ? fs.readFileSync(coinFile, 'utf8') : '';
  const next = JSON.stringify(meta, null, 1) + '\n';
  if (before !== next) fs.writeFileSync(coinFile, next);
  const changed = [setField('CA', MINT.toBase58()), setField('PROGRAM', PID.toBase58())].some(Boolean);
  if (changed || before !== next) { console.log('  config.js: CA, PROGRAM written · coin.json written'); push(['config.js', 'coin.json'], `CA ${MINT.toBase58()}`); }
  else console.log('  config.js: CA already there');
  if (!NO_PUSH) {
    const cfgUrl = `${host}${servedPath('config.js') || '/config.js'}`, coinUrl = `${host}${servedPath('coin.json') || '/coin.json'}`;
    process.stdout.write(`  ${t()}  waiting for the live site to show the CA (${cfgUrl}, ${coinUrl})`);
    let live = false, last = {};
    for (let i = 0; i < 90 && !live; i++) {
      const r1 = await fetch(`${cfgUrl}?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
      const text = r1 && r1.ok ? await r1.text() : '';
      const r2 = await fetch(`${coinUrl}?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
      last = { cfg: r1 ? r1.status : 0, coin: r2 ? r2.status : 0 };
      if (text.includes(MINT.toBase58()) && r2 && r2.ok) { live = true; process.stdout.write(' · live\n'); break; }
      process.stdout.write('.'); await sleep(4000);
    }
    if (!live) { console.log(`\n  STOPPED: after 6 minutes the live site still does not show the CA: ${cfgUrl} answered ${last.cfg}, ${coinUrl} answered ${last.coin}.\n  Nothing was created; check the deploy, then run the same command again.\n`); process.exit(1); }
  }
}
const uri = (() => { try { return `${JSON.parse(fs.readFileSync(coinFile, 'utf8')).website}/coin.json`; } catch { return SITE_URL + '/coin.json'; } })();

/* 3. the root coin, a plain create: its creator fees are this wallet's (no fee sharing for the main coin) */
if (!(await conn.getAccountInfo(curveOf(MINT)))) {
  if (DRY) console.log(`  $${TICKER}: would be created by ${dev.toBase58().slice(0, 6)}…, creator fees 100% to it${BUY ? `, first buy ${BUY / LAMPORTS_PER_SOL} SOL` : ''}`);
  else if (!mintKp) {
    console.log(`  ${t()}  waiting for ${MINT.toBase58()} to be created on pump.fun from ${dev.toBase58()}… (a plain create: name ${NAME}, ticker ${TICKER}, no fee sharing)`);
    while (!(await conn.getAccountInfo(curveOf(MINT)).catch(() => null))) await sleep(4000);
    console.log(`  ${t()}  $${TICKER} is on pump.fun`);
  } else {
    const img = `${HOST}${servedPath('coin.png') || '/coin.png'}`;
    const st = await statusOf(img);
    if (st !== 200) { console.log(`  STOPPED before the create: the coin's image ${img} answers ${st}, and pump.fun keeps the metadata for good. Publish it, then run the same command again.\n`); process.exit(1); }
    console.log(`  the coin's image is live: ${img}`);
    let ixs;
    if (BUY > 0) {
      const global = await new P.OnlinePumpSdk(conn).fetchGlobal();
      const amount = P.getBuyTokenAmountFromSolAmount({ global, feeConfig: null, mintSupply: null, bondingCurve: null, amount: new BN(BUY) });
      ixs = await sdk.createV2AndBuyInstructions({ global, mint: MINT, name: NAME, symbol: TICKER, uri, creator: dev, user: dev, amount, solAmount: new BN(Math.floor(BUY * 1.05)), mayhemMode: false });
    } else ixs = [await sdk.createV2Instruction({ mint: MINT, name: NAME, symbol: TICKER, uri, creator: dev, user: dev, mayhemMode: false })];
    // create_v2 under-pays the Token-2022 mint's rent for some metadata lengths: a small top-up rides along
    ixs.splice(1, 0, SystemProgram.transfer({ fromPubkey: dev, toPubkey: MINT, lamports: 20_000 }));
    await send(ixs, `$${TICKER} created on pump.fun, creator fees 100% to the dev${BUY ? `, first buy ${BUY / LAMPORTS_PER_SOL} SOL` : ''}`, { extra: [mintKp], units: 400_000 });
  }
}
const curve = await conn.getAccountInfo(curveOf(MINT));
if (curve) {
  const creator = new PublicKey(curve.data.subarray(49, 81));
  if (!creator.equals(dev)) { console.log(`  $${TICKER}'s creator is ${creator.toBase58()}, not this wallet: stopped\n`); process.exit(1); }
  console.log(`  $${TICKER}: creator fees 100% to the dev, no sharing config`);
  if (!DRY && !field('START')) {
    let before = null, oldest = null;
    for (let i = 0; i < 20; i++) { const page = await conn.getSignaturesForAddress(curveOf(MINT), { limit: 1000, ...(before ? { before } : {}) }, 'confirmed'); if (!page.length) break; oldest = page[page.length - 1]; before = oldest.signature; if (page.length < 1000) break; }
    const bt = oldest && (oldest.blockTime || (await conn.getBlockTime(oldest.slot).catch(() => null)));
    if (bt && setField('START', String(bt))) { console.log(`  config.js: START ${bt} (the create's block time)`); push(['config.js'], 'START: the coin create time'); }
  }
}

/* 4. the holder perk */
h = DRY ? h : await readConfig();
if (h && h.rootMint.equals(PublicKey.default) && !DRY) await send([await m.setRoles(null).accountsPartial({ admin: dev, config: K.config, rootMint: MINT }).instruction()], `set_roles: a planter holding 1,000,000 $${TICKER} pays no treasury share`, { units: 60_000 });
else if (!DRY && h) console.log(`  set_roles: $${TICKER} already set`);

/* 5. the lineup */
const lineup = JSON.parse(fs.readFileSync(path.join(here, 'lineup.json'), 'utf8')).models;
{
  const modelOf = a => Buffer.from(a.model).toString('utf8').replace(/\0+$/, '');
  const c = await readConfig();
  const count = c ? c.agentCount : 0;
  for (let i = 0; i < lineup.length; i++) {
    if (i < count) {
      const a = await ia.fetch('agent', K.agent(i));
      if (!a || modelOf(a) !== lineup[i]) { console.log(`  STOPPED: agent ${i} on chain is "${a ? modelOf(a) : '?'}", lineup.json says "${lineup[i]}". A change after launch is set_agent (it waits the rotation delay); fix lineup.json or the chain, then run again.\n`); process.exit(1); }
      continue;
    }
    if (DRY || !c) { console.log(`  add_agent ${i}: ${lineup[i]} would run`); continue; }
    await send([await m.addAgent(lineup[i]).accountsPartial({ admin: dev, config: K.config, agent: K.agent(i) }).instruction()], `add_agent ${i}: ${lineup[i]}`, { units: 60_000 });
  }
  if (count > lineup.length) console.log(`  note: ${count - lineup.length} more agent(s) on chain than lineup.json lists (Open League or added later)`);
  else if (!DRY && c) console.log(`  lineup: ${lineup.length} agents, exact versions on chain`);
}

/* 6. the site's lookup table */
{
  const have = field('ALT');
  const t0 = have ? (await conn.getAddressLookupTable(new PublicKey(have)).catch(() => ({ value: null }))).value : null;
  const c6 = DRY ? null : await readConfig();
  const want = DRY || !c6 ? [] : [PID, K.config, K.treasury, K.fund, ...lineup.map((_, i) => K.agent(i)), K.slotHashes, SystemProgram.programId, ComputeBudgetProgram.programId,
    new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'), c6.runner, c6.rootMint].map(String);
  const missing = want.filter(k => !(t0 ? t0.state.addresses.map(String) : []).includes(k));
  if (t0 && !missing.length) console.log(`  lookup table ${have}: ${t0.state.addresses.length} accounts, complete`);
  else if (DRY || !c6) console.log('  lookup table: would be made at the finalized slot - 20 with the accounts every plant, deposit and crank names');
  else {
    let key = t0 ? new PublicKey(have) : null;
    if (!key) {
      // the table's address comes from (authority, recentSlot); a create on an address that already holds a table is a no-op (the
      // extend would then append the same addresses twice): so a slot about 20 back whose table address is still free, retried
      let mk = null;
      for (let tries = 0; !mk; tries++) {
        if (tries) { if (tries > 30) { console.log('  no free lookup table address among the recent slots: run again'); process.exit(1); } await sleep(1000); }
        const fin = Number(await conn.getSlot('finalized'));
        const slots = [...new Set([...Array(40).keys()].map(k => fin - 20 - k).concat([...Array(21).keys()].map(k => fin - k)))].filter(x => x >= 0);
        for (const sl of slots) { const [ix, k2] = AddressLookupTableProgram.createLookupTable({ authority: dev, payer: dev, recentSlot: sl }); if (!(await conn.getAccountInfo(k2))) { mk = ix; key = k2; break; } }
      }
      await send([mk], 'lookup table created', { units: 40_000 });
    }
    for (let i = 0; i < missing.length; i += 25) await send([AddressLookupTableProgram.extendLookupTable({ lookupTable: key, authority: dev, payer: dev, addresses: missing.slice(i, i + 25).map(x => new PublicKey(x)) })], `lookup table: ${Math.min(i + 25, missing.length)}/${missing.length} accounts`, { units: 60_000 });
    if (setField('ALT', key.toBase58())) { console.log(`  config.js: ALT ${key.toBase58()}`); push(['config.js'], 'The site lookup table'); }
  }
}

/* 7. the runner's float */
{
  const want = BigInt(Math.round(Number(flag('runner-float', '0.1')) * LAMPORTS_PER_SOL));
  const have = DRY ? 0n : BigInt(await conn.getBalance(RUNNER, 'confirmed'));
  if (want > 0n && have < want) {
    if (DRY) console.log(`  runner float: would top ${RUNNER.toBase58().slice(0, 8)}… up to ${sol(want)} SOL`);
    else await send([SystemProgram.transfer({ fromPubkey: dev, toPubkey: RUNNER, lamports: want - have })], `runner float: ${sol(want - have)} SOL to ${RUNNER.toBase58().slice(0, 8)}… (now ${sol(want)} SOL)`, { units: 1000 });
  } else if (!DRY) console.log(`  runner float: ${sol(have)} SOL, enough`);
}

/* 8. open */
if (!DRY) { console.log(setBool('LIVE', true) ? '  config.js: LIVE: true' : '  config.js: LIVE already true (an empty commit redeploys production)'); push(['config.js'], 'Open: rounds can run'); }
const done = DRY ? '' : ` · the launch cost the dev ${sol(start - (await conn.getBalance(dev, 'confirmed')))} SOL in all`;
console.log(`\n  done. ${NAME} is open: the crank opens the first round, anyone can plant${done}\n`);
process.exit(0);
