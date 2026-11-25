/* Heads anchored on chain (CONTRACT §8): the log key sends an SPL Memo `ia-log:1:<program id>:<tree size>:<root hex>` as the
   transaction's fee payer (so its signature is on the transaction): the chain records "the log key published this head at this
   slot". Anyone finds the anchors with getSignaturesForAddress(log key) and checks
   any later head against them with a consistency proof. A docket's transcript root is also anchored by the program itself
   (post_transcript → DocketSettled.transcript_root). */
import { IaError, b58decode, hex, toB58, untext } from './codec.js';
import { MEMO_PROGRAMS, memoTransaction, sendAndConfirm, type Rpc } from './rpc.js';
import type { Signer } from './keys.js';

export interface Anchor { treeSize: number; rootHash: string; slot: number; signature: string; blockTime: number | null }

export const anchorMemo = (programId: string, size: number, rootHex: string) => `ia-log:1:${programId}:${size}:${rootHex}`;

export function parseAnchorMemo(memo: string, programId: string): { treeSize: number; rootHash: string } | null {
  const m = /^ia-log:1:([1-9A-HJ-NP-Za-km-z]{32,44}):(\d{1,15}):([0-9a-f]{64})$/.exec(memo);
  if (!m || m[1] !== programId) return null;
  return { treeSize: Number(m[2]), rootHash: m[3] };
}

export async function sendAnchor(rpc: Rpc, signer: Signer, programId: string, size: number, rootHex: string): Promise<string> {
  const bh = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const tx = memoTransaction(signer, anchorMemo(programId, size, rootHex), bh.value.blockhash);
  return sendAndConfirm(rpc, tx);
}

/** the log key's anchors, newest first (up to `limit` transactions scanned) */
export async function findAnchors(rpc: Rpc, logKey: string, programId: string, limit = 100): Promise<Anchor[]> {
  const sigs: any[] = await rpc('getSignaturesForAddress', [logKey, { limit, commitment: 'confirmed' }]);
  const out: Anchor[] = [];
  for (const s of sigs) {
    if (s.err) continue;
    const t = await rpc('getTransaction', [s.signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
    if (!t || t.meta?.err) continue;
    const keys: string[] = t.transaction.message.accountKeys;
    if (keys[0] !== logKey) continue; // the log key must be the fee payer (so it signed)
    for (const ix of t.transaction.message.instructions) {
      if (!MEMO_PROGRAMS.includes(keys[ix.programIdIndex])) continue;
      if (!ix.accounts.some((a: number) => keys[a] === logKey)) continue;
      let memo: string;
      try { memo = untext(b58decode(ix.data)); } catch { continue; }
      const p = parseAnchorMemo(memo, programId);
      if (p) out.push({ ...p, slot: t.slot, signature: s.signature, blockTime: t.blockTime ?? null });
    }
  }
  return out;
}

export { hex, toB58 };
export const noAnchor = () => new IaError('NOT_FOUND', 'no anchor yet', 404);
