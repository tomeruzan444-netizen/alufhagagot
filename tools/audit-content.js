/* Objective content problems a script can prove. Read-only: prints, never edits.

     node tools/audit-content.js

   What it looks for:
     - words glued together by a missing space ("אותוהלאה")
     - a word repeated twice in a row, and double spaces mid-sentence
     - a city page whose body names a different city than its URL
     - the same service priced differently on different pages
     - warranty periods that contradict each other
     - phone numbers and e-mail addresses that are not the site's
     - "מעל N שנה" experience claims that disagree
     - numeric ranges written backwards (120-80 instead of 80-120) */

const cheerio = require('cheerio');
const SITE = require('./site-pages.js');
const CFG = require('./site.config.js');

const redirected = new Set(CFG.redirects.map((r) => r.from));
const PAGES = SITE.load().filter((p) => !redirected.has(p.pathname));

const strip = (html) => {
  const $ = cheerio.load('<div>' + html + '</div>');
  $('style, script').remove();
  $('p, li, h1, h2, h3, h4, br, td, th, tr').after(' | ');
  return $.root().text();
};

/** Readable text of a page, widgets excluded. */
function text(p) {
  const out = [];
  for (const b of p.blocks) {
    if (b.region === 'cta') continue;
    if (b.html && /מחשב הצעת מחיר|טיפ יומי לאיטום/.test(b.html)) continue;
    if (b.type === 'heading' || b.type === 'button') out.push(b.text);
    else if (b.type === 'list') (b.items || []).forEach((i) => out.push(i.text));
    else if (b.type === 'faq') (b.items || []).forEach((i) => out.push(i.q, strip(i.a || '')));
    else if (b.html) out.push(strip(b.html));
    else if (b.text) out.push(b.text);
  }
  return out.filter(Boolean).join(' \n ').replace(/ /g, ' ');
}

const findings = [];
const add = (kind, page, detail) => findings.push({ kind, page, detail });

const HE = '[\\u05d0-\\u05ea]';
for (const p of PAGES) {
  const t = text(p);

  // 1. a word repeated twice in a row
  const dup = t.match(new RegExp('(?:^|[\\s|])(' + HE + '{2,}) \\1(?=[\\s|.,!?]|$)', 'g')) || [];
  [...new Set(dup.map((s) => s.trim()))].forEach((s) => add('מילה כפולה', p.pathname, s));

  // 2. suspiciously long token - usually two words with the space lost.
  // Hebrew has plenty of legitimately long words, so known ones are skipped.
  const LONG_OK = /^ו?ה?(פוליאוריטני|פוליאוריתני|פוליאוריאתני|ארכיטקטוני|קונסטרוקצי|אינסטלצי|טכנולוגי|אלטרנטיב|אוניברסל|פרופסיונל|סטנדרטיז|התקנתם|התייעצות)/;
  const glued = (t.match(new RegExp(HE + '{13,}', 'g')) || []);
  [...new Set(glued)].filter((w) => !LONG_OK.test(w))
    .forEach((w) => add('מילה חשודה כמודבקת', p.pathname, w));

  // 3. double space between Hebrew words
  const dbl = t.match(new RegExp(HE + '+  +' + HE + '+', 'g')) || [];
  [...new Set(dbl)].slice(0, 3).forEach((s) => add('רווח כפול', p.pathname, s.replace(/ +/g, ' _ ')));

  // 4. a range written backwards
  const ranges = t.match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)\s*(?:₪|ש"ח|שנ)/g) || [];
  ranges.forEach((r) => {
    const [a, b] = r.match(/\d[\d,]*/g).map((n) => +n.replace(/,/g, ''));
    if (a > b) add('טווח הפוך', p.pathname, r.trim());
  });

  // 5. a phone number that is not ours
  const phones = t.match(/0[2-9]\d[- ]?\d{3}[- ]?\d{4}|05\d[- ]?\d{3}[- ]?\d{4}/g) || [];
  const ours = CFG.phones.map((x) => x.tel);
  [...new Set(phones)].forEach((ph) => {
    if (!ours.includes(ph.replace(/[- ]/g, ''))) add('טלפון שאינו של האתר', p.pathname, ph);
  });

  // 6. an e-mail that is not ours
  const mails = t.match(/[\w.+-]+@[\w.-]+\.\w+/g) || [];
  [...new Set(mails)].forEach((m) => {
    if (m.toLowerCase() !== CFG.email.toLowerCase()) add('מייל שאינו של האתר', p.pathname, m);
  });

  // 7. experience claims
  (t.match(/(?:מעל|למעלה מ-?|יותר מ-?)\s*(\d{1,2})\s*שנ(?:ה|ים)/g) || [])
    .forEach((s) => add('טענת ותק', p.pathname, s.trim()));

  // 8. warranty periods
  (t.match(/(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*שנ(?:ות|ים|ה)\s*אחריות|אחריות\s*(?:של\s*)?(?:ל-?)?\s*(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s*שנ/g) || [])
    .forEach((s) => add('תקופת אחריות', p.pathname, s.replace(/\s+/g, ' ').trim()));
}

/* --- a city page that names another city --- */
const cityOf = (path) => {
  const m = path.match(/^\/(?:איטום|זיפות)-גגות?-ב(.+?)\/$/);
  return m ? m[1].replace(/-/g, ' ').replace(/ ?2$/, '') : null;
};
// Region and method pages share the city URL shape ("איטום גגות במרכז",
// "איטום גגות במריחה"), and "אזור" is both a town and the word for "area" -
// naming any of them on another page is normal, not a mix-up.
const NOT_A_CITY = new Set(['מרכז', 'דרום', 'צפון', 'קריות', 'אזור', 'מריחה', 'התזה', 'סנפלינג']);
const CITIES = PAGES.map((p) => cityOf(p.pathname)).filter((c) => c && !NOT_A_CITY.has(c));
for (const p of PAGES) {
  const city = cityOf(p.pathname);
  if (!city) continue;
  const t = text(p);
  if (!t.includes(city)) add('שם העיר לא מופיע בעמוד', p.pathname, city);
  // whole words only: "אור יהודה" contains "יהוד", which is a town of its own
  const others = [...new Set(CITIES.filter((c) => c !== city && c.length > 3
    && !city.includes(c) && !c.includes(city)
    && new RegExp('(^|[\\s|.,־-])ב?' + c + '($|[\\s|.,־-])').test(t)))];
  if (others.length) add('עיר אחרת מוזכרת בעמוד', p.pathname, city + ' -> ' + others.join(', '));
}

/* --- the same service priced differently on different pages --- */
const priceRows = [];
for (const p of PAGES) {
  const t = text(p);
  const re = /([א-ת"'\s]{6,60}?)\s*\|?\s*(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)\s*(?:₪|ש"ח)\s*(?:ל?מ["״']?ר|למטר|לאדנית|לנקודה)?/g;
  let m;
  while ((m = re.exec(t))) {
    const label = m[1].replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim().slice(-40);
    priceRows.push({ page: p.pathname, label, lo: +m[2].replace(/,/g, ''), hi: +m[3].replace(/,/g, '') });
  }
}
const KEYS = [['זיפות גג', /זיפות/], ['איטום ביריעות', /יריע/], ['איטום גג מרוצף', /מרוצף|ריצוף/],
  ['איטום קירות חוץ', /קיר(ות)? חוץ|קירות חיצוני/], ['איטום מרתף/תת קרקעי', /מרתף|תת.?קרקעי/],
  ['איטום גג בטון', /בטון/], ['איטום בהתזה', /התז/], ['איטום אקרילי', /אקריל/]];
for (const [name, re] of KEYS) {
  const rows = priceRows.filter((r) => re.test(r.label));
  const spans = [...new Set(rows.map((r) => r.lo + '-' + r.hi))];
  if (spans.length > 1) {
    add('מחירים סותרים לאותו שירות', name,
      rows.map((r) => r.page + ': ' + r.lo + '-' + r.hi + ' (' + r.label + ')').join('\n      '));
  }
}

/* ------------------------------------------------------------------ report */
const byKind = {};
findings.forEach((f) => { (byKind[f.kind] = byKind[f.kind] || []).push(f); });
const ORDER = ['מחירים סותרים לאותו שירות', 'עיר אחרת מוזכרת בעמוד', 'שם העיר לא מופיע בעמוד',
  'טווח הפוך', 'טלפון שאינו של האתר', 'מייל שאינו של האתר', 'טענת ותק', 'תקופת אחריות',
  'מילה חשודה כמודבקת', 'מילה כפולה', 'רווח כפול'];
console.log('=== בדיקות אוטומטיות על ' + PAGES.length + ' עמודים ===\n');
for (const kind of ORDER) {
  const list = byKind[kind] || [];
  if (!list.length) continue;
  if (kind === 'טענת ותק' || kind === 'תקופת אחריות') {
    const vals = {};
    list.forEach((f) => { (vals[f.detail] = vals[f.detail] || []).push(f.page); });
    const keys = Object.keys(vals);
    console.log('## ' + kind + ' (' + keys.length + ' ניסוחים שונים)');
    keys.sort((a, b) => vals[b].length - vals[a].length)
      .forEach((v) => console.log('   ' + v.padEnd(26) + vals[v].length + ' עמודים   ' + vals[v].slice(0, 3).join(' ')));
    console.log('');
    continue;
  }
  console.log('## ' + kind + ' (' + list.length + ')');
  list.slice(0, 40).forEach((f) => console.log('   ' + f.page + '\n      ' + f.detail));
  if (list.length > 40) console.log('   ... ועוד ' + (list.length - 40));
  console.log('');
}
console.log('סה"כ ממצאים: ' + findings.length);
