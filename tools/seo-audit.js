/* Content + SEO audit of the built site. Reports real defects, ranked. */
const fs = require('fs'), path = require('path'), cheerio = require('cheerio');
const CFG = require('./site.config.js');

const pages = JSON.parse(fs.readFileSync('_source/pages.json', 'utf8'));
const skip = new Set(CFG.redirects.map(r => r.from));
const live = pages.filter(p => !skip.has(p.pathname));

const findings = { critical: [], high: [], medium: [] };

// Pages deliberately kept out of the index (thank-you confirmation, the
// leftover "Uncategorized" archive). Thin content and orphan status are the
// intended state for these, not defects.
const NOINDEX = new Set(Object.keys(require('./seo-overrides.js').robots || {}));
const add = (sev, kind, page, detail) => findings[sev].push({ kind, page, detail });

function outFile(pn) {
  const rel = pn.replace(/^\//, '').replace(/\/$/, '');
  return rel ? path.join('build', rel, 'index.html') : 'build/index.html';
}

const docs = new Map();
for (const p of live) {
  const f = outFile(p.pathname);
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  const $ = cheerio.load(html);
  const $body = cheerio.load(html);
  $body('script, style, .site-header, .site-footer, .callbar, .a11y-panel, form').remove();
  // Pad every element so adjacent nodes never fuse into a bogus repeated
  // phrase (e.g. two <li> links reading as one run-on word).
  $body('main *').each((i, el) => { $body(el).before(' ').after(' '); });
  const text = $body('main').text().replace(/\s+/g, ' ').trim();
  docs.set(p.pathname, { p, $, html, text });
}

/* ---------- 1. duplicate titles / descriptions / H1 ---------- */
const byTitle = {}, byDesc = {}, byH1 = {}, byText = {};
for (const [pn, d] of docs) {
  const t = d.$('title').text().trim();
  const desc = (d.$('meta[name="description"]').attr('content') || '').trim();
  const h1 = d.$('h1').first().text().trim();
  (byTitle[t] = byTitle[t] || []).push(pn);
  if (desc) (byDesc[desc] = byDesc[desc] || []).push(pn);
  if (h1) (byH1[h1] = byH1[h1] || []).push(pn);
  // content fingerprint: first 400 chars of body text
  const fp = d.text.slice(0, 400);
  if (fp.length > 200) (byText[fp] = byText[fp] || []).push(pn);
}
Object.entries(byTitle).filter(([, v]) => v.length > 1).forEach(([t, v]) =>
  add('critical', 'כותרת meta כפולה', v.join(' , '), `"${t.slice(0, 70)}" מופיעה ב-${v.length} עמודים`));
Object.entries(byDesc).filter(([, v]) => v.length > 1).forEach(([t, v]) =>
  add('high', 'תיאור meta כפול', v.join(' , '), `${v.length} עמודים חולקים תיאור זהה`));
Object.entries(byH1).filter(([, v]) => v.length > 1).forEach(([t, v]) =>
  add('high', 'H1 כפול', v.join(' , '), `"${t.slice(0, 60)}"`));
Object.entries(byText).filter(([, v]) => v.length > 1).forEach(([, v]) =>
  add('critical', 'תוכן זהה', v.join(' , '), `${v.length} עמודים פותחים בטקסט זהה`));

/* ---------- 2. title / description length ---------- */
for (const [pn, d] of docs) {
  const t = d.$('title').text().trim();
  const desc = (d.$('meta[name="description"]').attr('content') || '').trim();
  if (t.length > 65) add('medium', 'כותרת ארוכה מדי', pn, `${t.length} תווים (מומלץ עד 60) - תיחתך בגוגל`);
  if (t.length < 20) add('medium', 'כותרת קצרה מדי', pn, `${t.length} תווים`);
  if (!desc) add('high', 'חסר meta description', pn, '');
  else if (desc.length > 160) add('medium', 'תיאור ארוך מדי', pn, `${desc.length} תווים (מומלץ עד 155)`);
  else if (desc.length < 70) add('medium', 'תיאור קצר מדי', pn, `${desc.length} תווים`);
}

/* ---------- 3. doubled keyword phrases (template bug) ----------
   Checked inside individual text nodes only. A heading followed by a paragraph
   that opens with the same words is normal writing, and two adjacent list
   links naturally repeat a prefix - neither is a defect, so comparing the
   flattened page text produces nothing but false alarms. */
for (const [pn, d] of docs) {
  const $n = cheerio.load(d.html);
  $n('script, style, .site-header, .site-footer, .callbar, .a11y-panel, form, .layout-side').remove();
  const seen = new Set();
  $n('main').find('*').addBack().contents().each((i, node) => {
    if (node.type !== 'text' || !node.data) return;
    const words = node.data.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    for (let n = 6; n >= 2; n--) {
      for (let i2 = 0; i2 + n * 2 <= words.length; i2++) {
        const a = words.slice(i2, i2 + n).join(' ');
        const b = words.slice(i2 + n, i2 + n * 2).join(' ');
        if (a !== b || a.replace(/\s/g, '').length < 6) continue;
        if (seen.has(a) || [...seen].some(x => x.includes(a))) continue;
        seen.add(a);
        add('critical', 'טקסט משוכפל בתוך משפט', pn, '"' + a + ' ' + b + '"');
      }
    }
  });
}

/* ---------- 4. thin content ---------- */
for (const [pn, d] of docs) {
  if (NOINDEX.has(pn)) continue;
  const words = d.text.split(/\s+/).filter(Boolean).length;
  // Contact and legal pages are legitimately short; padding them would be filler.
  const utility = /^\/(צרו-קשר|מדיניות-פרטיות|הצהרת-נגישות|תנאי-שימוש)\//.test(pn);
  if (words < 300 && !utility) add('high', 'תוכן דל', pn, `${words} מילים בלבד`);
}

/* ---------- 5. images without alt ---------- */
for (const [pn, d] of docs) {
  let missing = 0;
  d.$('main img').each((i, el) => {
    const alt = d.$(el).attr('alt');
    if (alt == null || !alt.trim()) missing++;
  });
  if (missing) add('medium', 'תמונות ללא alt', pn, `${missing} תמונות`);
}

/* ---------- 6. heading hierarchy ---------- */
for (const [pn, d] of docs) {
  const levels = [];
  d.$('main h1, main h2, main h3, main h4, main h5, main h6').each((i, el) => levels.push(Number(el.tagName[1])));
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) {
      add('medium', 'דילוג בהיררכיית כותרות', pn, `h${levels[i - 1]} ואחריו h${levels[i]}`);
      break;
    }
  }
}

/* ---------- 7. orphan pages (no internal links in) ---------- */
const inbound = {};
for (const [pn, d] of docs) {
  const seen = new Set();
  // count relative AND absolute same-origin links (embedded widgets use absolute URLs)
  d.$('a[href]').each((i, el) => {
    let h = (d.$(el).attr('href') || '').split('#')[0].split('?')[0];
    if (!h) return;
    if (h.startsWith(CFG.origin)) h = h.slice(CFG.origin.length) || '/';
    if (!h.startsWith('/')) return;
    if (/^\/(assets|wp-content)\//.test(h)) return;
    h = decodeURIComponent(h);
    if (!h.endsWith('/')) h += '/';
    if (h !== pn) seen.add(h);
  });
  seen.forEach(h => inbound[h] = (inbound[h] || 0) + 1);
}
for (const [pn] of docs) {
  if (pn === '/' || NOINDEX.has(pn)) continue;
  if (!inbound[pn]) add('high', 'עמוד יתום', pn, 'אף עמוד באתר לא מקשר אליו');
}

/* ---------- 8. schema sanity ---------- */
for (const [pn, d] of docs) {
  d.$('script[type="application/ld+json"]').each((i, el) => {
    const raw = d.$(el).html();
    try {
      const obj = JSON.parse(raw);
      const s = JSON.stringify(obj);
      if (/"aggregateRating"/.test(s) && !/"reviewCount"|"ratingCount"/.test(s)) {
        add('high', 'schema: aggregateRating ללא ספירת ביקורות', pn, 'גוגל יתעלם מהדירוג');
      }
      if (/"@type":\s*"Product"/.test(s) && !/"offers"|"aggregateRating"/.test(s)) {
        add('medium', 'schema: Product ללא offers', pn, '');
      }
    } catch (e) {
      add('critical', 'schema לא תקין (JSON שבור)', pn, String(e.message).slice(0, 60));
    }
  });
}

/* ---------- 9. broken / risky links ---------- */
const externals = new Map();
for (const [pn, d] of docs) {
  d.$('a[href^="http"]').each((i, el) => {
    const h = d.$(el).attr('href');
    if (h.startsWith(CFG.origin)) return;
    if (!externals.has(h)) externals.set(h, []);
    externals.get(h).push(pn);
  });
  // malformed hrefs
  d.$('a[href]').each((i, el) => {
    const h = d.$(el).attr('href') || '';
    if (/^https?:\/\/[^/]*@/.test(h) || /^https?:\/\/0\d{8,}/.test(h)) {
      add('critical', 'קישור שבור', pn, h.slice(0, 60));
    }
  });
}

/* ---------- 10. mixed language / encoding artefacts ---------- */
for (const [pn, d] of docs) {
  if (/[�]/.test(d.text)) add('high', 'תווים פגומים בתוכן', pn, 'נמצא תו replacement (�)');
}

/* ------------------------------------------------------------------ report */
function section(sev, label) {
  const list = findings[sev];
  // group by kind
  const byKind = {};
  list.forEach(f => (byKind[f.kind] = byKind[f.kind] || []).push(f));
  console.log('\n' + label + '  (' + list.length + ' ממצאים)');
  if (!list.length) { console.log('   אין'); return; }
  Object.entries(byKind).sort((a, b) => b[1].length - a[1].length).forEach(([kind, items]) => {
    console.log('\n  ' + kind + '  ×' + items.length);
    items.slice(0, 6).forEach(f => {
      console.log('     ' + String(f.page).slice(0, 90));
      if (f.detail) console.log('        ' + String(f.detail).slice(0, 110));
    });
    if (items.length > 6) console.log('     ... ועוד ' + (items.length - 6));
  });
}

console.log('=== SEO / CONTENT AUDIT — ' + docs.size + ' עמודים ===');
section('critical', '🔴 קריטי');
section('high', '🟠 חשוב');
section('medium', '🟡 בינוני');

fs.writeFileSync('_source/seo-audit.json', JSON.stringify(findings, null, 2));
console.log('\nהדוח המלא: _source/seo-audit.json');
console.log('external domains linked:', new Set([...externals.keys()].map(u => { try { return new URL(u).host; } catch (e) { return u; } })).size);
