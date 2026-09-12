/* Compares the generated site against the crawled original, page by page. */
const fs = require('fs'), path = require('path'), cheerio = require('cheerio');
const CFG = require('./site.config.js');
// crawled + approved additions + published new pages: all their text must render
const pages = require('./site-pages.js').load();
const OUT = 'build';
const REDIRECT_FROM = new Set(CFG.redirects.map(r => r.from));
const live = pages.filter(p => !REDIRECT_FROM.has(p.pathname));

// Long dashes are intentionally normalised to "-" site-wide; compare modulo that.
// Deliberate SEO corrections (duplicate/missing titles and descriptions).
// Everything not listed there must still match the original exactly.
const SEO = require('./seo-overrides.js');
const FIX = require('./content-fixes.js');
// The audit's corrections (text-fixes.js) change words on purpose, so the
// source is compared after them; parity still catches anything else lost.
const TEXTFIX = require('./text-fixes.js');
let VPAGE = '';
// Corrections are applied to the SOURCE side only. The built page already
// carries them, and several of them ("ביות" -> "ביותר") are prefixes of their
// own result, so applying them twice would corrupt the comparison.
let FIXING = true;

const normDash = (v) => v == null ? v : String(v).replace(/[‐‑‒–—―−]/g, '-');

const fail = [], warn = [];
const push = (arr, page, kind, msg) => arr.push({ page: page.pathname, kind, msg });

function tokens(rawText) {
  const t = FIXING ? TEXTFIX.apply(rawText || '', VPAGE) : (rawText || '');
  return (t || '').replace(/ /g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
}

// Visible text of an HTML fragment. Tags become spaces so that adjacent
// elements (e.g. <h3>..בחיפה</h3><p>איטום..) never fuse into one token.
function htmlTokens(html) {
  if (!html) return [];
  if (FIXING) html = TEXTFIX.applyHtml(html, VPAGE);   // same markup-level corrections
  const $f = cheerio.load('<div id="__t">' + html + '</div>', { decodeEntities: false });
  $f('#__t script, #__t style, #__t title').remove();
  const alts = $f('#__t [alt], #__t [title]')
    .map((i, e) => ($f(e).attr('alt') || '') + ' ' + ($f(e).attr('title') || '')).get().join(' ');
  // Pad every element so neighbouring text never fuses, then read .text() so
  // HTML entities (&nbsp; and friends) are decoded rather than tokenised.
  $f('#__t *').each((i, e) => { $f(e).before(' ').after(' '); });
  return tokens(normDash($f('#__t').text() + ' ' + alts));
}

function outFile(pathname) {
  const rel = pathname.replace(/^\//, '').replace(/\/$/, '');
  return rel ? path.join(OUT, rel, 'index.html') : path.join(OUT, 'index.html');
}

const allPaths = new Set(pages.map(p => p.pathname));
const stats = { assetsOk: 0, assetsMissing: new Set(), linksChecked: 0, linksBroken: new Set() };

for (const page of live) {
  VPAGE = page.pathname;
  const f = outFile(page.pathname);
  if (!fs.existsSync(f)) { push(fail, page, 'missing-page', 'no output file at ' + f); continue; }

  const html = fs.readFileSync(f, 'utf8');
  const $ = cheerio.load(html);

  /* --- SEO parity --- */
  const title = $('title').text().trim();
  const expectTitle = TEXTFIX.apply(SEO.title[page.pathname] || normDash(page.title), page.pathname);
  if (title !== expectTitle) push(fail, page, 'title', `"${title}" != "${page.title}"`);

  const desc = $('meta[name="description"]').attr('content') || null;
  const rawDesc = SEO.description[page.pathname] || normDash(page.description || null);
  const expectDesc = rawDesc ? TEXTFIX.apply(rawDesc, page.pathname) : rawDesc;
  if (expectDesc !== (desc || null)) push(fail, page, 'description', `"${desc}" != "${page.description}"`);

  const canon = $('link[rel="canonical"]').attr('href');
  const expectCanon = page.canonical || (CFG.origin + page.rawPathname);
  if (canon !== expectCanon) push(fail, page, 'canonical', `${canon} != ${expectCanon}`);

  const schemaCount = $('script[type="application/ld+json"]').length;
  if (schemaCount !== page.schema.length) push(fail, page, 'schema', `${schemaCount} blocks != ${page.schema.length}`);

  /* --- structure --- */
  const h1s = $('h1');
  if (h1s.length === 0) push(fail, page, 'h1', 'no H1');
  else if (h1s.length > 1) push(fail, page, 'h1', h1s.length + ' H1 elements');

  if (!$('html').attr('lang')) push(fail, page, 'lang', 'missing lang');
  if ($('html').attr('dir') !== 'rtl') push(fail, page, 'dir', 'missing dir=rtl');
  if (!$('meta[name="viewport"]').length) push(fail, page, 'viewport', 'missing viewport');

  /* --- content parity (token level) --- */
  const srcTokens = [];
  // blocks the build deliberately drops must not count as lost content
  const dropped = FIX.droppedHeroBlocks(page.blocks.filter(b => b.region === 'hero'));
  for (const b of page.blocks) {
    if (dropped.has(b)) continue;
    // blocks the audit deletes are not expected in the output either
    if (TEXTFIX.isDropped([b.text, b.html].filter(Boolean).join(' '), page.pathname)) continue;
    switch (b.type) {
      case 'heading': srcTokens.push(...tokens(normDash(b.text))); break;
      case 'button': srcTokens.push(...tokens(normDash(b.text))); break;
      case 'image': srcTokens.push(...tokens(normDash(b.alt))); break;
      case 'imagebox': srcTokens.push(...tokens(b.title), ...tokens(b.text), ...tokens(b.alt)); break;
      case 'gallery': b.images.forEach(i => srcTokens.push(...tokens(i.alt))); break;
      case 'list': b.items.forEach(i => srcTokens.push(...tokens(normDash(i.text)))); break;
      case 'richtext': srcTokens.push(...htmlTokens(b.html)); break;
      case 'html': srcTokens.push(...htmlTokens(b.html)); break;
      case 'faq':
        b.items.forEach(i => { srcTokens.push(...tokens(normDash(i.q)), ...htmlTokens(i.a)); });
        break;
      default: break;
    }
  }

  const $out = cheerio.load(html);
  $out('script, style, .site-header, .site-footer, .callbar, .a11y-panel').remove();
  FIXING = false;   // the output is read as-is
  const outSet = new Set(htmlTokens($out('body').html() || ''));
  FIXING = true;
  const missing = [...new Set(srcTokens)].filter(t => !outSet.has(t));
  if (missing.length) {
    const pct = ((1 - missing.length / new Set(srcTokens).size) * 100).toFixed(1);
    push(fail, page, 'content', `${missing.length} tokens missing (${pct}% kept): ${missing.slice(0, 12).join(' ')}`);
  }

  /* --- assets exist on disk --- */
  $('img[src], source[srcset], video source[src]').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('srcset');
    if (!src || !src.startsWith('/')) return;
    const p = path.join(OUT, decodeURIComponent(src).replace(/^\//, ''));
    if (fs.existsSync(p)) stats.assetsOk++;
    else stats.assetsMissing.add(src);
  });

  /* --- internal links resolve --- */
  $('a[href]').each((i, el) => {
    let h = $(el).attr('href') || '';
    if (!h.startsWith('/')) return;
    h = h.split('#')[0].split('?')[0];
    if (!h) return;
    if (/^\/assets\//.test(h) || /^\/wp-content\//.test(h)) return;
    stats.linksChecked++;
    const decoded = decodeURIComponent(h);
    const normalised = decoded.endsWith('/') ? decoded : decoded + '/';
    if (allPaths.has(normalised)) return;
    if (fs.existsSync(path.join(OUT, decoded.replace(/^\//, '').replace(/\/$/, ''), 'index.html'))) return;
    stats.linksBroken.add(h);
  });
}

/* ---------------------------------------------------------------- report */
const byKind = {};
fail.forEach(f => { (byKind[f.kind] = byKind[f.kind] || []).push(f); });

console.log('=== VERIFICATION ===');
console.log('pages checked:', live.length);
console.log('');
const KINDS = ['missing-page', 'title', 'description', 'canonical', 'schema', 'content', 'h1', 'lang', 'dir', 'viewport'];
for (const k of KINDS) {
  const n = (byKind[k] || []).length;
  console.log((n === 0 ? 'PASS' : 'FAIL') + '  ' + k.padEnd(14) + (n === 0 ? 'all ' + live.length + ' pages' : n + ' pages'));
}
console.log('');
console.log('assets referenced & present:', stats.assetsOk);
console.log('assets missing on disk:', stats.assetsMissing.size);
[...stats.assetsMissing].slice(0, 8).forEach(a => console.log('   ' + a));
console.log('internal links checked:', stats.linksChecked);
console.log('internal links unresolved:', stats.linksBroken.size);
[...stats.linksBroken].slice(0, 12).forEach(a => console.log('   ' + decodeURIComponent(a)));

console.log('');
for (const k of KINDS) {
  const list = byKind[k] || [];
  if (!list.length) continue;
  console.log('--- ' + k + ' (' + list.length + ') ---');
  list.slice(0, 6).forEach(f => console.log('   ' + f.page.slice(0, 40) + ' :: ' + f.msg.slice(0, 150)));
}
fs.writeFileSync('_source/verify.json', JSON.stringify({ fail, stats: { assetsOk: stats.assetsOk, assetsMissing: [...stats.assetsMissing], linksBroken: [...stats.linksBroken] } }, null, 2));
