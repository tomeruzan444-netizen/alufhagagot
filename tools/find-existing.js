/* Does the site already have a page on this topic?

   Run it before creating ANY new page (see "לפני שיוצרים עמוד" in
   docs/content-guide.md):

     node tools/find-existing.js "איטום גג בטון"
     node tools/find-existing.js "/איטום-גגות-בקריית-ביאליק/"

   Hebrew hides duplicates from a plain text search: "איטום גג בטון" and the
   existing "איטום גגות מבטון" share no exact word pair, and the site spells
   "קרית" and "קריית" both ways. So every word is reduced to a set of keys -
   with and without the prefix letters (ו ה ב ל מ כ ש) and the common endings
   (ות ים ה ת י), final letters folded, doubled י/ו collapsed - and two words
   match when their key sets meet.

   Searches: URL, title (after seo-overrides), H1, sub-headings and FAQ
   questions, and the body text of every crawled page - plus the title and H1
   of any page in build/ that is not in the crawl (new pages), and the
   redirected duplicate URLs. */

const fs = require('fs'), path = require('path'), cheerio = require('cheerio');
const CFG = require('./site.config.js');
const SEO = require('./seo-overrides.js');

const ROOT = path.join(__dirname, '..');
const PREFIX = new Set('והבלמכש');
const SUFFIXES = ['ות', 'ימ', 'ה', 'ת', 'י'];
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const STOP = new Set(['של', 'עמ', 'על', 'את', 'או', 'גמ', 'איכ', 'מה', 'כמה', 'למה',
  'מתי', 'זה', 'כל', 'לא', 'יש', 'אני', 'הוא', 'היא', 'אתה', 'עמוד', 'מאמר']);

/* ------------------------------------------------------------ Hebrew keys */

function norm(s) {
  let t = String(s || '');
  if (/%[0-9A-F]{2}/i.test(t)) { try { t = decodeURIComponent(t); } catch (e) { /* keep */ } }
  return t.toLowerCase()
    .replace(/[֑-ׇ]/g, '')                 // niqqud and cantillation
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/[^0-9a-zא-ת]+/g, ' ')        // hyphens, slashes, quotes
    .replace(/יי+/g, 'י').replace(/וו+/g, 'ו')       // קריית = קרית
    .trim();
}

const words = (s) => norm(s).split(' ').filter(Boolean);

const keyCache = new Map();
function keys(word) {
  if (keyCache.has(word)) return keyCache.get(word);
  const bases = [word];
  if (PREFIX.has(word[0]) && word.length > 3) bases.push(word.slice(1));
  if (PREFIX.has(word[0]) && PREFIX.has(word[1]) && word.length > 4) bases.push(word.slice(2));
  const out = new Set();
  for (const b of bases) {
    out.add(b);
    for (const suf of SUFFIXES) {
      if (b.endsWith(suf) && b.length - suf.length >= 2) out.add(b.slice(0, -suf.length));
    }
  }
  keyCache.set(word, out);
  return out;
}

/** Every key of every word in a piece of text. */
function keySet(text) {
  const out = new Set();
  for (const w of words(text)) for (const k of keys(w)) out.add(k);
  return out;
}

const hits = (word, set) => [...keys(word)].some((k) => set.has(k));

/* ------------------------------------------------------------- the pages */

const stripHtml = (html) => {
  const $ = cheerio.load('<div>' + html + '</div>');
  $('style, script').remove();
  return $.root().text();
};

function fromCrawl() {
  // drafts too: two drafts on one topic are a duplicate as well
  const pages = require('./site-pages.js').load({ drafts: true });
  const redirected = new Map(CFG.redirects.map((r) => [r.from, r.to]));
  return pages.map((p) => {
    const heads = [], body = [];
    let h1 = '';
    for (const b of p.blocks) {
      if (b.region === 'cta') continue;               // the same on every page
      if (b.type === 'heading') {
        if (b.level === 1 && !h1) h1 = b.text; else heads.push(b.text);
      } else if (b.type === 'faq') {
        for (const it of b.items || []) { heads.push(it.q); body.push(stripHtml(it.a || '')); }
      } else if (b.type === 'list') {
        for (const it of b.items || []) body.push(it.text || '');
      } else if (b.html) {
        body.push(stripHtml(b.html));
      } else {
        body.push([b.text, b.title, b.alt].filter(Boolean).join(' '));
      }
    }
    return {
      path: p.pathname,
      title: (SEO.title && SEO.title[p.pathname]) || p.title || '',
      h1, heads: heads.join(' | '), body: body.join(' '),
      redirectTo: redirected.get(p.pathname) || null,
      noindex: !!(SEO.robots && SEO.robots[p.pathname]),
    };
  });
}

/** Pages that exist in build/ but not in the crawl - i.e. pages added since. */
function fromBuild(known) {
  const dir = path.join(ROOT, 'build');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'assets' || e.name === 'wp-content') continue;
      const sub = rel + e.name + '/';
      const file = path.join(d, e.name, 'index.html');
      if (fs.existsSync(file) && !known.has(sub)) {
        const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
        if (!$('meta[http-equiv="refresh"]').length) {
          out.push({ path: sub, title: $('title').text(), h1: $('h1').first().text(),
            heads: $('main h2, main h3').map((i, h) => $(h).text()).get().join(' | '),
            body: '', fromBuild: true });
        }
      }
      walk(path.join(d, e.name), sub);
    }
  })(dir, '/');
  return out;
}

function loadPages() {
  const crawl = fromCrawl();
  return crawl.concat(fromBuild(new Set(crawl.map((p) => p.path))));
}

/* ---------------------------------------------------------------- search */

const WEIGHT = { path: 3, title: 3, h1: 3, heads: 1.5, body: 0.5 };
const STRONG = ['path', 'title', 'h1'];

function findExisting(query, pages = loadPages()) {
  const qWords = [...new Set(words(query))].filter((w) => !STOP.has(w) && w.length > 1);
  if (!qWords.length) return { qWords, results: [], missing: [] };

  const indexed = pages.map((p) => {
    const f = {};
    for (const k of Object.keys(WEIGHT)) f[k] = keySet(p[k]);
    return { p, f };
  });

  // rare words decide; "איטום" and "גגות" are on almost every page
  const N = indexed.length;
  const idf = {}, missing = [];
  for (const w of qWords) {
    const df = indexed.filter(({ f }) => Object.values(f).some((s) => hits(w, s))).length;
    // a word no page has is the rarest of all: it keeps every page's coverage down
    idf[w] = df ? Math.max(0.2, Math.log((N + 1) / (df + 1))) : Math.log(N + 1);
    if (!df) missing.push(w);
  }
  const totalIdf = Object.values(idf).reduce((a, b) => a + b, 0) || 1;

  const results = indexed.map(({ p, f }) => {
    let score = 0;
    const where = {};
    for (const w of qWords) {
      const fields = Object.keys(WEIGHT).filter((k) => hits(w, f[k]));
      if (!fields.length) continue;
      where[w] = fields;
      score += idf[w] * Math.max(...fields.map((k) => WEIGHT[k]));
    }
    // share of the query's weight found in these fields - so a filler word
    // like "שונים" cannot hide a page whose URL and title carry the topic
    const cover = (ok) => qWords.reduce((s, w) => s + ((where[w] || []).some(ok) ? idf[w] : 0), 0) / totalIdf;
    const strong = cover((k) => STRONG.includes(k));
    const withHeads = cover((k) => k !== 'body');
    const level = strong >= 0.8 ? 'page' : withHeads >= 0.8 ? 'section' : cover(() => true) >= 0.8 ? 'mention' : null;
    return { ...p, score, where, level, strong };
  }).filter((r) => r.score > 0)
    .sort((a, b) => (b.level === 'page') - (a.level === 'page') || b.score - a.score);

  return { qWords, results, missing };
}

/* ------------------------------------------------------------------- CLI */

function slugCheck(query, pages) {
  if (!query.trim().startsWith('/')) return [];
  let slug = query.trim();
  try { slug = decodeURIComponent(slug); } catch (e) { /* keep */ }
  if (!slug.endsWith('/')) slug += '/';
  const out = [];
  const hit = pages.find((p) => p.path === slug);
  if (hit && hit.redirectTo) out.push('URL תפוס: ' + slug + ' מפנה (301) אל ' + hit.redirectTo);
  else if (hit) out.push('URL תפוס: העמוד ' + slug + ' כבר קיים');
  if (/-\d+\/$/.test(slug)) out.push('URL עם סיומת מספר (' + slug + ') - אסור לפי המדריך');
  return out;
}

if (require.main === module) {
  // Git Bash rewrites a leading "/" into a Windows path; undo that
  const query = process.argv.slice(2).join(' ')
    .replace(/^[a-z]:[\\/]+program files[\\/]+git(?=[\\/])/i, '').replace(/\\/g, '/');
  if (!query.trim()) {
    console.log('שימוש: node tools/find-existing.js "נושא העמוד החדש"  (או "/slug-מוצע/")');
    process.exit(1);
  }
  const pages = loadPages();
  const { qWords, results, missing } = findExisting(query, pages);
  const LABEL = {
    page: 'עמוד קיים על הנושא - לא יוצרים חדש, מרחיבים אותו',
    section: 'הנושא מכוסה כסעיף בעמוד קיים - לבדוק לפני שיוצרים',
    mention: 'אזכור בגוף הטקסט בלבד',
  };

  console.log('\nחיפוש: ' + query + '\nמילים: ' + qWords.join(', ') + '\n');
  const problems = slugCheck(query, pages);
  problems.forEach((s) => console.log('!! ' + s));

  const top = results.slice(0, 10);
  if (!top.length) console.log('לא נמצא אף עמוד שנוגע בנושא.');
  for (const r of top) {
    console.log((r.level === 'page' ? '!! ' : '   ') + r.path +
      (r.redirectTo ? '  (מפנה אל ' + r.redirectTo + ')' : '') +
      (r.noindex ? '  (noindex)' : '') + (r.fromBuild ? '  (עמוד חדש, לא מהסריקה)' : ''));
    console.log('     title: ' + r.title);
    if (r.h1 && r.h1 !== r.title) console.log('     H1:    ' + r.h1);
    console.log('     ' + (r.level ? LABEL[r.level] : 'התאמה חלקית') + ' · ' +
      Object.entries(r.where).map(([w, f]) => w + ' ב-' + f.join('/')).join(', ') +
      ' · ציון ' + r.score.toFixed(1) + '\n');
  }
  if (missing.length) console.log('מילים שלא מופיעות באף עמוד: ' + missing.join(', '));

  // a match on a redirected duplicate is a match on the page it redirects to
  const pageHits = [...new Set(results.filter((r) => r.level === 'page').map((r) => r.redirectTo || r.path))];
  console.log('\nמסקנה: ' + (pageHits.length || problems.length
    ? 'יש כבר עמוד על הנושא (' + (pageHits.join(', ') || 'ראו למעלה') + '). מרחיבים את הקיים - לא יוצרים עמוד חדש.'
    : results.some((r) => r.level === 'section')
      ? 'אין עמוד ייעודי, אבל הנושא מכוסה כסעיף. לשקול הרחבה של העמוד הקיים לפני עמוד חדש, ולשאול.'
      : 'לא נמצא עמוד מתחרה. אפשר להמשיך - ועדיין לעבור על התוצאות למעלה.'));
}

module.exports = { findExisting, loadPages, norm, keys };
