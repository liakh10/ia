/* A Solana wallet in the page. Every wallet the browser offers (wallet-standard wallets, Phantom, Solflare, Backpack) is listed
   in a picker, never just the first one; on localhost the lab's dev wallet is offered too. One connection at a time. */
import { PublicKey, Transaction } from './chain.js';
import { rpc, LOCAL } from './data.js';
import { esc } from './fmt.js';

const std = new Map();
const register = w => { if (w && w.name && w.features && (w.features['solana:signTransaction'] || w.features['solana:signAndSendTransaction'])) std.set(w.name, w); };
try {
  addEventListener('wallet-standard:register-wallet', e => { try { e.detail(register); } catch {} });
  dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register } }));
} catch {}

const W = { name: null, address: null, sign: null, signMessage: null, signAndSend: null };
const emit = () => dispatchEvent(new CustomEvent('ia:wallet', { detail: { address: W.address, name: W.name } }));
export const address = () => W.address;
const KEY = 'ia:wallet';

async function labWallet() {
  if (!LOCAL) return null;
  try { const r = await fetch('/lab/wallet'); if (!r.ok) return null; return (await r.json()).address; } catch { return null; }
}

/** what the browser offers, as [{ id, name, connect() → { address, sign(tx) → signed tx, signMessage(bytes) → sig } }] */
export async function available() {
  const list = [];
  const lab = await labWallet();
  if (lab) list.push({ id: 'lab', name: 'Lab dev wallet', connect: async () => ({
    address: lab,
    sign: async tx => { const msg = tx.serializeMessage(); const r = await fetch('/lab/wallet/sign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: btoa(String.fromCharCode(...msg)) }) }).then(r => r.json()); tx.addSignature(new PublicKey(lab), Uint8Array.from(atob(r.signature), c => c.charCodeAt(0))); return tx; },
    signMessage: async bytes => { const r = await fetch('/lab/wallet/sign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: btoa(String.fromCharCode(...bytes)) }) }).then(r => r.json()); return Uint8Array.from(atob(r.signature), c => c.charCodeAt(0)); },
  }) });
  const seen = new Set();
  for (const [name, w] of std) {
    seen.add(name);
    list.push({ id: 'std:' + name, name, connect: async () => {
      const r = await w.features['standard:connect'].connect();
      const acc = r.accounts[0];
      return {
        address: acc.address,
        sign: async tx => { const out = await w.features['solana:signTransaction'].signTransaction({ account: acc, chain: chain(), transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }) }); return Transaction.from(out[0].signedTransaction); },
        signMessage: async bytes => (await w.features['solana:signMessage'].signMessage({ account: acc, message: bytes }))[0].signature,
        signAndSend: w.features['solana:signAndSendTransaction'] ? async tx => base58((await w.features['solana:signAndSendTransaction'].signAndSendTransaction({ account: acc, chain: chain(), transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }) }))[0].signature) : null,
      };
    } });
  }
  const injected = [['Phantom', window.phantom && window.phantom.solana], ['Solflare', window.solflare], ['Backpack', window.backpack && window.backpack.solana]];
  for (const [name, p] of injected) if (p && !seen.has(name)) list.push({ id: 'inj:' + name, name, connect: async () => {
    const r = await p.connect();
    return {
      address: (r && r.publicKey ? r.publicKey : p.publicKey).toString(), sign: tx => p.signTransaction(tx),
      signMessage: async bytes => { const s = await p.signMessage(bytes, 'utf8'); return s.signature || s; },
      signAndSend: p.signAndSendTransaction ? async tx => { const o = await p.signAndSendTransaction(tx); const g = o && o.signature !== undefined ? o.signature : o; return typeof g === 'string' ? g : base58(g); } : null,
    };
  } });
  return list;
}
const chain = () => (window.IA && window.IA.NETWORK === 'devnet') ? 'solana:devnet' : LOCAL ? 'solana:localnet' : 'solana:mainnet';

function picker(list) {
  return new Promise((ok, no) => {
    const box = document.createElement('div');
    box.className = 'wallet-pick';
    box.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Choose a wallet"><strong>Choose a wallet</strong>${list.map(w => `<button class="btn ghost" data-id="${esc(w.id)}">${esc(w.name)}</button>`).join('')}<button class="btn small ghost" data-id="">Cancel</button></div>`;
    box.addEventListener('click', e => { const b = e.target.closest('button'); if (!b && e.target !== box) return; box.remove(); const w = b && list.find(x => x.id === b.dataset.id); w ? ok(w) : no(Error('no wallet chosen')); });
    document.body.append(box);
    box.querySelector('button').focus();
  });
}

/** on a phone without an injected wallet: open this page inside a wallet app's browser (Phantom, Solflare deep links) */
function deepLinks() {
  const here = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
  const links = [['Phantom', `https://phantom.app/ul/browse/${here}?ref=${ref}`], ['Solflare', `https://solflare.com/ul/v1/browse/${here}?ref=${ref}`]];
  const box = document.createElement('div');
  box.className = 'wallet-pick';
  box.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Open in a wallet app"><strong>Open this page in your wallet app</strong>${links.map(([n, u]) => `<a class="btn ghost" href="${esc(u)}">${esc(n)}</a>`).join('')}<button class="btn small ghost">Cancel</button></div>`;
  box.addEventListener('click', e => { if (e.target.closest('button') || e.target === box) box.remove(); });
  document.body.append(box);
}
const MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

export async function connect() {
  const list = await available();
  if (!list.length && MOBILE) { deepLinks(); throw Error('Open this page in your wallet app to connect.'); }
  if (!list.length) throw Error('No Solana wallet found. Install Phantom, Solflare or Backpack, or open this page in your wallet app.');
  const w = list.length === 1 ? list[0] : await picker(list);
  const c = await w.connect();
  Object.assign(W, { name: w.name, sign: null, signMessage: null, signAndSend: null, ...c });
  try { localStorage.setItem(KEY, w.id); } catch {}
  emit();
  return W.address;
}
export async function ensure() { return W.address || connect(); }

/** build, simulate, sign in the wallet, send, confirm; returns the signature */
export async function send(instructions, explain = e => e.message) {
  await ensure();
  const { blockhash, lastValidBlockHeight } = (await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
  const tx = new Transaction({ feePayer: new PublicKey(W.address), blockhash, lastValidBlockHeight });
  instructions.forEach(i => tx.add(i));
  const raw = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const sim = await rpc('simulateTransaction', [btoa(String.fromCharCode(...raw)), { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }]);
  if (sim.value.err) { const e = Error('simulation failed'); e.logs = sim.value.logs; throw Error(explain(e)); }
  // the wallet signs and sends through its own RPC (this site's /api/rpc is read-only); the lab's dev wallet only signs, and the lab
  // server relays its transaction to the lab chain
  let sig;
  if (W.signAndSend) sig = await W.signAndSend(tx);
  else { const signed = await W.sign(tx); sig = await rpc('sendTransaction', [btoa(String.fromCharCode(...signed.serialize())), { encoding: 'base64', preflightCommitment: 'confirmed' }]); }
  for (let i = 0; i < 60; i++) {
    const s = (await rpc('getSignatureStatuses', [[sig]])).value[0];
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) { if (s.err) throw Error('the transaction failed on chain'); return sig; }
    const h = await rpc('getBlockHeight', [{ commitment: 'confirmed' }]).catch(() => 0);
    if (h > lastValidBlockHeight) throw Error('the transaction expired before it was confirmed');
    await new Promise(r => setTimeout(r, 800));
  }
  throw Error('not confirmed in time; check the signature ' + sig);
}
export async function signText(text) { await ensure(); return W.signMessage(new TextEncoder().encode(text)); }

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) { let x = 0n; for (const b of bytes) x = (x << 8n) + BigInt(b); let s = ''; while (x > 0n) { s = B58[Number(x % 58n)] + s; x /= 58n; } for (const b of bytes) { if (b) break; s = '1' + s; } return s; }

/* the header button */
emit();
document.addEventListener('click', e => { if (e.target.closest('[data-wallet]')) connect().catch(err => console.warn(err.message)); });
