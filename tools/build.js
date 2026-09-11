/* ==========================================================================
   Static site generator for אלוף הגגות.
   Renders every crawled page to build/<path>/index.html, preserving URLs,
   content, images, internal links and all SEO metadata exactly.
   ========================================================================== */
const fs = require('fs'), path = require('path'), cheerio = require('cheerio');
const CFG = require('./site.config.js');
const { scopeCss } = require('./scope-css.js');
const FIX = require('./content-fixes.js');
const SEO = require('./seo-overrides.js');
const LINKS = require('./internal-links.js');
const HOME = require('./home-layout.js');
const INBOUND = require('./inbound-links.js');
const ADDITIONS = require('./content-additions.js');
const crypto = require('crypto');

/* Assets are served with `immutable` for a year, which means a browser will
   not re-fetch them even on a manual reload. Version each URL by the hash of
   its contents so a change produces a new URL - unchanged files keep the
   long cache, changed ones are picked up immediately. */
const assetHash = (file) => crypto.createHash('sha1')
  .update(fs.readFileSync(file)).digest('hex').slice(0, 8);
const CSS_V = assetHash('src/css/site.css');
const JS_V = assetHash('src/js/site.js');

// approved additions to existing pages are merged in here (content-additions.js)
const pages = ADDITIONS.apply(JSON.parse(fs.readFileSync('_source/pages.json', 'utf8')));
const OUT = 'build';
const REDIRECT_FROM = new Set(CFG.redirects.map(r => r.from));
const LIVE_PAGES = pages.filter(p => !REDIRECT_FROM.has(p.pathname));
const LINK_MESH = LINKS.build(LIVE_PAGES);

/* ---------------------------------------------------------------- helpers */

/* Long dashes are normalised to a plain hyphen site-wide (client request).
   Applied to visible text, meta values and schema strings only - never to
   href/src values, so URLs and file paths stay byte-identical. */
const LONG_DASH = /[‐‑‒–—―−]/g;
const dashes = (s) => (s == null ? s : String(s).replace(LONG_DASH, '-'));

// Rewrites text nodes of an HTML fragment, leaving tags and attributes alone.
function dashesInHtml(html) {
  if (!html) return html;
  if (!LONG_DASH.test(html)) return html;
  return html.replace(/>([^<]+)</g, (m, text) => '>' + text.replace(LONG_DASH, '-') + '<')
    // text before the first tag / after the last one
    .replace(/^([^<]+)/, (m, t) => t.replace(LONG_DASH, '-'))
    .replace(/([^>]+)$/, (m, t) => t.replace(LONG_DASH, '-'))
    // alt / title attributes carry reader-visible text too
    .replace(/\b(alt|title)="([^"]*)"/g, (m, a, v) => a + '="' + v.replace(LONG_DASH, '-') + '"');
}

// Schema strings, but never URLs.
function dashesInSchema(node) {
  if (typeof node === 'string') return /^https?:\/\//i.test(node) ? node : node.replace(LONG_DASH, '-');
  if (Array.isArray(node)) return node.map(dashesInSchema);
  if (node && typeof node === 'object') {
    const out = {};
    for (const k of Object.keys(node)) {
      out[k] = (k === 'url' || k === '@id' || k === 'contentUrl' || k === 'sameAs' || k === 'logo' || k === 'image')
        ? node[k] : dashesInSchema(node[k]);
    }
    return out;
  }
  return node;
}

// Adds the founders (seo-overrides.js) to the site's Organization node,
// wherever a page's schema carries it. Returns a copy; the source is untouched.
const ORG_ID = CFG.origin + '/#organization';
function withOrganization(node) {
  if (Array.isArray(node)) return node.map(withOrganization);
  if (!node || typeof node !== 'object') return node;
  if (node['@id'] === ORG_ID && node.name) return { ...node, ...SEO.organization };
  const out = {};
  for (const k of Object.keys(node)) out[k] = withOrganization(node[k]);
  return out;
}

const esc = (s) => String(s == null ? '' : s)
  .replace(LONG_DASH, '-')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const escRaw = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// URL-bearing attributes keep their exact original bytes
const URL_ATTRS = new Set(['href', 'src', 'srcset', 'content-url']);
const attr = (name, value) => (value == null || value === '') ? ''
  : ` ${name}="${URL_ATTRS.has(name) ? escRaw(value) : esc(value)}"`;

// Percent-encoded Hebrew hrefs are what Google has indexed - keep them byte-identical.
function href(h) {
  if (!h) return '#';
  return h;
}

function slugifyAnchor(text, used) {
  let base = String(text).trim().toLowerCase()
    .replace(/["'׳״]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'section';
  let s = base, i = 2;
  while (used.has(s)) { s = base + '-' + i++; }
  used.add(s);
  return s;
}

/* --------------------------------------------------------------- pictures */
const webpCache = new Map();
function hasWebp(src) {
  if (!src) return false;
  if (webpCache.has(src)) return webpCache.get(src);
  let ok = false;
  try {
    const p = decodeURIComponent(new URL(src, CFG.origin).pathname);
    if (/\.(png|jpe?g)$/i.test(p)) {
      ok = fs.existsSync(path.join(OUT, p.replace(/^\//, '').replace(/\.(png|jpe?g)$/i, '.webp')));
    }
  } catch (e) { ok = false; }
  webpCache.set(src, ok);
  return ok;
}

// Keeps the original file path (Google Images equity) and adds a WebP source.
const MISSING_IMAGES = new Set(SEO.missingImages || []);
function picture(src, alt, opts) {
  opts = opts || {};
  if (!src) return '';
  const fileName = decodeURIComponent(String(src).split('/').pop().split('?')[0]);
  // deleted from the media library; a broken <img> helps nobody
  if (MISSING_IMAGES.has(fileName)) return '';
  // the editor left some images without alt text
  if (!alt || !String(alt).trim()) alt = (SEO.alt || {})[fileName] || '';
  let rel = src;
  try { rel = new URL(src, CFG.origin).pathname; } catch (e) { }
  const dims = attr('width', opts.width) + attr('height', opts.height);
  const loading = opts.eager ? ' loading="eager" fetchpriority="high"' : ' loading="lazy" decoding="async"';
  const cls = attr('class', opts.className);
  const img = `<img src="${esc(rel)}"${attr('alt', alt || '')}${dims}${loading}${cls}>`;
  if (!hasWebp(src)) return img;
  const webp = rel.replace(/\.(png|jpe?g)$/i, '.webp');
  return `<picture><source srcset="${esc(webp)}" type="image/webp">${img}</picture>`;
}

/* ------------------------------------------------------------------ icons */
const ICON = {
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.3 21 3 12.7 3 2.5c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .7-.2 1l-2.3 2.2z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.1a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.1 8.1 0 1 1 12 20.1zm4.5-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.8c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.1-.3 0-.5l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.2.7 3 .6.5 0 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1z"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h2v2H3V6zm4 0h14v2H7V6zM3 11h2v2H3v-2zm4 0h14v2H7v-2zm-4 5h2v2H3v-2zm4 0h14v2H7v-2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>',
  a11y: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm8 5.2-5.3 1.1v3.3l1.9 8.1a1 1 0 0 1-1.9.5L12 14l-2.7 6.2a1 1 0 0 1-1.9-.5l1.9-8.1V8.3L4 7.2a1 1 0 1 1 .4-2l4.9 1a13 13 0 0 0 5.4 0l4.9-1a1 1 0 1 1 .4 2z"/></svg>',
  trust: {
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5.4v5.3c0 5 3.4 9.7 8 11.3 4.6-1.6 8-6.3 8-11.3V5.4L12 2zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 5-5 1.4 1.4-6.4 6.4z"/></svg>',
    building: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V7l6-4 6 4v3h6v11H3zm2-2h4v-3H5v3zm0-5h4v-3H5v3zm0-5h4V6H5v3zm6 10h4v-3h-4v3zm0-5h4v-3h-4v3zm0-5h4V6h-4v3zm6 10h4v-3h-4v3zm0-5h4v-3h-4v3z"/></svg>',
    tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5V4a1 1 0 0 0-1-1h-7.5a1 1 0 0 0-.7.3l-8.5 8.5a1 1 0 0 0 0 1.4l7.5 7.5a1 1 0 0 0 1.4 0l8.5-8.5a1 1 0 0 0 .3-.7zM17 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4.2 3.8 7 8 8-4.2 1-7 3.8-8 8-1-4.2-3.8-7-8-8 4.2-1 7-3.8 8-8z"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 17.3-6.2 3.7 1.6-7L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.4 4.8 1.6 7z"/></svg>',
  },
  social: {
    Facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1z"/></svg>',
    Youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 12s0-3.5-.5-5.1a2.7 2.7 0 0 0-1.9-1.9C18.9 4.5 12 4.5 12 4.5s-6.9 0-8.6.5A2.7 2.7 0 0 0 1.5 6.9C1 8.5 1 12 1 12s0 3.5.5 5.1a2.7 2.7 0 0 0 1.9 1.9c1.7.5 8.6.5 8.6.5s6.9 0 8.6-.5a2.7 2.7 0 0 0 1.9-1.9C23 15.5 23 12 23 12zM9.8 15.4V8.6l5.8 3.4-5.8 3.4z"/></svg>',
    X: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.2 2H21l-6.5 7.4L22 22h-6l-4.7-6.2L5.9 22H3.1l7-8-7.3-12h6.2l4.2 5.7L18.2 2zm-1 18h1.6L7.9 3.7H6.2L17.2 20z"/></svg>',
    Linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.9 8.5H3.6V21h3.3V8.5zM5.2 3a1.9 1.9 0 1 0 0 3.9 1.9 1.9 0 0 0 0-3.9zM21 13.8c0-3.3-1.8-4.9-4.2-4.9-1.9 0-2.8 1.1-3.2 1.8V8.5H10V21h3.3v-6.6c0-1.6.5-2.7 2-2.7s2 1.2 2 2.7V21H21v-7.2z"/></svg>',
  },
};

/* ------------------------------------------------------------- rich HTML */
// Runs over content HTML: keeps it 1:1 but wraps tables for mobile scrolling
// and upgrades <img> to <picture> with a WebP source.
function enhanceHtml(html) {
  if (!html) return '';
  // Editor content occasionally carries document-level tags; strip them textually
  // so cheerio cannot hoist a stray <title> into the real <head>.
  const cleaned = html
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi, '');
  const $ = cheerio.load('<div id="__r">' + cleaned + '</div>', { decodeEntities: false });

  // Only the hero may hold an H1; any inside body copy becomes an H2.
  $('#__r h1').each((i, el) => { el.tagName = 'h2'; });

  $('#__r img').each((i, el) => {
    const $i = $(el);
    const src = $i.attr('src');
    if (!src) return;
    const fileName = decodeURIComponent(String(src).split('/').pop().split('?')[0]);
    // the file was deleted from the media library; drop the broken reference
    // (and its wrapper, if the image was all it held)
    if (MISSING_IMAGES.has(fileName)) {
      const $fig = $i.closest('figure');
      if ($fig.length && !$fig.find('figcaption').text().trim()) $fig.remove(); else $i.remove();
      return;
    }
    if (!($i.attr('alt') || '').trim() && (SEO.alt || {})[fileName]) {
      $i.attr('alt', SEO.alt[fileName]);
    }
    let rel = src;
    try { rel = new URL(src, CFG.origin).pathname; } catch (e) { }
    $i.attr('src', rel);
    $i.attr('loading', 'lazy');
    $i.attr('decoding', 'async');
    $i.removeAttr('srcset'); $i.removeAttr('sizes');
    if (hasWebp(src) && $i.parent().is('picture') === false) {
      $i.wrap('<picture></picture>');
      $i.before('<source srcset="' + rel.replace(/\.(png|jpe?g)$/i, '.webp') + '" type="image/webp">');
    }
  });

  $('#__r table').each((i, el) => {
    const $t = $(el);
    $t.removeAttr('dir').removeAttr('style').removeAttr('border').removeAttr('width');
    if (!$t.parent().hasClass('table-scroll')) $t.wrap('<div class="table-scroll"></div>');
  });

  // outbound links get rel=noopener; internal ones are untouched
  $('#__r a[href]').each((i, el) => {
    const h = $(el).attr('href') || '';
    if (/^https?:\/\//i.test(h) && h.indexOf(CFG.origin) !== 0) {
      $(el).attr('rel', 'noopener').attr('target', '_blank');
    }
  });

  // Elementor left behind empty wrappers and spacer paragraphs; they only add
  // vertical gaps now that the new stylesheet controls rhythm.
  for (let pass = 0; pass < 3; pass++) {
    $('#__r div, #__r p, #__r span, #__r section').each((i, el) => {
      const $e = $(el);
      const text = $e.text().replace(/[\s ]/g, '');
      if (!text && !$e.find('img,video,iframe,svg,input,button,source,picture').length) $e.remove();
    });
  }

  // Links into new pages (tools/inbound-links.js). Article body only - the
  // sidebar renders first and is shared by every page, so it must never take
  // the link.
  if (CURRENT_REGION === 'article') {
    INBOUND.applyTo($, '#__r', CURRENT_PAGE, (to) => {
      const target = LIVE_PAGES.find(x => x.pathname === to);
      return target ? target.rawPathname : to;
    });
  }

  return dashesInHtml(FIX.fixHtml($('#__r').html(), CURRENT_PAGE));
}

/* --------------------------------------------------------------- widgets */
function renderForm(block, page, idx) {
  const isHero = block.region === 'hero';
  const id = 'f' + idx;
  // Source placeholders read like "שם:" / "מספר טלפון:" - use them as the visible
  // label (colon trimmed) and drop the duplicate placeholder text.
  const fields = block.fields.map((f, i) => {
    const fid = id + '-' + i;
    const raw = (f.placeholder || f.label || f.name || '').trim();
    const label = raw.replace(/[:：]\s*$/, '');
    const req = f.required ? ' required' : '';
    const name = esc(label || ('field' + i));
    const common = `id="${fid}" name="${name}"${attr('data-label', label)}${req}`;
    const lab = `<label for="${fid}">${esc(label)}${f.required ? ' <span aria-hidden="true">*</span>' : ''}</label>`;
    if (f.tag === 'textarea') return `<div class="field">${lab}<textarea ${common} rows="3"></textarea></div>`;
    const isPhone = f.type === 'number' || /טלפון|נייד|פלאפון/.test(label);
    const type = isPhone ? 'tel' : (f.type === 'email' ? 'email' : 'text');
    const extra = isPhone ? ' inputmode="tel" autocomplete="tel"'
      : (/^שם/.test(label) ? ' autocomplete="name"' : (/עיר|מאיפה/.test(label) ? ' autocomplete="address-level2"' : ''));
    return `<div class="field">${lab}<input type="${type}" ${common}${extra}></div>`;
  }).join('\n        ');

  const action = CFG.formEndpoint;
  // The form and its success panel are siblings: on submit the form is hidden
  // and the panel takes its place, so the visitor gets an unmistakable
  // confirmation instead of one small line of status text.
  return `<div class="lead-block">
      <form class="lead-form" data-lead${attr('action', action)} method="POST"${attr('data-whatsapp', CFG.whatsapp)}>
        <input type="hidden" name="subject" value="פנייה חדשה מהאתר - ${esc(page.title.split('|')[0].trim())}">
        <input type="hidden" name="t" value="">
        <input type="hidden" name="from_page" value="${esc(page.pathname)}">
        <input type="checkbox" name="botcheck" class="hp-field" tabindex="-1" autocomplete="off" aria-hidden="true">
        ${fields}
        <button type="submit" class="btn btn--primary btn--block">${esc(block.submit || 'שלח')}</button>
        <p class="form-status" role="status" aria-live="polite"></p>
        <p class="form-note">פנייתכם מגיעה אלינו ישירות. אנחנו חוזרים בדרך כלל תוך שעה בשעות הפעילות.</p>
      </form>
      <div class="form-sent" role="status" aria-live="polite" hidden>
        <span class="form-sent__mark" aria-hidden="true">${ICON.check}</span>
        <h3>תודה שפניתם אלינו!</h3>
        <p class="form-sent__lead">מיד ניצור אתכם קשר.</p>
        <p class="form-sent__alt">ממהרים? אפשר להתקשר עכשיו:</p>
        <p class="form-sent__cta">
          ${CFG.phones.map(ph => `<a class="btn btn--ghost" href="tel:${escRaw(ph.tel)}">${ICON.phone}${esc(ph.name)} ${esc(ph.label)}</a>`).join('\n          ')}
        </p>
      </div>
    </div>`;
}

function renderFaq(block) {
  const items = block.items.map(it =>
    `<details class="faq-item">
          <summary>${esc(it.q)}</summary>
          <div class="faq-body">${enhanceHtml(it.a) || ''}</div>
        </details>`).join('\n        ');
  return `<div class="faq">\n        ${items}\n      </div>`;
}

function renderList(block) {
  const items = block.items.map(it => it.href
    ? `<li><a href="${esc(href(it.href))}">${esc(it.text)}</a></li>`
    : `<li class="is-plain">${esc(it.text)}</li>`).join('\n        ');
  return `<ul class="link-grid">\n        ${items}\n      </ul>`;
}

function renderButton(block) {
  const h = block.href || '#';
  const isTel = /^tel:/i.test(h);
  const cls = isTel ? 'btn btn--primary btn--lg' : 'btn btn--ghost';
  const icon = isTel ? ICON.phone : '';
  return `<p><a class="${cls}" href="${esc(href(h))}">${icon}${esc(block.text)}</a></p>`;
}

function renderVideo(block) {
  // YouTube: click-to-play facade. Nothing is requested from YouTube until the
  // visitor presses play, which keeps the page fast and avoids third-party
  // cookies on load.
  const yt = block.youtube || (block.iframe && /youtu/.test(block.iframe) ? block.iframe : null);
  if (yt) {
    const m = String(yt).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
    const id = m ? m[1] : null;
    if (id) {
      const thumb = `/assets/video/${id}.jpg`;
      const local = fs.existsSync(path.join(OUT, 'assets', 'video', id + '.jpg'));
      return `<div class="video-wrap video-facade" data-yt="${esc(id)}">
          <button type="button" class="video-play" aria-label="הפעלת הסרטון">
            ${local ? `<img src="${thumb}" alt="תצוגה מקדימה של סרטון התדמית של ${esc(CFG.siteName)}" width="480" height="360" loading="lazy" decoding="async">` : ''}
            <span class="video-play__btn" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
          </button>
        </div>`;
    }
  }
  if (block.iframe) {
    return `<div class="video-wrap"><iframe src="${esc(block.iframe)}" title="סרטון תדמית - ${esc(CFG.siteName)}" loading="lazy" allowfullscreen></iframe></div>`;
  }
  if (block.src) {
    let rel = block.src;
    try { rel = new URL(block.src, CFG.origin).pathname; } catch (e) { }
    return `<div class="video-wrap"><video controls preload="none"${attr('poster', block.poster)} playsinline><source src="${esc(rel)}" type="video/mp4">הדפדפן שלכם אינו תומך בהצגת וידאו.</video></div>`;
  }
  return '';
}

// Custom HTML widgets (price calculator, daily tip, comparison tables …).
// Preserved verbatim - only image paths and table wrappers are normalised.
let embedSeq = 0;
function renderRawHtml(block) {
  // Some widgets were pasted as whole documents. Strip the document-level tags
  // textually first - cheerio would otherwise hoist <title>/<meta> into <head>
  // and corrupt the page title.
  const cleaned = block.html
    .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, '')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi, '');
  const $ = cheerio.load('<div id="__h">' + cleaned + '</div>', { decodeEntities: false });
  $('#__h h1').each((i, el) => { el.tagName = 'h2'; }); // one H1 per page
  $('#__h table').each((i, el) => {
    if (!$(el).parent().hasClass('table-scroll')) $(el).wrap('<div class="table-scroll"></div>');
  });

  // These widgets carried whole-document stylesheets (`body { font-family: Arial }`
  // and friends) that leaked out and restyled the page. Scope them to this embed
  // and strip their font declarations so Assistant is inherited everywhere.
  // The "daily tip" widget filled #tipContent from JavaScript, so Googlebot saw
  // an empty element. Pre-render the first tip and today's date into the HTML;
  // the script still swaps in the date-based tip for visitors.
  const $tip = $('#__h #tipContent');
  if ($tip.length && !$tip.text().trim()) {
    const src = $('#__h script').map((i, el) => $(el).html() || '').get().join('\n');
    const m = src.match(/const\s+tips\s*=\s*\[([\s\S]*?)\]/);
    if (m) {
      const first = (m[1].match(/"([^"]{10,})"/) || m[1].match(/'([^']{10,})'/) || [])[1];
      if (first) $tip.text(first);
    }
    // #tipDate is left for the script: a date baked in at build time goes stale
    // the next day and would rewrite every page on each rebuild.
  }

  const scope = 'embed-' + (++embedSeq);
  $('#__h style').each((i, el) => {
    const raw = $(el).html() || '';
    const scoped = scopeCss(raw, '.' + scope);
    if (scoped) $(el).text(scoped); else $(el).remove();
  });

  return '<div class="embed ' + scope + '">' + dashesInHtml(FIX.fixHtml($('#__h').html(), CURRENT_PAGE)) + '</div>';
}

/* ------------------------------------------------------------ page render */
let CURRENT_PAGE = '';
let CURRENT_REGION = '';
function renderPage(page) {
  CURRENT_PAGE = page.pathname;
  CURRENT_REGION = '';
  const anchors = new Set();
  const headingIds = [];      // for the table of contents
  const isHome = page.pathname === '/';

  // assign stable ids to article headings so the TOC can link to them
  page.blocks.forEach(b => {
    if (b.type === 'heading' && b.level >= 2 && b.level <= 3 && b.region === 'article') {
      b._id = slugifyAnchor(b.text, anchors);
      headingIds.push({ id: b._id, text: b.text, level: b.level });
    }
  });

  let firstImage = true;

  function renderBlock(b, i) {
    CURRENT_REGION = b.region || '';
    switch (b.type) {
      case 'heading': {
        // A handful of source pages carry a second <h1> inside the article body.
        // Demote it to <h2> so each page has exactly one H1; the text is unchanged.
        let lvl = Math.min(Math.max(b.level, 1), 6);
        if (lvl === 1 && b.region !== 'hero') lvl = 2;
        const id = b._id ? ` id="${esc(b._id)}"` : '';
        const htext = FIX.fixText(b.text, CURRENT_PAGE);
        const inner = b.href ? `<a href="${esc(href(b.href))}">${esc(htext)}</a>` : esc(htext);
        return `<h${lvl}${id}>${inner}</h${lvl}>`;
      }
      case 'richtext':
        return enhanceHtml(b.html);
      case 'button':
        return renderButton(b);
      case 'image': {
        const eager = firstImage && b.region === 'hero';
        firstImage = false;
        const p = picture(b.src, b.alt, { width: b.width, height: b.height, eager });
        const inner = b.href ? `<a href="${esc(href(b.href))}">${p}</a>` : p;
        // No visible caption: the source had none, and echoing the alt text
        // below every image both duplicates it and reads oddly next to headings.
        return `<figure class="media">${inner}</figure>`;
      }
      case 'imagebox':
        return `<div class="imagebox">${picture(b.src, b.alt, {})}${b.title ? `<h3>${esc(b.title)}</h3>` : ''}${b.text ? `<p>${esc(b.text)}</p>` : ''}</div>`;
      case 'gallery':
        return `<div class="gallery">${b.images.map(im => picture(im.src, im.alt, {})).join('')}</div>`;
      case 'list':
        return renderList(b);
      case 'faq':
        return renderFaq(b);
      case 'toc': {
        if (!headingIds.length) return '';
        const items = headingIds.map(h =>
          `<li${h.level === 3 ? ' class="lvl-3"' : ''}><a href="#${esc(h.id)}">${esc(h.text)}</a></li>`).join('\n          ');
        return `<details class="toc">
        <summary>${ICON.list}${esc(b.label || 'תוכן עניינים')}</summary>
        <ol>
          ${items}
        </ol>
      </details>`;
      }
      case 'video':
        return renderVideo(b);
      case 'form':
        return renderForm(b, page, i);
      case 'html':
        return renderRawHtml(b);
      case 'unknown': {
        // The WordPress "archive posts" widget rendered client-side and came
        // through empty, leaving /בלוג/ with no post list at all.
        if (b.widget && b.widget.indexOf('archive-posts') === 0) {
          const posts = LIVE_PAGES.filter(x => x.templateKind === 'theme-main' &&
            x.pathname !== '/עמוד-תודה/' && x.pathname !== '/category/uncategorized/');
          if (!posts.length) return '';
          return `<ul class="post-list">${posts.map(x => {
            const t = (SEO.title[x.pathname] || x.title).split('|')[0].trim();
            const d = SEO.description[x.pathname] || x.description || '';
            return `<li>
              <a href="${escRaw(x.rawPathname)}"><h3>${esc(t)}</h3></a>
              ${d ? `<p>${esc(d)}</p>` : ''}
            </li>`;
          }).join('')}</ul>`;
        }
        return '';
      }
      default:
        return '';
    }
  }

  const hero = page.blocks.filter(b => b.region === 'hero');
  const article = page.blocks.filter(b => b.region === 'article');
  const cta = page.blocks.filter(b => b.region === 'cta');

  /* -- hero: H1 + lede on one side, the lead form card on the other -- */
  const h1Block = hero.find(b => b.type === 'heading' && b.level === 1);
  const heroFormIdx = hero.findIndex(b => b.type === 'form');
  const heroForm = heroFormIdx >= 0 ? hero[heroFormIdx] : null;
  const formHeading = heroFormIdx > 0 && hero[heroFormIdx - 1].type === 'heading' ? hero[heroFormIdx - 1] : null;

  const usedInHero = new Set();
  if (h1Block) usedInHero.add(h1Block);
  if (heroForm) usedInHero.add(heroForm);
  if (formHeading) usedInHero.add(formHeading);

  // The hero already carries both numbers by name, so the source's redundant
  // "call us now" heading + tel button pair is dropped (see content-fixes.js).
  FIX.droppedHeroBlocks(hero).forEach(b => usedInHero.add(b));

  // the lede is the first richtext right after the H1
  const h1Pos = hero.indexOf(h1Block);
  const ledeBlock = h1Pos >= 0 ? hero.slice(h1Pos + 1).find(b => b.type === 'richtext') : null;
  if (ledeBlock) usedInHero.add(ledeBlock);

  const heroRest = hero.filter(b => !usedInHero.has(b));

  // Pages with no H1 in the source (the 5 blog posts + 2 others): promote the
  // page title so every page has exactly one H1.
  const h1Html = h1Block
    ? `<h1>${esc(h1Block.text)}</h1>`
    : `<h1>${esc((page.title || '').split('|')[0].split(' - ')[0].trim() || CFG.siteName)}</h1>`;

  const heroAside = heroForm ? `<aside class="card card-pad card--sticky">
          <h2 class="form-title">${esc(formHeading ? formHeading.text : 'השאירו פרטים ונחזור אליכם')}</h2>
          <p class="form-sub">ייעוץ והצעת מחיר - ללא עלות וללא התחייבות.</p>
          ${renderForm(heroForm, page, 0)}
        </aside>` : '';

  const heroSection = `<section class="hero">
      <div class="wrap">
        <div class="hero-grid">
          <div>
            ${h1Html}
            ${ledeBlock ? `<div class="hero-lede">${enhanceHtml(ledeBlock.html)}</div>` : ''}
            <div class="hero-cta">
              ${CFG.phones.map((ph, i) => `<a class="btn btn--lg ${i === 0 ? 'btn--primary' : 'btn--ghost'}" href="tel:${escRaw(ph.tel)}">${ICON.phone}<span>${esc(ph.name)} <b>${esc(ph.label)}</b></span></a>`).join('\n              ')}
              <a class="btn btn--ghost btn--lg" href="https://wa.me/${escRaw(CFG.whatsapp)}" rel="noopener" target="_blank">${ICON.whatsapp}ווטסאפ</a>
            </div>
            <ul class="trust-row">
              <li>${ICON.check}מעל 20 שנות ניסיון</li>
              <li>${ICON.check}אחריות בכתב</li>
              <li>${ICON.check}פריסה ארצית</li>
              <li>${ICON.check}הצעת מחיר חינם</li>
            </ul>
          </div>
          ${heroAside}
        </div>
      </div>
    </section>`;

  const heroExtra = heroRest.length ? `<section class="section">
      <div class="wrap">
        ${heroRest.map(renderBlock).filter(Boolean).join('\n        ')}
      </div>
    </section>` : '';

  /* -- sidebar: mirrors the original 760px content + 360px aside layout.
        In the source the sidebar widgets are titled by button-styled labels;
        each label starts a new sidebar card. -- */
  function renderSidebar(blocks, extraCards) {
    if (!blocks.length && !extraCards) return '';
    const cards = [];
    let cur = null;
    const flush = () => { if (cur && cur.body.trim()) cards.push(cur); cur = null; };

    blocks.forEach((b, i) => {
      const isLabel = (b.type === 'button' && !b.href) ||
        (b.type === 'heading' && b.level <= 3);
      if (isLabel) { flush(); cur = { title: b.text, body: '' }; return; }
      // custom embeds (e.g. the daily tip) carry their own heading - give each
      // its own card instead of appending to the previous one
      if (b.type === 'html') { flush(); cur = { title: null, body: renderBlock(b, 900 + i) || '' }; flush(); return; }
      if (!cur) cur = { title: null, body: '' };
      if (b.type === 'form') {
        cur.body += `<p class="form-sub">נחזור אליכם עם הצעת מחיר מותאמת.</p>` + renderForm(b, page, 900 + i);
      } else {
        cur.body += renderBlock(b, 900 + i) || '';
      }
    });
    flush();

    return `<aside class="layout-side" aria-label="מידע נוסף ויצירת קשר">
          ${cards.map(c => `<section class="side-card">
            ${c.title ? `<h2 class="side-card__title">${esc(c.title)}</h2>` : ''}
            <div class="side-card__body">${c.body}</div>
          </section>`).join('\n          ')}
          ${extraCards || ''}
        </aside>`;
  }

  /* -- internal link mesh: the source site left 71 of 166 pages with no
        inbound links at all, so every page now surfaces a rotating set of
        related pages. -- */
  const mesh = LINK_MESH.map.get(page.pathname) || { cities: [], topics: [] };
  const linkCard = (title, items) => items.length ? `<section class="side-card">
            <h2 class="side-card__title">${esc(title)}</h2>
            <div class="side-card__body">
              <ul class="link-grid">${items.map(it =>
    `<li><a href="${escRaw(it.href)}">${esc(it.text)}</a></li>`).join('')}</ul>
            </div>
          </section>` : '';

  const meshHtml = linkCard('אזורי שירות נוספים', mesh.cities) +
    linkCard('מדריכים ושירותים', mesh.topics);

  const sidebarHtml = renderSidebar(cta, meshHtml);

  const articleSection = (article.length || sidebarHtml) ? `<section class="section">
      <div class="wrap">
        <div class="layout">
          <div class="layout-main">
            <div class="prose">
        ${article.map(renderBlock).filter(Boolean).join('\n        ')}
            </div>
          </div>
          ${sidebarHtml}
        </div>
      </div>
    </section>` : '';

  const ctaSection = '';

  /* ------------------------------------------------------ homepage layout */
  // The landing layout only rearranges blocks that already exist on the page.
  function renderHome() {
    const P = HOME.plan(page.blocks);
    const heroImg = HOME.HERO_PHOTO;
    const heroWebp = heroImg.replace(/\.(png|jpe?g)$/i, '.webp');

    const trust = P.trustList ? `<section class="hp-trust">
      <div class="wrap">
        ${P.trustHeading ? `<h2 class="hp-trust__title">${esc(FIX.fixText(P.trustHeading.text, CURRENT_PAGE))}</h2>` : ''}
        <ul class="hp-trust__grid">
          ${P.trustList.items.map((it, i) => `<li>
            <span class="hp-trust__icon">${ICON.trust[HOME.TRUST_ICONS[i % HOME.TRUST_ICONS.length]]}</span>
            <span class="hp-trust__text">${esc(it.text)}</span>
          </li>`).join('\n          ')}
        </ul>
      </div>
    </section>` : '';

    const services = P.servicesList ? `<section class="hp-services">
      <div class="wrap">
        <div class="hp-sec-head">
          <p class="hp-eyebrow">השירותים שלנו</p>
          ${P.servicesLabel ? `<h2>${esc(P.servicesLabel.text)}</h2>` : ''}
        </div>
        <ul class="hp-cards">
          ${P.servicesList.items.map(it => {
      const photo = it.href ? HOME.SERVICE_PHOTOS[decodeURIComponent(it.href)] : null;
      const style = photo
        ? ` style="background-image:linear-gradient(to top,rgba(14,17,22,.88) 0%,rgba(14,17,22,.35) 60%,rgba(14,17,22,.2) 100%),url('${encodeURI(photo)}')"`
        : '';
      return `<li class="hp-card${photo ? ' has-photo' : ''}"${style}>
            <a href="${escRaw(it.href || '#')}">
              <span>${esc(it.text)}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
          </li>`;
    }).join('\n          ')}
        </ul>
      </div>
    </section>` : '';

    const leadSection = (P.form || P.calc) ? `<section class="section" id="lead">
      <div class="wrap">
        <div class="hp-lead">
          <div class="card card-pad">
            ${P.formHeading ? `<h2 class="form-title">${esc(P.formHeading.text)}</h2>` : ''}
            <p class="form-sub">ייעוץ והצעת מחיר - ללא עלות וללא התחייבות.</p>
            ${P.form ? renderForm(P.form, page, 10) : ''}
          </div>
          <div>
            ${P.calcHeading ? `<h2>${esc(FIX.fixText(P.calcHeading.text, CURRENT_PAGE))}</h2>` : ''}
            ${P.calc ? renderBlock(P.calc, 11) : ''}
          </div>
        </div>
      </div>
    </section>` : '';

    const band = P.bandHeading ? `<section class="hp-band">
      <div class="wrap-narrow">
        <h2>${esc(FIX.fixText(P.bandHeading.text, CURRENT_PAGE))}</h2>
        ${P.bandText ? ((CURRENT_REGION = P.bandText.region || ''), enhanceHtml(P.bandText.html)) : ''}
        <p class="hp-band__cta">
          <a class="btn btn--primary btn--lg" href="tel:${escRaw(CFG.phones[0].tel)}">${ICON.phone}${esc(CFG.phones[0].name)} ${esc(CFG.phones[0].label)}</a>
          <a class="btn btn--ghost btn--lg" href="#lead">${esc(P.formHeading ? P.formHeading.text : 'השאירו פרטים')}</a>
        </p>
      </div>
    </section>` : '';

    const body = P.article.length ? `<section class="section">
      <div class="wrap-narrow"><div class="prose">
        ${P.article.map(renderBlock).filter(Boolean).join('\n        ')}
      </div></div>
    </section>` : '';

    const areas = P.areasList ? `<section class="section section--tint">
      <div class="wrap">
        ${P.areasLabel ? `<h2>${esc(P.areasLabel.text)}</h2>` : ''}
        <ul class="link-grid">${P.areasList.items.map(it =>
      `<li><a href="${escRaw(it.href || '#')}">${esc(it.text)}</a></li>`).join('')}</ul>
      </div>
    </section>` : '';

    // whatever the plan did not claim (warranty image, video, daily tip …)
    const extras = P.rest.length ? `<section class="section">
      <div class="wrap-narrow"><div class="prose">
        ${P.rest.map(renderBlock).filter(Boolean).join('\n        ')}
      </div></div>
    </section>` : '';

    const contact = P.contactForm ? `<section class="section section--tint">
      <div class="wrap-narrow">
        <div class="card card-pad">
          ${P.contactLabel ? `<h2 class="form-title">${esc(P.contactLabel.text)}</h2>` : ''}
          <p class="form-sub">נחזור אליכם עם הצעת מחיר מותאמת.</p>
          ${renderForm(P.contactForm, page, 12)}
        </div>
      </div>
    </section>` : '';

    return `<section class="hp-hero" style="background-image:linear-gradient(90deg,rgba(10,13,18,.94) 0%,rgba(10,13,18,.80) 42%,rgba(10,13,18,.50) 100%),url('${encodeURI(heroImg)}')">
      <div class="wrap hp-hero__inner">
        ${P.lede ? `<p class="hp-eyebrow">${esc(cheerio.load('<d>' + P.lede.html + '</d>')('d').text().trim())}</p>` : ''}
        <h1>${esc(FIX.fixText(P.h1 ? P.h1.text : page.title, CURRENT_PAGE))}</h1>
        <div class="hp-hero__cta">
          <a class="btn btn--primary btn--lg" href="#lead">${esc(P.formHeading ? P.formHeading.text : 'השאירו פרטים')}</a>
          ${CFG.phones.map(ph => `<a class="btn btn--outline btn--lg" href="tel:${escRaw(ph.tel)}">${ICON.phone}<span>${esc(ph.name)} <b>${esc(ph.label)}</b></span></a>`).join('\n          ')}
        </div>
      </div>
    </section>
    ${trust}
    ${services}
    ${leadSection}
    ${band}
    ${body}
    ${areas}
    ${extras}
    ${contact}`;
  }

  /* ------------------------------------------------------------- <head> */
  const canonical = page.canonical || (CFG.origin + page.rawPathname);
  const schemaTags = page.schema.map(withOrganization).map(s =>
    `<script type="application/ld+json">${JSON.stringify(dashesInSchema(s)).replace(/</g, '\\u003c')}</script>`).join('\n  ');

  const breadcrumbs = isHome ? '' : `<nav class="crumbs wrap" aria-label="מסלול ניווט">
      <ol>
        <li><a href="/">דף הבית</a></li>
        <li><span aria-current="page">${esc((page.title || '').split('|')[0].split(' - ')[0].trim())}</span></li>
      </ol>
    </nav>`;

  const navHtml = CFG.nav.map(item => {
    const active = item.href === page.pathname ? ' aria-current="page"' : '';
    if (!item.children) return `<li><a href="${esc(item.href)}"${active}>${esc(item.text)}</a></li>`;
    const kids = item.children.map(c =>
      `<li><a href="${esc(c.href)}"${c.href === page.pathname ? ' aria-current="page"' : ''}>${esc(c.text)}</a></li>`).join('');
    return `<li class="has-sub">
            <button type="button" aria-expanded="false">${esc(item.text)}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg></button>
            <ul class="subnav">${item.href && item.href !== '#' ? `<li><a href="${esc(item.href)}">${esc(item.text)} - כל האזורים</a></li>` : ''}${kids}</ul>
          </li>`;
  }).join('\n          ');

  const footerCol = (title, links) => `<div>
            <h3>${esc(title)}</h3>
            <ul>${links.map(l => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('')}</ul>
          </div>`;

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(SEO.title[page.pathname] || page.title)}</title>
${(SEO.description[page.pathname] || page.description) ? `<meta name="description" content="${esc(SEO.description[page.pathname] || page.description)}">` : ''}
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="${esc(SEO.robots[page.pathname] || page.robots || 'index, follow, max-snippet:-1, max-video-preview:-1, max-image-preview:large')}">
<meta name="google-site-verification" content="${esc(CFG.googleSiteVerification)}">
<meta property="og:locale" content="he_IL">
<meta property="og:type" content="${esc(page.ogType || 'article')}">
<meta property="og:title" content="${esc(SEO.title[page.pathname] || page.ogTitle || page.title)}">
${(SEO.description[page.pathname] || page.ogDescription || page.description) ? `<meta property="og:description" content="${esc(SEO.description[page.pathname] || page.ogDescription || page.description)}">` : ''}
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${esc(CFG.siteName)}">
${page.ogImage ? `<meta property="og:image" content="${esc(page.ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${esc(CFG.favicons.ico32)}" sizes="32x32">
<link rel="icon" href="${esc(CFG.favicons.ico192)}" sizes="192x192">
<link rel="apple-touch-icon" href="${esc(CFG.favicons.apple180)}">
<meta name="theme-color" content="#ff8f00">
<link rel="preload" href="/assets/fonts/2sDcZGJYnIjSi6H75xkzamW5O7w.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/fonts/assistant.css">
<link rel="stylesheet" href="/assets/css/site.css?v=${CSS_V}">
${schemaTags}
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${CFG.gtmId}');</script>
</head>
<body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${CFG.gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<a class="skip-link" href="#main">דילוג לתוכן הראשי</a>

<header class="site-header">
  <div class="wrap header-bar">
    <a class="brand" href="/" aria-label="${esc(CFG.siteName)} - לדף הבית">
      ${picture(CFG.logo, CFG.siteName + ' - ' + CFG.tagline, { width: 300, height: 210, eager: true })}
    </a>
    <nav class="nav" id="primary-nav" aria-label="תפריט ראשי">
      <ul>
          ${navHtml}
      </ul>
    </nav>
    <div class="header-actions">
      <a class="tel-btn" href="tel:${esc(CFG.phones[0].tel)}">${ICON.phone}<span>${esc(CFG.phones[0].label)}</span></a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-nav" aria-label="פתיחת תפריט">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
    </div>
  </div>
</header>

${breadcrumbs}

<main id="main">
${isHome ? renderHome() : `    ${heroSection}
    ${heroExtra}
    ${articleSection}
    ${ctaSection}`}
</main>

<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        ${picture(CFG.logo, CFG.siteName, { width: 300, height: 210 })}
        <p>איטום ותיקון גגות בפריסה ארצית, מעל 20 שנות ניסיון. עבודה מקצועית עם אחריות בכתב.</p>
        <div class="social">
          ${CFG.social.map(s => `<a href="${esc(s.href)}" rel="noopener" target="_blank" aria-label="${esc(s.name)}">${ICON.social[s.name] || ''}</a>`).join('')}
        </div>
      </div>
      ${footerCol('החברה', CFG.footer.company)}
      ${footerCol('השירותים שלנו', CFG.footer.services)}
      ${footerCol('אזורי שירות', CFG.footer.areas)}
      <div>
        <h3>יצירת קשר</h3>
        <ul class="footer-contact">
          ${CFG.phones.map(p => `<li>${ICON.phone}<a href="tel:${esc(p.tel)}">${esc(p.label)}</a></li>`).join('')}
          <li>${ICON.mail}<a href="mailto:${esc(CFG.email)}">${esc(CFG.email)}</a></li>
          <li>${ICON.whatsapp}<a href="https://wa.me/${esc(CFG.whatsapp)}" rel="noopener" target="_blank">שליחת הודעה בווטסאפ</a></li>
        </ul>
        <p style="margin-top:.9rem"><a href="${esc(CFG.reviewsUrl)}" rel="noopener" target="_blank">ראו ביקורות על אלוף הגגות באיזי</a></p>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} ${esc(CFG.siteName)}. כל הזכויות שמורות.</span>
      <nav aria-label="קישורים משפטיים">
        ${CFG.footer.legal.map(l => `<a href="${esc(l.href)}">${esc(l.text)}</a>`).join('')}
      </nav>
    </div>
  </div>
</footer>

<div class="callbar">
  <a class="btn btn--primary" href="tel:${esc(CFG.phones[0].tel)}">${ICON.phone}חייגו עכשיו</a>
  <a class="btn btn--ghost" href="https://wa.me/${esc(CFG.whatsapp)}" rel="noopener" target="_blank">${ICON.whatsapp}ווטסאפ</a>
</div>

<button class="a11y-btn" type="button" aria-expanded="false" aria-controls="a11y-panel" aria-label="פתיחת תפריט נגישות">${ICON.a11y}</button>
<div class="a11y-panel" id="a11y-panel" role="dialog" aria-label="הגדרות נגישות">
  <h2>הגדרות נגישות</h2>
  <div class="a11y-actions">
    <button class="a11y-opt" type="button" data-action="font-up">הגדלת טקסט</button>
    <button class="a11y-opt" type="button" data-action="font-down">הקטנת טקסט</button>
    <button class="a11y-opt" type="button" data-mode="contrast" aria-pressed="false">ניגודיות גבוהה</button>
    <button class="a11y-opt" type="button" data-mode="dark" aria-pressed="false">מצב כהה</button>
    <button class="a11y-opt" type="button" data-mode="links" aria-pressed="false">הדגשת קישורים</button>
    <button class="a11y-opt" type="button" data-mode="readable" aria-pressed="false">גופן קריא</button>
    <button class="a11y-opt" type="button" data-mode="bigspace" aria-pressed="false">ריווח מוגדל</button>
    <button class="a11y-opt" type="button" data-mode="nomotion" aria-pressed="false">עצירת אנימציות</button>
    <button class="a11y-opt a11y-reset" type="button" data-action="reset">איפוס הגדרות</button>
  </div>
  <a class="a11y-statement" href="/הצהרת-נגישות/">להצהרת הנגישות המלאה</a>
</div>

<script src="/assets/js/site.js?v=${JS_V}" defer></script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ write */
fs.mkdirSync(path.join(OUT, 'assets/css'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'assets/js'), { recursive: true });
fs.copyFileSync('src/css/site.css', path.join(OUT, 'assets/css/site.css'));
fs.copyFileSync('src/send.php', path.join(OUT, 'send.php'));
fs.copyFileSync('src/js/site.js', path.join(OUT, 'assets/js/site.js'));

let written = 0, skipped = [];
for (const page of pages) {
  if (REDIRECT_FROM.has(page.pathname)) { skipped.push(page.pathname); continue; }
  const rel = page.pathname.replace(/^\//, '').replace(/\/$/, '');
  const dir = rel ? path.join(OUT, rel) : OUT;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), renderPage(page), 'utf8');
  written++;
}

// change log for the content repairs
const byKind = {};
FIX.log.forEach(e => { (byKind[e.kind] = byKind[e.kind] || []).push(e); });
console.log('');
console.log('content repairs applied:');
Object.entries(byKind).forEach(([k, v]) => {
  console.log('  ' + k + ': ' + v.length);
  const seen = new Set();
  v.forEach(e => {
    const key = e.page + e.before;
    if (seen.has(key)) return; seen.add(key);
    console.log('     ' + e.page + '  |  ' + e.before + '  ->  ' + e.after);
  });
});
fs.writeFileSync('_source/content-fixes.json', JSON.stringify(FIX.log, null, 2));

// every link into a new page must have landed; otherwise stop the build
const inboundCount = INBOUND.assertAllApplied(new Set(LIVE_PAGES.map(p => p.pathname)));
console.log('');
console.log('inbound links to new pages:', inboundCount);
console.log('pages written:', written);
console.log('redirected instead of written:', skipped.length, skipped);
