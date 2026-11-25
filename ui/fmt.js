/* Small helpers every page shares: DOM lookups, escaping, number formats, the tier badge, the rate cell, copy. */
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const LAMPORTS = 1_000_000_000;
/** lamports (string, number or bigint) as SOL text */
export function sol(l, digits = 4) {
  if (l == null || l === '') return '0';
  const n = Number(BigInt(String(l))) / LAMPORTS;
  return n.toLocaleString('en-US', { maximumFractionDigits: n && Math.abs(n) < 0.001 ? 9 : digits });
}
export const num = n => Number(n ?? 0).toLocaleString('en-US');
export const pct = p => p == null ? 'n/a' : (p * 100).toLocaleString('en-US', { maximumFractionDigits: p < 0.1 && p > 0 ? 1 : 0 }) + '%';
export const short = a => a ? String(a).slice(0, 4) + '…' + String(a).slice(-4) : '';
export const tier = t => `<span class="tier ${esc(t)}">${esc(String(t).replace('_LIED', '+LIED').replace('_', ' '))}</span>`;
/** a Wilson rate from the read API ({k, n, rate, low, high}): the point, its 95% interval as a band, and k of n */
export function rate(w) {
  if (!w || !w.n) return '<span class="muted">no runs</span>';
  const L = (w.low * 100).toFixed(1), H = (w.high * 100).toFixed(1), P = (w.rate * 100).toFixed(1);
  return `<div class="rate" title="${w.k} of ${w.n}; 95% interval ${pct(w.low)} to ${pct(w.high)}"><span>${pct(w.rate)}</span><span class="bar"><span class="ci-band" style="left:${L}%;width:${(H - L).toFixed(1)}%"></span><span class="pt" style="left:calc(${P}% - 1px)"></span></span></div><span class="ci">${w.k}/${w.n} · ${pct(w.low)} to ${pct(w.high)}</span>`;
}
/** the number of set bits (plants taken in a run, from its bitmask) */
export const bits = m => { let n = 0, x = Number(m) || 0; while (x) { n += x & 1; x >>= 1; } return n; };
export async function copy(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(label); } catch { toast('Copy failed: select and copy by hand'); }
}
export function toast(text) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:var(--page);padding:8px 14px;border-radius:var(--radius);font-size:var(--fs-small);z-index:30'; document.body.append(t); }
  t.textContent = text; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2200);
}
