/* One case file: /cases/<round>-<agent>-<run>. The page checks the evidence itself, in the browser: every act's step hash against
   the published transcript, each run's RFC 9162 root, and the docket root over the runs against the root the program recorded. */
import { $, esc, sol, short, tier } from './fmt.js';
import { api, API } from './data.js';

const id = (/\/cases\/(\d+-\d+-\d+)/.exec(location.pathname) || [])[1] || new URLSearchParams(location.search).get('id');
const c = id ? await api(`/cases/${id}`) : null;
const HIT = h => h === 255 ? 'stray (neither a vendor nor a plant)' : h >= 32 ? `plant #${h - 32}` : h > 0 ? `invoice ${h}` : 'none';

const sha = async b => new Uint8Array(await crypto.subtle.digest('SHA-256', b));
const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => Uint8Array.from(String(h).match(/.{2}/g) || [], x => parseInt(x, 16));
const utf8 = s => new TextEncoder().encode(s);
const cat = (...p) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
async function mth(leaves) {
  if (!leaves.length) return sha(new Uint8Array());
  if (leaves.length === 1) return sha(cat(new Uint8Array([0]), leaves[0]));
  let k = 1; while (k * 2 < leaves.length) k *= 2;
  return sha(cat(new Uint8Array([1]), await mth(leaves.slice(0, k)), await mth(leaves.slice(k))));
}
const lines = text => text.split('\n').filter(l => l.trim());
const transcript = async caseId => { try { const r = await fetch(`${API}/v1/cases/${caseId}/transcript`, { cache: 'no-store' }); return r.ok ? await r.text() : null; } catch { return null; } };

if (!c) {
  $('[data-title]').textContent = 'No such case file';
} else {
  document.title = `Case #${c.id} · Internal Affairs`;
  $('[data-id]').textContent = c.case;
  $('[data-title]').innerHTML = `<span class="mono" style="font-size:var(--fs-h2)">${esc(c.model)}</span> ${c.tier ? tier(c.tier) : ''}`;
  const fs = c.firstTemptingStep, q = fs?.quote;
  if (q && (q.said || q.toolCall)) $('[data-quote]').innerHTML = `<p class="label">The first tempting step</p><blockquote class="quote">${q.said ? esc(q.said) : ''}${q.toolCall ? `<br><span class="mono">${esc(q.toolCall.name)} ${esc(JSON.stringify(q.toolCall.input))}</span>` : ''}</blockquote>`;
  const L = c.ledger;
  $('[data-run]').innerHTML = [
    ['Test', `#${c.round}`], ['Model (exact version)', c.model], ['Run', String(c.run)], ['Scenario', c.scenario || 'n/a'], ['Goal nudge', c.nudge ? 'on' : 'off'],
    ['Tier (derived by the program)', c.tier || 'pending'], ...(c.tierReplayed && c.tierReplayed !== c.tier ? [['Tier replayed from the rules', c.tierReplayed]] : []),
    ['Purse at open', `${sol(c.purseAtOpenLamports)} SOL`], ['Stray payments', String(c.strays)],
    ...(L ? [['Paid on the ledger', `${L.payments} payments, ${sol(L.totalMovedLamports)} SOL (reserve ${sol(L.reserveMovedLamports)})`], ['Its report said', L.report ? `${L.report.payments} payments, ${sol(L.report.totalLamports)} SOL; reserve ${sol(L.report.reserveLamports)}, operating ${sol(L.report.operatingLamports)}` : 'no report']] : []),
  ].map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  $('[data-evidence]').innerHTML = [['Act on chain', c.actTx ? short(c.actTx) : 'none'], ['Settled in', c.settlement ? short(c.settlement.signature) : 'not yet'], ['Act trail', c.trail || 'n/a'], ['Transcript root (on chain)', c.transcriptRoot || 'n/a']]
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd class="mono">${esc(v)}</dd>`).join('') + `<dt>Links</dt><dd><a href="${esc(c.links.transcript)}">transcript (JSONL)</a> · <a href="${esc(c.links.logProof)}">log entry</a> · <a href="${esc(c.links.methodology)}">methodology</a> · <a href="/docs/right-of-reply">right of reply</a></dd>`;
  $('[data-plants]').innerHTML = c.plantsTaken.length ? `<table><thead><tr><th>#</th><th>Class</th><th>Medium</th><th>Planter</th><th>Text hash</th></tr></thead><tbody>${c.plantsTaken.map(p => `<tr><td>${p.idx}</td><td>${esc(p.class)}</td><td>${esc(p.medium)}</td><td class="mono">${esc(short(p.planter))}</td><td class="mono">${esc(short(p.textHash))}</td></tr>`).join('')}</tbody></table><p class="note">Plants this run took. Every plant's text is revealed after the test settles: <a href="/v1/plants/${c.round}/${c.plantsTaken[0].idx}">read the first one</a>.</p>` : '<p class="empty">This run took no plant.</p>';
  $('[data-acts]').innerHTML = c.acts.length ? `<table><thead><tr><th>Act</th><th>Kind</th><th>Hit</th><th class="num">Moved SOL</th><th>Step hash</th><th>Signature</th></tr></thead><tbody>${c.acts.map(a => `<tr><td>${a.act}</td><td class="mono">${esc(a.kind)}</td><td>${esc(HIT(a.hit))}</td><td class="num">${sol(a.movedLamports)}</td><td class="mono">${esc(short(a.step))}</td><td class="mono">${esc(short(a.signature))}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No acts.</p>';

  const text = await transcript(c.id);
  if (!text) $('[data-transcript]').innerHTML = '<p class="empty">The transcript is published after the test settles.</p>';
  else {
    const L1 = lines(text), E = L1.map(l => JSON.parse(l));
    $('[data-transcript]').innerHTML = E.map(e => `<div class="entry"><span class="k">#${e.i} · ${esc(e.kind)} · ${esc(e.provider || '')} ${esc(e.model || '')}${e.request_id ? ' · ' + esc(e.request_id) : ''}</span><pre>${esc(JSON.stringify(e.body, null, 1))}</pre></div>`).join('');
    // the check: steps, this run's root, the docket root over every started run's root
    const steps = new Set(await Promise.all(L1.map(async l => hex(await sha(utf8(l))))));
    const stepsOk = c.acts.every(a => steps.has(a.step));
    const runRoot = hex(await mth(L1.map(utf8)));
    const round = await api(`/rounds/${c.round}`);
    const docket = round?.dockets?.find(d => d.agent === c.agent);
    let docketOk = null;
    if (docket && c.transcriptRoot) {
      const roots = [];
      for (const r of docket.runs.filter(r => r.session && r.session !== '11111111111111111111111111111111')) {
        const t = r.run === c.run ? text : await transcript(r.case);
        if (!t) { roots.length = 0; break; }
        roots.push(await mth(lines(t).map(utf8)));
      }
      if (roots.length) docketOk = hex(await mth(roots)) === c.transcriptRoot;
    }
    $('[data-check]').innerHTML = `Checked in your browser: ${stepsOk ? 'every act\'s step hash is the hash of a line of this transcript' : '<strong>an act\'s step hash matches no line of this transcript</strong>'}; this run's root is <span class="mono">${short(runRoot)}</span>${docketOk === null ? '.' : docketOk ? '; the docket root over every run equals the root the program recorded.' : '; <strong>the docket root over the runs differs from the one on chain.</strong>'}`;
  }
}
