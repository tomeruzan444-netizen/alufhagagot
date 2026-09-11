/* Mines the existing site copy for the owner's real voice: first-person
   passages, named people, concrete claims, and the phrasing that recurs.
   Used to ground the content guide in evidence instead of an invented persona. */
const fs = require('fs'), cheerio = require('cheerio');
const pages = JSON.parse(fs.readFileSync('_source/pages.json', 'utf8'));

const textOf = (b) => {
  if (b.type === 'heading' || b.type === 'button') return b.text || '';
  if (b.type === 'richtext' || b.type === 'html') {
    const $ = cheerio.load('<d>' + b.html + '</d>'); $('d script, d style').remove();
    $('d *').each((i, e) => { $(e).before(' ').after(' '); });
    return $('d').text();
  }
  if (b.type === 'list') return b.items.map(i => i.text).join('. ');
  if (b.type === 'faq') return b.items.map(i => i.q + ' ' + cheerio.load('<d>' + i.a + '</d>')('d').text()).join(' ');
  return '';
};

const corpus = pages.map(p => ({
  path: p.pathname, title: p.title,
  text: p.blocks.filter(b => b.region !== 'cta').map(textOf).join(' ').replace(/\s+/g, ' ').trim(),
}));

const sentences = [];
corpus.forEach(c => c.text.split(/(?<=[.!?])\s+/).forEach(s => {
  s = s.trim(); if (s.length > 25 && s.length < 320) sentences.push({ path: c.path, s });
}));

// 1. first-person singular - the owner speaking as himself
const firstSingular = sentences.filter(x => /(^|\s)(אני|שלי|לי |אותי|ביקשתי|הגעתי|ראיתי|גיליתי|למדתי|אמרתי|התחלתי|עבדתי|אישית)(\s|,|$)/.test(x.s));
console.log('=== FIRST PERSON SINGULAR (' + firstSingular.length + ') ===');
const seen = new Set();
firstSingular.forEach(x => { const k = x.s.slice(0, 60); if (seen.has(k)) return; seen.add(k); console.log('  [' + x.path.slice(0, 32) + ']  ' + x.s.slice(0, 230)); });

// 2. named people
console.log('\n=== NAMES MENTIONED ===');
const names = {};
corpus.forEach(c => (c.text.match(/(מנחם|משה|שמואל|נדב|טולדו|הדר)[\s,.]/g) || []).forEach(n => {
  n = n.trim().replace(/[,.]$/, ''); (names[n] = names[n] || new Set()).add(c.path);
}));
Object.entries(names).forEach(([n, s]) => console.log('  ' + n.padEnd(8) + s.size + ' pages: ' + [...s].slice(0, 4).join(', ')));

// 3. concrete, checkable claims
console.log('\n=== CONCRETE CLAIMS ===');
const claimRe = /(\d+\s*שנ(ים|ות|ה)|מעל\s*\d+|אחריות\s*(של|ל-?)?\s*\d+|\d+\s*שנות\s*ניסיון|ותק|מוסמך|רישיון|רשום|קבלן\s*רשום|תעודה|ביטוח)/;
const claims = {};
sentences.filter(x => claimRe.test(x.s)).forEach(x => {
  const m = x.s.match(claimRe)[0]; (claims[m] = claims[m] || []).push(x);
});
Object.entries(claims).sort((a, b) => b[1].length - a[1].length).slice(0, 14).forEach(([k, v]) =>
  console.log('  ' + String(v.length).padStart(4) + '  "' + k + '"   e.g. ' + v[0].s.slice(0, 110)));

// 4. how pages open - the first sentence of the body
console.log('\n=== HOW PAGES OPEN (first body sentence, sample) ===');
const openers = {};
corpus.forEach(c => {
  const s = (c.text.split(/(?<=[.!?])\s+/).find(t => t.length > 40) || '').slice(0, 44);
  const key = s.replace(/\S*ב[א-ת]+(\s[א-ת]+)?\s(היא|הוא)/, '<CITY> $2').slice(0, 30);
  (openers[key] = openers[key] || []).push(c.path);
});
Object.entries(openers).sort((a, b) => b[1].length - a[1].length).slice(0, 10).forEach(([k, v]) =>
  console.log('  ' + String(v.length).padStart(3) + ' x  "' + k + '…"'));

// 5. recurring stock phrases (template fingerprints)
console.log('\n=== MOST REPEATED 5-WORD PHRASES ACROSS PAGES ===');
const grams = {};
corpus.forEach(c => {
  const w = c.text.split(' '); const local = new Set();
  for (let i = 0; i + 5 <= w.length; i++) local.add(w.slice(i, i + 5).join(' '));
  local.forEach(g => grams[g] = (grams[g] || 0) + 1);
});
Object.entries(grams).filter(([g]) => !/[0-9]/.test(g)).sort((a, b) => b[1] - a[1]).slice(0, 16)
  .forEach(([g, n]) => console.log('  ' + String(n).padStart(4) + ' pages  "' + g + '"'));

// 6. voice markers
console.log('\n=== VOICE MARKERS ===');
const all = corpus.map(c => c.text).join(' ');
const count = (re) => (all.match(re) || []).length;
console.log('  "אנחנו" (we) ............ ' + count(/(^|\s)אנחנו(\s|,)/g));
console.log('  "אני" (I) ............... ' + count(/(^|\s)אני(\s|,)/g));
console.log('  addresses reader "אתם" .. ' + count(/(^|\s)(אתם|לכם|שלכם)(\s|,)/g));
console.log('  exclamation marks ....... ' + count(/!/g));
console.log('  question headings ....... ' + pages.reduce((a, p) => a + p.blocks.filter(b => b.type === 'heading' && /\?/.test(b.text)).length, 0));
console.log('  emoji in titles ......... ' + pages.filter(p => /[✅❄⭐🔥]/u.test(p.title)).length + ' pages');
console.log('  total words ............. ' + all.split(' ').length);
