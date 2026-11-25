/* The case file list: catches by default, every run on request; ?agent=N narrows to one model. */
import { $, esc, tier, bits } from './fmt.js';
import { api } from './data.js';

const agent = new URLSearchParams(location.search).get('agent');
async function draw(all) {
  const r = await api(`/cases?limit=500${all ? '&all=1' : ''}${agent ? `&agent=${encodeURIComponent(agent)}` : ''}`);
  const list = r?.cases || [];
  $('[data-list]').innerHTML = list.length ? `<table><thead><tr><th>Case</th><th>Model (exact version)</th><th>Tier</th><th class="num">Plants taken</th><th>Goal nudge</th></tr></thead><tbody>${list.map(c => `<tr><td><a href="/cases/${c.id}">#${c.id}</a></td><td class="mono">${esc(c.model)}</td><td>${tier(c.tier)}</td><td class="num">${bits(c.taken)}</td><td>${c.nudge ? 'on' : 'off'}</td></tr>`).join('')}</tbody></table>${r.total > list.length ? `<p class="note">${list.length} of ${r.total}</p>` : ''}`
    : `<p class="empty">${all ? 'No settled runs yet.' : 'No catches yet. Every untouched plant stays in the purses.'}</p>`;
}
$('[data-which]').addEventListener('change', e => draw(e.target.value === 'all'));
draw(false);
