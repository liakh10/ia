#!/usr/bin/env node
// Builds the static IA site at the repo root from site/pages (the app pages), docs-src (the paper), reports/*.md and CHANGELOG.md,
// with the shell in site/layout.mjs. Deterministic: the same inputs give the same bytes. It also copies the program's IDL to
// ui/idl.json, so the pages encode instructions from the file the program was built with.
//   node site/build.mjs            write the pages
//   node site/build.mjs --check    build in memory; fail if a committed page differs, an internal link is dead or the copy
//                                  breaks a house rule (long dashes, betting words, Cyrillic)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { frontMatter, render, esc } from './md.mjs';
import { shell, docsBody } from './layout.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const CHECK = process.argv.includes('--check');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));
const cfgText = exists('config.js') ? read('config.js') : '';
const cfg = k => (new RegExp(`${k}\\s*:\\s*"([^"]*)"`).exec(cfgText) || [])[1] || '';
const origin = (cfg('DOMAIN') ? `https://${cfg('DOMAIN').replace(/^https?:\/\//, '')}` : 'https://ia-sol.vercel.app').replace(/\/$/, '');
const REPO = (cfg('REPO') || 'https://github.com/liakh10/ia') + '/blob/main/';
const site = { origin, program: cfg('PROGRAM'), repo: REPO };

const outputs = new Map();
// en dashes in ranges and names (written by every part's reports) render as hyphens: the site's copy uses no long dashes
const emit = (p, s) => outputs.set(p, p.endsWith('.html') ? s.replace(/\u2013/g, '-') : s);
const pages = new Set();

/* ------------------------------------------------------------------ the paper */
const DOC_SKIP = new Set(['developers.md']);   // its own page, /developers (written by devx)
const docs = exists('docs-src') ? fs.readdirSync(path.join(ROOT, 'docs-src')).filter(f => f.endsWith('.md') && !DOC_SKIP.has(f)).map(f => {
  const { meta, body } = frontMatter(read(`docs-src/${f}`));
  const slug = f.replace(/\.md$/, '');
  return { slug, meta, body, order: Number(meta.order ?? 99), title: meta.title || slug };
}).sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug)) : [];
const docSlugs = new Set(docs.map(d => d.slug));
const lead = docs.find(d => d.slug === 'abstract') || docs[0];
const docHref = slug => (lead && slug === lead.slug ? '/docs' : `/docs/${slug}`);
const reportFiles = exists('reports') ? fs.readdirSync(path.join(ROOT, 'reports')).filter(f => f.endsWith('.md')).sort() : [];

function linker(fromDir) {
  return href => {
    if (/^(https?:|mailto:|#|\/)/.test(href)) return href;
    const [p, hash = ''] = href.split('#');
    const h = hash ? `#${hash}` : '';
    const norm = path.posix.normalize(path.posix.join(fromDir, p));
    const base = norm.replace(/\.md$/, '');
    if (norm.startsWith('docs-src/')) { const slug = base.slice('docs-src/'.length); if (slug === 'developers') return `/developers${h}`; return (docSlugs.has(slug) ? docHref(slug) : `/docs/${slug}`) + h; }
    if (/^reports\/[\w-]+$/.test(base) && reportFiles.includes(base.slice(8) + '.md')) return `/reports/${base.slice(8)}${h}`;
    if (norm === 'CHANGELOG.md') return `/changelog${h}`;
    return REPO + norm + h;
  };
}
const sections = docs.map((d, i) => ({ slug: d.slug, title: d.title, href: docHref(d.slug), num: String(i + 1).padStart(2, '0') }));

/** the first page of the paper opens with the trust points (docs-src/trust.md, one per h2), before anything else */
function trustDigest() {
  const t = docs.find(d => d.slug === 'trust');
  if (!t) return '';
  const r = render(t.body, { link: linker('docs-src') });
  const items = [];
  const re = /<h2 id="([^"]+)">([\s\S]*?)<a class="anchor"[\s\S]*?<\/h2>\s*<p>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(r.html))) {
    const first = m[3].replace(/<[^>]+>/g, '').split(/(?<=\.)\s/)[0];
    items.push(`<li><a href="/docs/trust#${m[1]}"><strong>${m[2].replace(/^\d+\.\s*/, '')}</strong><span>${esc(first)}</span></a></li>`);
  }
  if (!items.length) return '';
  return `<section class="trust-first" aria-labelledby="trust-first-h"><p class="label" id="trust-first-h">Read this first: what you trust</p><ol>${items.join('')}</ol><a href="/docs/trust">Every trust point, with what each party could do and what bounds it</a></section>`;
}

docs.forEach((d, i) => {
  const r = render(d.body, { link: linker('docs-src'), origin });
  const href = docHref(d.slug);
  pages.add(href);
  let html = r.html;
  if (d === lead) html = trustDigest() + html;
  const body = docsBody({ sections, current: d.slug, html, outline: r.outline, meta: d.meta, prev: sections[i - 1], next: sections[i + 1] });
  emit(d === lead ? 'docs/index.html' : `docs/${d.slug}.html`, shell({ title: d === lead ? 'Docs' : d.title, description: d.meta.summary, nav: 'docs', body, canonical: href, scripts: ['/ui/docs.js'], bodyClass: 'page-docs' }, site));
});

/* ------------------------------------------------------------------ /developers */
if (exists('docs-src/developers.md')) {
  const { meta, body } = frontMatter(read('docs-src/developers.md'));
  const r = render(body, { origin, link: linker('docs-src') });
  const html = docsBody({ sections: [{ slug: 'developers', title: meta.title || 'Developers', href: '/developers', num: 'D' }], current: 'developers', html: r.html, outline: r.outline, meta, kicker: 'Developers' });
  emit('developers.html', shell({ title: 'Developers', description: meta.summary || 'The read API, the SDK, the MCP server and the CLI: read the Integrity Index, case files, purses and plants from code.', nav: 'docs', body: html, canonical: '/developers', scripts: ['/ui/docs.js'], bodyClass: 'page-docs' }, site));
  pages.add('/developers');
}

/* ------------------------------------------------------------------ /reports */
const reports = reportFiles.map(f => {
  const { meta, body } = frontMatter(read(`reports/${f}`));
  const r = render(body, { link: linker('reports') });
  const slug = f.replace(/\.md$/, '');
  const firstP = (/<p>([\s\S]*?)<\/p>/.exec(r.html) || [])[1] || '';
  return { slug, meta, r, title: meta.title || r.title || slug, summary: meta.summary || firstP.replace(/<[^>]+>/g, '').slice(0, 240) };
});
const repSections = reports.map((r, i) => ({ slug: r.slug, title: r.title, href: `/reports/${r.slug}`, num: String(i + 1).padStart(2, '0') }));
reports.forEach((rep, i) => {
  const body = docsBody({ sections: repSections, current: rep.slug, html: rep.r.html, outline: rep.r.outline, meta: rep.meta, prev: repSections[i - 1], next: repSections[i + 1], kicker: 'Test reports' });
  emit(`reports/${rep.slug}.html`, shell({ title: rep.title, description: rep.summary, nav: 'docs', body, canonical: `/reports/${rep.slug}`, scripts: ['/ui/docs.js'], bodyClass: 'page-docs' }, site));
  pages.add(`/reports/${rep.slug}`);
});
emit('reports/index.html', shell({
  title: 'Test reports', nav: 'docs', canonical: '/reports',
  description: 'Every part of Internal Affairs publishes what it tested, the commands that run the tests, and what is still open.',
  body: `<div class="page"><section class="band"><p class="label">Record</p><h1 class="h1">Test reports</h1><p class="lead">Each part publishes what it tested, how to run the tests, and what is still open. Findings stay in the reports after they are fixed.</p></section>
${reports.length ? `<ol class="index-list">${reports.map((r, i) => `<li><a href="/reports/${r.slug}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${esc(r.title)}</span><span class="s">${esc(r.summary)}</span></a></li>`).join('')}</ol>` : '<p class="empty">The first reports are published with the first suite runs of each part.</p>'}</div>`,
}, site));
pages.add('/reports');

/* ------------------------------------------------------------------ /changelog: CHANGELOG.md, else the repository history by day */
{
  let html, outline = [];
  if (exists('CHANGELOG.md')) { const r = render(frontMatter(read('CHANGELOG.md')).body, { link: linker('') }); html = r.html; outline = r.outline; }
  else {
    let log = '';
    try { log = execFileSync('git', ['log', '--date=short', '--pretty=format:%ad\t%h\t%s', '-n', '400'], { cwd: ROOT, encoding: 'utf8' }); } catch {}
    const byDay = new Map();
    for (const line of log.split('\n').filter(Boolean)) { const [d, h, s] = line.split('\t'); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push([h, s]); }
    html = `<h1 id="changelog">Changelog</h1><p>Every change to the program, the runner, the registry, the log, the API and this site, from the repository history.</p>` +
      [...byDay].map(([d, list]) => `<h2 id="d-${d}">${d}</h2><ul class="commits">${list.map(([h, s]) => `<li><span class="mono">${h}</span> ${esc(s)}</li>`).join('')}</ul>`).join('');
    outline = [...byDay.keys()].map(d => ({ depth: 2, id: `d-${d}`, text: d }));
  }
  const body = docsBody({ sections: [{ slug: 'changelog', title: 'Changelog', href: '/changelog', num: '00' }], current: 'changelog', html, outline, kicker: 'Record' });
  emit('changelog.html', shell({ title: 'Changelog', nav: 'docs', canonical: '/changelog', body, scripts: ['/ui/docs.js'], bodyClass: 'page-docs', description: 'What changed in Internal Affairs, part by part.' }, site));
  pages.add('/changelog');
}

/* ------------------------------------------------------------------ the app pages */
const APP = [
  { file: 'home', out: 'index.html', url: '/', nav: 'home', title: '', scripts: ['/ui/home.js'] },
  { file: 'live', out: 'live.html', url: '/live', nav: 'home', title: 'Live runs', scripts: ['/ui/live.js'], description: 'Every tool call of every model in the current test, as the runner relays it.' },
  { file: 'integrity', out: 'integrity.html', url: '/integrity', nav: 'integrity', title: 'Integrity Index', scripts: ['/ui/integrity.js'], description: 'Per exact model version: how often each model took the bait, lied about it, or filed a false report, in our tests, with 95% intervals over every run.' },
  { file: 'agent', out: 'agent.html', url: '/agent', nav: 'integrity', title: 'Model', scripts: ['/ui/agent.js'], description: 'One model in the lineup: its purse, its record per version, every run.' },
  { file: 'cases', out: 'cases.html', url: '/cases', nav: 'cases', title: 'Case files', scripts: ['/ui/cases.js'], description: 'Every catch, with the act on chain, the transcript hash and the first tempting step.' },
  { file: 'case', out: 'case.html', url: '/case', nav: 'cases', title: 'Case file', scripts: ['/ui/case.js'], description: 'One run: the model, the plants it faced, the tier the program derived, the acts and the transcript.' },
  { file: 'plant', out: 'plant.html', url: '/plant', nav: 'plant', title: 'Plant bait', scripts: ['/ui/plant.js'], description: 'Write a plant for the next test. If any model takes it, the program pays you a bounty from that model\'s purse.' },
  { file: 'sureties', out: 'sureties.html', url: '/sureties', nav: 'sureties', title: 'Sureties', scripts: ['/ui/sureties.js'], description: 'Underwrite a model\'s purse: earn from every plant it resists, lose a capped share when it is caught.' },
  { file: 'forecasts', out: 'forecasts.html', url: '/forecasts', nav: 'forecasts', title: 'Forecasts', scripts: ['/ui/forecasts.js'], description: 'Call CLEAN or BENT for each model before the plant window closes. Free, signed messages, points on a public board.' },
  { file: 'log', out: 'log.html', url: '/log', nav: 'docs', title: 'Transparency log', scripts: ['/ui/log.js'], description: 'Transcript roots, plant reveals and forecasts in an append-only Merkle log.' },
  { file: 'status', out: 'status.html', url: '/status', nav: '', title: 'Status', scripts: ['/ui/status.js'], description: 'The live health of every part Internal Affairs depends on.' },
  { file: '404', out: '404.html', url: '/404', nav: '', title: 'Not found', scripts: [], noindex: true },
];
for (const p of APP) {
  const src = path.join(here, 'pages', `${p.file}.html`);
  if (!fs.existsSync(src)) continue;
  emit(p.out, shell({ ...p, body: fs.readFileSync(src, 'utf8'), canonical: p.url }, site));
  pages.add(p.url);
}
emit('favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" rx="5" fill="none" stroke="#161616" stroke-width="3"/><text x="16" y="21" font-family="ui-monospace,Menlo,monospace" font-size="12" font-weight="700" text-anchor="middle" fill="#161616">IA</text></svg>\n');
if (exists('program/idl/ia.json')) emit('ui/idl.json', read('program/idl/ia.json'));

/* ------------------------------------------------------------------ checks: links and copy */
const known = url => {
  const u = url.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
  if (pages.has(u) || outputs.has(u.slice(1)) || outputs.has(u.slice(1) + '.html')) return true;
  if (/^\/(v1|api|cases|agents|ui|lab)(\/|$)/.test(u)) return true;
  return exists(u.slice(1));
};
const dead = [], copyBad = [];
const BANNED = [[/[—–]/, 'long dash'], [/\b(bets?|betting|wager(s|ing)?|odds|jackpot|gambl\w*)\b/i, 'betting word'], [/[Ѐ-ӿ]/, 'Cyrillic']];
for (const [p, s] of outputs) {
  if (!p.endsWith('.html')) continue;
  for (const m of s.matchAll(/href="(\/[^"]*)"/g)) if (!known(m[1])) dead.push(`${p}: ${m[1]}`);
  const text = s.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  for (const [re, what] of BANNED) { const m = re.exec(text); if (m && !(what === 'betting word' && /no betting|not a wager|never a wager|no odds|without odds|no wagers|not betting|takes a wager|no house/i.test(text.slice(Math.max(0, m.index - 40), m.index + 40)))) copyBad.push(`${p}: ${what} "${text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ').trim()}"`); }
}

let changed = 0;
for (const [p, s] of outputs) {
  const f = path.join(ROOT, p);
  const old = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  if (old === s) continue;
  changed++;
  if (!CHECK) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); }
}
if (dead.length) console.warn('dead links: ' + dead.join(', '));
if (copyBad.length) console.warn('copy rules: ' + copyBad.join('\n  '));
console.log(`${CHECK ? 'checked' : 'built'} ${outputs.size} files (${changed} ${CHECK ? 'differ' : 'changed'}) for ${origin}`);
if (CHECK && (changed || dead.length || copyBad.length)) process.exit(1);
