// Verifies that no text content was lost during block extraction.
const fs = require('fs'), path = require('path'), cheerio = require('cheerio');
const pages = JSON.parse(fs.readFileSync('_source/pages.json', 'utf8'));

// Normalize to a comparable set of Hebrew/latin word tokens.
function tokens(text) {
  return (text || '')
    .replace(/ /g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().split(/\s+/).filter(Boolean);
}

function blockText(b) {
  switch (b.type) {
    case 'heading': return b.text;
    case 'richtext': return cheerio.load('<div>' + b.html + '</div>').text();
    case 'button': return b.text;
    case 'image': return b.alt;
    case 'imagebox': return b.title + ' ' + b.text + ' ' + b.alt;
    case 'gallery': return b.images.map(i => i.alt).join(' ');
    case 'list': return b.items.map(i => i.text).join(' ');
    case 'faq': return b.items.map(i => i.q + ' ' + cheerio.load('<div>' + i.a + '</div>').text()).join(' ');
    case 'toc': return b.label;
    case 'form': return b.fields.map(f => (f.placeholder || '') + ' ' + (f.label || '')).join(' ') + ' ' + b.submit;
    case 'html': return cheerio.load('<div>' + b.html + '</div>').text();
    case 'unknown': return b.text;
    default: return '';
  }
}

const report = [];
for (const p of pages) {
  const html = fs.readFileSync(path.join('_source/html', p.name + '.html'), 'utf8');
  const $ = cheerio.load(html);
  const $main = $('.elementor-location-single').first();
  $main.find('script, style').remove();
  const srcTok = tokens($main.text());
  const gotTok = new Set(tokens(p.blocks.map(blockText).join(' ')));

  const missing = [];
  const seen = new Set();
  for (const t of srcTok) {
    if (!gotTok.has(t) && !seen.has(t)) { seen.add(t); missing.push(t); }
  }
  const srcUnique = new Set(srcTok).size;
  const pct = srcUnique ? (1 - missing.length / srcUnique) * 100 : 100;
  report.push({ slug: p.slug, title: p.title, srcUnique, missingCount: missing.length, pct: +pct.toFixed(1), missing: missing.slice(0, 25) });
}

report.sort((a, b) => a.pct - b.pct);
const bad = report.filter(r => r.pct < 99.5);
console.log('pages checked:', report.length);
console.log('pages at 100% token coverage:', report.filter(r => r.pct === 100).length);
console.log('pages below 99.5%:', bad.length);
console.log('');
for (const r of bad.slice(0, 12)) {
  console.log(r.pct + '% | ' + r.slug.slice(0, 45));
  console.log('   missing (' + r.missingCount + '/' + r.srcUnique + '): ' + r.missing.join(' | ').slice(0, 300));
}
fs.writeFileSync('_source/coverage.json', JSON.stringify(report, null, 2));

// pages missing an H1
const noH1 = pages.filter(p => !p.blocks.some(b => b.type === 'heading' && b.level === 1));
console.log('\n=== pages with no H1 (' + noH1.length + ') ===');
noH1.forEach(p => console.log('  ' + p.slug.slice(0, 60) + '  ::  ' + p.title.slice(0, 60)));
