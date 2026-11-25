// What the launch rehearsal's chain copies from mainnet (read-only): pump.fun with every account a create_v2 (and a buy) reads, from the
// SDK's own instructions for a throwaway mint. Data accounts go to .run/accounts/*.json (loaded with --account), upgradeable programs to
// .run/programs.txt and their binaries to .run/programs/. Mainnet reads go to MAINNET_RPC, else a random key of
// ~/.config/helius/site_keys, else the public endpoint. Run once (again when pump.fun changes): node test/prep.mjs
import { createRequire } from 'module';
import fs from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const P = require('@pump-fun/pump-sdk');
const BN = require('bn.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const run = path.join(here, '.run');
const accDir = path.join(run, 'accounts');
fs.rmSync(accDir, { recursive: true, force: true });
fs.mkdirSync(accDir, { recursive: true });
const keysFile = path.join(process.env.HOME || '', '.config', 'helius', 'site_keys');
const siteKeys = fs.existsSync(keysFile) ? fs.readFileSync(keysFile, 'utf8').split(/\s+/).filter(Boolean) : [];
const conn = new Connection(process.env.MAINNET_RPC || (siteKeys.length ? `https://mainnet.helius-rpc.com/?api-key=${siteKeys[Math.floor(Math.random() * siteKeys.length)]}` : 'https://api.mainnet-beta.solana.com'), 'confirmed');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function retry(f, n = 6) { for (let i = 0; ; i++) { try { return await f(); } catch (e) { if (i >= n) throw e; await sleep(1500 * (i + 1)); } } }
const online = new P.OnlinePumpSdk(conn), sdk = new P.PumpSdk();
const global = await retry(() => online.fetchGlobal());

const keys = new Set();
const add = (...ks) => ks.flat().forEach(k => k && keys.add(new PublicKey(k).toBase58()));
const addIxs = ixs => ixs.forEach(ix => { add(ix.programId); ix.keys.forEach(k => add(k.pubkey)); });
add(global.feeRecipient, global.feeRecipients, global.reservedFeeRecipient, global.reservedFeeRecipients);
{
  // every recipient the Global account itself lists: fee recipients at 41 and 162, buyback at 741
  const g = (await retry(() => conn.getAccountInfo(P.GLOBAL_PDA))).data;
  for (const [at, n] of [[41, 1], [162, 7], [741, 8]]) for (let i = 0; i < n; i++) { if (g.length < at + 32 * (i + 1)) break; const k = new PublicKey(g.subarray(at + 32 * i, at + 32 * i + 32)); if (!k.equals(PublicKey.default)) add(k); }
}
const throwaway = Keypair.generate().publicKey, who = Keypair.generate().publicKey;
const amount = P.getBuyTokenAmountFromSolAmount({ global, feeConfig: null, mintSupply: null, bondingCurve: null, amount: new BN(1e8) });
addIxs(await sdk.createV2AndBuyInstructions({ global, mint: throwaway, name: 'x', symbol: 'x', uri: 'x', creator: who, user: who, amount, solAmount: new BN(2e8), mayhemMode: false }));

const skipOwners = new Set(['Sysvar1111111111111111111111111111111111111', 'NativeLoader1111111111111111111111111111111', 'BPFLoaderUpgradeab1e11111111111111111111111', 'BPFLoader2111111111111111111111111111111111']);
const builtins = new Set(['11111111111111111111111111111111', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', 'ComputeBudget111111111111111111111111111111', 'SysvarRent111111111111111111111111111111111', 'SysvarC1ock11111111111111111111111111111111', 'So11111111111111111111111111111111111111112']);
const skipKeys = new Set([throwaway.toBase58(), who.toBase58(), ...builtins]);
const programs = new Set(['6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ', 'MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e', 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s']);
let saved = 0;
const list = [...keys].filter(k => !skipKeys.has(k));
for (let i = 0; i < list.length; i += 100) {
  const chunk = list.slice(i, i + 100).map(k => new PublicKey(k));
  const infos = await retry(() => conn.getMultipleAccountsInfo(chunk));
  chunk.forEach((k, j) => {
    const info = infos[j];
    if (!info) return;
    if (info.executable) { if (info.owner.toBase58() === 'BPFLoaderUpgradeab1e11111111111111111111111') programs.add(k.toBase58()); return; }
    if (skipOwners.has(info.owner.toBase58())) return;
    const file = { pubkey: k.toBase58(), account: { lamports: info.lamports, data: [Buffer.from(info.data).toString('base64'), 'base64'], owner: info.owner.toBase58(), executable: false, rentEpoch: 0, space: info.data.length } };
    fs.writeFileSync(path.join(accDir, k.toBase58() + '.json'), JSON.stringify(file));
    saved++;
  });
}
fs.writeFileSync(path.join(run, 'programs.txt'), [...programs].join('\n') + '\n');
fs.mkdirSync(path.join(run, 'programs'), { recursive: true });
for (const p of programs) {
  const out = path.join(run, 'programs', p + '.so');
  for (const u of ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com', conn.rpcEndpoint]) {
    if (spawnSync('solana', ['program', 'dump', '-u', u, p, out], { encoding: 'utf8' }).status === 0) break;
    await sleep(3000);
  }
  console.log(p, fs.existsSync(out) ? fs.statSync(out).size + ' bytes' : 'NOT dumped');
}
console.log('accounts saved', saved, '· upgradeable programs', programs.size);
