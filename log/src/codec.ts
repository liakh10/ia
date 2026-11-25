/* Byte helpers shared by the log, the registry and the replay kit. No I/O. Base58 is written out here (Bitcoin alphabet) so
   the bundle needs no Solana SDK. */
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';

const utf8 = new TextEncoder();
export const text = (s: string): Uint8Array => utf8.encode(s);
export const untext = (b: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(b);

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const sha256 = (...parts: Uint8Array[]): Uint8Array => nobleSha256(concat(...parts));

export const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
export function unhex(s: unknown, len?: number, field = 'value'): Uint8Array {
  if (typeof s !== 'string' || !/^(0x)?[0-9a-fA-F]*$/.test(s) || s.replace(/^0x/, '').length % 2) throw new IaError('BAD_HEX', `${field} must be hex`);
  const b = new Uint8Array(Buffer.from(s.replace(/^0x/, ''), 'hex'));
  if (len !== undefined && b.length !== len) throw new IaError('BAD_LENGTH', `${field} must be ${len} bytes, got ${b.length}`);
  return b;
}

const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const AMAP = new Map([...ALPHA].map((c, i) => [c, i]));
export function toB58(b: Uint8Array): string {
  let zeros = 0;
  while (zeros < b.length && b[zeros] === 0) zeros++;
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let s = '';
  while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; }
  return '1'.repeat(zeros) + s;
}
export function b58decode(s: string): Uint8Array {
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  let n = 0n;
  for (const c of s) { const v = AMAP.get(c); if (v === undefined) throw new IaError('BAD_BASE58', 'not base58'); n = n * 58n + BigInt(v); }
  const out: number[] = [];
  while (n > 0n) { out.unshift(Number(n & 0xffn)); n >>= 8n; }
  return Uint8Array.from([...new Array(zeros).fill(0), ...out]);
}
export function fromB58(s: unknown, len = 32, field = 'address'): Uint8Array {
  if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{1,128}$/.test(s)) throw new IaError('BAD_BASE58', `${field} must be base58`);
  const b = b58decode(s);
  if (b.length !== len) throw new IaError('BAD_LENGTH', `${field} must decode to ${len} bytes`);
  return b;
}

export function u64le(v: bigint | number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(v), true);
  return b;
}
export function u16le(v: number): Uint8Array { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; }
export const readU64le = (b: Uint8Array, o: number): bigint => new DataView(b.buffer, b.byteOffset + o, 8).getBigUint64(0, true);
export const readU16le = (b: Uint8Array, o: number): number => new DataView(b.buffer, b.byteOffset + o, 2).getUint16(0, true);

export function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/** Every rejection: a stable code, a sentence a person can act on, the HTTP status. */
export class IaError extends Error {
  code: string; status: number; details?: Record<string, unknown>;
  constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
    super(message); this.name = 'IaError'; this.code = code; this.status = status; if (details) this.details = details;
  }
}
