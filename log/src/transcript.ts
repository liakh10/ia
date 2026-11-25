/* Transcripts (CONTRACT §6): one JSONL file per run, every line one RFC 8785 entry. Run root = RFC 9162 MTH over the
   entries' bytes; docket root = MTH over the runs' roots (each 32-byte root is one leaf's data), in run order. `step` of an
   act = sha256 of the canonical tool_call entry. */
import { IaError, sha256, text, hex } from './codec.js';
import { leafHash, root } from './merkle.js';
import { parseCanonical } from './jcs.js';

export const ENTRY_KINDS = ['meta', 'system', 'user', 'assistant', 'tool_call', 'tool_result'] as const;
export const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;

export interface ParsedRun {
  entries: any[]; lines: string[]; runRoot: Uint8Array; fileHash: Uint8Array; bytes: number;
  meta: { seq: number; agent: number; run: number; [k: string]: unknown };
}

/** checks a run file and computes its root; `expect` pins seq/agent/run from the meta entry */
export function parseRun(jsonl: string, expect?: { seq: number; agent: number; run: number }): ParsedRun {
  if (typeof jsonl !== 'string' || !jsonl.length) throw new IaError('BAD_TRANSCRIPT', 'the transcript is empty');
  const bytes = Buffer.byteLength(jsonl, 'utf8');
  if (bytes > MAX_TRANSCRIPT_BYTES) throw new IaError('TOO_LARGE', `a run transcript is at most ${MAX_TRANSCRIPT_BYTES} bytes`, 413);
  const lines = jsonl.endsWith('\n') ? jsonl.slice(0, -1).split('\n') : jsonl.split('\n');
  const entries = lines.map((l, i) => parseCanonical(l, `entry ${i}`));
  entries.forEach((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new IaError('BAD_TRANSCRIPT', `entry ${i} is not an object`);
    if (e.i !== i) throw new IaError('BAD_TRANSCRIPT', `entry ${i} has i = ${e.i}`);
    if (!(ENTRY_KINDS as readonly string[]).includes(e.kind)) throw new IaError('BAD_TRANSCRIPT', `entry ${i} has an unknown kind ${e.kind}`);
  });
  const m = entries[0];
  if (m.kind !== 'meta' || !m.body || typeof m.body !== 'object') throw new IaError('BAD_TRANSCRIPT', 'the first entry must be meta');
  const meta = { ...m.body, seq: Number(m.body.seq), agent: Number(m.body.agent), run: Number(m.body.run) };
  if (expect && (meta.seq !== expect.seq || meta.agent !== expect.agent || meta.run !== expect.run))
    throw new IaError('BAD_TRANSCRIPT', `the meta entry names ${meta.seq}/${meta.agent}/${meta.run}, not ${expect.seq}/${expect.agent}/${expect.run}`);
  const runRoot = root(lines.map(l => leafHash(text(l))));
  return { entries, lines, runRoot, fileHash: sha256(text(jsonl)), bytes, meta };
}

export const docketRoot = (runRoots: Uint8Array[]): Uint8Array => root(runRoots.map(r => leafHash(r)));
export const stepOf = (entryLine: string): Uint8Array => sha256(text(entryLine));
export const stepHex = (entryLine: string): string => hex(stepOf(entryLine));
