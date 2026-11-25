/* Sureties: the purses, deposit, request an unbond, withdraw after the delay. Positions are read from the visitor's own Surety
   accounts on chain; everything else from /v1. */
import { $, esc, sol, short } from './fmt.js';
import { api, slot, about, geo } from './data.js';
import { loadIdl, addr } from './chain.js';
import { send, ensure, address } from './wallet.js';

const I = await loadIdl();
let purses = [], params = null;
const want = new URLSearchParams(location.search).get('agent');

async function draw() {
  const pu = await api('/purses');
  purses = pu?.purses || [];
  const cfg = await I.fetch('Config', addr.config(I)).catch(() => null);
  params = cfg?.params || null;
  $('[data-purses]').innerHTML = purses.length ? `<table><thead><tr><th>Model (exact version)</th><th class="num">Purse SOL</th><th class="num">Owned by sureties</th><th class="num">SOL per 1 SOL of shares</th><th class="num">Runs</th><th class="num">Took bait</th><th class="num">Lost to bounties</th></tr></thead><tbody>${purses.map(p => `<tr><td><a class="mono" href="/agents/${p.agent}">${esc(p.model)}</a></td><td class="num">${sol(p.assetsLamports)}</td><td class="num">${sol(p.ownedLamports)}</td><td class="num">${p.lamportsPerShareE9 ? (Number(p.lamportsPerShareE9) / 1e9).toFixed(4) : '1.0000'}</td><td class="num">${p.stats.runs}</td><td class="num">${Number(p.stats.bent) + Number(p.stats.bentLied)}</td><td class="num">${sol(p.stats.lost)}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">The lineup is announced at launch.</p>';
  const sel = $('#agent');
  if (!sel.options.length) sel.innerHTML = purses.filter(p => p.kind === 'house' && p.active).map(p => `<option value="${p.agent}"${String(p.agent) === want ? ' selected' : ''}>${esc(p.model)}</option>`).join('');
  if (params) $('[data-min]').textContent = `Minimum ${sol(params.min_deposit)} SOL. Unbond delay ${params.unbond_delay} slots (${about(params.unbond_delay)}).`;
  mine();
}

async function mine() {
  const me = address();
  if (!me) return;
  const now = await slot();
  const rows = [];
  for (const p of purses) {
    const s = await I.fetch('Surety', addr.surety(I, p.agent, me)).catch(() => null);
    if (!s || s.shares === 0n) continue;
    const total = BigInt(p.shares || '0'), owned = BigInt(p.ownedLamports);
    const value = total ? s.shares * owned / total : 0n;
    const delay = BigInt(s.unbond_delay || params?.unbond_delay || 0n);
    const ready = s.unbond_slot + delay, expires = s.unbond_slot + 2n * delay;
    let state = 'bonded', act = `<button class="btn small ghost" data-unbond="${p.agent}">Request unbond</button>`;
    if (s.unbond_shares > 0n) {
      if (BigInt(now) < ready) { state = `unbonding: withdraw from slot ${ready} (${about(Number(ready) - now)})`; act = ''; }
      else if (BigInt(now) <= expires) { state = `ready until slot ${expires}`; act = `<button class="btn small" data-withdraw="${p.agent}">Withdraw</button>`; }
      else state = 'the unbond request expired: request again';
    }
    rows.push(`<tr><td class="mono">${esc(p.model)}</td><td class="num">${s.shares}</td><td class="num">${sol(value)}</td><td>${esc(state)}</td><td>${act}</td></tr>`);
  }
  $('[data-mine]').innerHTML = rows.length ? `<div class="table"><table><thead><tr><th>Model</th><th class="num">Shares</th><th class="num">Worth now (SOL)</th><th>State</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<p class="empty">No positions in ${esc(short(me))}.</p>`;
}

const err = m => { $('[data-err]').textContent = m || ''; };
$('[data-deposit]').addEventListener('click', async e => {
  const b = e.currentTarget; b.disabled = true; err(); $('[data-done]').textContent = '';
  try {
    if ((await geo()).blocked) throw Error('Deposits are not available in your region.');
    const me = await ensure();
    const id = Number($('#agent').value);
    const lamports = BigInt(Math.round(Number($('#amount').value) * 1e9));
    if (params && lamports < params.min_deposit) throw Error(`The minimum deposit is ${sol(params.min_deposit)} SOL.`);
    const sig = await send([I.instruction('deposit', { lamports }, { owner: me, config: addr.config(I), agent: addr.agent(I, id), surety: addr.surety(I, id, me) })], x => I.explain(x));
    $('[data-done]').textContent = `Deposited (${short(sig)}).`;
    draw();
  } catch (x) { err(x.message); } finally { b.disabled = false; }
});
document.addEventListener('click', async e => {
  if (e.target.closest('[data-wallet-inline]')) { await ensure().catch(() => {}); mine(); return; }
  const u = e.target.closest('[data-unbond]'), w = e.target.closest('[data-withdraw]');
  if (!u && !w) return;
  const b = u || w; b.disabled = true; err();
  try {
    const me = address(), id = Number(b.dataset.unbond ?? b.dataset.withdraw);
    const acc = { owner: me, config: addr.config(I), agent: addr.agent(I, id), surety: addr.surety(I, id, me) };
    if (u) { const s = await I.fetch('Surety', acc.surety); await send([I.instruction('request_unbond', { shares: s.shares }, acc)], x => I.explain(x)); }
    else await send([I.instruction('withdraw', {}, acc)], x => I.explain(x));
    draw();
  } catch (x) { err(x.message); b.disabled = false; }
});
window.addEventListener('ia:wallet', () => mine());
draw();
