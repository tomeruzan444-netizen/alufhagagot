const fs = require('fs'), path = require('path'), cheerio = require('cheerio'), crypto = require('crypto');
const ORIGIN = 'https://roofschamp.co.il';

const log = fs.readFileSync('_source/crawl.log', 'utf8').trim().split('\n')
  .map(l => { const [name, code, url, slug] = l.split('\t'); return { name, code, url, slug }; });

const pages = [];
for (const e of log) {
  const html = fs.readFileSync(path.join('_source/html', e.name + '.html'), 'utf8');
  const $ = cheerio.load(html);

  const meta = (sel, attr = 'content') => { const v = $(sel).attr(attr); return v ? v.trim() : null; };

  // JSON-LD schema blocks
  const schema = [];
  $('script[type="application/ld+json"]').each((i, el) => {
    const t = $(el).html();
    if (t && t.trim()) { try { schema.push(JSON.parse(t)); } catch (err) { schema.push({ __unparsed: t.trim() }); } }
  });

  // main content container (Elementor)
  let $main = $('main').first();
  if (!$main.length) $main = $('.elementor').first();
  if (!$main.length) $main = $('body');

  // headings in document order
  const headings = [];
  $main.find('h1,h2,h3,h4,h5,h6').each((i, el) => {
    headings.push({ tag: el.tagName.toLowerCase(), text: $(el).text().replace(/\s+/g, ' ').trim() });
  });

  // images (site-hosted only)
  const images = new Set();
  $('img').each((i, el) => {
    for (const a of ['src', 'data-src']) {
      const v = $(el).attr(a);
      if (v && v.startsWith(ORIGIN)) images.add(v.split('?')[0]);
    }
    const ss = $(el).attr('srcset') || $(el).attr('data-srcset');
    if (ss) ss.split(',').forEach(p => { const u = p.trim().split(/\s+/)[0]; if (u && u.startsWith(ORIGIN)) images.add(u.split('?')[0]); });
  });
  // background images in inline styles + video/source
  $('[style]').each((i, el) => {
    const m = ($(el).attr('style') || '').match(/url\((['"]?)(https:\/\/roofschamp\.co\.il[^'")]+)\1\)/g) || [];
    m.forEach(s => { const u = s.match(/url\((['"]?)(.*?)\1\)/)[2]; images.add(u.split('?')[0]); });
  });
  $('source[src],video[src],source[srcset]').each((i, el) => {
    const v = $(el).attr('src') || $(el).attr('srcset');
    if (v && v.startsWith(ORIGIN)) images.add(v.split('?')[0]);
  });

  // internal links
  const links = new Set();
  $main.find('a[href]').each((i, el) => {
    let h = $(el).attr('href');
    if (!h) return;
    if (h.startsWith('/')) h = ORIGIN + h;
    if (h.startsWith(ORIGIN)) links.add(h.split('#')[0]);
  });

  // nav + footer links (site-wide structure)
  const navLinks = [];
  $('header a[href], nav a[href]').each((i, el) => {
    navLinks.push({ text: $(el).text().replace(/\s+/g, ' ').trim(), href: $(el).attr('href') });
  });

  pages.push({
    name: e.name, url: e.url, slug: e.slug,
    title: $('title').first().text().trim(),
    description: meta('meta[name="description"]'),
    canonical: meta('link[rel="canonical"]', 'href'),
    robots: meta('meta[name="robots"]'),
    ogTitle: meta('meta[property="og:title"]'),
    ogDescription: meta('meta[property="og:description"]'),
    ogImage: meta('meta[property="og:image"]'),
    ogType: meta('meta[property="og:type"]'),
    twitterCard: meta('meta[name="twitter:card"]'),
    h1: $main.find('h1').first().text().replace(/\s+/g, ' ').trim() || null,
    headings, schema,
    images: [...images],
    internalLinks: [...links],
    navLinks,
    lang: $('html').attr('lang') || null,
    dir: $('html').attr('dir') || null,
    bytes: html.length,
    textLength: $main.text().replace(/\s+/g, ' ').trim().length,
  });
}

fs.writeFileSync('_source/manifest.json', JSON.stringify(pages, null, 2));

const allImages = new Set(); pages.forEach(p => p.images.forEach(i => allImages.add(i)));
fs.writeFileSync('_source/images.txt', [...allImages].sort().join('\n'));

console.log('pages:', pages.length);
console.log('unique site images/media:', allImages.size);
console.log('missing title:', pages.filter(p => !p.title).length);
console.log('missing description:', pages.filter(p => !p.description).length);
console.log('missing h1:', pages.filter(p => !p.h1).length);
console.log('missing canonical:', pages.filter(p => !p.canonical).length);
console.log('pages with schema:', pages.filter(p => p.schema.length).length);
console.log('avg text length:', Math.round(pages.reduce((a, p) => a + p.textLength, 0) / pages.length));
