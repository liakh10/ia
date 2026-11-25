/* The verifier's keys, made for this project only.
     node scripts/keys.mjs            make the missing ones in ~/.config/ia/ (dir 700, files 600); print public keys only
     node scripts/keys.mjs --vercel   also replace IA_LOG_KEY and IA_SEAL_KEY in the linked Vercel project (production + preview):
                                      `vercel env rm` then `vercel env add`, the value through stdin only (VERCEL_BIN overrides
                                      the binary, for the test). The lead runs this once the Vercel project exists.
   Files: log.json (Solana keypair JSON, 64 numbers: the log's signing key and the memo anchor's fee payer) and seal.hex (32 bytes:
   AES-256-GCM key of the sealed store and the root of the rate-limit HMAC). An existing file is never overwritten.
   IA_CONFIG_DIR overrides the folder (tests). Nothing secret is ever printed. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ed25519 } from '@noble/curves/ed25519.js';

const dir = process.env.IA_CONFIG_DIR || path.join(os.homedir(), '.config', 'ia');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
fs.chmodSync(dir, 0o700);
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = (b) => { let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x); let s = ''; while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; } for (const x of b) { if (x) break; s = '1' + s; } return s; };

function keypair(name) {
  const f = path.join(dir, name + '.json');
  if (!fs.existsSync(f)) {
    const seed = crypto.randomBytes(32);
    fs.writeFileSync(f, JSON.stringify([...seed, ...ed25519.getPublicKey(seed)]), { mode: 0o600, flag: 'wx' });
    seed.fill(0);
  }
  fs.chmodSync(f, 0o600);
  const arr = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!Array.isArray(arr) || arr.length !== 64) { console.error(`${f} is not a 64-byte keypair: not touching it`); process.exit(1); }
  return { pub: b58(Uint8Array.from(arr.slice(32))), json: JSON.stringify(arr) };
}
function sealKey() {
  const f = path.join(dir, 'seal.hex');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  fs.chmodSync(f, 0o600);
  return fs.readFileSync(f, 'utf8').trim();
}
const log = keypair('log'), seal = sealKey();
console.log(JSON.stringify({ dir, logKey: log.pub, seal: 'present (not shown)' }, null, 2));

if (process.argv.includes('--vercel')) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const bin = process.env.VERCEL_BIN || 'vercel';
  for (const [name, value] of [['IA_LOG_KEY', log.json], ['IA_SEAL_KEY', seal]]) {
    for (const target of ['production', 'preview']) {
      spawnSync(bin, ['env', 'rm', name, target, '--yes'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
      const p = spawnSync(bin, ['env', 'add', name, target], { cwd: root, input: value, stdio: ['pipe', 'ignore', 'pipe'] });
      console.log(`${name} → ${target}: ${p.status === 0 ? 'set' : 'failed: ' + String(p.stderr).replace(/[A-Za-z0-9+/=]{40,}/g, '***').replace(/\[[\d,\s]{60,}\]/g, '***').slice(0, 160)}`);
    }
  }
}
