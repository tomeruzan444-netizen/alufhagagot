/* How long is a page's article? New pages go up at 800-1,100 words
   (see "אורך העמוד" in docs/content-guide.md).

     node tools/word-count.js /איטום-גגות-מבטון/    one page on the site
     node tools/word-count.js drafts/article.md       a draft (md / txt / html)
     node tools/word-count.js                         every page on the site

   Counted: the article the reader came for - H1, the lede under it, the body,
   FAQ questions and answers, lists. Not counted: menu, sidebar, lead forms,
   buttons, footer, and the "call us now" block the build drops. A word is any
   whitespace-separated token with a letter or a digit in it, so a lone "-" or
   "|" does not count. */

const fs = require('fs'), path = require('path'), cheerio = require('cheerio');
const CFG = require('./site.config.js');
const FIX = require('./content-fixes.js');

const MIN = 800, MAX = 1100;
const ROOT = path.join(__dirname, '..');

const count = (text) => String(text || '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const stripHtml = (html) => {
  const $ = cheerio.load('<div>' + html + '</div>');
  $('style, script').remove();
  // keep block boundaries, or "</p><p>" would glue two words together
  $('p, li, h1, h2, h3, h4, h5, h6, br, td, th, div').after(' ');
  return $.root().text();
};

/** The article text of a crawled page, as the build renders it. */
function articleText(page) {
  const hero = page.blocks.filter((b) => b.region === 'hero');
  const dropped = FIX.droppedHeroBlocks(hero);
  const out = [];
  for (const b of page.blocks) {
    if (b.region === 'cta' || dropped.has(b)) continue;   // cta = the sidebar
    if (b.type === 'form' || b.type === 'button' || b.type === 'toc') continue;
    if (b.type === 'heading') out.push(b.text);
    else if (b.type === 'faq') (b.items || []).forEach((it) => out.push(it.q, stripHtml(it.a || '')));
    else if (b.type === 'list') (b.items || []).forEach((it) => out.push(it.text));
    else if (b.html) out.push(stripHtml(b.html));
    else if (b.type === 'imagebox') out.push(b.title, b.text);
  }
  return out.filter(Boolean).join(' ');
}

/** Words in a draft file. Markdown syntax and HTML tags are not words. */
function draftText(file) {
  let t = fs.readFileSync(file, 'utf8');
  if (/\.html?$/i.test(file)) return stripHtml(t);
  return t
    .replace(/^---\n[\s\S]*?\n---\n/, '')              // front matter
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')              // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')            // links keep their text
    .replace(/^[ \t]*(#{1,6}|[-*+]|\d+\.|>)[ \t]+/gm, '')
    .replace(/^\|?[\s:|-]+\|?$/gm, ' ')                 // table rules
    .replace(/[|*_`]/g, ' ');
}

function verdict(n) {
  if (n < MIN) return 'קצר מדי - חסרות ' + (MIN - n) + ' מילים';
  if (n > MAX) return 'ארוך מדי - ' + (n - MAX) + ' מילים מעל';
  return 'בטווח';
}

function loadPages() {
  const redirected = new Set(CFG.redirects.map((r) => r.from));
  return JSON.parse(fs.readFileSync(path.join(ROOT, '_source/pages.json'), 'utf8'))
    .filter((p) => !redirected.has(p.pathname));
}

if (require.main === module) {
  // Git Bash rewrites a leading "/" into a Windows path; undo that
  const arg = (process.argv[2] || '')
    .replace(/^[a-z]:[\\/]+program files[\\/]+git(?=[\\/])/i, '').replace(/\\/g, '/');

  if (arg && fs.existsSync(arg) && fs.statSync(arg).isFile()) {
    const text = draftText(arg);
    const n = count(text);
    console.log(arg + ': ' + n + ' מילים (' + MIN + '-' + MAX + ') - ' + verdict(n));
    const open = (text.match(/\[לאשר עם מנחם[^\]]*\]/g) || []).length;
    if (open) console.log('!! ' + open + ' סוגריים [לאשר עם מנחם] פתוחים - זו עדיין טיוטה');
    process.exit(n < MIN || n > MAX ? 1 : 0);
  }

  const pages = loadPages();
  if (arg) {
    let slug = arg;
    try { slug = decodeURIComponent(slug); } catch (e) { /* keep */ }
    if (!slug.startsWith('/')) slug = '/' + slug;
    if (!slug.endsWith('/')) slug += '/';
    const page = pages.find((p) => p.pathname === slug);
    if (!page) { console.log('לא נמצא עמוד או קובץ: ' + arg); process.exit(1); }
    const n = count(articleText(page));
    console.log(slug + ': ' + n + ' מילים (' + MIN + '-' + MAX + ') - ' + verdict(n));
    process.exit(0);
  }

  const rows = pages.map((p) => ({ path: p.pathname, n: count(articleText(p)) })).sort((a, b) => a.n - b.n);
  const band = (lo, hi) => rows.filter((r) => r.n >= lo && r.n < hi).length;
  console.log('עמודים: ' + rows.length + ' · חציון ' + rows[Math.floor(rows.length / 2)].n + ' מילים');
  console.log('  מתחת ל-500   ' + band(0, 500));
  console.log('  500-799      ' + band(500, MIN));
  console.log('  800-1,100    ' + band(MIN, MAX + 1));
  console.log('  מעל 1,100    ' + band(MAX + 1, Infinity));
  console.log('\nהקצרים ביותר:');
  rows.slice(0, 12).forEach((r) => console.log('  ' + String(r.n).padStart(5) + '  ' + r.path));
  console.log('\nעמודים קיימים לא משוכתבים כדי להגיע לטווח - הכלל חל על עמודים חדשים.');
}

module.exports = { articleText, draftText, count, MIN, MAX };
