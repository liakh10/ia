/* Plant bait: the registry's quote (filter, hash, canary, price), then the plant transaction signed in the visitor's wallet, then
   claims for the visitor's settled plants. */
import { $, esc, sol, short } from './fmt.js';
import { api, rpc, slot, phase, about, geo, PHASE_TEXT, API } from './data.js';
import { loadIdl, addr, PublicKey, fromHex, b64 } from './chain.js';
import { send, ensure, address } from './wallet.js';

const I = await loadIdl();
const CLASSES = ['TRANSFER', 'KEY', 'REPORT'], MEDIA = ['email', 'invoice', 'tool_output', 'memory', 'file'];
let cur = null, q = null;

async function round() {
  const r = cur = await api('/rounds/current');
  const qt = await api('/quote');
  const s = await slot().catch(() => r?.slot);
  const ph = phase(r, s);
  $('[data-phase]').textContent = r ? `Test #${r.seq} · ${PHASE_TEXT[ph]}` : PHASE_TEXT.none;
  $('[data-round]').innerHTML = (r ? [
    ['State', PHASE_TEXT[ph]],
    ph === 'planting' ? ['Plants close', `in ${about(Number(r.plantClose) - s)} (slot ${r.plantClose})`] : ['Plants', 'closed for this test'],
    ['Plants so far', String(r.plants.length)],
    ['Price now', ph === 'planting' && qt?.open ? `${sol(qt.priceLamports)} SOL` : 'next test'],
    ['Lineup', r.lineup.map(a => a.model).join(', ')],
    ['Scenario', r.template || 'n/a'],
    ['Seed (the task is a pure function of it)', r.seed],
  ] : [['State', 'The first test opens after launch.']]).map(([k, v]) => `<dt>${esc(k)}</dt><dd${k.startsWith('Seed') ? ' class="mono"' : ''}>${esc(v)}</dd>`).join('');
  const sp = qt?.split;
  if (sp && qt.priceLamports) {
    const P = BigInt(qt.priceLamports), share = x => P ? `${(Number(BigInt(x ?? 0) * 10000n / P) / 100).toLocaleString('en-US')}%` : 'n/a';
    $('[data-split]').innerHTML = [['Purses (equal share per model in the lineup)', share(sp.purses ?? sp.toPurses)], ['Runner fund (inference bills, public draws)', share(sp.runner ?? sp.toRunner)], ['Treasury', share(sp.treasury ?? sp.toTreasury)], ['Each later plant in the same test', 'costs 10% more']].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  }
  $('[data-quote]').disabled = !(ph === 'planting' && qt?.open);
}

const cls = () => $('[data-class] input:checked').value;
$('[data-class]').addEventListener('change', () => { $('[data-target-field]').hidden = cls() !== 'REPORT'; });
$('#text').addEventListener('input', e => { $('[data-bytes]').textContent = new TextEncoder().encode(e.target.value).length; $('[data-pay]').hidden = true; q = null; });

$('[data-quote]').addEventListener('click', async () => {
  $('[data-err]').textContent = '';
  const g = await geo();
  if (g.blocked) { $('[data-err]').textContent = 'Planting is not available in your region.'; return; }
  const text = $('#text').value;
  if (!text.trim()) { $('[data-err]').textContent = 'Write the plant first.'; return; }
  if (cls() === 'TRANSFER' && !text.includes('{{PLANT}}')) { $('[data-err]').textContent = 'A TRANSFER plant needs {{PLANT}} where the bait address goes.'; return; }
  if (cls() === 'KEY' && !text.includes('{{CANARY}}')) { $('[data-err]').textContent = 'A KEY plant needs {{CANARY}} where the leaked key goes.'; return; }
  const target = cls() === 'REPORT' ? String(Math.round(Number($('#target').value || 0) * 1e9)) : '0';
  if (cls() === 'REPORT' && target === '0') { $('[data-err]').textContent = 'A REPORT plant needs a target number.'; return; }
  const r = await fetch(`${API}/api/plant/quote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ round: cur.seq, class: cls(), medium: $('#medium').value, text, target }) }).then(x => x.json()).catch(e => ({ error: e.message }));
  if (r.filter !== 'ok') { const why = r.error?.details?.filter === 'rejected' ? r.error.message : r.reason; $('[data-err]').textContent = why ? `Refused before payment: ${why}` : (r.error?.message || r.error || 'The registry did not answer.'); return; }
  r.text_hash ??= r.textHash;
  q = { ...r, class: CLASSES.indexOf(cls()), medium: MEDIA.indexOf($('#medium').value), target };
  $('[data-quote-kv]').innerHTML = [['Test and slot', `#${r.round ?? cur.seq}, plant #${r.index}`], ['Plant address (the bait address)', r.plant || addr.plant(I, cur.seq, r.index).toBase58()], ['Text hash (sha256, on chain)', r.text_hash], ...(r.canary ? [['Canary public key', r.canary]] : []), ['Price', `${sol(r.price)} SOL plus the plant account rent, returned when you claim`]].map(([k, v]) => `<dt>${esc(k)}</dt><dd class="mono">${esc(v)}</dd>`).join('');
  $('[data-plant]').textContent = `Plant for ${sol(r.price)} SOL`;
  $('[data-pay]').hidden = false;
});

/** the ATA that proves a 1,000,000 $IA holding, when the visitor has one */
async function holderToken(owner) {
  const c = await I.fetch('Config', addr.config(I));
  if (!c || c.root_mint.equals(new PublicKey(new Uint8Array(32)))) return null;
  const ATA = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const ata = PublicKey.findProgramAddressSync([new PublicKey(owner).toBytes(), c.root_token_program.toBytes(), c.root_mint.toBytes()], ATA)[0];
  try { const b = await rpc('getTokenAccountBalance', [ata.toBase58(), { commitment: 'confirmed' }]); return BigInt(b.value.amount) >= BigInt(c.params.holder_min) ? ata : null; } catch { return null; }
}

$('[data-plant]').addEventListener('click', async e => {
  const b = e.currentTarget; b.disabled = true; $('[data-err]').textContent = ''; $('[data-done]').textContent = '';
  try {
    const me = await ensure();
    const seq = cur.seq;
    const ix = I.instruction('plant', { class: q.class, medium: q.medium, text_hash: fromHex(q.text_hash), target: BigInt(q.target), canary: q.canary ? new PublicKey(q.canary) : new PublicKey(new Uint8Array(32)), max_price: BigInt(q.price) },
      { planter: me, config: addr.config(I), round: addr.round(I, seq), plant: addr.plant(I, seq, q.index), treasury: addr.treasury(I), runner_fund: addr.fund(I), holder_token: await holderToken(me) });
    const sig = await send([ix], err => I.explain(err));
    $('[data-done]').textContent = `Planted: #${q.index} in test #${seq} (${short(sig)}). It stays sealed until the test settles.`;
    $('[data-pay]').hidden = true; q = null; $('#text').value = '';
    await round(); mine();
  } catch (err) { $('[data-err]').textContent = err.message; } finally { b.disabled = false; }
});

/* the visitor's unclaimed plants: Plant accounts whose planter is the wallet (planter at byte 17: 8 discriminator, 8 round, 1 idx) */
async function mine() {
  const me = address();
  if (!me) return;
  const list = await rpc('getProgramAccounts', [I.program.toBase58(), { encoding: 'base64', commitment: 'confirmed', filters: [{ memcmp: { offset: 0, bytes: b58(I.accounts.Plant.discriminator) } }, { memcmp: { offset: 17, bytes: me } }] }]).catch(() => []);
  const plants = list.map(x => ({ address: x.pubkey, ...I.decode({ defined: { name: 'Plant' } }, b64(x.account.data[0]), 8)[0] })).sort((a, b) => Number(b.round - a.round) || b.idx - a.idx);
  if (!plants.length) { $('[data-mine]').innerHTML = '<p class="empty">No unclaimed plants in this wallet.</p>'; return; }
  const rows = [];
  for (const p of plants) {
    const r = await I.fetch('Round', addr.round(I, p.round));
    const settled = r && r.state === 2;
    const owed = settled ? r.owed[p.idx] : 0n;
    rows.push(`<tr><td>#${p.round}/${p.idx}</td><td>${CLASSES[p.class]}</td><td class="num">${sol(p.price)}</td><td>${settled ? (owed > 0n ? `${sol(owed)} SOL bounty` : 'not taken') : 'sealed, test running'}</td><td>${settled ? `<button class="btn small" data-claim="${p.round}.${p.idx}">Claim</button>` : ''}</td></tr>`);
  }
  $('[data-mine]').innerHTML = `<div class="table"><table><thead><tr><th>Plant</th><th>Class</th><th class="num">Paid SOL</th><th>Outcome</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
document.addEventListener('click', async e => {
  if (e.target.closest('[data-wallet-inline]')) { await ensure().catch(() => {}); mine(); return; }
  const b = e.target.closest('[data-claim]'); if (!b) return;
  b.disabled = true;
  try {
    const [seq, idx] = b.dataset.claim.split('.').map(Number);
    await send([I.instruction('claim_plant', {}, { planter: address(), round: addr.round(I, seq), plant: addr.plant(I, seq, idx) })], err => I.explain(err));
    mine();
  } catch (err) { $('[data-err]').textContent = err.message; b.disabled = false; }
});
window.addEventListener('ia:wallet', () => mine());

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) { let x = 0n; for (const b of bytes) x = (x << 8n) + BigInt(b); let s = ''; while (x > 0n) { s = B58[Number(x % 58n)] + s; x /= 58n; } for (const b of bytes) { if (b) break; s = '1' + s; } return s; }

round();
setInterval(() => { if (!document.hidden) round(); }, 10000);
