/* The program from the browser, with nothing in between: the IDL the program was built with (copied to /ui/idl.json at build)
   drives a small Borsh codec, PDA derivation and instruction encoding. Only the instructions a visitor signs are used here:
   plant, deposit, request_unbond, withdraw, claim_plant. */
import { PublicKey, Transaction, TransactionInstruction } from 'https://esm.sh/@solana/web3.js@1.98.4?bundle';
import { rpc } from './data.js';
export { PublicKey, Transaction };

const enc = new TextEncoder();
const concat = (...p) => { const out = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let o = 0; for (const x of p) { out.set(x, o); o += x.length; } return out; };
const le = (n, bytes) => { const b = new Uint8Array(bytes); let v = BigInt(n); for (let i = 0; i < bytes; i++) { b[i] = Number(v & 255n); v >>= 8n; } return b; };
const pk = v => v instanceof PublicKey ? v : new PublicKey(v);
export const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const toB64 = b => btoa(String.fromCharCode(...b));
export const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
export const fromHex = h => Uint8Array.from(String(h).match(/.{2}/g) || [], x => parseInt(x, 16));
export const ZERO = new PublicKey(new Uint8Array(32));

export class Idl {
  constructor(idl) {
    this.idl = idl; this.program = new PublicKey((window.IA && window.IA.PROGRAM) || idl.address);
    this.types = Object.fromEntries(idl.types.map(t => [t.name, t.type]));
    this.accounts = Object.fromEntries(idl.accounts.map(a => [a.name, a]));
    this.errors = Object.fromEntries((idl.errors || []).map(e => [e.code, e.msg || e.name]));
  }
  encode(type, v) {
    const ints = { u8: 1, u16: 2, u32: 4, u64: 8, u128: 16 };
    if (ints[type]) return le(v, ints[type]);
    if (type === 'bool') return new Uint8Array([v ? 1 : 0]);
    if (type === 'pubkey') return pk(v).toBytes();
    if (type === 'string') { const s = enc.encode(String(v)); return concat(le(s.length, 4), s); }
    if (type.array) { const [t, n] = type.array; if (t === 'u8') { const b = v instanceof Uint8Array ? v : Uint8Array.from(v); if (b.length !== n) throw Error(`expected ${n} bytes`); return b; } return concat(...v.map(x => this.encode(t, x))); }
    if (type.vec) return concat(le(v.length, 4), ...v.map(x => this.encode(type.vec, x)));
    if (type.option) return v == null ? new Uint8Array([0]) : concat(new Uint8Array([1]), this.encode(type.option, v));
    if (type.defined) { const t = this.types[type.defined.name]; if (t.kind === 'struct') return concat(...t.fields.map(f => this.encode(f.type, v[f.name]))); }
    throw Error('cannot encode ' + JSON.stringify(type));
  }
  decode(type, b, o = 0) {
    const ints = { u8: 1, u16: 2, u32: 4, u64: 8, u128: 16 };
    if (ints[type]) { let v = 0n; for (let i = ints[type] - 1; i >= 0; i--) v = (v << 8n) + BigInt(b[o + i]); return [ints[type] <= 4 ? Number(v) : v, o + ints[type]]; }
    if (type === 'i64') { const [v, p] = this.decode('u64', b, o); return [BigInt.asIntN(64, v), p]; }
    if (type === 'bool') return [!!b[o], o + 1];
    if (type === 'pubkey') return [new PublicKey(b.slice(o, o + 32)), o + 32];
    if (type === 'string') { const [n, p] = this.decode('u32', b, o); return [new TextDecoder().decode(b.slice(p, p + n)), p + n]; }
    if (type.option) return b[o] ? this.decode(type.option, b, o + 1) : [null, o + 1];
    if (type.vec) { const [n, p0] = this.decode('u32', b, o); o = p0; const out = []; for (let i = 0; i < n; i++) { const [v, p] = this.decode(type.vec, b, o); out.push(v); o = p; } return [out, o]; }
    if (type.array) { const [t, n] = type.array; if (t === 'u8') return [b.slice(o, o + n), o + n]; const out = []; for (let i = 0; i < n; i++) { const [v, p] = this.decode(t, b, o); out.push(v); o = p; } return [out, o]; }
    if (type.defined) { const t = this.types[type.defined.name]; if (t.kind === 'struct') { const out = {}; for (const f of t.fields) { const [v, p] = this.decode(f.type, b, o); out[f.name] = v; o = p; } return [out, o]; } }
    throw Error('cannot decode ' + JSON.stringify(type));
  }
  async fetch(name, address) {
    const r = await rpc('getAccountInfo', [pk(address).toBase58(), { encoding: 'base64', commitment: 'confirmed' }]);
    if (!r || !r.value) return null;
    const d = b64(r.value.data[0]);
    const disc = this.accounts[name].discriminator;
    if (disc.some((x, i) => d[i] !== x)) return null;
    return this.decode({ defined: { name } }, d, 8)[0];
  }
  pda(...seeds) { return PublicKey.findProgramAddressSync(seeds.map(s => typeof s === 'string' ? enc.encode(s) : s), this.program)[0]; }
  /** accounts by name: what the caller gives, else the IDL's fixed address, else a PDA from the IDL's seeds */
  instruction(name, args = {}, given = {}) {
    const ix = this.idl.instructions.find(x => x.name === name);
    if (!ix) throw Error('no instruction ' + name);
    const out = {};
    const argType = n => ix.args.find(a => a.name === n).type;
    const get = a => {
      if (out[a.name]) return out[a.name];
      if (a.name in given) return given[a.name] == null ? null : pk(given[a.name]);
      if (a.address) return new PublicKey(a.address);
      if (a.pda) {
        const seeds = a.pda.seeds.map(s => {
          if (s.kind === 'const') return Uint8Array.from(s.value);
          if (s.kind === 'arg') return this.encode(argType(s.path), args[s.path]);
          if (s.kind === 'account' && !s.path.includes('.')) return get(ix.accounts.find(x => x.name === s.path)).toBytes();
          if (s.kind === 'account') throw Error(`pass ${a.name} for ${name}: its seeds read another account's data`);
          throw Error('seed ' + s.kind);
        });
        return PublicKey.findProgramAddressSync(seeds, this.program)[0];
      }
      if (a.optional) return null;
      throw Error(`missing account ${a.name} for ${name}`);
    };
    const keys = [];
    for (const a of ix.accounts) {
      const key = out[a.name] = get(a);
      // Anchor's convention for an absent optional account: the program id in its place
      keys.push(key ? { pubkey: key, isSigner: !!a.signer, isWritable: !!a.writable } : { pubkey: this.program, isSigner: false, isWritable: false });
    }
    const data = concat(Uint8Array.from(ix.discriminator), ...ix.args.map(a => this.encode(a.type, args[a.name])));
    return new TransactionInstruction({ programId: this.program, keys, data });
  }
  explain(e) {
    const logs = (e && (e.logs || (e.data && e.data.logs))) || [];
    for (const l of logs) { const m = /Error Message: (.+?)\.?$/.exec(l); if (m) return m[1]; }
    const m = /custom program error: 0x([0-9a-f]+)/i.exec(String(e && e.message || ''));
    if (m && this.errors[parseInt(m[1], 16)]) return this.errors[parseInt(m[1], 16)];
    const s = String(e && e.message || e);
    return /reject/i.test(s) ? 'rejected in the wallet' : s.slice(0, 200);
  }
}
let cached;
export const loadIdl = () => cached || (cached = fetch('/ui/idl.json').then(r => r.json()).then(j => new Idl(j)));
export const u16 = n => le(n, 2);
export const u64 = n => le(n, 8);
export const addr = {
  config: I => I.pda('config'), treasury: I => I.pda('treasury'), fund: I => I.pda('runner_fund'),
  agent: (I, id) => I.pda('agent', u16(id)), round: (I, s) => I.pda('round', u64(s)),
  plant: (I, s, j) => I.pda('plant', u64(s), new Uint8Array([j])), surety: (I, id, owner) => I.pda('surety', u16(id), pk(owner).toBytes()),
};
