/* Prints the readable text of pages, for proofreading. Read-only.

     node tools/dump-text.js            list every page with its index
     node tools/dump-text.js 0 20       print the text of pages 0-19
     node tools/dump-text.js /slug/     print one page

   Skips the sidebar and the two widgets that repeat on every page (the price
   calculator and the daily tip), so what is printed is what a reader reads. */

const cheerio = require('cheerio');
const SITE = require('./site-pages.js');
const CFG = require('./site.config.js');
const SEO = require('./seo-overrides.js');

const redirected = new Set(CFG.redirects.map((r) => r.from));
const PAGES = SITE.load().filter((p) => !redirected.has(p.pathname))
  .sort((a, b) => a.pathname.localeCompare(b.pathname, 'he'));

const strip = (html) => {
  const $ = cheerio.load('<div>' + html + '</div>');
  $('style, script').remove();
  $('p, li, h1, h2, h3, h4, h5, h6, br, td, th, tr, div').after('\n');
  return $.root().text().replace(/[ \t ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
};

const WIDGETS = /מחשב הצעת מחיר|טיפ יומי לאיטום/;

function dump(p, i) {
  const out = [];
  out.push('=== [' + i + '] ' + p.pathname);
  out.push('TITLE: ' + (SEO.title[p.pathname] || p.title || ''));
  out.push('DESC:  ' + (SEO.description[p.pathname] || p.description || ''));
  for (const b of p.blocks) {
    if (b.region === 'cta') continue;
    if (b.type === 'form' || b.type === 'toc' || b.type === 'video') continue;
    if (b.html && WIDGETS.test(b.html)) continue;
    if (b.type === 'heading') out.push('\n[H' + b.level + '] ' + b.text);
    else if (b.type === 'button') out.push('[כפתור] ' + b.text);
    else if (b.type === 'image' || b.type === 'imagebox') {
      const alt = [b.alt, b.title, b.text].filter(Boolean).join(' | ');
      if (alt) out.push('[תמונה alt] ' + alt);
    } else if (b.type === 'list') out.push((b.items || []).map((it) => '  - ' + it.text).join('\n'));
    else if (b.type === 'faq') {
      (b.items || []).forEach((it) => out.push('[שאלה] ' + it.q + '\n[תשובה] ' + strip(it.a || '')));
    } else if (b.html) out.push(strip(b.html));
    else if (b.text) out.push(b.text);
  }
  return out.filter(Boolean).join('\n');
}

const arg = (process.argv[2] || '').replace(/^[a-z]:[\\/]+program files[\\/]+git(?=[\\/])/i, '');
if (!arg) {
  PAGES.forEach((p, i) => console.log(String(i).padStart(3), p.pathname));
  console.log('\n' + PAGES.length + ' pages');
} else if (arg.startsWith('/')) {
  const i = PAGES.findIndex((p) => p.pathname === decodeURIComponent(arg));
  if (i < 0) { console.log('not found: ' + arg); process.exit(1); }
  console.log(dump(PAGES[i], i));
} else {
  const from = parseInt(arg, 10) || 0;
  const to = Math.min(parseInt(process.argv[3], 10) || from + 1, PAGES.length);
  for (let i = from; i < to; i++) console.log(dump(PAGES[i], i) + '\n');
}
