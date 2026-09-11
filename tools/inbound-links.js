/* Links INTO a new page from the existing pages most relevant to it.
   See "קישורים אל עמוד חדש" in docs/content-guide.md.

   Every new page gets 1-3 of these. They change existing pages, so they are
   kept here - one reviewable list - rather than edited into the content:

     phrase      Preferred. Words that already appear in the existing page's
                 body are turned into the link. Not a word of copy changes.

     afterText + sentence
                 Only when no existing sentence fits, and only once approved.
                 One short sentence is added after the paragraph that contains
                 `afterText`. The [square-bracketed] words become the link.

   The build fails if a rule no longer matches, so a link can never silently
   disappear when copy changes.
*/

const RULES = [
  { from: '/איטום-בניין/', to: '/איטום-בסנפלינג/', phrase: 'סנפלינג' },
  { from: '/איטום-גגות/', to: '/יריעות-ביטומניות/', afterText: 'רוב האנשים מחכים לטיפות הראשונות', sentence: 'כתבתי בהרחבה על [איטום ביריעות ביטומניות] - איך זה מתבצע ומה המחיר.' },
  // {
  //   from: '/איטום-בניין/',             // existing page that gets the link
  //   to: '/איטום-בסנפלינג/',             // the new page
  //   phrase: 'סנפלינג',                  // already in that page's text
  // },
  // {
  //   from: '/איטום-גגות/',
  //   to: '/איטום-גג-בחורף/',
  //   afterText: 'רוב האנשים מחכים לטיפות הראשונות',
  //   sentence: 'ואם הגג כבר נוזל עכשיו, כתבתי על [איטום גג בחורף] - מה אפשר לעשות גם בגשם.',
  // },
];

const MAX_PER_PAGE = 3;
const SKIP_INSIDE = new Set(['a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'summary', 'figcaption', 'script', 'style', 'label']);
const LONG_DASH = /[‐‑‒–—―−]/g;

const done = new Set();

function insideSkipped(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'tag' && SKIP_INSIDE.has(p.name)) return true;
  }
  return false;
}

/** Wraps the first eligible occurrence of the rule's phrase in a link. */
function wrapPhrase($, root, rule, href) {
  const want = rule.phrase.replace(LONG_DASH, '-');
  let hit = false;
  $(root).find('*').addBack().contents().each((i, node) => {
    if (hit || node.type !== 'text' || !node.data || insideSkipped(node)) return;
    // long dashes are normalised later in the build, one character for one,
    // so matching on the normalised copy keeps the indices valid
    const at = node.data.replace(LONG_DASH, '-').indexOf(want);
    if (at < 0) return;
    const before = node.data.slice(0, at);
    const match = node.data.slice(at, at + want.length);
    const after = node.data.slice(at + want.length);
    $(node).replaceWith(before + '<a href="' + href + '">' + match + '</a>' + after);
    hit = true;
  });
  return hit;
}

/** Adds one approved sentence after the paragraph containing afterText. */
function appendSentence($, root, rule, href) {
  const m = rule.sentence.match(/^(.*)\[(.+?)\](.*)$/);
  if (!m) throw new Error('inbound-links: sentence needs [anchor words] - ' + rule.from + ' -> ' + rule.to);
  let hit = false;
  $(root).find('p, li').each((i, el) => {
    if (hit) return;
    if (!$(el).text().replace(LONG_DASH, '-').includes(rule.afterText.replace(LONG_DASH, '-'))) return;
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    $(el).after('<p>' + esc(m[1]) + '<a href="' + href + '">' + esc(m[2]) + '</a>' + esc(m[3]) + '</p>');
    hit = true;
  });
  return hit;
}

/**
 * Called from the build for every article-body fragment of a page, in document
 * order. A rule is applied once, at its first match, then retired.
 * @param hrefFor maps a page path to the URL the site links it with
 */
function applyTo($, root, pagePath, hrefFor) {
  for (const rule of RULES) {
    if (rule.from !== pagePath || done.has(rule)) continue;
    const href = hrefFor(rule.to);
    const ok = rule.phrase ? wrapPhrase($, root, rule, href) : appendSentence($, root, rule, href);
    if (ok) done.add(rule);
  }
}

/** Validates the whole list once the build has finished. Throws on any problem. */
function assertAllApplied(knownPaths) {
  const problems = [];
  const perTarget = {}, pairs = new Set();
  for (const r of RULES) {
    const id = r.from + ' -> ' + r.to;
    if (!knownPaths.has(r.from)) problems.push(id + ': linking page does not exist');
    if (!knownPaths.has(r.to)) problems.push(id + ': target page does not exist');
    if (r.from === r.to) problems.push(id + ': a page cannot link to itself');
    if (!r.phrase && !(r.afterText && r.sentence)) problems.push(id + ': needs `phrase`, or `afterText` + `sentence`');
    if (pairs.has(id)) problems.push(id + ': duplicate - one link per page pair');
    pairs.add(id);
    perTarget[r.to] = (perTarget[r.to] || 0) + 1;
    if (!done.has(r) && knownPaths.has(r.from)) {
      problems.push(id + ': ' + (r.phrase
        ? 'phrase "' + r.phrase + '" not found in the article body'
        : 'paragraph starting "' + r.afterText + '" not found'));
    }
  }
  Object.entries(perTarget).forEach(([to, n]) => {
    if (n > MAX_PER_PAGE) problems.push(to + ': ' + n + ' inbound rules, the guide allows ' + MAX_PER_PAGE);
  });
  if (problems.length) {
    throw new Error('inbound-links.js has ' + problems.length + ' problem(s):\n  ' + problems.join('\n  '));
  }
  return RULES.length;
}

module.exports = { RULES, applyTo, assertAllApplied };
