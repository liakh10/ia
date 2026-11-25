/* Runner authentication (CONTRACT §7): header `authorization: IA-Runner <pubkey b58>.<unix s>.<sig b58>`, the ed25519
   signature over the UTF-8 text `IA-RUNNER1\n<METHOD>\n<path>\n<unix s>\n<hex sha256(body)>`. The key must be the runner the
   program's Config names right now, and the time within ±300 s. The body hash binds a POST to its content. */
import { IaError, fromB58, hex, sha256, text, toB58 } from '../../log/src/codec.js';
import { verifySig, type Signer } from '../../log/src/keys.js';

export const AUTH_SKEW_S = 300;
export const authMessage = (method: string, path: string, unix: number, body: Uint8Array) =>
  text(`IA-RUNNER1\n${method.toUpperCase()}\n${path}\n${unix}\n${hex(sha256(body))}`);

/** what the runner sends (used by the runner's client, the tests and the e2e) */
export function runnerAuth(signer: Signer, method: string, path: string, body: Uint8Array = new Uint8Array(), unix = Math.floor(Date.now() / 1000)) {
  return `IA-Runner ${signer.address}.${unix}.${toB58(signer.sign(authMessage(method, path, unix, body)))}`;
}

export function checkRunnerAuth(header: string | null, method: string, path: string, body: Uint8Array, runner: string, now = Math.floor(Date.now() / 1000)) {
  const m = /^IA-Runner ([1-9A-HJ-NP-Za-km-z]{32,44})\.(\d{1,12})\.([1-9A-HJ-NP-Za-km-z]{60,90})$/.exec(header || '');
  if (!m) throw new IaError('UNAUTHORIZED', 'this route is for the runner: send authorization: IA-Runner <key>.<unix>.<signature>', 401);
  const unix = Number(m[2]);
  if (Math.abs(now - unix) > AUTH_SKEW_S) throw new IaError('UNAUTHORIZED', 'the signed time is more than 300 s away from now', 401);
  if (m[1] !== runner) throw new IaError('FORBIDDEN', 'that key is not the runner the program names', 403);
  let sig: Uint8Array;
  try { sig = fromB58(m[3], 64, 'signature'); } catch { throw new IaError('UNAUTHORIZED', 'bad signature encoding', 401); }
  if (!verifySig(sig, authMessage(method, path, unix, body), fromB58(m[1]))) throw new IaError('UNAUTHORIZED', 'the signature does not verify', 401);
}
