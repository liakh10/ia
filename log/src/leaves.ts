/* The log's leaf data (CONTRACT §8). Every leaf is `0x01 version ‖ kind u8 ‖ body`, integers little-endian. Leaves hold hashes
   and small fixed fields only: plant texts and transcripts live in the content store, addressed by the hashes here, so a
   harmful text that slipped past the filter can be withheld (a REDACTION leaf says so, publicly) while every hash stays
   checkable. */
import { IaError, concat, equal, readU16le, readU64le, text, u16le, u64le, untext } from './codec.js';

export const LEAF_VERSION = 1;
export const KIND = { MANIFEST: 1, TRANSCRIPT: 2, HARNESS: 3, VERDICT: 4, REVEAL: 5, FORECAST: 6, REDACTION: 7 } as const;
export const KIND_NAME: Record<number, string> = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [v, k.toLowerCase()]));

export type Leaf =
  | { kind: 'manifest'; seq: bigint; plantClose: bigint; plants: { idx: number; delivered: boolean; textHash: Uint8Array }[]; bundle: Uint8Array }
  | { kind: 'transcript'; seq: bigint; agent: number; docketRoot: Uint8Array; runs: { root: Uint8Array; entries: number; fileHash: Uint8Array }[] }
  | { kind: 'harness'; seq: bigint; harness: Uint8Array; manifest: string }
  | { kind: 'verdict'; seq: bigint; agent: number; epoch: number; slot: bigint; tx: Uint8Array; purseAtOpen: bigint; bountyTotal: bigint; transcriptRoot: Uint8Array; runs: { tier: number; taken: number; trail: Uint8Array }[] }
  | { kind: 'reveal'; seq: bigint; idx: number; class: number; medium: number; target: bigint; textHash: Uint8Array; canary: Uint8Array; canarySeed: Uint8Array; textLen: number }
  | { kind: 'forecast'; seq: bigint; agent: number; call: number; signer: Uint8Array; signature: Uint8Array; slot: bigint }
  | { kind: 'redaction'; target: number; keyHash: Uint8Array; contentHash: Uint8Array; reason: string };

const u8 = (n: number) => Uint8Array.of(n & 0xff);
const u32le = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const need = (b: Uint8Array, len: number, what: string) => { if (b.length !== len) throw new IaError('BAD_LEAF', `${what} must be ${len} bytes`); return b; };

export function encodeLeaf(l: Leaf): Uint8Array {
  const head = (k: number) => Uint8Array.of(LEAF_VERSION, k);
  switch (l.kind) {
    case 'manifest':
      if (l.plants.length > 16) throw new IaError('BAD_LEAF', 'at most 16 plants');
      return concat(head(KIND.MANIFEST), u64le(l.seq), u64le(l.plantClose), u8(l.plants.length),
        ...l.plants.flatMap(p => [u8(p.idx), u8(p.delivered ? 1 : 0), need(p.textHash, 32, 'text hash')]), need(l.bundle, 32, 'bundle'));
    case 'transcript':
      if (l.runs.length < 1 || l.runs.length > 8) throw new IaError('BAD_LEAF', '1 to 8 runs');
      return concat(head(KIND.TRANSCRIPT), u64le(l.seq), u16le(l.agent), need(l.docketRoot, 32, 'docket root'), u8(l.runs.length),
        ...l.runs.flatMap(r => [need(r.root, 32, 'run root'), u32le(r.entries), need(r.fileHash, 32, 'file hash')]));
    case 'harness': {
      const m = text(l.manifest);
      if (m.length > 65_535) throw new IaError('BAD_LEAF', 'harness manifest too large');
      return concat(head(KIND.HARNESS), u64le(l.seq), need(l.harness, 32, 'harness'), u32le(m.length), m);
    }
    case 'verdict':
      return concat(head(KIND.VERDICT), u64le(l.seq), u16le(l.agent), u32le(l.epoch), u64le(l.slot), need(l.tx, 64, 'tx signature'),
        u64le(l.purseAtOpen), u64le(l.bountyTotal), need(l.transcriptRoot, 32, 'transcript root'), u8(l.runs.length),
        ...l.runs.flatMap(r => [u8(r.tier), u16le(r.taken), need(r.trail, 32, 'trail')]));
    case 'reveal':
      return concat(head(KIND.REVEAL), u64le(l.seq), u8(l.idx), u8(l.class), u8(l.medium), u64le(l.target), need(l.textHash, 32, 'text hash'),
        need(l.canary, 32, 'canary'), need(l.canarySeed, 32, 'canary seed'), u16le(l.textLen));
    case 'forecast':
      return concat(head(KIND.FORECAST), u64le(l.seq), u16le(l.agent), u8(l.call), need(l.signer, 32, 'signer'), need(l.signature, 64, 'signature'), u64le(l.slot));
    case 'redaction': {
      const r = text(l.reason);
      if (r.length > 255) throw new IaError('BAD_LEAF', 'reason too long');
      return concat(head(KIND.REDACTION), u8(l.target), need(l.keyHash, 32, 'key hash'), need(l.contentHash, 32, 'content hash'), u8(r.length), r);
    }
  }
}

export function decodeLeaf(b: Uint8Array): Leaf {
  let o = 0;
  const take = (n: number) => { if (o + n > b.length) throw new IaError('BAD_LEAF', 'leaf too short'); const s = b.slice(o, o + n); o += n; return s; };
  const r8 = () => take(1)[0], r16 = () => readU16le(take(2), 0), r32 = () => new DataView(take(4).buffer).getUint32(0, true), r64 = () => readU64le(take(8), 0);
  if (r8() !== LEAF_VERSION) throw new IaError('BAD_LEAF', 'unknown leaf version');
  const k = r8();
  let l: Leaf;
  switch (k) {
    case KIND.MANIFEST: {
      const seq = r64(), plantClose = r64(), n = r8();
      const plants = Array.from({ length: n }, () => ({ idx: r8(), delivered: r8() === 1, textHash: take(32) }));
      l = { kind: 'manifest', seq, plantClose, plants, bundle: take(32) }; break;
    }
    case KIND.TRANSCRIPT: {
      const seq = r64(), agent = r16(), docketRoot = take(32), n = r8();
      l = { kind: 'transcript', seq, agent, docketRoot, runs: Array.from({ length: n }, () => ({ root: take(32), entries: r32(), fileHash: take(32) })) }; break;
    }
    case KIND.HARNESS: {
      const seq = r64(), harness = take(32), n = r32();
      l = { kind: 'harness', seq, harness, manifest: untext(take(n)) }; break;
    }
    case KIND.VERDICT: {
      const seq = r64(), agent = r16(), epoch = r32(), slot = r64(), tx = take(64), purseAtOpen = r64(), bountyTotal = r64(), transcriptRoot = take(32), n = r8();
      l = { kind: 'verdict', seq, agent, epoch, slot, tx, purseAtOpen, bountyTotal, transcriptRoot, runs: Array.from({ length: n }, () => ({ tier: r8(), taken: r16(), trail: take(32) })) }; break;
    }
    case KIND.REVEAL:
      l = { kind: 'reveal', seq: r64(), idx: r8(), class: r8(), medium: r8(), target: r64(), textHash: take(32), canary: take(32), canarySeed: take(32), textLen: r16() }; break;
    case KIND.FORECAST:
      l = { kind: 'forecast', seq: r64(), agent: r16(), call: r8(), signer: take(32), signature: take(64), slot: r64() }; break;
    case KIND.REDACTION: {
      const target = r8(), keyHash = take(32), contentHash = take(32), n = r8();
      l = { kind: 'redaction', target, keyHash, contentHash, reason: untext(take(n)) }; break;
    }
    default: throw new IaError('BAD_LEAF', `unknown leaf kind ${k}`);
  }
  if (o !== b.length) throw new IaError('BAD_LEAF', 'trailing bytes in leaf');
  if (!equal(encodeLeaf(l), b)) throw new IaError('BAD_LEAF', 'leaf is not in its canonical encoding');
  return l;
}

/** JSON view of a leaf (bytes as hex, u64 as decimal strings) */
export function leafJson(l: Leaf): Record<string, unknown> {
  const j = (v: unknown): unknown => v instanceof Uint8Array ? Buffer.from(v).toString('hex') : typeof v === 'bigint' ? v.toString()
    : Array.isArray(v) ? v.map(j) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, j(x)])) : v;
  return j(l) as Record<string, unknown>;
}
