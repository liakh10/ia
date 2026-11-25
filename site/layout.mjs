// The page shell every IA page is built with: head, header, footer. Pages are static HTML; live parts load as ES modules from /ui.
// Copy rules: no long dashes, no fixed clock times, no betting words, "in our tests" for every measured claim.
import { esc } from './md.mjs';

export const NAV = [
  ['home', '/', 'Test'],
  ['integrity', '/integrity', 'Integrity Index'],
  ['cases', '/cases', 'Case files'],
  ['plant', '/plant', 'Plant'],
  ['sureties', '/sureties', 'Sureties'],
  ['forecasts', '/forecasts', 'Forecasts'],
  ['docs', '/docs', 'Docs'],
];

const FOOT = [
  ['Watch', [['/', 'The current test'], ['/live', 'Live runs'], ['/integrity', 'Integrity Index'], ['/cases', 'Case files']]],
  ['Take part', [['/plant', 'Plant bait'], ['/sureties', 'Stand surety'], ['/forecasts', 'Free forecasts']]],
  ['Check', [['/docs/trust', 'Trust points'], ['/docs/methodology', 'Methodology'], ['/log', 'Transparency log'], ['/status', 'Status']]],
  ['Record', [['/docs', 'The paper'], ['/developers', 'Developers'], ['/changelog', 'Changelog'], ['/reports', 'Test reports'], ['/docs/right-of-reply', 'Right of reply']]],
];

/**
 * page: { title, description, nav, body, scripts, bodyClass, canonical, noindex, head }
 * site: { origin, program, repo }
 */
export function shell(page, site) {
  const title = page.title ? `${page.title} · Internal Affairs` : 'Internal Affairs · the agent is the suspect, the chain is the witness';
  const desc = page.description || 'Six AI models run an accounts-payable job with real SOL within reach. Anyone can plant bait. The program records who takes it, and the Integrity Index shows the rates, in our tests, per exact model version.';
  const url = site.origin + (page.canonical || '/');
  const nav = NAV.map(([id, href, label]) => `<a href="${href}"${page.nav === id ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const scripts = (page.scripts || []).map(s => `<script type="module" src="${s}"></script>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/ui/tokens.css">
<link rel="stylesheet" href="/ui/site.css">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Internal Affairs">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
${page.noindex ? '<meta name="robots" content="noindex">\n' : ''}${page.head || ''}
<script src="/config.js"></script>
<script type="module" src="/ui/app.js"></script>
${scripts}
</head>
<body class="${esc(page.bodyClass || '')}" data-page="${esc(page.nav || '')}">
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <a class="brand" href="/" aria-label="Internal Affairs, home"><span class="brand-mark" aria-hidden="true">IA</span><span class="brand-name">Internal Affairs</span></a>
  <nav class="nav" id="nav" aria-label="Main">${nav}</nav>
  <div class="top-end"><button class="btn small ghost" type="button" data-wallet hidden>Connect</button><button class="menu" type="button" aria-expanded="false" aria-controls="nav"><span class="menu-bars"></span><span class="sr">Menu</span></button></div>
</header>
<main id="main">
${page.body}
</main>
<footer class="foot">
  <div class="foot-grid">
    <div><div class="ca" data-ca></div><p class="foot-links" data-token-links></p></div>
    ${FOOT.map(([h, links]) => `<div><h2>${h}</h2><ul>${links.map(([href, label]) => `<li><a href="${href}"${/^https?:/.test(href) ? ' rel="noopener" target="_blank"' : ''}>${label}</a></li>`).join('')}</ul></div>`).join('')}
  </div>
  <dl class="foot-facts">
    <div><dt>Program</dt><dd class="mono">${esc(site.program)}</dd></div>
  </dl>
  <p class="foot-note">Rates are from our tests, per exact model version, with 95% intervals and every run published. Agents act only inside a closed program ledger against addresses we own; real SOL moves only at settlement, by rule. Forecasts are free.</p>
</footer>
</body>
</html>
`;
}

/** The docs body: the sections sidebar, the article, the on-page outline. */
export function docsBody({ sections, current, html, outline, meta, prev, next, kicker }) {
  const side = sections.map(s => `<li><a href="${s.href}"${s.slug === current ? ' aria-current="page"' : ''}><span class="n">${s.num}</span>${esc(s.title)}</a></li>`).join('');
  const toc = outline.filter(o => o.depth === 2 || o.depth === 3).map(o => `<li class="d${o.depth}"><a href="#${o.id}">${esc(o.text.replace(/#$/, ''))}</a></li>`).join('');
  return `<div class="docs">
  <aside class="docs-side" aria-label="Sections">
    <details class="docs-pick" open><summary>${esc(kicker || 'The paper')}</summary><ol class="docs-list">${side}</ol></details>
  </aside>
  <article class="prose" data-docs>
    ${meta?.summary ? `<p class="kicker">${esc(meta.summary)}</p>` : ''}
    ${html}
    <nav class="docs-next" aria-label="Pages">${prev ? `<a class="prev" href="${prev.href}"><span>Previous</span>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.href}"><span>Next</span>${esc(next.title)}</a>` : ''}</nav>
  </article>
  ${toc ? `<aside class="docs-toc" aria-label="On this page"><h2>On this page</h2><ol>${toc}</ol></aside>` : '<aside class="docs-toc"></aside>'}
</div>`;
}
