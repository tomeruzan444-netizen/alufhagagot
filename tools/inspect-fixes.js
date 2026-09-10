// One-off inspection for the outstanding fix items.
const fs = require('fs'), cheerio = require('cheerio');
const pages = JSON.parse(fs.readFileSync('_source/pages.json', 'utf8'));
const find = (p) => pages.find(x => x.pathname === p);

console.log('=== titles / descriptions that need work ===');
const targets = [
  '/איטום-גגות-בבנימינה-2/', '/איטום-גגות-בבנימינה/',
  '/אזורי-שירות/', '/עמוד-אודות/', '/הפרויקטים-של-אלוף-הגגות/', '/בטקל-לאיטום/',
  '/מדיניות-פרטיות/', '/הצהרת-נגישות/', '/תנאי-שימוש/', '/בלוג/',
  '/איטום-גגות-בגבעת-זאב/', '/יריעות-ביטומניות/', '/איטום-גגות-בקרית-עקרון/',
];
for (const t of targets) {
  const p = find(t);
  if (!p) { console.log('   ' + t + '  (not found)'); continue; }
  const h1 = (p.blocks.find(b => b.type === 'heading' && b.level === 1) || {}).text || '';
  console.log('\n   ' + t);
  console.log('     H1    : ' + h1.slice(0, 70));
  console.log('     title : [' + p.title.length + '] ' + p.title);
  console.log('     desc  : [' + (p.description || '').length + '] ' + (p.description || '(none)').slice(0, 130));
}

console.log('\n\n=== images still missing alt (after the broken one is removed) ===');
const brokenPages = new Set(['/איטום-גגות/', '/איטום-גגות-בגוש-עציון/', '/איטום-גגות-בטירת-הכרמל/', '/איטום-גגות-בקרית-מוצקין/']);
for (const p of pages) {
  const noAlt = p.blocks.filter(b => b.type === 'image' && b.src && !(b.alt || '').trim());
  if (!noAlt.length) continue;
  const rows = noAlt
    .filter(b => !/אלוף-הגגות-9\.png/.test(decodeURIComponent(b.src)))
    .map(b => decodeURIComponent(b.src).split('/').pop());
  if (!rows.length) continue;
  console.log('\n   ' + p.pathname);
  rows.forEach(r => console.log('     ' + r));
  // the heading right before, for context
  const idx = p.blocks.findIndex(b => b.type === 'image' && b.src && !(b.alt || '').trim());
  for (let i = idx - 1; i >= 0 && i > idx - 4; i--) {
    if (p.blocks[i].type === 'heading') { console.log('     ^ under heading: ' + p.blocks[i].text.slice(0, 60)); break; }
  }
}
