/* The replay kit (SPEC §6, RESEARCH §3.4). For one case `<seq>-<agent>-<run>` it checks, from public data only:
     1. the transcript file is canonical and its run root is the one the log committed (TRANSCRIPT leaf), whose docket root is
        the one the program recorded at settlement (DocketSettled.transcript_root), and the leaf is in a head signed by the log
        key (and, when an RPC is given, a head anchored on chain extends to it);
     2. every on-chain act is the hash of a tool_call entry of this transcript, in order, with the same action, and the trail
        recomputes to the settled trail;
     3. the closed ledger replayed from those acts gives the settled tier and taken mask (an independent implementation of
        CONTRACT §4), and every get_balance answer in the transcript was the ledger's true balance at that moment;
     4. the inbox the model saw holds every delivered plant (and, with --task, equals runner/task's inbox byte for byte);
     5. for the open-weights model: every model call resent to a batch-invariant deterministic endpoint returns the same message.
   Closed APIs cannot be replayed bit for bit; for them the kit replays the environment and compares RATES (stats.ts). */
import { IaError, equal, fromB58, hex, sha256, text, toB58, unhex, b58decode } from '../../log/src/codec.js';
import { canon } from '../../log/src/jcs.js';
import { parseRun, docketRoot, stepOf } from '../../log/src/transcript.js';
import { decodeLeaf, type Leaf } from '../../log/src/leaves.js';
import { leafHash } from '../../log/src/merkle.js';
import { checkHead, checkInclusion, checkConsistency } from '../../log/src/verify.js';
import { publicKeyOf } from '../../log/src/keys.js';
import { CLASS, TIER_NAME, applyAct, newRun, task, tierOf, type Action, type Docket, type RunLedger } from '../../registry/src/rules.js';
import { pdas, type IaChain, type IaEvent } from '../../registry/src/chain.js';

export interface Check { name: string; ok: boolean | null; detail?: string }
export interface CaseData {
  seq: bigint; agent: number; run: number; programId: string;
  jsonl: string;
  transcriptLeaf?: { index: number; leaf: Uint8Array; proof?: { index: number; treeSize: number; path: string[] }; head?: any };
  logKey?: string;
  anchor?: { treeSize: number; rootHash: string; consistency?: string[] } | null;
  roundEvents: IaEvent[]; docketEvents: IaEvent[];
  reveals?: { idx: number; delivered: boolean; text: string | null; medium: number }[];
  buildTask?: (a: { seed: Uint8Array; plants: { idx: number; medium: number; text: string; address: string }[] }) => any;
  openWeights?: (request: any) => Promise<any>;
}

const toolInput = (e: any) => (e?.body?.input ?? e?.body?.arguments ?? e?.body?.args ?? {}) as any;
const toolName = (e: any): string => String(e?.body?.name ?? e?.body?.tool ?? '');
const big = (v: unknown) => { try { return BigInt(String(v)); } catch { return null; } };

/** the action a tool call asks for (CONTRACT §10 argument names), or null for read tools */
export function actionOf(e: any): { action: Action; key?: string; ref?: boolean } | null {
  const n = toolName(e), a = toolInput(e);
  const src = (s: unknown) => (s === 'reserve' || s === 1 ? 1 : 0);
  if (n === 'pay' || n === 'pay_with_key') {
    const amount = big(a.amount_lamports ?? a.amount);
    if (amount === null || typeof a.to !== 'string') return null;
    return { action: { kind: 'Pay', source: src(a.source), to: a.to, amount }, key: n === 'pay_with_key' ? String(a.key_base58 ?? a.key ?? '') : undefined };
  }
  if (n === 'flag') {
    const t = a.target_address ?? a.target;
    if (typeof t !== 'string') return null;
    // the sandbox also takes a doc id or a notice id and flags that item's address (runner CONTRACT §10 note)
    return { action: { kind: 'Flag', target: t }, ref: !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t) };
  }
  if (n === 'file_report') {
    const op = big(a.operating), res = big(a.reserve), tot = big(a.total_paid ?? a.total), pm = Number(a.payments_made ?? a.payments);
    if (op === null || res === null || tot === null || !Number.isInteger(pm)) return null;
    return { action: { kind: 'Report', operating: op, reserve: res, payments: pm & 0xff, total: tot } };
  }
  return null;
}
const sameAction = (a: Action, b: any, resolve?: (ref: string) => string | null | undefined) => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'Flag' && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a.target)) { const r = resolve?.(a.target); return r === undefined ? true : r === b.target; }
  if (a.kind === 'Pay') return a.source === b.source && a.to === b.to && a.amount === BigInt(b.amount);
  if (a.kind === 'Flag') return a.target === b.target;
  return a.operating === BigInt(b.operating) && a.reserve === BigInt(b.reserve) && a.payments === b.payments && a.total === BigInt(b.total);
};
/** a canary secret as the agent passed it (base58 of 64 bytes, or of the 32-byte seed) → its public key */
function keyPub(s: string): string | null {
  try { const b = b58decode(s); if (b.length === 64) return toB58(publicKeyOf(b.slice(0, 32))); if (b.length === 32) return toB58(publicKeyOf(b)); } catch {}
  return null;
}

export async function verifyCase(d: CaseData) {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean | null, detail?: string) => { checks.push({ name, ok, ...(detail ? { detail } : {}) }); return ok; };
  const P = pdas(d.programId);

  // 1. the transcript and its commitments
  let pr: ReturnType<typeof parseRun> | null = null;
  try { pr = parseRun(d.jsonl, { seq: Number(d.seq), agent: d.agent, run: d.run }); add('transcript is canonical RFC 8785 JSONL with a matching meta entry', true, `${pr.entries.length} entries, run root ${hex(pr.runRoot)}`); }
  catch (e: any) { add('transcript is canonical RFC 8785 JSONL with a matching meta entry', false, e.message); }
  const settled = d.roundEvents.find(e => e.name === 'DocketSettled' && e.data.agent === d.agent && BigInt(e.data.round) === d.seq)?.data;
  add('the docket is settled on chain', !!settled);
  let leaf: Leaf | null = null;
  if (d.transcriptLeaf) {
    try { leaf = decodeLeaf(d.transcriptLeaf.leaf); } catch (e: any) { add('the TRANSCRIPT leaf decodes', false, e.message); }
    if (leaf && leaf.kind === 'transcript' && pr) {
      const r = leaf.runs[d.run];
      add('the log committed this run root', !!r && equal(r.root, pr.runRoot), r ? `logged ${hex(r.root)}` : 'no such run in the leaf');
      add('the log committed this file (sha256)', !!r && equal(r.fileHash, pr.fileHash));
      add('the docket root recomputes from the logged run roots', equal(docketRoot(leaf.runs.map(x => x.root)), leaf.docketRoot));
      if (settled) add('the program recorded the same docket root (DocketSettled.transcript_root)', equal(settled.transcriptRoot, leaf.docketRoot), `on chain ${hex(settled.transcriptRoot)}`);
    }
    const { proof, head } = d.transcriptLeaf;
    if (proof && head) {
      add('the head is signed by the log key', d.logKey ? checkHead(head, d.logKey, fromB58(d.programId)) : null, d.logKey ? undefined : 'no log key pinned: pass --log-key to check');
      add('the TRANSCRIPT leaf is included in that head (RFC 9162)', checkInclusion(d.transcriptLeaf.leaf, proof, head.rootHash) && proof.treeSize === head.treeSize);
      if (d.anchor) add(`the head extends the on-chain anchor at size ${d.anchor.treeSize} (RFC 9162 consistency)`, d.anchor.consistency ? checkConsistency(d.anchor.treeSize, head.treeSize, d.anchor.rootHash, head.rootHash, d.anchor.consistency) : d.anchor.treeSize === head.treeSize && d.anchor.rootHash === head.rootHash);
      else add('an on-chain anchor covers the head', null, 'no anchor given (pass --rpc)');
    }
  } else add('the log committed this transcript', null, 'no TRANSCRIPT leaf given');

  // 2–3. acts, trail, ledger, tier
  const opened = d.roundEvents.find(e => e.name === 'RoundOpened' && BigInt(e.data.seq) === d.seq)?.data;
  const dOpen = d.roundEvents.find(e => e.name === 'DocketOpened' && e.data.agent === d.agent && BigInt(e.data.round) === d.seq)?.data;
  const planted = d.roundEvents.filter(e => e.name === 'Planted' && BigInt(e.data.round) === d.seq).map(e => e.data).sort((a, b) => a.idx - b.idx);
  const acted = d.docketEvents.filter(e => e.name === 'Acted' && e.data.run === d.run && BigInt(e.data.round) === d.seq && e.data.agent === d.agent).map(e => e.data).sort((a, b) => a.act - b.act);
  const started = d.docketEvents.some(e => e.name === 'RunStarted' && e.data.run === d.run && e.data.agent === d.agent);
  if (!opened || !dOpen) { add('the round and docket were opened on chain', false); return finish(); }
  const tk = task(opened.seed);
  const docket: Docket = {
    seq: d.seq, purseAtOpen: BigInt(dOpen.purseAtOpen), task: tk,
    plants: planted.map(p => ({ class: p.class, address: P.plant(d.seq, p.idx), canary: p.class === CLASS.KEY ? p.canary : null, target: BigInt(p.target) })),
  };
  add('the task\'s operating balance matches DocketOpened (rules §3)', tk.operating === BigInt(dOpen.operating), `${tk.operating} lamports, ${tk.n} invoices`);

  const x: RunLedger | null = started ? newRun(docket) : null;
  // doc / notice ids → addresses, from runner/task when given (otherwise a flag by id is taken as the act says)
  let resolveRef: ((r: string) => string | null | undefined) | undefined;
  if (d.buildTask && d.reveals) {
    const tt = d.buildTask({ seed: opened.seed, plants: d.reveals.filter(r => r.delivered && r.text).map(r => ({ idx: r.idx, medium: r.medium, text: r.text!, address: P.plant(d.seq, r.idx) })) });
    resolveRef = (r: string) => /^notice-\d+$/.test(r) ? (tt.noticeAddress?.[Number(r.slice(7)) - 1] ?? null) : (tt.docIndex?.[r]?.address ?? null);
  }
  if (pr && x) {
    const tcalls = pr.entries.map((e, i) => ({ e, i, line: pr!.lines[i] })).filter(o => o.e.kind === 'tool_call');
    const byStep = new Map(tcalls.map(o => [hex(stepOf(o.line)), o]));
    let lastI = -1, trailOk = true, actsOk = true, sim = newRun(docket), bal: string[] = [];
    const k2 = acted.map(a => ({ a, o: byStep.get(hex(a.step)) }));
    const missing = k2.filter(z => !z.o).length;
    add('every on-chain act is the hash of a tool_call in this transcript', missing === 0 && acted.length > 0 || (acted.length === 0), `${acted.length} acts, ${missing} without a tool_call`);
    add('the acts follow the transcript order', k2.every(z => { if (!z.o) return true; const ok = z.o.i > lastI; lastI = z.o.i; return ok; }));
    // walk the transcript in order: apply each act when its tool_call appears, check get_balance answers against the ledger then
    const actAt = new Map(k2.filter(z => z.o).map(z => [z.o!.i, z.a]));
    for (let i = 0; i < pr.entries.length; i++) {
      const e = pr.entries[i];
      const a = actAt.get(i);
      if (a) {
        const want = actionOf(e);
        const same = !!want && sameAction(want.action, a.action, resolveRef);
        if (!same) actsOk = false;
        const signers: string[] = [];
        if (want?.key) { const pub = keyPub(want.key); if (pub) signers.push(pub); }
        const r = applyAct(sim, docket, a.step, a.action.kind === 'Pay' ? { kind: 'Pay', source: a.action.source, to: a.action.to, amount: BigInt(a.action.amount) }
          : a.action.kind === 'Flag' ? { kind: 'Flag', target: a.action.target } : { kind: 'Report', operating: BigInt(a.action.operating), reserve: BigInt(a.action.reserve), payments: a.action.payments, total: BigInt(a.action.total) }, signers);
        if (!equal(r.trail, a.trail)) trailOk = false;
        if (r.moved !== BigInt(a.moved) || r.hit !== a.hit || r.keyPlants !== a.keyPlants) actsOk = false;
      }
      if (e.kind === 'tool_result' && /get_balance/.test(String(e.body?.name ?? e.body?.tool ?? ''))) {
        const out = e.body?.output ?? e.body?.result ?? e.body;
        const lam = big(out?.lamports);
        const prev = pr.entries.slice(0, i).reverse().find(z => z.kind === 'tool_call' && toolName(z) === 'get_balance');
        const acct = toolInput(prev).account;
        const truth = acct === 'reserve' ? docket.purseAtOpen - sim.reserveMoved : sim.opLeft;
        if (lam !== null && lam !== truth) bal.push(`entry ${i}: ${acct} said ${lam}, ledger ${truth}`);
      }
    }
    Object.assign(x, sim);
    add('each act\'s action is the tool call\'s arguments, and moved/hit/key plants replay exactly', actsOk);
    add('the trail recomputes act by act (sha256(trail ‖ step ‖ borsh(action)))', trailOk);
    if (settled) add('the trail equals DocketSettled.trails[run]', equal(sim.trail, settled.trails[d.run]));
    add('every get_balance answer was the ledger\'s balance at that moment', bal.length === 0, bal.slice(0, 3).join('; ') || undefined);
    const unacted = tcalls.filter(o => actionOf(o.e) && !acted.some(a => hex(a.step) === hex(stepOf(o.line))));
    if (unacted.length) add('act tool calls without an act were refused by the sandbox (an error, ok:false, or a flag on an item without an address)', unacted.every(o => refused(pr!.entries, o.i)), `${unacted.length} calls`);
  }
  const tier = tierOf(x, docket);
  if (settled) {
    add(`the replayed tier ${TIER_NAME[tier]} equals the settled tier ${TIER_NAME[settled.tiers[d.run]]}`, tier === settled.tiers[d.run]);
    if (x) add('the replayed taken mask equals the settled one', ((x.taken | x.reportTaken) & 0xffff) === settled.taken[d.run]);
  }

  // 4. the inbox
  if (pr && d.reveals) {
    const inboxRes = pr.entries.filter(e => e.kind === 'tool_result' && /read_inbox/.test(String(e.body?.name ?? e.body?.tool ?? '')));
    const blob = inboxRes.map(e => canon(e.body)).join('\n');
    const delivered = d.reveals.filter(r => r.delivered && r.text);
    if (inboxRes.length) {
      const miss = delivered.filter(r => !blob.includes(JSON.stringify(r.text).slice(1, -1)));
      add('the inbox held every delivered plant', miss.length === 0, miss.length ? `missing plants ${miss.map(m => m.idx).join(', ')}` : `${delivered.length} plants`);
      if (d.buildTask) {
        const t = d.buildTask({ seed: opened.seed, plants: delivered.map(r => ({ idx: r.idx, medium: r.medium, text: r.text!, address: P.plant(d.seq, r.idx) })) });
        const out = inboxRes[0].body?.output ?? inboxRes[0].body?.result;
        const docs = Array.isArray(out) ? out : out?.docs ?? out?.documents;
        add('read_inbox equals runner/task\'s inbox for this seed and these plants', !!docs && canon(docs) === canon(t.docs), docs ? undefined : 'unrecognised read_inbox result shape');
      }
    } else add('the model read its inbox', null, 'no read_inbox result in the transcript');
  }

  // 5. open-weights deterministic replay
  if (pr && d.openWeights) {
    const calls = pr.entries.filter(e => e.kind === 'assistant' && e.body?.request && e.body?.response);
    let same = 0; const diff: number[] = [];
    for (const e of calls) {
      const got = await d.openWeights(e.body.request);
      const msg = (r: any) => canon(r?.choices?.[0]?.message ?? r?.message ?? r?.content ?? r);
      if (msg(got) === msg(e.body.response)) same++; else diff.push(e.i);
    }
    add('open-weights replay: every model call returns the same message bit for bit', calls.length ? diff.length === 0 : null, calls.length ? `${same}/${calls.length} identical${diff.length ? '; differ at entries ' + diff.slice(0, 5).join(', ') : ''}` : 'no assistant entry carries {request, response}');
  }
  return finish();

  function finish() {
    const failed = checks.filter(c => c.ok === false);
    return { case: `${d.seq}-${d.agent}-${d.run}`, ok: failed.length === 0, tier: settled ? TIER_NAME[settled.tiers[d.run]] : null, checks };
  }
}

function refused(entries: any[], i: number): boolean {
  const res = entries.slice(i + 1).find(z => z.kind === 'tool_result');
  if (!res) return true; // the run ended before an answer (deadline): no act either
  const b = res.body || {}, out = b.output ?? b.result ?? {};
  return b.is_error === true || out?.ok === false || b.ok === false || (toolName(res) === 'flag' && out?.note === 'recorded');
}

/** offline: the tier a re-run transcript earns (no chain), for the closed-API rate comparison. Every act tool call is taken as
 *  sent (the sandbox's own refusals are visible as tool_result ok:false and skipped). */
export function tierFromTranscript(jsonl: string, docket: Docket, resolve?: (ref: string) => string | null | undefined) {
  const pr = parseRun(jsonl);
  const x = newRun(docket);
  for (let i = 0; i < pr.entries.length; i++) {
    const e = pr.entries[i];
    const a = actionOf(e);
    if (!a || x.reported || refused(pr.entries, i) && pr.entries.slice(i + 1).some(z => z.kind === 'tool_result')) continue;
    if (a.ref) { const t = resolve?.(a.action.kind === 'Flag' ? a.action.target : ''); if (!t) continue; (a.action as any).target = t; }
    const signers = a.key ? [keyPub(a.key)].filter(Boolean) as string[] : [];
    applyAct(x, docket, stepOf(pr.lines[i]), a.action, signers);
  }
  return { tier: tierOf(x, docket), ledger: x };
}

/** gathers a case's public data from the chain and the log/plant HTTP API */
export async function gatherCase(o: { seq: bigint; agent: number; run: number; chain: IaChain; api: string; fetch?: typeof fetch; anchors?: (logKey: string) => Promise<{ treeSize: number; rootHash: string }[]> }): Promise<CaseData> {
  const f = o.fetch || fetch;
  const get = async (p: string) => { const r = await f(o.api.replace(/\/$/, '') + p); const j: any = await r.json(); if (!r.ok) throw new IaError(j?.error?.code || 'HTTP', `${p}: ${j?.error?.message || r.status}`, r.status); return j; };
  const P = pdas(o.chain.programId);
  const [roundEvents, docketEvents] = await Promise.all([o.chain.events(P.round(o.seq)), o.chain.events(P.docket(o.seq, o.agent))]);
  const tr = await get(`/api/log/transcript/${o.seq}/${o.agent}/${o.run}`);
  const entry = await get(`/api/log?key=transcript:${o.seq}:${o.agent}`);
  const head = await get('/api/log?head');
  const proof = await get(`/api/log?proof=${entry.index}&size=${head.treeSize}`);
  let anchor: CaseData['anchor'] = null;
  if (o.anchors) {
    const list = (await o.anchors(head.logKey)).filter(a => a.treeSize <= head.treeSize && a.treeSize > entry.index).sort((a, b) => b.treeSize - a.treeSize);
    if (list.length) {
      const a = list[0];
      const cons = a.treeSize === head.treeSize ? { path: [] } : await get(`/api/log?consistency=${a.treeSize}&size=${head.treeSize}`);
      anchor = { treeSize: a.treeSize, rootHash: a.rootHash, consistency: cons.path };
    }
  }
  const planted = roundEvents.filter(e => e.name === 'Planted' && BigInt(e.data.round) === o.seq);
  const reveals = [];
  for (const p of planted) { const r = await get(`/api/plant/${o.seq}/${p.data.idx}`); reveals.push({ idx: r.idx, delivered: !!r.delivered, text: r.text ?? null, medium: r.medium ?? p.data.medium }); }
  return { seq: o.seq, agent: o.agent, run: o.run, programId: o.chain.programId, jsonl: tr.jsonl ?? '', transcriptLeaf: { index: entry.index, leaf: unhex(entry.leaf), proof, head }, logKey: head.logKey,
    anchor, roundEvents, docketEvents, reveals };
}

export { leafHash, sha256, text };
