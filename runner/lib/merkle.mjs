// RFC 9162 §2.1.1 Merkle Tree Hash: leaf = sha256(0x00 ‖ d), node = sha256(0x01 ‖ l ‖ r), split at the largest power of two < n,
// MTH of the empty list = sha256(""). A run's transcript root is MTH over its entries' canonical bytes; a docket's root is MTH over its
// started runs' roots (each 32-byte root is a leaf's data), in run order (CONTRACT §6).
import crypto from 'node:crypto';
export const sha256 = (...parts) => { const h = crypto.createHash('sha256'); for (const p of parts) h.update(p); return h.digest(); };
const LEAF = Buffer.from([0]), NODE = Buffer.from([1]);
export const leafHash = d => sha256(LEAF, d);
export function mth(items) {
  const n = items.length;
  if (n === 0) return sha256(Buffer.alloc(0));
  if (n === 1) return leafHash(items[0]);
  let k = 1;
  while (k * 2 < n) k *= 2;
  return sha256(NODE, mth(items.slice(0, k)), mth(items.slice(k)));
}
