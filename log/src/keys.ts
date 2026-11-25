/* ed25519 keys and the signed messages of the log (CONTRACT §8). A key arrives as a Solana keypair JSON (64 numbers:
   seed ‖ public key) from an env var on Vercel or a file in ~/.config/ia locally. The secret never leaves this module. */
import { ed25519 } from '@noble/curves/ed25519.js';
import { IaError, concat, equal, text, toB58, u64le } from './codec.js';

export interface Signer { publicKey: Uint8Array; address: string; sign(msg: Uint8Array): Uint8Array }

export function signerFromJson(json: string, name = 'key'): Signer {
  let arr: unknown;
  try { arr = JSON.parse(json); } catch { throw new IaError('KEY_MISSING', `${name} is not a keypair JSON`, 500); }
  if (!Array.isArray(arr) || arr.length !== 64) throw new IaError('KEY_MISSING', `${name} is not a 64-byte keypair`, 500);
  return signerFromSecret(Uint8Array.from(arr as number[]), name);
}
/** 64-byte secret (seed ‖ pub) */
export function signerFromSecret(full: Uint8Array, name = 'key'): Signer {
  if (full.length !== 64) throw new IaError('KEY_MISSING', `${name} is not a 64-byte keypair`, 500);
  const seed = full.slice(0, 32);
  const pub = ed25519.getPublicKey(seed);
  if (!equal(pub, full.subarray(32))) throw new IaError('KEY_MISSING', `${name}: the public half does not match the seed`, 500);
  return { publicKey: pub, address: toB58(pub), sign: (msg) => ed25519.sign(msg, seed) };
}
export function signerFromSeed(seed: Uint8Array): Signer { return signerFromSecret(concat(seed, ed25519.getPublicKey(seed))); }
export const publicKeyOf = (seed: Uint8Array): Uint8Array => ed25519.getPublicKey(seed);
export const randomSeed = (): Uint8Array => ed25519.utils.randomSecretKey();
export const verifySig = (sig: Uint8Array, msg: Uint8Array, pub: Uint8Array): boolean => {
  try { return sig.length === 64 && pub.length === 32 && ed25519.verify(sig, msg, pub); } catch { return false; }
};

/** Signed tree head: "IA-STH-1" (8) ‖ program_id (32) ‖ tree_size u64 (8) ‖ root_hash (32) = 80 bytes */
export const sthBytes = (programId: Uint8Array, size: number | bigint, rootHash: Uint8Array): Uint8Array =>
  concat(text('IA-STH-1'), programId, u64le(size), rootHash);
/** Witness cosignature: "IA-WIT-1" (8) ‖ program_id ‖ tree_size u64 ‖ root_hash ‖ timestamp u64 (unix s) = 88 bytes */
export const cosignBytes = (programId: Uint8Array, size: number | bigint, rootHash: Uint8Array, timestamp: number | bigint): Uint8Array =>
  concat(text('IA-WIT-1'), programId, u64le(size), rootHash, u64le(timestamp));
