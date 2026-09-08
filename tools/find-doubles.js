// Lists every adjacent duplicated phrase with enough context to fix it safely.
const fs = require('fs'), cheerio = require('cheerio');
const CFG = require('./site.config.js');
const pages = JSON.parse(fs.readFileSync('_source/pages.json', 'utf8'));
const skip = new Set(CFG.redirects.map(r => r.from));

function textOf(b) {
  if (b.type === 'heading' || b.type === 'button') return b.text || '';
  if (b.type === 'richtext' || b.type === 'html') {
    const $ = cheerio.load('<div id="x">' + b.html + '</div>');
    $('#x script, #x style').remove();
    return $('#x').text();
  }
  if (b.type === 'list') return b.items.map(i => i.text).join(' \n ');
  if (b.type === 'faq') return b.items.map(i => i.q + ' ' + cheerio.load('<div>' + i.a + '</div>').text()).join(' \n ');
  return '';
}

let total = 0;
for (const p of pages) {
  if (skip.has(p.pathname)) continue;
  const hits = [];
  p.blocks.forEach((b, bi) => {
    const t = textOf(b).replace(/\s+/g, ' ').trim();
    if (!t) return;
    const words = t.split(' ');
    const seen = new Set();
    for (let n = 6; n >= 2; n--) {
      for (let i = 0; i + n * 2 <= words.length; i++) {
        const a = words.slice(i, i + n).join(' ');
        const bb = words.slice(i + n, i + n * 2).join(' ');
        if (a !== bb || a.length <= 6) continue;
        if ([...seen].some(s => s.includes(a))) continue;
        seen.add(a);
        const ctxStart = Math.max(0, i - 8), ctxEnd = Math.min(words.length, i + n * 2 + 8);
        hits.push({ bi, type: b.type, region: b.region, phrase: a, n,
          context: words.slice(ctxStart, ctxEnd).join(' ') });
      }
    }
  });
  if (hits.length) {
    console.log('\n=== ' + p.pathname + ' ===');
    hits.forEach(h => {
      total++;
      console.log('  block#' + h.bi + ' ' + h.type + '/' + h.region + '  repeated: "' + h.phrase + '"');
      console.log('    …' + h.context + '…');
    });
  }
}
console.log('\ntotal doubled phrases: ' + total);
