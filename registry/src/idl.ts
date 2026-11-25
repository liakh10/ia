/* Reads the `ia` program's accounts and events from the committed IDL (idl/ia.json, inlined in the bundle, so the bundle hash
   pins it). A small Borsh reader driven by the IDL types, so a field the program agent adds is picked up by `npm run
   sync-idl` without hand-kept offsets. Events are read from transaction logs only where the `ia` program itself is the
   innermost running program (a CPI'd program cannot forge an `ia` event line). */
import idlJson from '../idl/ia.json';
import { IaError, toB58, equal } from '../../log/src/codec.js';

const idl: any = idlJson;
export const IDL_ADDRESS: string = idl.address;
const types = new Map<string, any>(idl.types.map((t: any) => [t.name, t]));
const accDisc = new Map<string, Uint8Array>(idl.accounts.map((a: any) => [a.name, Uint8Array.from(a.discriminator)]));
const evDisc: [string, Uint8Array][] = idl.events.map((e: any) => [e.name, Uint8Array.from(e.discriminator)]);

class Reader {
  o = 0;
  constructor(public b: Uint8Array) {}
  take(n: number) { if (this.o + n > this.b.length) throw new IaError('BAD_ACCOUNT', 'account data too short', 502); const s = this.b.subarray(this.o, this.o + n); this.o += n; return s; }
  dv(n: number) { const s = this.take(n); return new DataView(s.buffer, s.byteOffset, n); }
}

function read(r: Reader, t: any): any {
  if (typeof t === 'string') {
    switch (t) {
      case 'u8': return r.take(1)[0];
      case 'i8': return r.dv(1).getInt8(0);
      case 'bool': return r.take(1)[0] !== 0;
      case 'u16': return r.dv(2).getUint16(0, true);
      case 'i16': return r.dv(2).getInt16(0, true);
      case 'u32': return r.dv(4).getUint32(0, true);
      case 'i32': return r.dv(4).getInt32(0, true);
      case 'u64': return r.dv(8).getBigUint64(0, true);
      case 'i64': return r.dv(8).getBigInt64(0, true);
      case 'u128': { const d = r.dv(16); return d.getBigUint64(0, true) | (d.getBigUint64(8, true) << 64n); }
      case 'pubkey': return toB58(r.take(32).slice());
      case 'string': { const n = r.dv(4).getUint32(0, true); return new TextDecoder().decode(r.take(n)); }
      case 'bytes': { const n = r.dv(4).getUint32(0, true); return r.take(n).slice(); }
      default: throw new IaError('INTERNAL', `idl type ${t}`, 500);
    }
  }
  if (t.array) {
    const [inner, n] = t.array;
    if (inner === 'u8') return r.take(n).slice();
    return Array.from({ length: n }, () => read(r, inner));
  }
  if (t.vec) { const n = r.dv(4).getUint32(0, true); if (t.vec === 'u8') return r.take(n).slice(); return Array.from({ length: n }, () => read(r, t.vec)); }
  if (t.option) return r.take(1)[0] ? read(r, t.option) : null;
  if (t.defined) return readDefined(r, typeof t.defined === 'string' ? t.defined : t.defined.name);
  throw new IaError('INTERNAL', 'idl type ' + JSON.stringify(t), 500);
}

const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
function readDefined(r: Reader, name: string): any {
  const d = types.get(name);
  if (!d) throw new IaError('INTERNAL', `idl has no type ${name}`, 500);
  if (d.serialization && d.serialization !== 'borsh') throw new IaError('INTERNAL', `${name} is ${d.serialization}, not borsh`, 500);
  if (d.type.kind === 'struct') return Object.fromEntries(d.type.fields.map((f: any) => [camel(f.name), read(r, f.type)]));
  if (d.type.kind === 'enum') {
    const v = d.type.variants[r.take(1)[0]];
    if (!v) throw new IaError('BAD_ACCOUNT', `bad ${name} variant`, 502);
    const fields = v.fields ? Object.fromEntries(v.fields.map((f: any, i: number) => [camel(f.name ?? String(i)), read(r, f.type ?? f)])) : {};
    return { kind: v.name, ...fields };
  }
  throw new IaError('INTERNAL', `idl kind ${d.type.kind}`, 500);
}

/** decodes a Borsh account (Config, Round, Plant, Agent, …), checking its discriminator */
export function decodeAccount<T = any>(name: string, data: Uint8Array): T {
  const disc = accDisc.get(name);
  if (!disc) throw new IaError('INTERNAL', `idl has no account ${name}`, 500);
  if (data.length < 8 || !equal(data.subarray(0, 8), disc)) throw new IaError('BAD_ACCOUNT', `not a ${name} account`, 502);
  return readDefined(new Reader(data.subarray(8)), name);
}

export function decodeEvent(data: Uint8Array): { name: string; data: any } | null {
  if (data.length < 8) return null;
  for (const [name, d] of evDisc) if (equal(data.subarray(0, 8), d)) {
    try { return { name, data: readDefined(new Reader(data.subarray(8)), name) }; } catch { return null; }
  }
  return null;
}

/** `ia` events in a transaction's log lines, in order, only where `ia` is the innermost running program */
export function eventsFromLogs(logs: string[], programId = IDL_ADDRESS): { name: string; data: any }[] {
  const stack: string[] = [];
  const out: { name: string; data: any }[] = [];
  for (const line of logs || []) {
    let m: RegExpExecArray | null;
    if ((m = /^Program (\w+) invoke \[\d+\]$/.exec(line))) { stack.push(m[1]); continue; }
    if ((m = /^Program (\w+) (success|failed)/.exec(line))) { if (stack[stack.length - 1] === m[1]) stack.pop(); continue; }
    if (line.startsWith('Program data: ') && stack[stack.length - 1] === programId) {
      const e = decodeEvent(new Uint8Array(Buffer.from(line.slice(14), 'base64')));
      if (e) out.push(e);
    }
  }
  return out;
}

export const idlInstructions = (): string[] => idl.instructions.map((i: any) => i.name);
