/* One model: /agents/:id. Its purse, its counters, its rates per version, its runs with links to the case files. */
import { $, esc, sol, num, rate, tier, bits } from './fmt.js';
import { api } from './data.js';

const id = Number((/\/agents\/(\d+)/.exec(location.pathname) || [])[1] ?? new URLSearchParams(location.search).get('id'));
const a = Number.isFinite(id) ? await api(`/agents/${id}`) : null;
if (!a) {
  $('[data-model]').textContent = 'No such model in the lineup';
} else {
  document.title = `${a.model} · Internal Affairs`;
  $('[data-model]').textContent = a.model;
  $('[data-surety-link]').href = `/sureties?agent=${a.id}`;
  const p = a.purse;
  if (p) {
    $('[data-purse]').innerHTML = `${sol(p.assetsLamports)} <small>SOL</small>`;
    $('[data-purse-kv]').innerHTML = [['Owned by sureties', sol(p.ownedLamports) + ' SOL'], ['Unowned (bounty money only)', sol(p.orphanLamports) + ' SOL'], ['Version epoch', a.epoch], ['In the lineup', a.active ? 'yes' : 'retired'], ...(a.pending ? [['Pending change', `${a.pending.model || ''} from slot ${a.pending.atSlot}`]] : [])].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    const s = p.stats;
    $('[data-stats]').innerHTML = [['Runs', s.runs], ['Clean', Number(s.clean) + Number(s.flagged)], ['Flagged a plant', s.flagged], ['Incomplete', s.incomplete], ['False report', s.falseReport], ['Took bait', s.bent], ['Took and lied', s.bentLied], ['Void', s.voidRuns], ['Plants faced', s.plantsFaced], ['Plants taken', s.plantsTaken], ['SOL untouched (purse at open, clean runs)', sol(s.untouched)], ['SOL lost to bounties', sol(s.lost)], ['SOL earned from plant fees', sol(s.earned)]].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(typeof v === 'string' && /SOL/.test(k) ? v : num(v))}</dd>`).join('');
  }
  $('[data-rates]').innerHTML = a.index.length ? `<table><thead><tr><th>Version</th><th>Runs</th><th>Took bait</th><th>Took and lied</th><th>False report</th><th>Stray</th><th>Flagged</th></tr></thead><tbody>${a.index.map(v => `<tr><td class="mono">${esc(v.model)} <span class="ci">epoch ${v.epoch}</span></td><td>${v.runs}</td><td>${rate(v.rates.taken)}</td><td>${rate(v.rates.lied)}</td><td>${rate(v.rates.falseReport)}</td><td>${rate(v.rates.stray)}</td><td>${rate(v.rates.flagged)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No settled runs yet.</p>';
  $('[data-runs]').innerHTML = a.cases.length ? `<table><thead><tr><th>Case</th><th>Tier</th><th>Plants taken</th><th>Nudge</th></tr></thead><tbody>${a.cases.map(r => `<tr><td><a href="/cases/${r.id}">#${r.id}</a></td><td>${tier(r.tier)}</td><td>${bits(r.taken)}</td><td>${r.nudge ? 'on' : 'off'}</td></tr>`).join('')}</tbody></table><p><a href="/cases?agent=${a.id}">Every run of this model</a></p>` : '<p class="empty">No catches for this model yet.</p>';
}
