#!/usr/bin/env node
/* The IA replay kit (SPEC §6). Read-only: it never signs or sends anything.
     replay case <seq>-<agent>-<run> --api <https://site> --rpc <url> [--program <id>] [--log-key <b58>] [--task <runner/task/index.mjs>]
                 [--openweights <OpenAI-compatible base url of a batch-invariant server>] [--json]
     replay rates --api <https://site> [--agent <id>]                       the Index's rates with Wilson 95% bounds, from VERDICT leaves
     replay compare <k>/<n> <k>/<n>                                          is a replayed rate consistent with a published one (Fisher)
     replay env <seq> --dir <folder of re-run .jsonl> --rpc <url> [--program <id>] [--published <k>/<n>]
                                                                             closed APIs: tiers of re-runs in the same environment, as a rate
   Exit code 0 when every check passed (or nothing could fail), 1 otherwise. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const V = await import(pathToFileURL(path.join(here, '../../registry/dist/ia-verifier.mjs')).href).catch(() => {
  console.error('build the bundle first: cd ia/registry && npm ci && npm run build'); process.exit(2);
});
const { replay, stats, RpcChain, jsonRpc, findAnchors, IDL_ADDRESS, decodeLeaf, unhex, rules, pdas } = V;

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = k => argv.includes('--' + k);
const cmd = argv[0];
const program = opt('program', process.env.IA_PROGRAM || IDL_ADDRESS);
const frac = s => { const m = /^(\d+)\/(\d+)$/.exec(s || ''); if (!m) { console.error(`expected k/n, got ${s}`); process.exit(2); } return { k: +m[1], n: +m[2] }; };
const pct = w => w.rate === null ? '–' : `${(w.rate * 100).toFixed(1)}% [${(w.low * 100).toFixed(1)}–${(w.high * 100).toFixed(1)}]`;

if (cmd === 'case') {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(argv[1] || '');
  if (!m || !opt('api') || !opt('rpc')) { console.error('replay case <seq>-<agent>-<run> --api <url> --rpc <url>'); process.exit(2); }
  const rpc = jsonRpc(opt('rpc').split(','));
  const chain = new RpcChain(rpc, program);
  const data = await replay.gatherCase({ seq: BigInt(m[1]), agent: +m[2], run: +m[3], chain, api: opt('api'), anchors: k => findAnchors(rpc, k, program, 200) });
  if (opt('log-key')) data.logKey = opt('log-key');
  else console.error('note: the log key is taken from the head itself; pin it with --log-key for a real check');
  if (opt('task')) data.buildTask = (await import(pathToFileURL(path.resolve(opt('task'))).href)).buildTask;
  if (opt('openweights')) {
    const base = opt('openweights').replace(/\/$/, '');
    data.openWeights = async req => { const r = await fetch(base + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) }); return r.json(); };
  }
  const rep = await replay.verifyCase(data);
  if (flag('json')) console.log(JSON.stringify(rep, null, 2));
  else {
    console.log(`CASE #${rep.case}  settled tier: ${rep.tier ?? '?'}`);
    for (const c of rep.checks) console.log(`  ${c.ok === true ? 'ok  ' : c.ok === false ? 'FAIL' : 'skip'}  ${c.name}${c.detail ? '  (' + c.detail + ')' : ''}`);
    console.log(rep.ok ? 'all checks passed' : 'SOME CHECKS FAILED');
  }
  process.exit(rep.ok ? 0 : 1);
}

if (cmd === 'rates') {
  const api = opt('api'); if (!api) { console.error('replay rates --api <url>'); process.exit(2); }
  const get = async p => (await fetch(api.replace(/\/$/, '') + p)).json();
  const head = await get('/api/log?head');
  const by = new Map();
  for (let i = 0; i < head.treeSize; i += 256) {
    const page = await get(`/api/log?from=${i}&to=${i + 256}`);
    for (const e of page.entries) if (e.kind === 'verdict') {
      const d = decodeLeaf(unhex(e.leaf));
      if (opt('agent') && d.agent !== +opt('agent')) continue;
      by.set(d.agent, [...(by.get(d.agent) || []), ...d.runs.map(r => r.tier)]);
    }
  }
  for (const [agent, tiers] of [...by].sort((a, b) => a[0] - b[0])) {
    const r = stats.ratesFromTiers(tiers);
    console.log(`agent ${agent}: ${r.runs} runs · taken ${pct(r.taken)} · lied ${pct(r.lied)} · false report ${pct(r.falseReport)} · flagged ${pct(r.flagged)} · complete ${pct(r.complete)}`);
  }
  process.exit(0);
}

if (cmd === 'compare') {
  const c = stats.compareRates(frac(argv[1]), frac(argv[2]));
  console.log(`published ${pct(c.published)} vs replayed ${pct(c.replayed)}: Fisher p = ${c.pValue.toFixed(4)} → ${c.consistent ? 'consistent' : 'NOT consistent'} at α = ${c.alpha}`);
  process.exit(c.consistent ? 0 : 1);
}

if (cmd === 'env') {
  const seq = BigInt(argv[1] ?? -1), dir = opt('dir');
  if (seq < 0n || !dir || !opt('rpc')) { console.error('replay env <seq> --dir <folder> --rpc <url>'); process.exit(2); }
  const chain = new RpcChain(jsonRpc(opt('rpc').split(',')), program);
  const P = pdas(program);
  const evs = await chain.events(P.round(seq));
  const opened = evs.find(e => e.name === 'RoundOpened')?.data;
  if (!opened) { console.error(`round ${seq} has no RoundOpened event`); process.exit(1); }
  const planted = evs.filter(e => e.name === 'Planted').map(e => e.data).sort((a, b) => a.idx - b.idx);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).sort();
  const byAgent = new Map();
  for (const f of files) {
    const jsonl = fs.readFileSync(path.join(dir, f), 'utf8');
    const agent = JSON.parse(jsonl.split('\n')[0]).body.agent;
    const dOpen = evs.find(e => e.name === 'DocketOpened' && e.data.agent === agent)?.data;
    const docket = { seq, purseAtOpen: BigInt(dOpen?.purseAtOpen ?? 0), task: rules.task(opened.seed),
      plants: planted.map(p => ({ class: p.class, address: P.plant(seq, p.idx), canary: p.class === 1 ? p.canary : null, target: BigInt(p.target) })) };
    const { tier } = replay.tierFromTranscript(jsonl, docket);
    byAgent.set(agent, [...(byAgent.get(agent) || []), tier]);
    console.log(`${f}: agent ${agent} → ${rules.TIER_NAME[tier]}`);
  }
  for (const [agent, tiers] of byAgent) {
    const r = stats.ratesFromTiers(tiers);
    console.log(`agent ${agent}: ${r.runs} re-runs · taken ${pct(r.taken)}`);
    if (opt('published')) { const c = stats.compareRates(frac(opt('published')), { k: r.taken.k, n: r.taken.n }); console.log(`  vs published: p = ${c.pValue.toFixed(4)} → ${c.consistent ? 'consistent' : 'NOT consistent'}`); }
  }
  process.exit(0);
}

console.error('usage: replay case <seq>-<agent>-<run> | rates | compare <k>/<n> <k>/<n> | env <seq>   (see the header of this file)');
process.exit(2);
