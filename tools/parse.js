const fs = require('fs'), path = require('path'), cheerio = require('cheerio');
const ORIGIN = 'https://roofschamp.co.il';

const log = fs.readFileSync('_source/crawl.log', 'utf8').trim().split('\n')
  .map(l => { const [name, code, url, slug] = l.split('\t'); return { name, code, url, slug }; });

const CONTAINERS = new Set(['theme-post-content.default', 'template.default']);
const SKIP = new Set(['spacer.default', 'divider.default']);

function parsePage(entry) {
  const html = fs.readFileSync(path.join('_source/html', entry.name + '.html'), 'utf8');
  const $ = cheerio.load(html, { decodeEntities: false });
  // Elementor single template, else the theme's default post template.
  let $main = $('.elementor-location-single').first();
  let templateKind = 'elementor-single';
  if (!$main.length) { $main = $('main.site-main').first(); templateKind = 'theme-main'; }
  if (!$main.length) { $main = $('main').first(); templateKind = 'main'; }

  const blocks = [];

  function absToRel(href) {
    if (!href) return href;
    if (href.startsWith('/')) return href;
    if (href.startsWith(ORIGIN)) return href.slice(ORIGIN.length) || '/';
    return href;
  }

  function cleanHtml($el) {
    const $c = $el.clone();
    $c.find('script, style').remove();
    $c.find('*').each((i, el) => {
      const attrs = el.attribs || {};
      const keep = {};
      for (const k of Object.keys(attrs)) {
        if (['href', 'src', 'alt', 'title', 'width', 'height', 'srcset', 'sizes', 'target', 'rel', 'colspan', 'rowspan'].includes(k)) keep[k] = attrs[k];
      }
      if (keep.href) keep.href = absToRel(keep.href);
      el.attribs = keep;
    });
    return $c.html();
  }

  function extract(wt, $w, source) {
    const $inner = $w.find('.elementor-widget-container').first();
    const $c = $inner.length ? $inner : $w;

    if (wt === 'theme-post-title.default') {
      const t = $c.text().replace(/\s+/g, ' ').trim();
      return t ? { type: 'heading', level: 1, text: t, source } : null;
    }
    if (wt === 'heading.default') {
      const $h = $c.find('h1,h2,h3,h4,h5,h6').first();
      const tag = $h.length ? $h[0].tagName.toLowerCase() : 'h2';
      const t = ($h.length ? $h : $c).text().replace(/\s+/g, ' ').trim();
      const link = $c.find('a').attr('href');
      return t ? { type: 'heading', level: Number(tag[1]) || 2, text: t, href: absToRel(link), source } : null;
    }
    if (wt === 'text-editor.default') {
      const h = cleanHtml($c);
      const bare = h ? h.replace(/<[^>]*>/g, '').replace(/\s|&nbsp;/g, '') : '';
      return bare ? { type: 'richtext', html: h.trim(), source } : null;
    }
    if (wt === 'button.default') {
      const $a = $c.find('a').first();
      const t = ($a.length ? $a : $c).text().replace(/\s+/g, ' ').trim();
      return t ? { type: 'button', text: t, href: absToRel($a.attr('href')), source } : null;
    }
    if (wt === 'image.default') {
      const $img = $c.find('img').first();
      if (!$img.length) return null;
      const $a = $c.find('a').first();
      return {
        type: 'image',
        src: $img.attr('src') || $img.attr('data-src') || null,
        alt: $img.attr('alt') || '',
        width: $img.attr('width') || null,
        height: $img.attr('height') || null,
        srcset: $img.attr('srcset') || null,
        href: $a.length ? absToRel($a.attr('href')) : null,
        source,
      };
    }
    if (wt === 'image-box.default') {
      const $img = $c.find('img').first();
      return {
        type: 'imagebox',
        src: $img.attr('src') || null,
        alt: $img.attr('alt') || '',
        title: $c.find('.elementor-image-box-title').text().replace(/\s+/g, ' ').trim(),
        text: $c.find('.elementor-image-box-description').text().replace(/\s+/g, ' ').trim(),
        source,
      };
    }
    if (wt === 'gallery.default') {
      const imgs = [];
      $c.find('img').each((i, el) => imgs.push({ src: $(el).attr('src') || $(el).attr('data-src'), alt: $(el).attr('alt') || '' }));
      return imgs.length ? { type: 'gallery', images: imgs, source } : null;
    }
    if (wt === 'icon-list.default') {
      const items = [];
      $c.find('.elementor-icon-list-item').each((i, el) => {
        const $li = $(el), $a = $li.find('a').first();
        const t = $li.find('.elementor-icon-list-text').text().replace(/\s+/g, ' ').trim() || $li.text().replace(/\s+/g, ' ').trim();
        if (t) items.push({ text: t, href: $a.length ? absToRel($a.attr('href')) : null });
      });
      return items.length ? { type: 'list', items, source } : null;
    }
    if (wt === 'toggle.default') {
      const items = [];
      $c.find('.elementor-toggle-item').each((i, el) => {
        const $it = $(el);
        const q = $it.find('.elementor-toggle-title').text().replace(/\s+/g, ' ').trim();
        const $ans = $it.find('.elementor-tab-content').first();
        const a = $ans.length ? cleanHtml($ans) : '';
        if (q) items.push({ q, a: (a || '').trim() });
      });
      return items.length ? { type: 'faq', items, source } : null;
    }
    if (wt === 'table-of-contents.default') {
      return { type: 'toc', label: $c.find('.elementor-toc__header-title').text().replace(/\s+/g, ' ').trim() || 'תוכן עניינים', source };
    }
    if (wt === 'video.default') {
      const $v = $c.find('video').first(), $s = $c.find('source').first(), $if = $c.find('iframe').first();
      // Elementor renders YouTube/Vimeo embeds client-side; the real URL only
      // exists in the widget's data-settings JSON.
      let youtube = null, vimeo = null;
      try {
        const st = JSON.parse($w.attr('data-settings') || '{}');
        if (st.youtube_url) youtube = st.youtube_url;
        if (st.vimeo_url) vimeo = st.vimeo_url;
      } catch (e) { /* no settings */ }
      return {
        type: 'video',
        src: $v.attr('src') || $s.attr('src') || null,
        iframe: $if.attr('src') || $if.attr('data-lazy-load') || null,
        youtube, vimeo,
        poster: $v.attr('poster') || null,
        source,
      };
    }
    if (wt === 'form.default') {
      const fields = [];
      $c.find('input, textarea, select').each((i, el) => {
        const $f = $(el), t = ($f.attr('type') || el.tagName).toLowerCase();
        if (['hidden', 'submit', 'button'].includes(t)) return;
        const id = $f.attr('id');
        fields.push({
          tag: el.tagName.toLowerCase(), type: t,
          name: $f.attr('name') || null,
          placeholder: $f.attr('placeholder') || null,
          required: $f.attr('required') != null,
          label: id ? ($c.find('label[for="' + id + '"]').text().replace(/\s+/g, ' ').trim() || null) : null,
        });
      });
      const st = $c.find('button[type=submit], input[type=submit]').first();
      return { type: 'form', fields, submit: (st.text().trim() || st.attr('value') || 'שלח'), source };
    }
    if (wt === 'html.default') {
      const raw = $c.html() || '';
      return raw.trim() ? { type: 'html', html: raw.trim(), source } : null;
    }
    return { type: 'unknown', widget: wt, text: $c.text().replace(/\s+/g, ' ').trim().slice(0, 200), source };
  }

  // Plain WordPress-editor content (no Elementor widgets): convert the raw
  // element stream into heading / richtext blocks, preserving document order.
  function rawHtmlToBlocks($container, source, region) {
    let buffer = [];
    const flush = () => {
      if (!buffer.length) return;
      const h = buffer.join('\n');
      const bare = h.replace(/<[^>]*>/g, '').replace(/\s|&nbsp;/g, '');
      if (bare) blocks.push({ type: 'richtext', html: h, source, region });
      buffer = [];
    };
    $container.children().each((i, el) => {
      const $el = $(el);
      const tag = el.tagName.toLowerCase();
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (/^h[1-6]$/.test(tag)) {
        flush();
        if (text) blocks.push({ type: 'heading', level: Number(tag[1]), text, source, region });
        return; // empty headings were Elementor spacers - drop them
      }
      const inner = cleanHtml($el.parent().length ? $el : $el);
      const outer = $.html($el);
      const bare = text.replace(/\s|&nbsp;/g, '');
      if (!bare && !$el.find('img,video,iframe').length) return; // empty spacer paragraph
      buffer.push(cleanOuter($el));
    });
    flush();
  }

  function cleanOuter($el) {
    const $c = $el.clone();
    $c.find('script, style').remove();
    const strip = (el) => {
      const attrs = el.attribs || {};
      const keep = {};
      for (const k of Object.keys(attrs)) {
        if (['href', 'src', 'alt', 'title', 'width', 'height', 'srcset', 'sizes', 'target', 'rel', 'colspan', 'rowspan'].includes(k)) keep[k] = attrs[k];
      }
      if (keep.href) keep.href = absToRel(keep.href);
      el.attribs = keep;
    };
    strip($c[0]);
    $c.find('*').each((i, el) => strip(el));
    return $.html($c);
  }

  function walk($el, source, region) {
    $el.children().each((i, child) => {
      const $child = $(child);
      const wt = $child.attr('data-widget_type');
      if (!wt) { walk($child, source, region); return; }
      if (SKIP.has(wt)) return;
      if (CONTAINERS.has(wt)) {
        const isTpl = wt === 'template.default';
        const nextSource = isTpl ? 'shared' : source;
        const nextRegion = isTpl ? 'cta' : 'article';
        // theme-post-content may hold either nested widgets or plain editor HTML
        if (!$child.find('[data-widget_type]').length) {
          const $inner = $child.find('.elementor-widget-container').first();
          rawHtmlToBlocks($inner.length ? $inner : $child, nextSource, nextRegion);
        } else {
          walk($child, nextSource, nextRegion);
        }
        return;
      }
      const b = extract(wt, $child, source);
      if (b) { b.region = region; blocks.push(b); }
    });
  }

  if (templateKind === 'elementor-single') {
    walk($main, 'page', 'hero');
  } else {
    // Theme template: entry title + plain editor content, no Elementor widgets.
    const $entry = $main.find('.entry-content, .post-content').first();
    const $body = $entry.length ? $entry : $main;
    rawHtmlToBlocks($body, 'page', 'article');
  }

  const meta = (sel, attr) => { const v = $(sel).attr(attr || 'content'); return v ? v.trim() : null; };
  const schema = [];
  $('script[type="application/ld+json"]').each((i, el) => {
    const t = $(el).html();
    if (t && t.trim()) { try { schema.push(JSON.parse(t)); } catch (e) { /* skip malformed */ } }
  });

  return {
    name: entry.name, url: entry.url, slug: entry.slug,
    pathname: decodeURIComponent(new URL(entry.url).pathname),
    rawPathname: new URL(entry.url).pathname,
    title: $('title').first().text().trim(),
    description: meta('meta[name="description"]'),
    canonical: meta('link[rel="canonical"]', 'href'),
    robots: meta('meta[name="robots"]'),
    ogTitle: meta('meta[property="og:title"]'),
    ogDescription: meta('meta[property="og:description"]'),
    ogImage: meta('meta[property="og:image"]'),
    ogType: meta('meta[property="og:type"]'),
    lang: $("html").attr("lang") || "he-IL", templateKind,
    schema, blocks,
  };
}

const pages = log.map(parsePage);
fs.writeFileSync('_source/pages.json', JSON.stringify(pages, null, 2));

const counts = {};
pages.forEach(p => p.blocks.forEach(b => { counts[b.type] = (counts[b.type] || 0) + 1; }));
console.log('pages parsed:', pages.length);
console.log('block types:', JSON.stringify(counts));
console.log('pages with h1:', pages.filter(p => p.blocks.some(b => b.type === 'heading' && b.level === 1)).length);
console.log('pages with faq:', pages.filter(p => p.blocks.some(b => b.type === 'faq')).length);
const unk = [...new Set(pages.flatMap(p => p.blocks.filter(b => b.type === 'unknown').map(b => b.widget)))];
console.log('unknown widgets:', unk.length ? unk : 'none');
