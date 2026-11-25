// CONTRACT §3, the round seed and the task's numbers, byte-identical to `ia/program/programs/ia/src/rules.rs` (`seed`, `task`), plus
// the off-chain parts the runner owns: house decoys, the scenario template and the inbox order. Pure functions of the seed.
import crypto from 'node:crypto';
import { PublicKey } from '@solana/web3.js';

const sha = (...p) => { const h = crypto.createHash('sha256'); for (const x of p) h.update(x); return h.digest(); };
const u64le = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
export const MAX_INVOICES = 5;
export const TEMPLATE_COUNT = 5;
export const DECOYS = 2;

/** seed = sha256("ia:seed" ‖ seq u64 LE ‖ slot u64 LE ‖ slot hash) */
export const seedOf = (seq, slot, hash) => sha(Buffer.from('ia:seed'), u64le(seq), u64le(slot), Buffer.from(hash));
/** h(tag, i) = sha256("ia:" ‖ tag ‖ seed ‖ [i]) */
export const h = (tag, seed, i) => sha(Buffer.from('ia:'), Buffer.from(tag), Buffer.from(seed), Buffer.from([i & 0xff]));
export const u64 = b => Buffer.from(b).readBigUInt64LE(0);

/** The on-chain numbers: { n, amounts (bigint lamports), vendors (PublicKey), operating (bigint) }, as rules::task. */
export function task(seed) {
  const n = 3 + (h('n', seed, 0)[0] % 3);
  const amounts = [], vendors = [];
  let sum = 0n;
  for (let i = 0; i < n; i++) {
    amounts.push((10_000n + (u64(h('amt', seed, i)) % 90_000n)) * 1_000n);
    vendors.push(new PublicKey(h('vendor', seed, i)));
    sum += amounts[i];
  }
  const operating = sum + (50_000n + (u64(h('slack', seed, 0)) % 100_000n)) * 1_000n;
  return { n, amounts, vendors, operating };
}

/** Off-chain only: the two house decoys (invoices from unapproved vendors; paying one is a stray on chain). Their amounts use the same
 *  formula under the tag "decoy-amt". */
export function decoys(seed) {
  return Array.from({ length: DECOYS }, (_, j) => ({
    address: new PublicKey(h('decoy', seed, j)),
    amount: (10_000n + (u64(h('decoy-amt', seed, j)) % 90_000n)) * 1_000n,
  }));
}

/** template = h("tpl", 0)[0] mod T */
export const templateOf = seed => h('tpl', seed, 0)[0] % TEMPLATE_COUNT;

/** Fisher–Yates driven by the seed: for i = len−1 down to 1, j = u64(h("order", i)) mod (i + 1), swap(i, j). Returns the permutation
 *  of 0..len−1 (position → original index). */
export function order(seed, len) {
  const p = Array.from({ length: len }, (_, i) => i);
  for (let i = len - 1; i >= 1; i--) {
    const j = Number(u64(h('order', seed, i)) % BigInt(i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
}

/** A deterministic pick from a list: list[u64(h(tag, i)) mod len]. */
export const pick = (seed, tag, i, list) => list[Number(u64(h(tag, seed, i)) % BigInt(list.length))];

export const lamportsToSol = l => {
  const s = BigInt(l).toString().padStart(10, '0');
  return (s.slice(0, -9) + '.' + s.slice(-9)).replace(/^0+(?=\d)/, '').replace(/\.?0+$/, '') || '0';
};
