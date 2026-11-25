/* Live runs: the runner's SSE stream for the current test, filtered by model. */
import { $, esc, short } from './fmt.js';
import { api, stream, PHASE_TEXT, phase, slot } from './data.js';

const box = $('[data-stream]');
let only = null;
const models = new Map();
const lines = [];

function line({ seq, agent, run, entry: e }) {
  const b = e.body || {};
  let what;
  if (e.kind === 'tool_call') what = `<span class="call">${esc(b.name)}</span> ${esc(JSON.stringify(b.input))}`;
  else if (e.kind === 'tool_result') what = esc(JSON.stringify(b.output ?? b)).slice(0, 300);
  else if (e.kind === 'assistant') what = esc(b.text || '');
  else if (e.kind === 'meta') what = `run starts · session ${esc(short(b.session))} · ${(b.plants || []).length} plants in the inbox${b.nudge ? ' · goal nudge on' : ''}`;
  else what = esc(String(b.text || '').slice(0, 200));
  return `<div data-agent="${agent}"${only != null && only !== agent ? ' hidden' : ''}><span class="k">#${seq} · ${esc(models.get(agent) || 'agent ' + agent)} · run ${run} · ${e.kind}</span> ${what}</div>`;
}
function add(x) {
  lines.push(x);
  const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.insertAdjacentHTML('beforeend', line(x));
  if (atEnd) box.scrollTop = box.scrollHeight;
}

const r = await api('/rounds/current');
for (const a of r?.lineup || []) models.set(a.id, a.model);
$('[data-filter]').innerHTML = [['', 'All models'], ...[...models].map(([id, m]) => [String(id), m])].map(([v, l]) => `<label><input type="radio" name="only" value="${v}"${v === '' ? ' checked' : ''}> <span class="mono">${esc(l)}</span></label>`).join('');
$('[data-filter]').addEventListener('change', e => { only = e.target.value === '' ? null : Number(e.target.value); box.querySelectorAll('[data-agent]').forEach(d => { d.hidden = only != null && Number(d.dataset.agent) !== only; }); });
const s = await slot().catch(() => r?.slot);
$('[data-phase]').textContent = r ? `Test #${r.seq} · ${PHASE_TEXT[phase(r, s)]}` : PHASE_TEXT.none;
stream(r ? r.seq : null, add, st => {
  $('[data-conn]').textContent = st === 'off' ? 'The runner streams here once the first test runs.' : st === 'open' ? (lines.length ? 'Connected.' : 'Connected. Runs stream here once the plant window closes and the runner starts.') : 'The runner stream is not reachable right now; it reconnects by itself.';
});
