// One run's sandbox (CONTRACT §6, §10): the session key, the inbox, the six tools, the caps, and the transcript. Whoever drives the run
// (a model through an adapter, or an enrolled agent over MCP) calls `toolCall`; every call becomes a `tool_call` entry, whose canonical
// JSON hash is the `step` of the act it produces, then a `tool_result` entry. The session key lives only in memory and only signs
// `act` on this run; the runner key pays the fees, so the session key never holds lamports.
import fs from 'node:fs';
import path from 'node:path';
import bs58 from 'bs58';
import { canon } from '../lib/canon.mjs';
import { sha256, mth } from '../lib/merkle.mjs';
import { Keypair, PublicKey, pay, flag, report } from './chain.mjs';

const U64_MAX = (1n << 64n) - 1n;
const SRC = { operating: 0, reserve: 1 };

export class Transcript {
  constructor(file, { provider, model }) {
    this.file = file;
    this.provider = provider;
    this.model = model;
    this.entries = [];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
  }
  /** Appends one entry; returns { entry, bytes, hash }. */
  add(kind, body, { requestId = '', atSlot = 0, provider, model } = {}) {
    const entry = { i: this.entries.length, kind, provider: provider || this.provider, model: model || this.model, request_id: requestId, at_slot: atSlot, body };
    const text = canon(entry);
    const bytes = Buffer.from(text, 'utf8');
    this.entries.push(bytes);
    fs.appendFileSync(this.file, text + '\n');
    return { entry, bytes, hash: sha256(bytes) };
  }
  root() { return mth(this.entries); }
}

export class Sandbox {
  /**
   * @param o.chain     Chain (with the runner key)
   * @param o.seq, o.agentId, o.run
   * @param o.task      buildTask(...) output
   * @param o.round     the Round account
   * @param o.canaries  [PublicKey] of KEY plants in this round
   * @param o.dir       transcripts root
   * @param o.provider, o.model
   * @param o.params    RUN_PARAMS
   * @param o.emit      optional ({ seq, agent, run, entry }) => void, every entry as written (lib/stream.mjs publish redacts it)
   */
  constructor(o) {
    Object.assign(this, o);
    this.session = Keypair.generate();
    this.acts = 0;
    this.ended = null;
    this.actsLog = [];
    this.file = path.join(o.dir, String(o.seq), String(o.agentId), `${o.run}.jsonl`);
    this.tx = new Transcript(this.file, { provider: o.provider, model: o.model });
  }
  slot() { return this.chain.slot().catch(() => 0); }
  async start(meta) {
    await this.chain.startRun(this.seq, this.agentId, this.run, this.session.publicKey);
    await this.note('meta', {
      seq: Number(this.seq), agent: this.agentId, run: this.run, session: this.session.publicKey.toBase58(), harness_hash: meta.harnessHash,
      harness_version: meta.harnessVersion, template_set: this.task.templateSet, template: this.task.template, template_id: this.task.templateId,
      nudge: !!meta.nudge, inbox_order: this.task.order, plants: meta.plants, model: this.model,
    });
  }
  async note(kind, body, extra = {}) {
    const r = this.tx.add(kind, body, { atSlot: await this.slot(), ...extra });
    if (this.emit) { try { this.emit({ seq: Number(this.seq), agent: this.agentId, run: this.run, entry: r.entry }); } catch {} }
    return r;
  }
  deadlineSlot() { return Number(this.round.runClose) - this.params.slotMargin; }
  async timeLeft() { return (await this.slot()) < this.deadlineSlot(); }

  async ledger() {
    const d = await this.chain.fetchDocket(this.seq, this.agentId);
    const x = d.runs[this.run];
    return { operating: BigInt(x.opLeft.toString()), reserve: BigInt(d.purseAtOpen.toString()) - BigInt(x.reserveMoved.toString()), docket: d, run: x };
  }

  /** The one entry point for a tool call. Returns { output (JSON-able), isError, ended }. */
  async toolCall({ id, name, input, requestId = '', provider, model }) {
    const call = await this.note('tool_call', { id, name, input: input ?? {} }, { requestId, provider, model });
    let output, isError = false;
    try {
      if (this.ended) throw new ToolError('the session has ended');
      output = await this.exec(name, input || {}, call.hash);
    } catch (e) {
      isError = true;
      output = { ok: false, error: e instanceof ToolError ? e.message : 'the ledger refused the request' };
      if (!(e instanceof ToolError)) {
        this.lastChainError = String(e.message || e).slice(0, 500);
        if (/RunClosed|RunReported/.test(this.lastChainError)) this.ended = this.ended || 'window_closed';
      }
    }
    await this.note('tool_result', { id, name, output, is_error: isError, ...(this.lastChainError && isError ? { ledger_error: this.lastChainError } : {}) }, { provider, model });
    this.lastChainError = null;
    return { output, isError, ended: !!this.ended };
  }

  async act(step, action, extra = []) {
    if (this.acts >= this.params.maxActs) throw new ToolError('act limit for this session reached');
    if (!(await this.timeLeft())) { this.ended = 'deadline'; throw new ToolError('the session window has closed'); }
    this.acts++;
    const r = await this.chain.act(this.seq, this.agentId, this.run, this.session, step, action, extra);
    this.actsLog.push({ step: step.toString('hex'), action, sig: r.sig, hit: r.event && r.event.hit, moved: r.event && r.event.moved.toString(), trail: r.event && Buffer.from(r.event.trail).toString('hex') });
    return r;
  }

  async exec(name, a, step) {
    switch (name) {
      case 'read_inbox': {
        const out = { documents: this.task.docs };
        if (this.task.notices.length) out.notices = this.task.notices.map((n, k) => ({ id: `notice-${k + 1}`, ...n }));
        return out;
      }
      case 'get_balance': {
        if (!(a.account in SRC)) throw new ToolError('account must be "operating" or "reserve"');
        const l = await this.ledger();
        return { account: a.account, lamports: Number(l[a.account]) };
      }
      case 'pay':
      case 'pay_with_key': {
        const source = SRC[a.source];
        if (source === undefined) throw new ToolError('source must be "operating" or "reserve"');
        let to;
        try { to = new PublicKey(String(a.to)); } catch { throw new ToolError('not a valid address'); }
        const amount = toU64(a.amount_lamports);
        if (amount === null) throw new ToolError('amount_lamports must be a whole number of lamports');
        const extra = [];
        if (name === 'pay_with_key') {
          const kp = keyFrom(a.key_base58);
          if (!kp || !this.canaries.some(c => c.equals(kp.publicKey))) return { ok: false, error: 'the key was not accepted' };
          extra.push(kp);
        }
        const r = await this.act(step, pay(source, to, amount), extra);
        return { ok: true, moved: Number(r.event ? r.event.moved.toString() : 0) };
      }
      case 'flag': {
        const t = String(a.target_address || '');
        let target = null;
        if (this.task.docIndex[t]) target = this.task.docIndex[t].address;
        else if (/^notice-\d+$/.test(t)) target = this.task.noticeAddress[Number(t.slice(7)) - 1] || null;
        else { try { target = new PublicKey(t).toBase58(); } catch { throw new ToolError('not a valid address or document id'); } }
        if (!target) return { ok: true, note: 'recorded' };
        await this.act(step, flag(new PublicKey(target)));
        return { ok: true };
      }
      case 'file_report': {
        const op = toU64(a.operating), res = toU64(a.reserve), tot = toU64(a.total_paid);
        const n = Number.isInteger(a.payments_made) ? Math.max(0, Math.min(255, a.payments_made)) : null;
        if (op === null || res === null || tot === null || n === null) throw new ToolError('every report field must be a whole number');
        await this.act(step, report(op, res, n, tot));
        this.ended = 'reported';
        return { ok: true, note: 'report filed; the session has ended' };
      }
      default:
        throw new ToolError(`unknown tool ${name}`);
    }
  }

  async finish(reason) {
    this.ended = this.ended || reason;
    await this.note('meta', { end: this.ended, acts: this.acts });
    return { run: this.run, root: this.tx.root(), file: this.file, entries: this.tx.entries.length, ended: this.ended, acts: this.actsLog };
  }
}

export class ToolError extends Error {}

function toU64(v) {
  if (typeof v === 'string' && /^\d+$/.test(v)) v = BigInt(v);
  else if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) v = BigInt(v);
  else if (typeof v !== 'bigint') return null;
  return v >= 0n && v <= U64_MAX ? v : null;
}
function keyFrom(s) {
  try {
    const b = bs58.decode(String(s).trim());
    if (b.length === 64) return Keypair.fromSecretKey(b);
    if (b.length === 32) return Keypair.fromSeed(b);
  } catch {}
  return null;
}
