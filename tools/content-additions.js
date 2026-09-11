/* Approved additions to existing pages.

   Existing pages are not rewritten (see "שינויים בתוכן קיים" in
   docs/content-guide.md). When the owner approves an addition, it goes here -
   one reviewable list - and the crawled source in _source/ stays untouched.

   Each addition is inserted as new article blocks right after the first block
   whose text contains `afterText`. Nothing already on the page changes. The
   build fails if the page or the anchor text is gone, so an addition can never
   silently disappear or land somewhere else. */

const link = (p, text) => '<a href="' + encodeURI(p) + '">' + text + '</a>';

const ADDITIONS = [
  {
    page: '/עמוד-אודות/',
    approved: '11.09.2026 - בעל האתר: להוסיף את מנחם טולדו כמייסד לצד משה',
    afterText: 'אלוף הגגות היא חברת איטום ותיקון גגות ותיקה',
    blocks: [{
      type: 'richtext',
      html:
        '<p>אלוף הגגות הוקמה על ידי <strong>משה</strong> ו<strong>מנחם טולדו</strong>.</p>' +
        '<p>משה כותב כאן באתר מהניסיון שלו - על ' + link('/זיפות-גגות/', 'זיפות גגות') + ', ' +
        link('/זפת-קר/', 'זפת קר') + ' ו' + link('/איטום-גגות-שינגלס-מידע-ומחירים/', 'גגות שינגלס') + '.</p>' +
        '<p>מנחם מתמחה באיטום וזיפות גגות, ומבצע גם את העבודות המורכבות יותר: ' +
        link('/איטום-בסנפלינג/', 'איטום בסנפלינג') + ' ו' + link('/איטום-בניין/', 'איטום בניינים') +
        '. אפשר לדבר איתו ישירות: <a href="tel:0505650223">050-565-0223</a>.</p>',
    }],
  },
];

const textOf = (b) => [b.text, b.html, ...(b.items || []).map((i) => i.text || i.q || '')]
  .filter(Boolean).join(' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');

/** Returns the pages with every addition inserted. Throws if one cannot be placed. */
function apply(pages) {
  const problems = [];
  const out = pages.map((p) => {
    const mine = ADDITIONS.filter((a) => a.page === p.pathname);
    if (!mine.length) return p;
    const blocks = p.blocks.slice();
    for (const a of mine) {
      const at = blocks.findIndex((b) => b.region === 'article' && textOf(b).includes(a.afterText));
      if (at < 0) { problems.push(a.page + ': anchor "' + a.afterText + '" not found'); continue; }
      blocks.splice(at + 1, 0, ...a.blocks.map((b) => ({ ...b, source: 'addition', region: 'article' })));
    }
    return { ...p, blocks };
  });
  const known = new Set(pages.map((p) => p.pathname));
  ADDITIONS.filter((a) => !known.has(a.page)).forEach((a) => problems.push(a.page + ': page does not exist'));
  if (problems.length) throw new Error('content-additions.js:\n  ' + problems.join('\n  '));
  return out;
}

module.exports = { ADDITIONS, apply };
