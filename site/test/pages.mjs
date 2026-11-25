#!/usr/bin/env node
// Every page of the site in a real browser against the lab server (node lab/serve.mjs): no console errors, no failed module, the
// live parts filled from /v1, nothing wider than the viewport at 375 px. Screenshots go to --out (default: the OS temp dir).
//   node site/test/pages.mjs [--base http://127.0.0.1:5791] [--out dir]
// Needs Google Chrome and playwright-core (PLAYWRIGHT_CORE=<path to the package>, else it is looked up in sibling projects).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:5791');
const OUT = arg('--out', fs.mkdtempSync(path.join(os.tmpdir(), 'ia-pages-')));
const req = createRequire(import.meta.url);
const pw = (() => {
  for (const p of [process.env.PLAYWRIGHT_CORE, 'playwright-core', '/Users/artem/Desktop/sol/gg/node_modules/playwright-core'].filter(Boolean)) { try { return req(p); } catch {} }
  throw Error('playwright-core not found: set PLAYWRIGHT_CORE');
})();

const PAGES = [
  ['/', '[data-purses] .purse'],
  ['/integrity', '[data-models] table'],
  ['/cases', '[data-list] table'],
  ['/plant', '[data-round] dd'],
  ['/sureties', '[data-purses] table'],
  ['/forecasts', '[data-calls]'],
  ['/live', '[data-filter] label'],
  ['/log', '[data-head]'],
  ['/status', '[data-checks] table'],
  ['/docs', '.trust-first li'],
  ['/docs/methodology', '.prose h2'],
  ['/developers', '.prose h1'],
  ['/changelog', '.prose'],
  ['/reports', '.page'],
  ['/lab', '#agents tr'],
];
const browser = await pw.chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let fails = 0, total = 0;
const check = (ok, what) => { total++; if (!ok) { fails++; console.log('  FAIL ' + what); } else console.log('  ok   ' + what); };

// a case file and an agent page from whatever the lab chain holds
const cases = await fetch(`${BASE}/v1/cases?all=1`).then(r => r.json()).catch(() => ({ cases: [] }));
if (cases.cases?.length) { PAGES.push([`/cases/${cases.cases.find(c => c.tier === 'BENT_LIED')?.id || cases.cases[0].id}`, '[data-check] :is(strong, span)']); PAGES.push([`/agents/${cases.cases[0].agent}`, '[data-stats] dd']); }

for (const [w, h] of [[1280, 900], [375, 812]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  for (const [url, sel] of PAGES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !/favicon|EventSource|ERR_CONNECTION|404 \(Not Found\)/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e.message)));
    await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => errors.push(e.message));
    const found = await page.waitForSelector(sel, { timeout: 12000 }).then(() => true).catch(() => false);
    if (url.startsWith('/cases/')) await page.waitForFunction(() => /Checked in your browser/.test(document.querySelector('[data-check]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const name = `${w}${url.replace(/\//g, '_') || '_home'}.png`;
    await page.screenshot({ path: path.join(OUT, name), fullPage: true });
    check(found && !errors.length && wide <= 1, `${w}px ${url}${found ? '' : ` (no ${sel})`}${errors.length ? ' errors: ' + errors.join(' | ').slice(0, 300) : ''}${wide > 1 ? ` (${wide}px too wide)` : ''}`);
    if (url.startsWith('/cases/') && w === 1280) {
      const t = await page.textContent('[data-check]');
      check(/every act's step hash is the hash of a line/.test(t) && /equals the root the program recorded/.test(t), 'case file: steps and docket root check out in the browser');
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'result.txt'), `${total - fails}/${total}\n`);
console.log(`\nsite pages: ${total - fails}/${total} · screenshots in ${OUT}`);
process.exit(fails ? 1 : 0);
