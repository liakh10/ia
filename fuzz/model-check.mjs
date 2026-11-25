// Differential check: recompute every rules.rs vector (fuzz/rules emits them) with the JS model written from CONTRACT §3–§5.
//   node fuzz/model-check.mjs fuzz/results/rules-vectors-1.json
import fs from 'node:fs';
import * as M from './model.mjs';
const V = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let bad = [], checks = 0;
const ne = (a, b, what, i) => { checks++; if (String(a) !== String(b)) bad.push(`vector ${i}: ${what}: rust ${b}, model ${a}`); };
V.forEach((v, i) => {
  const t = M.task(Buffer.from(v.seed, 'hex'));
  ne(t.n, v.task.n, 'n', i); ne(t.operating, v.task.operating, 'operating', i);
  t.amounts.forEach((a, k) => ne(a, v.task.amounts[k], 'amount ' + k, i));
  t.vendors.forEach((a, k) => ne(a.toString('hex'), v.task.vendors[k], 'vendor ' + k, i));
  v.price.prices.forEach((p, k) => ne(M.price(v.price.minPlant, v.price.lineupAssets, v.price.priceBps, v.price.stepBps, k), p, 'price ' + k, i));
  ne(M.runsFor(v.maxRuns, v.plantCount), v.runsFor, 'runsFor', i);
  const runs = v.runs.map(x => ({ ...x, opLeft: BigInt(x.opLeft) }));
  runs.forEach((x, k) => {
    ne(M.tier(x, v.task.n, v.purseAtOpen), x.tier, 'tier ' + k, i);
    if (x.reported) ne(M.reportHits(x, v.purseAtOpen, v.classes, v.targets), x.reportTaken, 'report hits ' + k, i);
  });
  const owed = M.bounties(runs.filter(x => x.started), v.plantCount, v.purseAtOpen, v.bountyBps, v.capBps, v.available);
  v.owed.forEach((o, j) => ne(owed[j], o, 'owed ' + j, i));
  if (v.md) { const [a, b, d, q] = v.md.map(x => x === 'none' ? null : BigInt(x)); const want = d === 0n ? null : (a * b / d >= (1n << 128n) ? null : a * b / d); ne(want === null ? 'none' : want, q === null ? 'none' : q, 'mul_div', i); }
});
console.log(`model check · ${V.length} vectors · ${checks} comparisons · mismatches ${bad.length}`);
bad.slice(0, 20).forEach(l => console.log('MISMATCH ' + l));
process.exit(bad.length ? 1 : 0);
