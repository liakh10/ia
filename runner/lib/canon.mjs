// RFC 8785 (JCS) canonical JSON: object keys sorted by UTF-16 code units, ECMAScript number and string serialization, no whitespace.
// Transcript entries (CONTRACT §6) are hashed in this form, so `step` and the Merkle leaves are reproducible from the published files.
export function canon(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw Error('canon: non-finite number');
    return JSON.stringify(v);
  }
  if (typeof v === 'bigint') throw Error('canon: bigint (convert to a decimal string or a safe integer first)');
  if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : canon(x))).join(',') + ']';
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  throw Error('canon: unsupported ' + typeof v);
}
export const canonBytes = v => Buffer.from(canon(v), 'utf8');
