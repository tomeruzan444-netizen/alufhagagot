/* Which Search Console queries does the site's content never say? Read-only.

     node tools/query-gap.js queries.tsv [out.json]

   queries.tsv: one query per line, "query<TAB>impressions" (commas allowed).

   For each query:
     exact    - the phrase appears word for word in some page's own content
     partial  - every word appears in one page, but not as that phrase
     absent   - no page has all the words

   "Content" is what a page says about itself: title, meta description and
   the main article. Menu, sidebar and footer repeat on every page and would
   make almost any city name look present everywhere, so they are left out.

   For a query that is not exact anywhere, the tool names the page that should
   carry it: the city page when the query names a city that has one, otherwise
   the best match from find-existing.js.

   Some queries should never be written into copy word for word; they are
   classified rather than assigned:
     typo     - a misspelling ("בתקל", "יריעות בטומניות")
     variant  - the same query without the ב a sentence needs ("איטום גגות
                תל אביב"); the proper form is what goes on the page
     brand    - someone else's product or company
     off      - not a service this site offers
     broken   - a malformed row from the export */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const FE = require('./find-existing.js');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');

/* ------------------------------------------------------------ the pages */

function builtPages() {
  const out = [];
  const read = (file, pathname) => {
    const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
    if ($('meta[name="robots"]').attr('content')?.includes('noindex')) return;
    const main = $('main').clone();
    main.find('aside, .side-card, .crumbs, form, .lead-block, script, style, .toc').remove();
    // .text() glues <p>a</p><p>b</p> into "ab"; mark where each block ends
    main.find('p, h1, h2, h3, h4, h5, h6, li, td, th, div, dt, dd, br, blockquote, figcaption').append(' ¶ ');
    out.push({
      path: pathname,
      title: $('title').text(),
      text: [$('title').text(), $('meta[name="description"]').attr('content') || '', main.text()].join(' ¶ '),
    });
  };
  read(path.join(BUILD, 'index.html'), '/');
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'assets' || e.name === 'wp-content') continue;
      const f = path.join(dir, e.name, 'index.html');
      if (fs.existsSync(f)) read(f, rel + e.name + '/');
      walk(path.join(dir, e.name), rel + e.name + '/');
    }
  })(BUILD, '/');
  return out;
}

/* ---------------------------------------------------------- normalising */

/* Sentence punctuation and block ends become '|', so "איטום בטקל, מחיר" does
   not count as saying "בטקל מחיר". A query never contains '|'. */
const BREAK = /\s[-–]\s|[,.;:!?()[\]|¶•–—]/g;
const clean = (s) => ' ' + String(s || '').toLowerCase()
  .replace(/[֑-ׇ]/g, '')
  .replace(BREAK, ' | ')
  .replace(/[^0-9a-zא-ת|]+/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/(\| )+/g, '| ')
  .trim() + ' ';

/* ------------------------------------------------------- classification */

const TYPOS = ['בתקל', 'בט קל', 'בטומניות', 'אוטים גגות', 'קפילרית', 'עליה קפילרית'];
const BRANDS = ['הרקולס', 'ס איטום', 'מחירון דקל'];
const OFF = ['זגג', 'חלונות גג', 'חלון לגג', 'סולמות גג', 'לולים', 'רפתות', 'תקרות אש',
  'מעטפת מגדלים', 'זיגוג', 'פנל מבודד', 'חיפוי בטון קל'];

/* --------------------------------------------------------------- topics */

/* Which service page a topic query belongs on. Checked in order, so the
   specific comes before the general ("זפת קר" before "זפת", "מרזב פנימי"
   before "מרזב"). A topic query never goes to a city page: city pages mention
   every service in their templated titles and would outrank the real page. */
const TOPICS = [
  [/זפת קר/, '/זפת-קר/'],
  [/מרזב פנימי/, '/תיקון-מרזב-פנימי/'],
  [/(התקנת|מתקין) מרזב|מרזב(ים)? (לפרגולה|אלומיניום|פלסטיק)|מרזבים (לגגות|מחיר)/, '/התקנת-מרזבים/'],
  [/(ניקוי|פתיחת|פותחים) מרזב|מרזב סתום/, '/ניקוי-מרזב/'],
  [/מרזב/, '/תיקון-מרזבים/'],
  [/קפיל|מעל הפנלים/, '/רטיבות-קפילארית/'],
  [/עובש/, '/טיפול-בעובש-בקיר/'],
  [/מהשכן|בית משותף.*נזיל|נזיל.*בית משותף|מי משלם/, '/נזילה-בתקרה-מהשכן/'],
  [/(רטיבות|נזיל|ייבוש|תיקון).*(תקרה)|תקרה.*(רטיבות|נזיל)/, '/רטיבות-בתקרה/'],
  // cracks: inside walls go with internal walls, everything else to the cracks page
  [/סדק.*(פנימי|פנימיים|פנים)/, '/איטום-קירות-פנימיים/'],
  [/סדק/, '/סדקים-בקיר-חיצוני/'],
  [/(איטום|חומר).*(קיר|קירות) (פנימי|פנימיים|פנים)|איטום קיר מבפנים/, '/איטום-קירות-פנימיים/'],
  [/(איטום|תיקון|כמה עולה איטום).*(קיר|קירות) (חיצוני|חיצוניים)|קירות בסנפלינג/, '/איטום-קירות-חיצוניים/'],
  [/רטיבות.*(קיר|קירות)|(קיר|קירות).*רטיבות/, '/רטיבות-בקיר/'],
  [/רטיבות/, '/רטיבות-בבית/'],
  [/סנפלינג/, '/איטום-בסנפלינג/'],
  [/התז/, '/איטום-בהתזה/'],
  [/בטקל|בטון קל/, '/בטקל-לאיטום/'],
  [/יריע|ביטומני/, '/יריעות-ביטומניות/'],
  [/(ספריי|תרסיס) זפת/, '/זפת-קר/'],
  [/זיפות|זפת/, '/זיפות-גגות/'],
  [/סיוד|הלבנת/, '/סיוד-גגות/'],
  [/איסכורית/, '/איטום-גג-איסכורית/'],
  [/שינגלס/, '/איטום-גגות-שינגלס-מידע-ומחירים/'],
  [/רעפים|בניית גג/, '/בניית-גג-רעפים/'],
  [/מרפס/, '/איטום-מרפסת-מרוצפת/'],
  [/מרוצ[פף]/, '/איטום-גגות-מרוצפים/'],   // מרוצף and מרוצפים
  [/מקלחת|מקלחות/, '/איטום-מקלחת/'],
  [/אמבטיה/, '/איטום-אמבטיה/'],
  [/אקריל/, '/איטום-אקרילי/'],
  [/קריסטל|גבישי/, '/איטום-קריסטלי/'],
  [/חלונות|פתחים/, '/איטום-חלונות/'],
  [/יועץ|יועצי|ייעוץ|מהנדס|פיקוח/, '/יועץ-איטום/'],
  [/מומלץ|מומלצת|מומחה|איש איטום|קבלן גגות/, '/קבלן-איטום-אמין/'],
  [/אחריות/, '/אחריות-על-איטום-גג/'],
  [/חניון/, '/איטום-חניון-תת-קרקעי/'],
  [/תת קרקעי/, '/איטום-מבנים/'],
  [/רצפ/, '/איטום-רצפה/'],
  [/בניינים|בניין/, '/איטום-בניין/'],
  [/מבנים|מבנה/, '/איטום-מבנים/'],
  [/קירות|קיר/, '/איטום-קירות/'],
  [/חומר/, '/חומרי-איטום/'],
  [/במריחה/, '/איטום-גגות-במריחה/'],
  [/בטון/, '/איטום-גגות-מבטון/'],
  [/תיקון|שיקום|שיפוץ|החלפת/, '/תיקון-גגות/'],
  [/גג|חדירות/, '/איטום-גגות/'],
];

/* --------------------------------------------------------------- cities */

const CITY_ALIASES = { 'קריית גת': 'קרית גת', 'קריית אתא': 'קרית אתא', 'קריית שמונה': 'קרית שמונה',
  'קריית מלאכי': 'קרית מלאכי', 'נצרת עילית': 'נוף הגליל', 'יפו': 'תל אביב' };
const CITY_EXTRA = { 'שדרות': '/איטום-גגות-שדרות/', 'חוף הכרמל': '/איטום-גגות-חוף-הכרמל/',
  'מעגן מיכאל': '/איטום-במעגן-מיכאל/' };

function cityPages(pages) {
  const map = {};
  for (const p of pages) {
    const m = decodeURIComponent(p.path).match(/^\/(?:איטום|זיפות)-גגות?-ב(.+?)\/$/);
    if (m) map[m[1].replace(/-/g, ' ')] = p.path;
  }
  // place pages whose slug has no ב
  for (const [name, p] of Object.entries(CITY_EXTRA)) if (pages.some((x) => decodeURIComponent(x.path) === p)) map[name] = p;
  return map;
}

function cityOf(query, cities) {
  const q = ' ' + query + ' ';
  let hit = null;
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    if (q.includes(' ' + alias + ' ') || q.includes(' ב' + alias + ' ')) hit = { name: alias, page: cities[city] || null };
  }
  for (const city of Object.keys(cities).sort((a, b) => b.length - a.length)) {
    if (q.includes(' ' + city + ' ') || q.includes(' ב' + city + ' ')) return { name: city, page: cities[city] };
  }
  return hit;
}

/* A place the site has no page for ("איטום גגות בערד"). That is a new-page
   question, not a phrase to push into the main service page. */
const PLACE_RE = /^(?:איטום גגות|איטום גג|תיקון גגות|זיפות גגות|זיפות|איטום|קבלן איטום|סיוד גגות|גגות רעפים|חומרי איטום|עבודות איטום|גגן) ב(.+)$/;
const NOT_PLACE = /^(טון|ניין|ניינים|יריעות|התזה|סנפלינג|זפת|גובה|בניין|בניינים|קיר|קירות|תקרה|בית|מריחה|מקלחת|אמבטיה|רטיבות|עם|גג)/;
function placeOf(query) {
  const m = query.trim().match(PLACE_RE);
  return m && !NOT_PLACE.test(m[1]) ? m[1] : null;
}

/* --------------------------------------------------------------- report */

function analyse(file) {
  const queries = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map((l) => l.match(/^(.+?)\t\s*([\d,]+)\s*$/))
    .filter(Boolean)
    .map((m) => ({ query: m[1].trim(), impressions: +m[2].replace(/,/g, '') }));

  const pages = builtPages();
  const indexed = pages.map((p) => ({ ...p, clean: clean(p.text) }));
  // every word form of every page, built once
  const pageKeys = indexed.map((p) => {
    const keys = new Set();
    for (const w of p.clean.trim().split(' ')) if (w !== '|') for (const k of FE.keys(FE.norm(w))) keys.add(k);
    return keys;
  });
  const cities = cityPages(pages);
  const cityPathSet = new Set(Object.values(cities));
  const known = new Set(pages.map((p) => decodeURIComponent(p.path)));
  // a topic map pointing at a page that does not exist is a bug in this file
  const missing = [...new Set(TOPICS.map(([, p]) => p))].filter((p) => !known.has(p));
  if (missing.length) console.log('!! עמודים ברשימת הנושאים שלא קיימים באתר:', missing.join(', '));
  const fePages = FE.loadPages();
  const all = new Set(queries.map((q) => clean(q.query).trim()));

  return queries.map((q) => {
    const phrase = clean(q.query);
    const exactPages = indexed.filter((p) => p.clean.includes(phrase)).map((p) => p.path);

    // every word present in one page, in any order or form
    const words = phrase.trim().split(' ');
    const hasWords = (i) => words.every((w) => [...FE.keys(FE.norm(w))].some((k) => pageKeys[i].has(k)));
    const partialPages = exactPages.length ? [] : indexed.filter((p, i) => hasWords(i)).map((p) => p.path);

    let kind = 'ok';
    const low = ' ' + q.query + ' ';
    // two words glued together by the export ("ביטומניותאיטום")
    if (/[א-ת]{14,}/.test(q.query)) kind = 'broken';
    else if (TYPOS.some((t) => low.includes(t))) kind = 'typo';
    else if (BRANDS.some((t) => clean(q.query).replace(/\| /g, '').includes(clean(t)))) kind = 'brand';
    else if (OFF.some((t) => low.includes(t))) kind = 'off';
    else {
      // the same query with the ב a sentence needs is also in the list
      const city = cityOf(q.query, cities);
      if (city && !low.includes(' ב' + city.name + ' ')) {
        const withBet = clean(q.query.replace(city.name, 'ב' + city.name)).trim();
        if (all.has(withBet)) kind = 'variant';
      }
    }

    // where it belongs
    let target = null, why = '';
    const city = cityOf(q.query, cities);
    if (city) {
      target = city.page;
      why = city.page ? 'עמוד העיר' : 'אין עמוד לעיר ' + city.name;
    } else if (placeOf(q.query)) {
      why = 'אין עמוד ל' + placeOf(q.query);
    } else if (q.query.trim() === 'איטום') {
      target = '/'; why = 'דף הבית';
    } else {
      const topic = TOPICS.find(([re]) => re.test(q.query));
      if (topic && known.has(topic[1])) { target = topic[1]; why = 'עמוד השירות'; }
      else {
        // fallback: the closest page that is not a city page
        const best = FE.findExisting(q.query, fePages).results
          .filter((r) => !r.redirectTo && !r.noindex && !cityPathSet.has(r.path))[0];
        if (best && best.level) { target = best.path; why = 'העמוד הקרוב ביותר לנושא'; }
        else why = 'אין עמוד שעוסק בנושא';
      }
    }

    const status = exactPages.length ? 'exact' : partialPages.length ? 'partial' : 'absent';
    const onTarget = target ? exactPages.includes(target) : false;
    return { ...q, status, kind, target, why, onTarget,
      exactPages: exactPages.length, exactOn: exactPages.slice(0, 5),
      partialOnTarget: target ? hasWords(indexed.findIndex((p) => p.path === target)) : false };
  });
}

if (require.main === module) {
  const [file, out] = process.argv.slice(2);
  if (!file) { console.log('שימוש: node tools/query-gap.js queries.tsv [out.json]'); process.exit(1); }
  const rows = analyse(file);
  if (out) fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  const count = (f) => rows.filter(f).length;
  const sum = (f) => rows.filter(f).reduce((s, r) => s + r.impressions, 0);
  console.log('ביטויים:', rows.length, '| חשיפות:', sum(() => true).toLocaleString());
  console.log('מופיע מילה במילה:', count((r) => r.status === 'exact'));
  console.log('רק המילים, לא כביטוי:', count((r) => r.status === 'partial'));
  console.log('לא מופיע כלל:', count((r) => r.status === 'absent'));
  console.log('\nלא לשלב מילולית:');
  for (const k of ['variant', 'typo', 'brand', 'off', 'broken']) console.log('  ' + k + ':', count((r) => r.kind === k));
  console.log('\nחסר בעמוד היעד (ביטויים שכדאי לשלב):',
    count((r) => r.kind === 'ok' && r.target && !r.onTarget), 'ביטויים,',
    sum((r) => r.kind === 'ok' && r.target && !r.onTarget).toLocaleString(), 'חשיפות');
}

module.exports = { analyse };
