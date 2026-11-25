/* The Integrity Index: per model version rates with Wilson intervals, the split by goal nudge and by plant class, the investigators. */
import { $, esc, sol, rate, short } from './fmt.js';
import { api } from './data.js';

const [ix, inv] = await Promise.all([api('/index'), api('/investigators')]);
let split = 'all';

function models() {
  if (!ix || !ix.rows.length) { $('[data-models]').innerHTML = '<p class="empty">No settled runs yet. The index fills from the first settled test, one row per exact model version.</p>'; return; }
  const row = a => {
    const v = split === 'all' ? a : a.nudge[split];
    const R = v.rates;
    return `<tr><td><a class="mono" href="/agents/${a.agent}">${esc(a.model)}</a>${a.epoch > 1 ? ` <span class="ci">version ${a.epoch}</span>` : ''}</td><td class="num">${v.runs}</td><td>${rate(R.taken)}</td><td>${rate(R.lied)}</td><td>${rate(R.falseReport)}</td><td>${rate(R.stray)}</td><td>${rate(R.flagged)}</td><td>${rate(R.complete)}</td><td class="num">${sol(v.untouchedLamports)}</td><td class="num">${sol(v.lostLamports)}</td></tr>`;
  };
  $('[data-models]').innerHTML = `<table><thead><tr><th>Model (exact version)</th><th class="num">Runs</th><th>Took bait</th><th>Took and lied</th><th>False report</th><th>Stray payment</th><th>Flagged a plant</th><th>Completed the task</th><th class="num">SOL untouched</th><th class="num">SOL lost</th></tr></thead><tbody>${ix.rows.map(row).join('')}</tbody></table>`;
}
function classes() {
  if (!ix || !ix.rows.length) return;
  const C = ['TRANSFER', 'KEY', 'REPORT'];
  $('[data-classes]').innerHTML = `<table><thead><tr><th>Model</th>${C.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${ix.rows.map(a => `<tr><td class="mono">${esc(a.model)}</td>${C.map(c => `<td>${rate(a.byClass[c]?.rate)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function investigators() {
  const list = inv?.investigators || [];
  $('[data-investigators]').innerHTML = list.length ? `<table><thead><tr><th>#</th><th>Investigator</th><th class="num">Plants</th><th class="num">Catches</th><th class="num">Plants that caught</th><th class="num">Bounty SOL</th></tr></thead><tbody>${list.map((x, i) => `<tr><td>${i + 1}</td><td class="mono">${esc(short(x.planter))}</td><td class="num">${x.plants}</td><td class="num">${x.catches}</td><td class="num">${x.plantsThatCaught}</td><td class="num">${sol(x.bountyLamports)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No plants yet. <a href="/plant">Write the first one.</a></p>';
}
$('[data-split]').addEventListener('change', e => { split = e.target.value; models(); });
models(); classes(); investigators();
