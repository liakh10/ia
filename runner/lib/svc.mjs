// The runner's calls to the verifier's services (registry, log), signed with the runner key (BOARD 2026-11-25 verifier):
//   authorization: IA-Runner <runner pubkey b58>.<unix s>.<ed25519 sig b58>
//   signed text:   IA-RUNNER1\n<METHOD>\n<path>\n<unix s>\n<hex sha256(body)>
// Base URL: IA_SERVICES_URL (the site origin). Without it the runner uses local fixtures and keeps transcripts local.
import crypto from 'node:crypto';
import bs58 from 'bs58';

const b64u = b => Buffer.from(b).toString('base64url');
export function runnerAuth(kp, method, pathname, body = '', now = Math.floor(Date.now() / 1000)) {
  const sk = Buffer.from(kp.secretKey);
  const key = crypto.createPrivateKey({ key: { kty: 'OKP', crv: 'Ed25519', d: b64u(sk.subarray(0, 32)), x: b64u(sk.subarray(32)) }, format: 'jwk' });
  const text = `IA-RUNNER1\n${method}\n${pathname}\n${now}\n${crypto.createHash('sha256').update(body).digest('hex')}`;
  const sig = crypto.sign(null, Buffer.from(text, 'utf8'), key);
  return `IA-Runner ${kp.publicKey.toBase58()}.${now}.${bs58.encode(sig)}`;
}

export const servicesUrl = () => (process.env.IA_SERVICES_URL || '').replace(/\/$/, '');

async function call(kp, method, pathname, json) {
  const body = json === undefined ? '' : JSON.stringify(json);
  const r = await fetch(servicesUrl() + pathname, {
    method, body: body || undefined,
    headers: { authorization: runnerAuth(kp, method, pathname, body), ...(body ? { 'content-type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(60_000),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(`${method} ${pathname}: ${r.status} ${JSON.stringify(out).slice(0, 200)}`);
  return out;
}

/** Delivered plants with texts (only after plant close): { seq, manifest, plants: [{ idx, class, medium, target, textHash, address, text }] } */
export const fetchPlants = (kp, seq) => call(kp, 'GET', `/api/plant/internal/${seq}`);
/** One run's transcript → { runRoot }; then close the docket → { docketRoot, index }. */
export const postRun = (kp, seq, agent, run, jsonl) => call(kp, 'POST', '/api/log/transcript', { seq: Number(seq), agent, run, jsonl });
export const closeDocket = (kp, seq, agent, runs) => call(kp, 'POST', '/api/log/transcript', { seq: Number(seq), agent, close: true, runs });
export const postHarness = (kp, seq, harness, manifest) => call(kp, 'POST', '/api/log/harness', { seq: Number(seq), harness, manifest });
