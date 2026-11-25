/* The transparency log page: the signed head and a search over entries, both from /v1/log (the log service behind it, CONTRACT §8). */
import { $, esc, short } from './fmt.js';
import { api } from './data.js';

const head = await api('/log/head');
$('[data-head]').innerHTML = head && !head.error
  ? Object.entries(head).filter(([, v]) => typeof v !== 'object').map(([k, v]) => `<dt>${esc(k)}</dt><dd class="mono">${esc(v)}</dd>`).join('')
  : '<dt>State</dt><dd>The log is not reachable from this page right now.</dd>';
$('[data-find]').addEventListener('click', async () => {
  const q = new URLSearchParams();
  if ($('#kind').value) q.set('kind', $('#kind').value);
  if ($('#seq').value !== '') q.set('seq', $('#seq').value);
  const r = await api(`/log/find?${q}`);
  const list = r?.entries || r?.leaves || [];
  $('[data-found]').innerHTML = list.length ? `<table><thead><tr><th>Index</th><th>Kind</th><th>Entry</th></tr></thead><tbody>${list.map(e => `<tr><td>${esc(e.index ?? '')}</td><td>${esc(e.kind ?? '')}</td><td class="mono">${esc(short(e.leafHash || e.hash || '') + ' ' + JSON.stringify(e.data ?? e.leaf ?? '').slice(0, 160))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No entries match.</p>';
});
