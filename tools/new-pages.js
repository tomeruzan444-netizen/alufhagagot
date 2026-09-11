/* New pages - written for the new site, not crawled from WordPress.

   One Markdown file per page in content/pages/. The front matter carries the
   SEO fields; the body is the article. See "הוספת עמוד חדש" in
   docs/content-guide.md.

     ---
     path: /איטום-חניון-תת-קרקעי/
     status: draft                 draft | published
     title: ...                    <= 60 characters
     description: ...              120-155 characters
     h1: ...
     lede: ...                     one or two sentences under the H1
     author: מנחם טולדו
     published: 2026-09-11
     template: /איטום-בניין/        lead form, calculator and sidebar come from here
     approved: מנחם, 2026-09-12     required before status: published
     ---

   Body: ## and ### headings, paragraphs, - and 1. lists, | tables |, **bold**
   and [links](/path/). Under a "## שאלות נפוצות" heading every ### is a
   question and the text under it the answer. [לאשר עם מנחם: ...] marks what
   still has to be confirmed; a page with one left cannot be published.

   Drafts are never built into the live site. A published page must pass
   check(): the build fails otherwise, so publish refuses to push it. */

const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'content', 'pages');

/* ------------------------------------------------------------- markdown */

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return escHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => {
      const h = href.replace(/&amp;/g, '&');
      const url = h.startsWith('/') ? encodeURI(decodeURI(h)) : h;
      return '<a href="' + escHtml(url) + '">' + text + '</a>';
    });
}

function frontMatter(src) {
  const m = src.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error('missing front matter');
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z][a-zA-Z0-9]*):\s*(.*?)\s*$/);
    if (kv) meta[kv[1]] = kv[2].replace(/\s+#\s.*$/, '');
  }
  return { meta, body: m[2] };
}

/** Markdown body -> article blocks in the crawl's format. */
function toBlocks(body) {
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const blocks = [];
  let html = [], faq = null, q = null, para = [], list = null, table = null;

  const flushPara = () => { if (para.length) { html.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushList = () => { if (list) { html.push('<' + list.tag + '>' + list.items.map((i) => '<li>' + inline(i) + '</li>').join('') + '</' + list.tag + '>'); list = null; } };
  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((r) => !/^\|?[\s:|-]+\|?$/.test(r))
      .map((r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
    const [head, ...rest] = rows;
    html.push('<table><thead><tr>' + head.map((c) => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
      rest.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
    table = null;
  };
  const flushAll = () => { flushPara(); flushList(); flushTable(); };
  const flushHtml = () => {
    flushAll();
    if (!html.length) return;
    if (q) q.a += html.join('');
    else blocks.push({ type: 'richtext', html: html.join('') });
    html = [];
  };
  const closeFaq = () => {
    flushHtml();
    if (faq) { if (faq.items.length) blocks.push(faq); faq = null; q = null; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{2,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length, text = h[2].trim();
      if (level === 2) {
        closeFaq();
        blocks.push({ type: 'heading', level: 2, text });
        if (/^שאלות נפוצות/.test(text)) faq = { type: 'faq', items: [] };
      } else if (faq) {
        flushHtml();
        q = { q: text, a: '' };
        faq.items.push(q);
      } else {
        flushHtml();
        blocks.push({ type: 'heading', level: 3, text });
      }
      continue;
    }
    if (/^\s*\|/.test(line)) { flushPara(); flushList(); (table = table || []).push(line.trim()); continue; }
    flushTable();
    const li = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.*)$/);
    if (li) {
      flushPara();
      const tag = li[1] ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      (list = list || { tag, items: [] }).items.push(li[3]);
      continue;
    }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line.trim());
  }
  closeFaq();
  return blocks.map((b) => ({ ...b, source: 'new', region: 'article' }));
}

/* ------------------------------------------------------------ the pages */

const rawPath = (p) => encodeURI(p).replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase());

function files() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).map((f) => path.join(DIR, f));
}

/** Parses one file into a page record shaped like the crawl's. */
function parse(file, crawled) {
  const { meta, body } = frontMatter(fs.readFileSync(file, 'utf8'));
  const CFG = require('./site.config.js');
  const tpl = crawled.find((p) => p.pathname === (meta.template || '/איטום-בניין/'));
  if (!tpl) throw new Error(file + ': template page ' + meta.template + ' not found');

  const raw = rawPath(meta.path);
  const url = CFG.origin + raw;
  const date = (meta.published || new Date().toISOString().slice(0, 10)) + 'T08:00:00+03:00';

  // hero: our H1 and lede, then the template's lead form and price calculator
  const tHero = tpl.blocks.filter((b) => b.region === 'hero');
  const formAt = tHero.findIndex((b) => b.type === 'form');
  const calcAt = tHero.findIndex((b) => b.type === 'html');
  const hero = [
    { type: 'heading', level: 1, text: meta.h1 },
    { type: 'richtext', html: '<p>' + inline(meta.lede || '') + '</p>' },
    ...(formAt > 0 ? [tHero[formAt - 1], tHero[formAt]] : []),
    ...(calcAt > 0 ? [tHero[calcAt - 1], tHero[calcAt]] : []),
  ].map((b) => ({ ...b, region: 'hero' }));

  const graph = (tpl.schema[0] && tpl.schema[0]['@graph']) || [];
  const keep = graph.filter((n) => /#(organization|website)$/.test(n['@id'] || ''));
  const author = {
    '@type': 'Person',
    '@id': CFG.origin + rawPath('/עמוד-אודות/') + '#' + 'menachem-toledo',
    name: meta.author || 'מנחם טולדו',
    jobTitle: 'מייסד שותף, אלוף הגגות',
    url: CFG.origin + rawPath('/עמוד-אודות/'),
    worksFor: { '@id': CFG.origin + '/#organization' },
  };
  const schema = [{
    '@context': 'https://schema.org',
    '@graph': [
      ...keep,
      { '@type': 'WebPage', '@id': url + '#webpage', url, name: meta.title, datePublished: date, dateModified: date,
        isPartOf: { '@id': CFG.origin + '/#website' }, inLanguage: 'he-IL' },
      author,
      { '@type': 'Article', '@id': url + '#article', headline: meta.h1, name: meta.title, description: meta.description,
        datePublished: date, dateModified: date, author: { '@id': author['@id'], name: author.name },
        publisher: { '@id': CFG.origin + '/#organization' }, isPartOf: { '@id': url + '#webpage' },
        mainEntityOfPage: { '@id': url + '#webpage' }, inLanguage: 'he-IL' },
    ],
  }];

  return {
    name: crypto.createHash('sha1').update(meta.path).digest('hex').slice(0, 16),
    url, slug: raw.replace(/^\/|\/$/g, ''), pathname: meta.path, rawPathname: raw,
    title: meta.title, description: meta.description, canonical: url,
    robots: meta.status === 'published' ? tpl.robots : 'noindex, follow',
    ogTitle: meta.title, ogDescription: meta.description, ogImage: meta.image ? CFG.origin + meta.image : tpl.ogImage,
    ogType: 'article', lang: 'he-IL', templateKind: 'new-page', schema,
    blocks: [...hero, ...toBlocks(body), ...tpl.blocks.filter((b) => b.region === 'cta')],
    _new: { file, meta, body },
  };
}

/** New pages: published ones, plus drafts when asked. */
function load(crawled, { drafts = false } = {}) {
  return files().map((f) => parse(f, crawled))
    .filter((p) => drafts || p._new.meta.status === 'published');
}

/* ---------------------------------------------------------------- check */

const BANNED = ['בוודאי', 'חומרים איכותיים', 'חומרים מתקדמים', 'חומרי איטום איכותיים', 'טכנולוגיה מתקדמת',
  'ציוד מתקדם', 'שאף טיפה לא תחדור', 'שקט נפשי', 'מותאמים אישית', 'הגעתם למקום הנכון', 'ללא פשרות',
  'החברה המובילה', 'תשארו איתנו', 'החברה', 'אלוף הגגות מציעה', 'צוות המומחים'];

/** Every rule of the guide a script can check. Returns [{ok, rule, detail}]. */
function check(page, crawled) {
  const { meta, body } = page._new;
  const WC = require('./word-count.js');
  const INBOUND = require('./inbound-links.js');
  const out = [];
  const add = (ok, rule, detail) => out.push({ ok, rule, detail: detail || '' });
  const text = WC.articleText(page);
  const n = WC.count(text);

  const existing = crawled.find((p) => p.pathname === meta.path);
  add(!existing, 'ה-URL פנוי', existing ? 'כבר קיים עמוד ' + meta.path : meta.path);
  add(!/-\d+\/$/.test(meta.path), 'URL בלי סיומת מספר');
  add(n >= WC.MIN && n <= WC.MAX, WC.MIN + '-' + WC.MAX + ' מילים', n + ' מילים');
  add((meta.title || '').length <= 60 && !/\p{Extended_Pictographic}/u.test(meta.title || ''), 'כותרת עד 60 תווים, בלי אימוג\'י', (meta.title || '').length + ' תווים');
  const dl = (meta.description || '').length;
  add(dl >= 120 && dl <= 155, 'תיאור 120-155 תווים', dl + ' תווים');
  add(!!meta.h1, 'H1');
  const open = (body.match(/\[לאשר עם מנחם[^\]]*\]/g) || []);
  add(!open.length, 'אין [לאשר עם מנחם] פתוחים', open.length ? open.length + ' פתוחים' : '');
  const banned = BANNED.filter((w) => (text + ' ' + meta.title).includes(w));
  add(!banned.length, 'בלי ביטויים אסורים', banned.join(', '));
  add(!/[‐‑‒–—―−]/.test(body + meta.title + meta.description + meta.h1 + meta.lede), 'רק מקף רגיל (-)');
  const links = [...new Set((body.match(/\]\((\/[^)\s]*)\)/g) || []).map((l) => l.slice(2, -1)))];
  const broken = links.filter((l) => !crawled.some((p) => p.pathname === decodeURI(l)));
  add(links.length >= 3 && links.length <= 5, '3-5 קישורים יוצאים', links.length + ' קישורים');
  add(!broken.length, 'כל הקישורים היוצאים קיימים', broken.join(', '));
  const inbound = INBOUND.RULES.filter((r) => r.to === meta.path).length;
  add(inbound >= 1 && inbound <= 3, '1-3 קישורים נכנסים ב-inbound-links.js', inbound + ' כללים');
  add(!!meta.approved, 'מנחם קרא ואישר (approved:)', meta.approved || '');
  return out;
}

/** Throws if a published page breaks a rule. Called by the build. */
function assertPublishable(pages, crawled) {
  const problems = [];
  for (const p of pages.filter((x) => x._new && x._new.meta.status === 'published')) {
    check(p, crawled).filter((c) => !c.ok).forEach((c) => problems.push(p.pathname + ': ' + c.rule + (c.detail ? ' (' + c.detail + ')' : '')));
  }
  if (problems.length) throw new Error('new page(s) not ready to publish:\n  ' + problems.join('\n  '));
}

module.exports = { load, parse, check, assertPublishable, toBlocks, frontMatter, DIR };

/* ------------------------------------------------------------------- CLI */
if (require.main === module) {
  const crawled = require('./site-pages.js').crawled();
  const arg = process.argv[2];
  const targets = arg ? [path.resolve(arg)] : files();
  if (!targets.length) { console.log('אין עמודים חדשים ב-content/pages/'); process.exit(0); }
  let bad = 0;
  for (const f of targets) {
    const page = parse(f, crawled);
    const res = check(page, crawled);
    console.log('\n' + page.pathname + '  [' + page._new.meta.status + ']');
    res.forEach((c) => console.log('  ' + (c.ok ? '✓' : '✗') + ' ' + c.rule + (c.detail ? '  - ' + c.detail : '')));
    const fails = res.filter((c) => !c.ok).length;
    console.log(fails ? '  ' + fails + ' סעיפים פתוחים - עדיין לא לפרסום' : '  מוכן לפרסום');
    bad += fails;
  }
  process.exit(0);
}
