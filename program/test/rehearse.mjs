// Launch day and closing of Internal Affairs, rehearsed on a fresh chain with pump.fun cloned and no program loaded, with the dev key as a
// BASE58 STRING file (the real key path): launch.mjs deploys the launch build through sol-ops, runs init_config(runner, dev), writes the
// CA first (a scratch config.js, served with a stand-in coin.png on a local port), creates the coin with all its creator fees to the dev,
// writes START, sets the $IA holder rule, adds the lineup of program/lineup.json, builds the site's lookup table, tops up the runner's
// float and opens the site (LIVE); a second run finds everything done and spends nothing; --dry simulates. Then a first day: a surety
// stands behind agent 0, a round opens and an investigator plants. wind-down.mjs then closes everything in one run from that live state
// (mid plant window): every rent and every lamport back to whoever it belongs to, the program closed; a second run has nothing to do.
// Run: zsh test/rehearse.sh
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { web3, makeIa, makeSender, authorityOf } from '../ops.mjs';
const require = createRequire(import.meta.url);
const bs58 = (m => m.default || m)(require('bs58'));
const P = require('@pump-fun/pump-sdk');
const { BN } = require('@coral-xyz/anchor');
const crypto = require('crypto');
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL: SOL } = web3;

const RPC = 'http://127.0.0.1:52899';
const conn = new Connection(RPC, 'confirmed');
const here = path.dirname(fileURLToPath(import.meta.url));
const prog = path.join(here, '..'), site = path.join(prog, '..'), run = path.join(here, '.run');
let pass = 0, total = 0;
const ok = (cond, name, extra = '') => { total++; if (cond) { pass++; console.log('  ok   ' + name); } else console.log('  FAIL ' + name + (extra ? '  ' + String(extra).slice(0, 900) : '')); };
const lam = async a => BigInt(await conn.getBalance(new PublicKey(a), 'confirmed'));
const airdrop = async (k, s) => conn.confirmTransaction(await conn.requestAirdrop(k, s * SOL), 'confirmed');
const live = { out: '' };
const node = (file, args) => new Promise(res => {
  const p = spawn('node', [file, ...args], { cwd: prog, env: { ...process.env } });
  let out = '';
  live.out = '';
  p.stdout.on('data', d => { out += d; live.out += d; }); p.stderr.on('data', d => { out += d; live.out += d; });
  p.on('exit', code => res({ code, out }));
});
// IA_OWN_CA=1: the owner brings his own CA (in config.js, no mint key): launch.mjs must wait for his create from the dev wallet
const OWN_CA = !!process.env.IA_OWN_CA;
const show = r => r.out.split('\n').filter(l => l.trim()).map(l => '      ' + l).join('\n');

/* the dev key as a base58 string, a runner, people */
const dev = Keypair.generate();
const devFile = path.join(run, 'dev-b58.txt');
fs.writeFileSync(devFile, bs58.encode(dev.secretKey) + '\n', { mode: 0o600 });
const runner = Keypair.generate(), surety = Keypair.generate(), planter = Keypair.generate();
await airdrop(dev.publicKey, 40);
await airdrop(surety.publicKey, 5);
await airdrop(planter.publicKey, 5);

/* the site's files on a local port: a scratch config.js (a copy of ia/config.js) and a stand-in coin.png */
const www = path.join(run, 'www');
fs.mkdirSync(www, { recursive: true });
const cfg = path.join(www, 'config.js');
fs.copyFileSync(path.join(site, 'config.js'), cfg);
fs.writeFileSync(path.join(www, 'coin.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const server = http.createServer((q, s) => { const f = path.join(www, path.basename((q.url || '/').split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isFile()) { s.writeHead(200); s.end(fs.readFileSync(f)); } else { s.writeHead(404); s.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const host = `http://127.0.0.1:${server.address().port}`;
const mintFile = path.join(run, 'root-mint.json');
fs.rmSync(mintFile, { force: true });
const ownMint = Keypair.generate();
if (OWN_CA) fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace(/(\bCA\s*:\s*")[^"]*(")/, `$1${ownMint.publicKey.toBase58()}$2`));
const args = ['--url', RPC, '--keypair', devFile, '--config', cfg, '--host', host, '--runner', runner.publicKey.toBase58(), '--mint-key', mintFile, '--grind-secs', '5'];
const field = k => (new RegExp(`\\b${k}\\s*:\\s*"([^"]*)"`).exec(fs.readFileSync(cfg, 'utf8')) || [])[1] || '';

/* launch */
const d0 = await lam(dev.publicKey);
const r1p = node('launch.mjs', args);
if (OWN_CA) {
  // the owner creates the coin on pump.fun from the dev wallet once the script asks for it
  for (let i = 0; i < 600 && !live.out.includes('create it NOW'); i++) await new Promise(r => setTimeout(r, 500));
  ok(live.out.includes('create it NOW') && live.out.includes(ownMint.publicKey.toBase58()), 'own CA: launch.mjs asks for the create right after the deploy, naming the CA', live.out.slice(-600));
  const sdk = new P.PumpSdk();
  const ix = await sdk.createV2Instruction({ mint: ownMint.publicKey, name: 'Internal Affairs', symbol: 'IA', uri: `${host}/coin.json`, creator: dev.publicKey, user: dev.publicKey, mayhemMode: false });
  await makeSender(conn, dev.publicKey, { local: true, signer: dev, quiet: true })([ix, web3.SystemProgram.transfer({ fromPubkey: dev.publicKey, toPubkey: ownMint.publicKey, lamports: 20_000 })], 'own create', { extra: [ownMint] });
}
const r1 = await r1p;
ok(r1.code === 0 && r1.out.includes('done.'), 'launch.mjs runs to the end', show(r1));
const ia = makeIa(conn, dev.publicKey);
const { K, PID, m } = ia;
const auth = await authorityOf(conn, PID);
ok(auth && auth.equals(dev.publicKey), 'ia deployed by sol-ops, the dev is its upgrade authority');
const c = await ia.fetch('config', K.config);
ok(c && c.admin.equals(dev.publicKey) && c.dev.equals(dev.publicKey) && c.runner.equals(runner.publicKey), 'init_config: admin and fees the dev, the runner key named');
ok(c && Number(c.params.plantWindow) === 3000 && Number(c.params.minPlant) === 100_000_000 && c.params.leagueSeats === 0, 'the launch parameters (plant window 3,000 slots, min plant 0.1 SOL, Open League closed)');
const MINT = c ? c.rootMint : PublicKey.default;
if (OWN_CA) ok(MINT.equals(ownMint.publicKey) && !fs.existsSync(mintFile), 'own CA: the root mint is the owner\'s CA, no mint key was ground');
ok(field('CA') === MINT.toBase58() && field('PROGRAM') === PID.toBase58(), 'config.js: CA (the root mint) and PROGRAM written');
const curve = await conn.getAccountInfo(P.bondingCurvePda(MINT));
ok(curve && new PublicKey(curve.data.subarray(49, 81)).equals(dev.publicKey), 'the coin is on pump.fun, created by the dev (creator fees 100% to it)');
ok(/^\d+$/.test(field('START')), 'config.js: START (the create time)');
const lineup = JSON.parse(fs.readFileSync(path.join(prog, 'lineup.json'), 'utf8')).models;
const agents = await Promise.all(lineup.map((_, i) => ia.fetch('agent', K.agent(i))));
ok(c && agents.every((a, i) => a && Buffer.from(a.model).toString().replace(/\0+$/, '') === lineup[i]) && (await ia.fetch('config', K.config)).activeCount === lineup.length, `the lineup: ${lineup.length} agents with the exact versions of lineup.json`);
const alt = field('ALT');
const table = alt ? (await conn.getAddressLookupTable(new PublicKey(alt))).value : null;
ok(table && [PID, K.config, K.fund, K.agent(0), K.agent(lineup.length - 1), runner.publicKey, MINT].every(k => table.state.addresses.some(a => a.equals(k))), 'the lookup table (program, config, fund, every agent, runner, mint), its address in config.js');
ok(await lam(runner.publicKey) >= 100_000_000n, 'the runner float: 0.1 SOL');
ok(/LIVE:\s*true/.test(fs.readFileSync(cfg, 'utf8')), 'config.js: LIVE true');
const cost = d0 - await lam(dev.publicKey);
console.log(`       the launch cost the dev ${(Number(cost) / 1e9).toFixed(4)} SOL here (program rent, accounts, the coin, the table, the runner float)`);

const d1 = await lam(dev.publicKey);
const r2 = await node('launch.mjs', args);
ok(r2.code === 0 && await lam(dev.publicKey) === d1, 'a second run finds everything done and spends nothing', show(r2));
const r3 = await node('launch.mjs', ['--url', RPC, '--dry', '--as', dev.publicKey.toBase58(), '--config', cfg, '--host', host, '--runner', runner.publicKey.toBase58(), '--mint-key', mintFile]);
ok(r3.code === 0, 'launch.mjs --dry --as <dev> simulates without a key', show(r3));

/* a first day on the launch build: a surety, a round, a plant */
const sendAs = kp => makeSender(conn, kp.publicKey, { local: true, signer: kp, quiet: true });
let dayOne = true;
try {
  await sendAs(surety)([await m.deposit(new BN(SOL)).accountsPartial({ owner: surety.publicKey, config: K.config, agent: K.agent(0), surety: K.surety(0, surety.publicKey) }).instruction()], 'deposit');
  const lineupAccs = lineup.map((_, i) => ({ pubkey: K.agent(i), isWritable: true, isSigner: false }));
  await sendAs(planter)([await m.openRound().accountsPartial({ payer: planter.publicKey, config: K.config, prevRound: null, round: K.round(0), slotHashes: K.slotHashes }).remainingAccounts(lineupAccs).instruction()], 'open_round');
  const hash = [...crypto.createHash('sha256').update('rehearsal plant').digest()];
  await sendAs(planter)([await m.plant(0, 0, hash, new BN(0), PublicKey.default, new BN(200_000_000)).accountsPartial({ planter: planter.publicKey, config: K.config, round: K.round(0), plant: K.plant(0, 0), treasury: K.treasury, runnerFund: K.fund, holderToken: null }).instruction()], 'plant');
} catch (e) { dayOne = false; console.log('       ' + e.message); }
ok(dayOne, 'day one: a surety deposits 1 SOL behind agent 0, a round opens, an investigator plants 0.1 SOL');

/* closing from that live state, mid plant window */
const dry = await node('wind-down.mjs', ['--url', RPC, '--dry', '--as', dev.publicKey.toBase58()]);
ok(dry.code === 0, 'wind-down.mjs --dry simulates', show(dry));
const s0 = await lam(surety.publicKey), p0 = await lam(planter.publicKey), dd = await lam(dev.publicKey);
const w = await node('wind-down.mjs', ['--url', RPC, '--keypair', devFile]);
ok(w.code === 0 && w.out.includes('the program owns no account'), 'wind-down.mjs closes everything in one run', show(w));
ok((await conn.getProgramAccounts(PID)).length === 0 && (await authorityOf(conn, PID)) === undefined, 'the program owns nothing and is closed');
ok(await lam(surety.publicKey) - s0 > BigInt(SOL), 'the surety got its 1 SOL back, plus its share of the plant fees and its account rent');
ok(await lam(planter.publicKey) > p0, 'the planter got its plant\'s and the round\'s rent back');
ok(await lam(dev.publicKey) > dd, `the dev got the program rent, the agents' rent and the fees back (+${(Number(await lam(dev.publicKey) - dd) / 1e9).toFixed(4)} SOL)`);
const w2 = await node('wind-down.mjs', ['--url', RPC, '--keypair', devFile]);
ok(w2.code === 0 && w2.out.includes('already closed'), 'a second wind-down has nothing to do', show(w2));

server.close();
fs.writeFileSync(path.join(run, OWN_CA ? 'own-ca.txt' : 'rehearse.txt'), `${pass}/${total}\n`);
console.log(`\nia ${OWN_CA ? 'own-ca' : 'rehearse'}: ${pass}/${total}`);
process.exit(pass === total ? 0 : 1);
