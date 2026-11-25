/* Where the pages read from. The read API (/v1, CONTRACT §9) is the only source for derived numbers; the chain itself is read for
   the slot and to send transactions. On localhost the lab server answers every route (lab/serve.mjs). */
const CFG = window.IA || {};
export const API = (CFG.API || '').replace(/\/$/, '');
export const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const RPC = CFG.RPC || '/api/rpc';

/** GET /v1<path>; null when the API is not reachable or the record does not exist (the page shows its empty state) */
export async function api(p, opts = {}) {
  try {
    const r = await fetch(`${API}/v1${p}`, { cache: 'no-store', ...opts });
    if (r.status === 404) return null;
    if (!r.ok) throw Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return await r.json();
  } catch (e) { if (opts.throws) throw e; console.warn('api', p, e.message); return null; }
}
let rid = 0;
export async function rpc(method, params = []) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }) });
  const j = await r.json();
  if (j.error) { const e = Error(j.error.message); e.data = j.error.data; throw e; }
  return j.result;
}
export const slot = () => rpc('getSlot', [{ commitment: 'confirmed' }]);
/** the runner's live stream (BUILD interface 3): onEntry({seq, agent, run, entry}) for every transcript entry */
export function stream(seq, onEntry, onState) {
  const url = `${API}/api/runner/stream${seq != null ? `?seq=${seq}` : ''}`;
  let es;
  try { es = new EventSource(url); } catch { onState?.('closed'); return () => {}; }
  es.onopen = () => onState?.('open');
  es.onerror = () => onState?.('error');
  es.onmessage = m => { try { onEntry(JSON.parse(m.data)); } catch {} };
  return () => es.close();
}
/** the phase of a round (the read API's `state`, refreshed against the live slot the way the program reads the windows) */
export function phase(r, s) {
  if (!r) return 'none';
  if (r.state === 'settled' || r.state === 'closed_empty') return r.state;
  if (s == null) return r.state || 'open';
  if (s < Number(r.plantClose)) return 'planting';
  if (s <= Number(r.runClose)) return 'running';
  return 'settling';
}
export const SLOT_SECONDS = 0.4;
/** slots left as a duration ("about 12 min"), never a clock time */
export function about(slots) {
  const s = Math.max(0, Number(slots)) * SLOT_SECONDS;
  if (s < 90) return `about ${Math.round(s)} s`;
  if (s < 5400) return `about ${Math.round(s / 60)} min`;
  return `about ${Math.round(s / 3600)} h`;
}
/** plant and surety availability (SPEC §10 geo-block); an origin without /api/geo allows them */
export async function geo() {
  try { const r = await fetch('/api/geo', { cache: 'no-store' }); if (!r.ok) return { blocked: false }; return await r.json(); } catch { return { blocked: false }; }
}
export const PHASE_TEXT = { planting: 'Plants open', running: 'Models running', settling: 'Settling', settled: 'Settled', closed_empty: 'Closed without plants', open: 'Open', none: 'No test yet' };
