// IA fuzz/audit core: a seeded PRNG, the snapshot IDL through the Anchor client (instruction building and account decoding only), the
// PDAs of CONTRACT §1, and a chain harness that sends or simulates, names the program error of a refusal, parses events, and makes
// every transaction unique (a compute-unit limit carrying a counter), so two identical calls never collapse into one signature.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const FUZZ = path.resolve(here, '..');
export const PROG = path.resolve(FUZZ, '../program');
export const SCRATCH = process.env.FUZZ_SCRATCH || '/private/tmp/claude-501/-Users-artem-Desktop-sol/be802bf9-e299-4d83-b38b-bc795e5cbb1e/scratchpad/ia-fuzz';
export const RPC = process.env.FUZZ_RPC || 'http://127.0.0.1:60899';
const require = createRequire(path.join(PROG, 'package.json'));
export const anchor = require('@coral-xyz/anchor');
export const spl = require('@solana/spl-token');
export const web3 = anchor.web3;
export const BN = anchor.BN;
const { Keypair, PublicKey, Transaction, ComputeBudgetProgram, SystemProgram } = web3;
export { Keypair, PublicKey, SystemProgram };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const sha256 = (...p) => crypto.createHash('sha256').update(Buffer.concat(p.map(x => Buffer.from(x)))).digest();

/* ------------------------------------------------------------------ seeded PRNG (splitmix64 → xoshiro256**) */
export function rng(seed) {
  let x = BigInt.asUintN(64, BigInt(seed));
  const sm = () => { x = BigInt.asUintN(64, x + 0x9e3779b97f4a7c15n); let z = x; z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n); z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn); return z ^ (z >> 31n); };
  const s = [sm(), sm(), sm(), sm()];
  const rotl = (v, k) => BigInt.asUintN(64, (v << k) | (v >> (64n - k)));
  function next() {
    const r = BigInt.asUintN(64, rotl(BigInt.asUintN(64, s[1] * 5n), 7n) * 9n);
    const t = BigInt.asUintN(64, s[1] << 17n);
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 45n);
    return r;
  }
  const R = {
    u64: next,
    int: n => Number(next() % BigInt(n)),
    range: (a, b) => a + Number(next() % BigInt(b - a + 1)),
    big: (a, b) => a + next() % (b - a + 1n),
    bool: (p = 0.5) => Number(next() >> 11n) / 2 ** 53 < p,
    pick: arr => arr[Number(next() % BigInt(arr.length))],
    bytes: n => { const b = Buffer.alloc(n); for (let i = 0; i < n; i += 8) { let v = next(); for (let j = 0; j < 8 && i + j < n; j++) { b[i + j] = Number(v & 255n); v >>= 8n; } } return b; },
    keypair: () => Keypair.fromSeed(R.bytes(32)),
    shuffle: arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = R.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  };
  return R;
}

/* ------------------------------------------------------------------ IDL, PDAs */
export const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
export const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
export const big = x => BigInt(x.toString());

export function harness(url = RPC) {
  const idl = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'idl/ia.json'), 'utf8'));
  const conn = new web3.Connection(url, 'confirmed');
  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(SCRATCH, 'authority.json'), 'utf8'))));
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(admin), { commitment: 'confirmed' });
  const program = new anchor.Program(idl, provider);
  const PID = program.programId;
  const pda = (...s) => PublicKey.findProgramAddressSync(s, PID)[0];
  const K = {
    CONFIG: pda(Buffer.from('config')), TREASURY: pda(Buffer.from('treasury')), FUND: pda(Buffer.from('runner_fund')),
    PROGRAM_DATA: PublicKey.findProgramAddressSync([PID.toBuffer()], new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'))[0],
    SLOT_HASHES: new PublicKey('SysvarS1otHashes111111111111111111111111111'),
    agent: id => pda(Buffer.from('agent'), u16(id)),
    round: s => pda(Buffer.from('round'), u64(s)),
    plant: (s, j) => pda(Buffer.from('plant'), u64(s), Buffer.from([j])),
    docket: (s, id) => pda(Buffer.from('docket'), u64(s), u16(id)),
    surety: (id, owner) => pda(Buffer.from('surety'), u16(id), owner.toBuffer()),
  };
  const errByCode = Object.fromEntries((idl.errors || []).map(e => [e.code, e.name]));
  const coder = program.coder;
  const parser = new anchor.EventParser(PID, coder);
  let counter = 0, blockhash = null, bhAt = 0;
  async function bh() { if (!blockhash || Date.now() - bhAt > 15_000) { blockhash = (await conn.getLatestBlockhash('confirmed')).blockhash; bhAt = Date.now(); } return blockhash; }
  function reason(err, logs) {
    const s = (logs || []).join('\n');
    const m = /Error Code: (\w+)/.exec(s);
    if (m) return m[1];
    const c = /custom program error: 0x([0-9a-f]+)/.exec(s) || /"Custom":(\d+)/.exec(JSON.stringify(err || ''));
    if (c) { const code = c[0].includes('0x') ? parseInt(c[1], 16) : Number(c[1]); return errByCode[code] || 'Custom' + code; }
    if (/panicked|overflow|Program failed to complete/.test(s)) return 'Panic:' + ((/panicked at [^\n]*/.exec(s) || /(overflow[^\n]*)/.exec(s) || [''])[0]).slice(0, 120);
    return typeof err === 'string' ? err : JSON.stringify(err).slice(0, 160);
  }
  async function build(ixs, signers, payer) {
    const tx = new Transaction();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 - (++counter % 50_000) }));
    for (const ix of ixs) tx.add(ix);
    tx.feePayer = (payer || signers[0]).publicKey;
    tx.recentBlockhash = await bh();
    const uniq = []; for (const s of [payer || signers[0], ...signers]) if (s && !uniq.find(u => u.publicKey.equals(s.publicKey))) uniq.push(s);
    tx.sign(...uniq);
    return tx;
  }
  /** send and confirm; {ok, err, logs, sig, events} — never throws for a program refusal */
  async function send(ixs, signers, o = {}) {
    for (let attempt = 0; ; attempt++) {
      const tx = await build(ixs, signers, o.payer);
      try {
        const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        const st = await conn.confirmTransaction(sig, 'confirmed');
        const t = await getTx(sig);
        const logs = t?.meta?.logMessages || [];
        if (st.value.err) return { ok: false, err: reason(st.value.err, logs), logs, sig };
        return { ok: true, logs, sig, events: [...parser.parseLogs(logs)] };
      } catch (e) {
        if (/Blockhash not found|block height exceeded/i.test(String(e)) && attempt < 3) { blockhash = null; continue; }
        return { ok: false, err: reason(String(e.message || e), e.logs), logs: e.logs || [] };
      }
    }
  }
  async function getTx(sig) { for (let i = 0; i < 40; i++) { const t = await conn.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }); if (t) return t; await sleep(150); } return null; }
  async function sim(ixs, signers, o = {}) {
    const tx = await build(ixs, signers, o.payer);
    const r = await conn.simulateTransaction(tx, undefined, false);
    const logs = r.value.logs || [];
    return r.value.err ? { ok: false, err: reason(r.value.err, logs), logs, slot: r.context.slot } : { ok: true, logs, slot: r.context.slot, events: [...parser.parseLogs(logs)] };
  }
  const lam = async a => BigInt(await conn.getBalance(new PublicKey(a), 'confirmed'));
  const slot = () => conn.getSlot('confirmed');
  async function waitSlot(s) { while ((await slot()) <= Number(s)) await sleep(150); }
  async function fund(kps, sol) { await Promise.all(kps.map(async k => { const sig = await conn.requestAirdrop(k.publicKey, Math.round(sol * 1e9)); await conn.confirmTransaction(sig, 'confirmed'); })); }
  const F = program.account;
  const fetch = async (kind, addr) => { try { return await F[kind].fetch(addr, 'confirmed'); } catch { return null; } };
  return { idl, conn, admin, program, PID, K, send, sim, lam, slot, waitSlot, fund, F, fetch, reason };
}
