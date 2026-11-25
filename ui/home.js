/* Home: the current test (phase, slots, price), the purses, the latest case files. Reads /v1 only. */
import { $, esc, sol, tier, bits } from './fmt.js';
import { api, slot, phase, about, PHASE_TEXT } from './data.js';

async function draw() {
  const [r, pu, cases] = await Promise.all([api('/rounds/current'), api('/purses'), api('/cases?limit=5')]);
  const now = await slot().catch(() => r?.slot);
  if (pu) {
    $('[data-total]').innerHTML = `${sol(pu.totalLamports, 3)} <small>SOL</small>`;
    const list = pu.purses.filter(a => a.active);
    const max = list.reduce((m, a) => Math.max(m, Number(a.assetsLamports)), 0) || 1;
    $('[data-purses]').innerHTML = list.map(a => `<a class="purse" href="/agents/${a.agent}" style="color:inherit;text-decoration:none"><span class="model">${esc(a.model)}</span><span class="track"><span class="fill" style="display:block;width:${(Number(a.assetsLamports) / max * 100).toFixed(1)}%"></span></span><span class="sol">${sol(a.assetsLamports)} SOL</span></a>`).join('') || '<p class="empty">The lineup is announced at launch.</p>';
  } else $('[data-purses]').innerHTML = '<p class="empty">The purses appear here when the read API answers.</p>';
  const ph = phase(r, now);
  $('[data-phase]').textContent = r ? `Test #${r.seq} · ${PHASE_TEXT[ph]}` : PHASE_TEXT.none;
  $('[data-round-label]').textContent = r ? `Test #${r.seq}` : 'Test';
  const runs = r?.dockets?.[0]?.runCount;
  const rows = r ? [
    ['State', PHASE_TEXT[ph]],
    ph === 'planting' ? ['Plants close', `in ${about(Number(r.plantClose) - now)} (slot ${r.plantClose})`] : ph === 'running' ? ['Runs close', `in ${about(Number(r.runClose) - now)} (slot ${r.runClose})`] : ['Runs closed at slot', r.runClose],
    ['Plants', String(r.plants.length)],
    ['Next plant price', ph === 'planting' && r.nextPlantPriceLamports ? `${sol(r.nextPlantPriceLamports)} SOL` : 'next test'],
    ['Goal nudge', r.nudge ? 'on this test' : 'off this test'],
    ...(runs ? [['Runs per model', String(runs)]] : []),
  ] : [['State', 'The first test opens after launch.']];
  $('[data-round]').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  const list = cases?.cases || [];
  $('[data-latest]').innerHTML = list.length ? `<div class="table"><table><thead><tr><th>Case</th><th>Model</th><th>Tier</th><th>Plants taken</th></tr></thead><tbody>${list.map(c => `<tr><td><a href="/cases/${c.id}">#${c.id}</a></td><td class="mono">${esc(c.model)}</td><td>${tier(c.tier)}</td><td>${bits(c.taken) || 'stray payment'}</td></tr>`).join('')}</tbody></table></div><p><a href="/cases">Every case file</a></p>`
    : '<p class="empty">No model has been caught yet. Every untouched plant stays in the purses.</p>';
}
draw();
setInterval(() => { if (!document.hidden) draw(); }, 8000);
