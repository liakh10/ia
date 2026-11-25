// The program's own vectors (program/test/vectors.json, written by rules.rs) recomputed with the fuzz JS model (written from CONTRACT).
//   node fuzz/vectors-check.mjs [program/test/vectors.json]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as M from './model.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
const V = JSON.parse(fs.readFileSync(process.argv[2] || path.join(here, '../program/test/vectors.json'), 'utf8'));
const bs58 = createRequire(path.join(here, '../program/package.json'))('bs58').default;
let n = 0; const bad = [];
const eq = (a, b, w) => { n++; if (String(a) !== String(b)) bad.push(`${w}: vectors ${b}, model ${a}`); };
const run = x => ({ started: x.started, opLeft: BigInt(x.op_left), reserveMoved: BigInt(x.reserve_moved), totalMoved: BigInt(x.total_moved), repOperating: BigInt(x.rep_operating), repReserve: BigInt(x.rep_reserve), declTotal: BigInt(x.decl_total), taken: x.taken, flagged: x.flagged, reportTaken: x.report_taken, payments: x.payments, paidMask: x.paid_mask, wrongPays: x.wrong_pays, strays: x.strays, reported: x.reported, declPayments: x.decl_payments });
for (const s of V.seeds) {
  const sd = M.seed(s.seq, s.slot, Buffer.from(s.hash, 'hex')); eq(sd.toString('hex'), s.seed, `seed ${s.seq}`);
  const t = M.task(sd); eq(t.n, s.task.n, 'n'); eq(t.operating, s.task.operating, 'operating');
  t.amounts.forEach((a, i) => eq(a, s.task.amounts[i], 'amount')); t.vendors.forEach((v, i) => eq(bs58.encode(v), s.task.vendors[i], 'vendor'));
}
for (const p of V.prices) eq(M.price(p.min_plant, p.lineup_assets, p.price_bps, p.step_bps, p.n), p.price, `price ${JSON.stringify(p)}`);
for (const s of V.splits) { const r = M.split(s.price, s.runner_bps, s.treasury_bps, s.holder); eq(`${r.purses},${r.runner},${r.treasury}`, `${s.purses},${s.runner},${s.treasury}`, 'split'); }
for (const r of V.runs_for) eq(M.runsFor(r.max_runs, r.plants), r.runs, 'runs_for');
for (const t of V.tiers) eq(M.tier(run(t.run), t.invoice_count, t.purse_at_open), t.tier, `tier ${t.name}`);
for (const r of V.report_hits) eq(M.reportHits(run(r.run), r.purse_at_open, r.classes, r.targets), r.hits ?? r.mask ?? r.out, 'report_hits');
for (const b of V.bounties) { const o = M.bounties(b.runs.map(run).filter(x => x.started), b.plant_count, b.purse_at_open, b.bounty_bps, b.docket_cap_bps ?? b.cap_bps, b.available); (b.owed || b.out).forEach((x, j) => eq(o[j], x, 'owed ' + j)); }
for (const s of V.shares_for) eq(M.sharesFor(s.amount, s.total_shares, s.owned), s.minted, 'shares_for');
for (const s of V.lamports_for) eq(M.lamportsFor(BigInt(s.shares) < BigInt(s.total_shares) ? s.shares : s.total_shares, s.total_shares, s.owned), s.lamports, 'lamports_for');
console.log(`program vectors vs fuzz model · ${n} comparisons · mismatches ${bad.length}`); bad.slice(0, 20).forEach(l => console.log('MISMATCH ' + l));
process.exit(bad.length ? 1 : 0);
