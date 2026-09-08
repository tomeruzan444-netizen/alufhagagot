// Collects every site-hosted asset referenced anywhere (content, chrome, schema, head)
// and writes the download list, preserving the original /wp-content/uploads/... paths.
const fs = require('fs'), path = require('path'), cheerio = require('cheerio');
const ORIGIN = 'https://roofschamp.co.il';
const log = fs.readFileSync('_source/crawl.log', 'utf8').trim().split('\n').map(l => l.split('\t'));

const assets = new Set();
const add = (u) => {
  if (!u) return;
  u = u.trim();
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.startsWith('/')) u = ORIGIN + u;
  if (!u.startsWith(ORIGIN)) return;
  u = u.split('?')[0].split('#')[0];
  if (!/\/wp-content\/uploads\//.test(u)) return;
  assets.add(u);
};

for (const [name] of log) {
  const html = fs.readFileSync(path.join('_source/html', name + '.html'), 'utf8');
  const $ = cheerio.load(html);

  $('img').each((i, el) => {
    const $i = $(el);
    add($i.attr('src')); add($i.attr('data-src')); add($i.attr('data-lazy-src'));
    for (const a of ['srcset', 'data-srcset', 'data-lazy-srcset']) {
      const ss = $i.attr(a);
      if (ss) ss.split(',').forEach(p => add(p.trim().split(/\s+/)[0]));
    }
  });
  $('video, source, audio').each((i, el) => { add($(el).attr('src')); add($(el).attr('data-src')); });
  $('video').each((i, el) => add($(el).attr('poster')));
  $('link[rel*="icon"], link[rel="apple-touch-icon"]').each((i, el) => add($(el).attr('href')));
  $('meta[property="og:image"], meta[name="twitter:image"]').each((i, el) => add($(el).attr('content')));

  // inline style background images
  const styleUrls = html.match(/url\((['"]?)(https:\/\/roofschamp\.co\.il\/wp-content\/uploads\/[^'")]+)\1\)/g) || [];
  styleUrls.forEach(s => { const m = s.match(/url\((['"]?)(.*?)\1\)/); if (m) add(m[2]); });

  // JSON-LD image references (decode \/ and \uXXXX escapes before use)
  $('script[type="application/ld+json"]').each((i, el) => {
    const t = $(el).html() || '';
    (t.match(/https:\\?\/\\?\/roofschamp\.co\.il\\?\/wp-content\\?\/uploads\\?\/[^"',\s\]]+/g) || [])
      .forEach(u => {
        const decoded = u.replace(/\\\//g, '/')
          .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
        add(decoded);
      });
  });
}

const list = [...assets].sort();
fs.writeFileSync('_source/assets.txt', list.join('\n'));

const byExt = {};
list.forEach(u => { const e = (u.split('.').pop() || '').toLowerCase(); byExt[e] = (byExt[e] || 0) + 1; });
console.log('total unique assets:', list.length);
console.log('by extension:', JSON.stringify(byExt));
