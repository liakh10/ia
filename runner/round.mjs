// A test round, end to end, from the runner's side (BUILD: runTest(seq), the crank loop):
//   commitFor(chain, seq)       harness manifest → .data/harness/<seq>.json, commit_harness (before plant close)
//   runTest(chain, seq, opts)   after plant close: delivered plants (hash-checked) → the task → open_docket per lineup agent →
//                               runs (fresh session key each; a model through the adapters, or an enrolled agent over MCP) →
//                               transcripts → post_transcript (docket root) → summary
//   settleRound(chain, seq)     after run close: settle_docket for every docket (anyone can call it)
//   crank(chain, opts)          the loop: open → commit → wait → close empty or run → wait → settle → next
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTask } from './task/index.mjs';
import { harness, RUN_PARAMS, HARNESS_VERSION } from './harness/prompt.mjs';
import { Sandbox } from './harness/sandbox.mjs';
import { driveModel } from './harness/drive.mjs';
import { serveEnrol } from '../adapters/enrol/server.mjs';
import { mth, sha256 } from './lib/merkle.mjs';
import { big, PublicKey } from './harness/chain.mjs';
import { servicesUrl, fetchPlants, postRun, closeDocket, postHarness } from './lib/svc.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA = process.env.IA_DATA || path.resolve(here, '../.data');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

export async function lineupOf(chain, round) {
  const ids = Array.from(round.lineup.slice(0, round.lineupLen));
  const out = [];
  for (const id of ids) out.push({ id, model: chain.modelOf(await chain.fetchAgent(id)) });
  return out;
}

export async function commitFor(chain, seq) {
  const round = await chain.fetchRound(seq);
  const cfg = await chain.fetchConfig();
  const models = await lineupOf(chain, round);
  const { manifest, commit } = harness({ models, nudge: round.nudge, maxRuns: cfg.params.maxRuns });
  const file = path.join(DATA, 'harness', `${seq}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ seq: Number(seq), commit: commit.toString('hex'), manifest }, null, 1));
  const sig = await chain.commitHarness(seq, commit);
  if (servicesUrl()) await postHarness(chain.runner, seq, commit.toString('hex'), manifest);
  return { commit, sig, file };
}

/** Delivered plants: the registry's texts whose sha256 equals the on-chain text_hash (the runner re-checks every one; class and medium
 *  come from the chain, never from the registry). Source: IA_SERVICES_URL (GET /api/plant/internal/:seq, runner-signed) or the local
 *  fixture file .data/registry/<seq>.json ([{ idx, text }]). */
export async function deliveredPlants(chain, seq, round) {
  let texts = [];
  if (servicesUrl()) {
    texts = (await fetchPlants(chain.runner, seq)).plants || [];
  } else {
    const f = path.join(DATA, 'registry', `${seq}.json`);
    if (fs.existsSync(f)) texts = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  const byIdx = new Map(texts.map(t => [Number(t.idx), String(t.text)]));
  const out = [], refused = [];
  for (let j = 0; j < round.plantCount; j++) {
    const p = await chain.fetchPlant(seq, j);
    const text = byIdx.get(j);
    if (!p || text === undefined) { refused.push({ idx: j, why: 'no text' }); continue; }
    if (!sha256(Buffer.from(text, 'utf8')).equals(Buffer.from(p.textHash))) { refused.push({ idx: j, why: 'hash mismatch' }); continue; }
    out.push({ idx: j, class: p.class, medium: p.medium, text, address: chain.plantPda(seq, j).toBase58() });
  }
  return { plants: out, refused };
}

/**
 * @param opts.onEnrol  (ticket: { seq, agent, run, url, token, deadlineSlot }) => void — how an enrolled agent learns its endpoint
 *                      (a test hands it to a scripted client; in production the operator fetches the ticket).
 * @param opts.params   RUN_PARAMS overrides
 */
export async function runTest(chain, seq, opts = {}) {
  const params = { ...RUN_PARAMS, ...(opts.params || {}) };
  const r0 = await chain.fetchRound(seq);
  if (!r0) throw Error(`no round ${seq}`);
  if (!r0.harnessSet) throw Error(`round ${seq}: no harness commit`);
  await chain.waitSlot(big(r0.plantClose) - 1n);
  const round = await chain.fetchRound(seq); // plants are final now
  const hfile = path.join(DATA, 'harness', `${seq}.json`);
  const hrec = JSON.parse(fs.readFileSync(hfile, 'utf8'));
  if (hrec.commit !== Buffer.from(round.harness).toString('hex')) throw Error('the harness on chain is not the one in ' + hfile);
  const { plants, refused } = await deliveredPlants(chain, seq, round);
  // a plant the registry did not deliver (or whose text does not match its hash) is withheld on chain before any run starts, so it can
  // never be caught (CONTRACT §4, IA-04 note); the program refuses this after the first start_run
  if (refused.length && !Number(round.runsStarted || 0)) {
    const mask = refused.reduce((m, x) => m | (1 << x.idx), 0);
    await chain.withholdPlants(seq, mask);
    log(`round ${seq}: withheld plants ${refused.map(x => `${x.idx} (${x.why})`).join(', ')}`);
  }
  const task = buildTask({ seed: Buffer.from(round.seed), plants });
  const canaries = plants.filter(p => p.class === 1).map(p => new PublicKey(round.canary[p.idx]));
  const lineup = await lineupOf(chain, round);
  const tdir = path.join(DATA, 'transcripts');
  log(`round ${seq}: template ${task.templateId}, ${task.numbers.n} invoices, ${plants.length} plants delivered${refused.length ? `, ${refused.length} refused` : ''}, nudge ${round.nudge}`);

  async function docket(agent) {
    if (!(await chain.fetchDocket(seq, agent.id))) await chain.openDocket(seq, agent.id);
    const d = await chain.fetchDocket(seq, agent.id);
    // the task numbers on chain must be the ones the generator made: the proof that rules.mjs = rules.rs for this seed
    const same = d.invoiceCount === task.numbers.n && big(d.operating) === BigInt(task.numbers.operating) &&
      task.numbers.amounts.every((a, i) => big(d.invoices[i]) === BigInt(a)) && task.numbers.vendors.every((v, i) => d.vendors[i].toBase58() === v);
    if (!same) throw Error(`agent ${agent.id}: the docket's task numbers differ from runner/task`);
    const provider = agent.model.split('/')[0];
    const runs = [];
    for (let r = 0; r < d.runCount; r++) {
      if ((await chain.slot()) >= Number(round.runClose) - params.slotMargin) { log(`agent ${agent.id} run ${r}: window closing, not started (VOID)`); break; }
      const sb = new Sandbox({ chain, seq, agentId: agent.id, run: r, task, round, canaries, dir: tdir, provider, model: agent.model, params, emit: opts.emit });
      await sb.start({ harnessHash: hrec.commit, harnessVersion: HARNESS_VERSION, nudge: round.nudge, plants: plants.map(p => p.idx) });
      let res;
      if (provider === 'enrol') {
        const srv = await serveEnrol({ sandbox: sb, nudge: round.nudge });
        const ticket = { seq: Number(seq), agent: agent.id, run: r, url: srv.url, token: srv.token, deadlineSlot: sb.deadlineSlot() };
        const tf = path.join(DATA, 'enrol', `${seq}-${agent.id}-${r}.json`);
        fs.mkdirSync(path.dirname(tf), { recursive: true });
        fs.writeFileSync(tf, JSON.stringify(ticket), { mode: 0o600 });
        if (opts.onEnrol) Promise.resolve(opts.onEnrol(ticket)).catch(e => log(`enrolled agent ${agent.id}: ${e.message}`));
        res = await sb.finish(await srv.done);
        fs.rmSync(tf, { force: true });
      } else {
        res = await driveModel(sb, { nudge: round.nudge, params, agentId: agent.id });
      }
      log(`agent ${agent.id} (${agent.model}) run ${r}: ${res.ended}, ${res.acts.length} acts, ${res.entries} entries, root ${res.root.toString('hex').slice(0, 16)}…`);
      runs.push(res);
    }
    const root = mth(runs.map(x => x.root));
    if (runs.length && servicesUrl()) {
      for (const x of runs) {
        const { runRoot } = await postRun(chain.runner, seq, agent.id, x.run, fs.readFileSync(x.file, 'utf8'));
        if (runRoot !== x.root.toString('hex')) throw Error(`log run root differs for agent ${agent.id} run ${x.run}`);
      }
      const { docketRoot } = await closeDocket(chain.runner, seq, agent.id, runs.length);
      if (docketRoot !== root.toString('hex')) throw Error(`log docket root differs for agent ${agent.id}`);
    }
    if (runs.length) await chain.postTranscript(seq, agent.id, root);
    return { agent: agent.id, model: agent.model, root: root.toString('hex'), runs, payer: d.payer };
  }
  const dockets = await Promise.all(lineup.map(a => docket(a).catch(e => ({ agent: a.id, model: a.model, error: String(e.message || e) }))));
  const summary = { seq: Number(seq), template: task.templateId, plants: plants.map(p => ({ idx: p.idx, class: p.class, medium: p.medium })), refused, dockets };
  fs.mkdirSync(path.join(DATA, 'rounds'), { recursive: true });
  fs.writeFileSync(path.join(DATA, 'rounds', `${seq}.json`), JSON.stringify(summary, (k, v) => (typeof v === 'bigint' ? v.toString() : Buffer.isBuffer(v) ? v.toString('hex') : v), 1));
  return summary;
}

export async function settleRound(chain, seq) {
  const round = await chain.fetchRound(seq);
  await chain.waitSlot(round.runClose);
  const out = [];
  for (const id of Array.from(round.lineup.slice(0, round.lineupLen))) {
    const d = await chain.fetchDocket(seq, id);
    if (!d) continue;
    const { event } = await chain.settleDocket(seq, id, d.payer);
    out.push({ agent: id, tiers: event ? Array.from(event.tiers) : null, event });
  }
  return out;
}

/** The crank: anyone can run the permissionless half (open, close empty, settle); with the runner key it also commits and runs. */
export async function crank(chain, { lineup, once = false, onEnrol, params, emit, stop = () => false } = {}) {
  for (;;) {
    if (stop()) return;
    const cfg = await chain.fetchConfig();
    const next = big(cfg.nextRound);
    const prev = next > 0n ? await chain.fetchRound(next - 1n) : null;
    let seq;
    if (prev && prev.state !== 2) seq = next - 1n;
    else {
      const ids = lineup || await activeAgents(chain, cfg);
      seq = (await chain.openRound(ids)).seq;
      log(`opened round ${seq}`);
    }
    const r = await chain.fetchRound(seq);
    if (chain.runner && !r.harnessSet && (await chain.slot()) < Number(r.plantClose)) { await commitFor(chain, seq); log(`round ${seq}: harness committed`); }
    await chain.waitSlot(r.plantClose);
    const r2 = await chain.fetchRound(seq);
    if (r2.plantCount === 0) { await chain.closeEmptyRound(seq); log(`round ${seq}: no plants, closed`); }
    else {
      if (chain.runner && r2.harnessSet) await runTest(chain, seq, { onEnrol, params, emit });
      const s = await settleRound(chain, seq);
      log(`round ${seq}: settled`, s.map(x => `${x.agent}:${x.tiers}`).join(' '));
    }
    if (once) return seq;
  }
}

async function activeAgents(chain, cfg) {
  const ids = [];
  for (let id = 0; id < cfg.agentCount; id++) {
    const a = await chain.program.account.agent.fetchNullable(chain.agentPda(id));
    if (a && a.active && a.kind === 0) ids.push(id);
  }
  return ids;
}
