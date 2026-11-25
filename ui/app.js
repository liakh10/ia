/* The shell on every page: the menu, the CA box, token links, the wallet button, copy buttons on code. */
import { $, $$, esc, copy, short } from './fmt.js';

const CFG = window.IA || {};
const menu = $('.menu'), nav = $('#nav');
if (menu && nav) {
  const set = open => { menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); };
  menu.addEventListener('click', () => set(menu.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
}

/* the CA: "SOON" with no copy button until the token exists; then the address on one line with a copy button */
const CA = String(CFG.CA || '').trim();
const real = CA && CA.toUpperCase() !== 'SOON';
for (const box of $$('[data-ca]')) {
  box.innerHTML = `<span>$${esc(CFG.TICKER || 'IA')}</span><span class="addr">${esc(real ? CA : 'SOON')}</span>${real ? '<button type="button" aria-label="Copy the contract address">Copy</button>' : ''}`;
  box.querySelector('button')?.addEventListener('click', () => copy(CA, 'Contract address copied'));
}
for (const el of $$('[data-token-links]')) {
  const links = [];
  if (real) links.push([`https://pump.fun/coin/${CA}`, 'pump.fun'], [`https://dexscreener.com/solana/${CA}`, 'DexScreener']);
  if (CFG.X_URL) links.push([CFG.X_URL, 'X']);
  el.innerHTML = links.map(([h, l]) => `<a href="${esc(h)}" rel="noopener" target="_blank">${l}</a>`).join(' · ');
}

document.addEventListener('click', e => {
  const b = e.target.closest('.code-copy');
  if (b) copy(b.parentElement.querySelector('code').textContent, 'Code copied');
  const c = e.target.closest('[data-copy]');
  if (c) copy(c.dataset.copy, c.dataset.copyLabel || 'Copied');
});

/* the wallet button appears on pages that import wallet.js */
window.addEventListener('ia:wallet', e => {
  const b = $('[data-wallet]');
  if (!b) return;
  b.hidden = false;
  b.textContent = e.detail.address ? short(e.detail.address) : 'Connect';
});
