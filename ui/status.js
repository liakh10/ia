/* Status: live probes of the RPC, the program, the read API and indexer, the log and the runner stream. */
import { $, esc, num } from './fmt.js';
import { api, rpc, API, STREAM } from './data.js';

const CFG = window.IA || {};
const rows = [];
const put = (name, ok, detail) => { rows.push([name, ok, detail]); $('[data-checks]').innerHTML = `<table><thead><tr><th>Part</th><th>State</th><th>Detail</th></tr></thead><tbody>${rows.map(([n, o, d]) => `<tr><td>${esc(n)}</td><td><span class="tier ${o ? 'CLEAN' : o === null ? 'VOID' : 'BENT'}">${o ? 'up' : o === null ? 'not yet' : 'down'}</span></td><td class="mono">${esc(d)}</td></tr>`).join('')}</tbody></table>`; };
const time = async fn => { const t = performance.now(); const v = await fn(); return [v, Math.round(performance.now() - t)]; };

try { const [s, ms] = await time(() => rpc('getSlot', [{ commitment: 'confirmed' }])); put('Solana RPC', true, `slot ${num(s)} · ${ms} ms`); } catch (e) { put('Solana RPC', false, e.message); }
try {
  const a = await rpc('getAccountInfo', [CFG.PROGRAM, { encoding: 'base64' }]);
  put('IA program', a && a.value ? !!a.value.executable : null, a && a.value ? `${CFG.PROGRAM}${a.value.executable ? ' · executable' : ' · not executable'}` : 'not deployed on this cluster yet');
} catch (e) { put('IA program', false, e.message); }
const st = await api('/status');
put('Read API and indexer', !!st, st ? `${num(st.events)} events · ${st.rounds} tests · ${st.agents} agents · synced ${st.sync?.syncedAt ? 'recently' : 'n/a'}${st.sync?.lastError ? ' · last error: ' + st.sync.lastError : ''}` : `${API || ''}/v1 did not answer`);
put('Transparency log', st?.log ? !st.log.error : null, st?.log ? (st.log.error || `tree size ${st.log.size ?? st.log.treeSize ?? '?'}`) : 'not configured on this API');
const q = st && st.rounds ? await api('/quote') : null;
put('Plant pricing', q ? true : null, q ? `test #${q.round} · ${q.open ? 'open' : 'closed'}` : 'no test to plant in yet');
await new Promise(res => {
  let es; const done = (ok, d) => { try { es && es.close(); } catch {} put('Runner stream', ok, d); res(); };
  if (!STREAM) return done(null, 'not live yet: the runner streams once the first test runs');
  try { es = new EventSource(STREAM); } catch { return done(false, 'not reachable'); }
  const t = setTimeout(() => done(false, 'no answer in 6 s'), 6000);
  es.onopen = () => { clearTimeout(t); done(true, 'connected'); };
  es.onerror = () => { clearTimeout(t); done(false, 'refused'); };
});
if (st) $('[data-replay]').innerHTML = `<dt>Result</dt><dd>${esc(st.replay)}</dd><dt>Mismatches</dt><dd>${st.mismatchCount}</dd><dt>Unknown events</dt><dd>${st.unknownEvents}</dd>`;
