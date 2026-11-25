/* Free forecasts (SPEC §4): sign `ia-forecast:<round>:<agent>:<CLEAN|BENT>` and post it to /v1/forecasts; the board from /v1. */
import { $, esc, short } from './fmt.js';
import { api, API, slot, phase, about, PHASE_TEXT } from './data.js';
import { signText, ensure, base58 } from './wallet.js';

let r = null;
async function draw() {
  r = await api('/rounds/current');
  const s = await slot().catch(() => r?.slot);
  const ph = phase(r, s);
  $('[data-phase]').textContent = r ? `Test #${r.seq} · ${PHASE_TEXT[ph]}` : PHASE_TEXT.none;
  if (!r || ph !== 'planting') $('[data-calls]').innerHTML = `<p class="empty">${r ? 'Forecasts for this test are closed. The next test opens once this one settles.' : 'The first test opens after launch.'}</p>`;
  else $('[data-calls]').innerHTML = `<p class="note">Open for ${about(Number(r.plantClose) - s)} more (until slot ${r.plantClose}).</p><div class="table"><table><thead><tr><th>Model (exact version)</th><th>Your call</th></tr></thead><tbody>${r.lineup.map(a => `<tr><td><a class="mono" href="/agents/${a.id}">${esc(a.model)}</a></td><td class="choice"><button class="btn small ghost" data-call="${a.id}:CLEAN">CLEAN</button><button class="btn small ghost" data-call="${a.id}:BENT">BENT</button></td></tr>`).join('')}</tbody></table></div>`;
  const b = await api('/forecasts/board');
  const list = b?.board || [];
  $('[data-board]').innerHTML = list.length ? `<table><thead><tr><th>#</th><th>Wallet</th><th class="num">Points</th><th class="num">Scored</th><th class="num">Right</th><th class="num">Pending</th></tr></thead><tbody>${list.map((x, i) => `<tr><td>${i + 1}</td><td class="mono">${esc(short(x.wallet))}</td><td class="num">${x.points}</td><td class="num">${x.scored}</td><td class="num">${x.right}</td><td class="num">${x.pending}</td></tr>`).join('')}</tbody></table>${b.scoring ? `<p class="note">${esc(b.scoring)}</p>` : ''}` : '<p class="empty">No forecasts scored yet.</p>';
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-call]'); if (!b) return;
  $('[data-err]').textContent = ''; $('[data-done]').textContent = '';
  const [agent, call] = b.dataset.call.split(':');
  const message = `ia-forecast:${r.seq}:${agent}:${call}`;
  try {
    const wallet = await ensure();
    const sig = await signText(message);
    const res = await fetch(`${API}/v1/forecasts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature: base58(sig), wallet }) });
    const j = await res.json();
    if (!res.ok) throw Error(j.error?.message || 'not accepted');
    $('[data-done]').textContent = `Recorded: ${call} for agent ${agent} in test #${r.seq}.`;
    b.closest('td').querySelectorAll('button').forEach(x => { x.disabled = true; });
    draw();
  } catch (x) { $('[data-err]').textContent = x.message; }
});
draw();
