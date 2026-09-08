/* Content repairs applied at build time.

   The crawled source in _source/ stays pristine; every change below is
   deterministic, logged, and re-applied on each build so it is auditable.

   All of these fix defects that already existed in the WordPress site. */

const cheerio = require('cheerio');

const log = [];
const record = (kind, page, before, after) => log.push({ kind, page, before, after });

/* ---------------------------------------------------------------------------
   1. A phrase repeated back-to-back inside one sentence.
   Caused by a template merge-field that rendered twice, e.g.
   "מדברים על איטום גגות איטום גגות בגן יבנה" -> "מדברים על איטום גגות בגן יבנה".

   Guards: exact adjacency, whole words, minimum length, and the repeat must
   not be a legitimate heading->paragraph echo (those live in separate nodes,
   and this only ever looks inside a single text node).
--------------------------------------------------------------------------- */
function collapseAdjacentRepeat(text, page) {
  if (!text || text.length < 12) return text;
  let out = text;
  // longest first so "איטום גגות" does not pre-empt a longer real repeat
  for (let n = 8; n >= 2; n--) {
    const words = `((?:[^\\s]+\\s+){${n - 1}}[^\\s]+)`;
    const re = new RegExp(words + '\\s+\\1(?=\\s|[,.!?:;)]|$)', 'g');
    out = out.replace(re, (m, phrase) => {
      if (phrase.replace(/\s/g, '').length < 6) return m;
      record('טקסט משוכפל', page, m.trim().slice(0, 80), phrase.trim().slice(0, 80));
      return phrase;
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------
   2. A paragraph that merely repeats the heading immediately above it.
   e.g. <h2>הסוגים העיקריים…</h2><p>הסוגים העיקריים…</p><table>…
--------------------------------------------------------------------------- */
function dropHeadingEcho($, root, page) {
  // Walk headings and paragraphs in document order: the page builder wraps
  // them in nested divs, so a plain .next() sibling check misses most cases.
  const seq = $(root).find('h1,h2,h3,h4,h5,h6,p').toArray();
  for (let i = 0; i < seq.length - 1; i++) {
    const el = seq[i];
    if (!/^h[1-6]$/.test(el.tagName)) continue;
    const htext = $(el).text().replace(/\s+/g, ' ').trim();
    if (htext.length < 8) continue;
    const next = seq[i + 1];
    if (next.tagName !== 'p') continue;
    const ptext = $(next).text().replace(/\s+/g, ' ').trim();
    if (ptext !== htext) continue;
    // keep anything the paragraph carries beyond the repeated words
    if ($(next).find('img,a,table,ul,ol').length) continue;
    record('פסקה שמשכפלת כותרת', page, htext.slice(0, 70), '(הוסרה)');
    $(next).remove();
  }
}

/* ---------------------------------------------------------------------------
   3. Empty headings left behind by the page builder - they add nothing and
   break the heading outline for screen readers and for Google.
--------------------------------------------------------------------------- */
function dropEmptyHeadings($, root, page) {
  $(root).find('h1,h2,h3,h4,h5,h6').each((i, h) => {
    const t = $(h).text().replace(/[\s ]/g, '');
    if (!t && !$(h).find('img,svg').length) {
      record('כותרת ריקה', page, '<' + h.tagName + '>', '(הוסרה)');
      $(h).remove();
    }
  });
}

/** Applies every HTML-level repair to a content fragment. */
function fixHtml(html, page) {
  if (!html) return html;
  const $ = cheerio.load('<div id="__f">' + html + '</div>', { decodeEntities: false });
  dropHeadingEcho($, '#__f', page);
  dropEmptyHeadings($, '#__f', page);
  // text nodes only, so tags and attributes are untouched
  $('#__f').find('*').addBack().contents().each(function walk(i, node) {
    if (node.type === 'text' && node.data && /\S/.test(node.data)) {
      const fixed = collapseAdjacentRepeat(node.data, page);
      if (fixed !== node.data) node.data = fixed;
    }
  });
  return $('#__f').html();
}

/** Applies the text-level repair to a plain string (headings, list items…). */
function fixText(text, page) {
  return collapseAdjacentRepeat(text, page);
}

module.exports = { fixHtml, fixText, log };
