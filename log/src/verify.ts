/* What a client, a witness or the replay kit checks against the log, with nothing but the log key and the program id:
   a signed head, an entry's inclusion in it, one head extending another, and a witness cosignature. */
import { IaError, unhex, fromB58 } from './codec.js';
import { leafHash, verifyInclusion, verifyConsistency } from './merkle.js';
import { cosignBytes, sthBytes, verifySig, type Signer } from './keys.js';
import type { SignedHead } from './log.js';

export function checkHead(h: SignedHead, logKey: string, programId: Uint8Array): boolean {
  if (h.logKey !== logKey) return false;
  return verifySig(unhex(h.signature, 64, 'signature'), sthBytes(programId, h.treeSize, unhex(h.rootHash, 32, 'root')), fromB58(logKey));
}

export function checkInclusion(leaf: Uint8Array, p: { index: number; treeSize: number; path: string[] }, rootHex: string): boolean {
  return verifyInclusion(leafHash(leaf), p.index, p.treeSize, p.path.map(x => unhex(x, 32, 'path')), unhex(rootHex, 32, 'root'));
}

export function checkConsistency(m: number, n: number, oldRoot: string, newRoot: string, path: string[]): boolean {
  return verifyConsistency(m, n, unhex(oldRoot, 32, 'root'), unhex(newRoot, 32, 'root'), path.map(x => unhex(x, 32, 'path')));
}

/** A witness step: the new head must be signed by the log key and extend the last cosigned one; then it is cosigned. */
export function cosignHead(w: Signer, programId: Uint8Array, logKey: string, head: SignedHead,
  prev: { treeSize: number; rootHash: string } | null, proof: string[] | null, timestamp = Math.floor(Date.now() / 1000)) {
  if (!checkHead(head, logKey, programId)) throw new IaError('BAD_SIGNATURE', 'the head is not signed by the log key');
  if (prev) {
    if (head.treeSize < prev.treeSize) throw new IaError('LOG_SHRANK', `the log shrank from ${prev.treeSize} to ${head.treeSize}`);
    if (!proof || !checkConsistency(prev.treeSize, head.treeSize, prev.rootHash, head.rootHash, proof))
      throw new IaError('INCONSISTENT', `head ${head.treeSize} does not extend ${prev.treeSize}`);
  }
  const sig = w.sign(cosignBytes(programId, head.treeSize, unhex(head.rootHash, 32), timestamp));
  return { witnessKey: w.address, treeSize: head.treeSize, rootHash: head.rootHash, timestamp, signature: Buffer.from(sig).toString('hex') };
}
export function checkCosignature(c: { witnessKey: string; treeSize: number; rootHash: string; timestamp: number; signature: string }, programId: Uint8Array): boolean {
  return verifySig(unhex(c.signature, 64), cosignBytes(programId, c.treeSize, unhex(c.rootHash, 32), c.timestamp), fromB58(c.witnessKey));
}
