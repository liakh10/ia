/* RFC 8785 (JCS) canonical JSON, the form transcript entries are hashed in (CONTRACT §6). Same rules as
   runner/lib/canon.mjs: object keys sorted by UTF-16 code units, ECMAScript number and string serialization, no whitespace,
   undefined members dropped. An independent implementation on purpose: the verifier re-canonicalizes what the runner wrote. */
import { IaError } from './codec.js';

export function canon(v: unknown): string {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new IaError('NOT_CANONICAL', 'non-finite number');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : canon(x))).join(',') + ']';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter(k => o[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
  }
  throw new IaError('NOT_CANONICAL', 'unsupported JSON value: ' + typeof v);
}

/** parses one line and requires it to be exactly its own canonical form */
export function parseCanonical(line: string, where = 'line'): any {
  let v: unknown;
  try { v = JSON.parse(line); } catch { throw new IaError('NOT_CANONICAL', `${where} is not JSON`); }
  if (canon(v) !== line) throw new IaError('NOT_CANONICAL', `${where} is JSON but not in RFC 8785 canonical form`);
  return v;
}
