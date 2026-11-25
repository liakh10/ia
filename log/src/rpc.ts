/* A minimal Solana JSON-RPC client over fetch (a comma list of nodes, tried in order), plus program-derived addresses and a
   legacy transaction builder small enough for the memo anchor. No SDK, so the bundle stays small and auditable. */
import { ed25519 } from '@noble/curves/ed25519.js';
import { IaError, b58decode, concat, sha256, text, toB58 } from './codec.js';
import type { Signer } from './keys.js';

export type Rpc = (method: string, params: unknown[]) => Promise<any>;

export function jsonRpc(urls: string[], timeoutMs = 15_000): Rpc {
  let id = 0;
  return async (method, params) => {
    let last: unknown;
    for (const url of urls) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(timeoutMs) });
        const j: any = await r.json();
        if (j.error) { last = new IaError('RPC_ERROR', `${method}: ${j.error.message || 'error'}`, 502, { rpc: j.error }); if (j.error.code === -32602 || /invalid/i.test(j.error.message)) throw last; continue; }
        return j.result;
      } catch (e) { last = e; if (e instanceof IaError && e.code === 'RPC_ERROR') throw e; }
    }
    throw last instanceof IaError ? last : new IaError('RPC_UNAVAILABLE', `${method}: no RPC node answered`, 503);
  };
}

export function isOnCurve(b: Uint8Array): boolean {
  try { ed25519.Point.fromBytes(b); return true; } catch { return false; }
}
export function createProgramAddress(seeds: Uint8Array[], programId: Uint8Array): Uint8Array | null {
  const h = sha256(...seeds, programId, text('ProgramDerivedAddress'));
  return isOnCurve(h) ? null : h;
}
export function findProgramAddress(seeds: Uint8Array[], programId: Uint8Array): [Uint8Array, number] {
  for (let bump = 255; bump >= 0; bump--) {
    const a = createProgramAddress([...seeds, Uint8Array.of(bump)], programId);
    if (a) return [a, bump];
  }
  throw new IaError('INTERNAL', 'no program address', 500);
}

const compactU16 = (n: number): Uint8Array => {
  const out: number[] = [];
  for (;;) { let b = n & 0x7f; n >>= 7; if (n) b |= 0x80; out.push(b); if (!n) break; }
  return Uint8Array.from(out);
};

/** SPL Memo v2 (checks that every listed signer signed); v1 `Memo1Uhk…` anchors are accepted by readers too. The log key is the fee
 *  payer and the memo's listed signer. The local validator loads the same mainnet bytes (registry/test/e2e/chain.sh). */
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const MEMO_PROGRAMS = [MEMO_PROGRAM, 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo'];

/** a legacy transaction: one signer (the fee payer and the memo's signer), one memo instruction */
export function memoTransaction(signer: Signer, memo: string, recentBlockhash: string): Uint8Array {
  const data = text(memo);
  if (data.length > 500) throw new IaError('INTERNAL', 'memo too long', 500);
  const message = concat(
    Uint8Array.of(1, 0, 1),
    compactU16(2), signer.publicKey, b58decode(MEMO_PROGRAM),
    b58decode(recentBlockhash),
    compactU16(1), Uint8Array.of(1), compactU16(1), Uint8Array.of(0), compactU16(data.length), data,
  );
  return concat(compactU16(1), signer.sign(message), message);
}

export async function sendAndConfirm(rpc: Rpc, tx: Uint8Array, timeoutMs = 60_000): Promise<string> {
  const sig: string = await rpc('sendTransaction', [Buffer.from(tx).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const st = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]);
    const s = st?.value?.[0];
    if (s?.err) throw new IaError('CHAIN_REJECTED', `transaction failed: ${JSON.stringify(s.err)}`, 502);
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return sig;
    await new Promise(r => setTimeout(r, 400));
  }
  throw new IaError('CHAIN_UNCERTAIN', `no confirmation for ${sig} yet; check before retrying`, 504, { signature: sig });
}

export { toB58 };
