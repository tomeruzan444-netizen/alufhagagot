// sitemap.xml, robots.txt, 404 page and host redirect configs.
const fs = require('fs'), path = require('path');
const CFG = require('./site.config.js');
const pages = JSON.parse(fs.readFileSync('_source/pages.json', 'utf8'));
const OUT = 'build';
const REDIRECT_FROM = new Set(CFG.redirects.map(r => r.from));

// A sitemap should only advertise indexable URLs.
const SEO = require('./seo-overrides.js');
const NOINDEX = new Set(Object.keys(SEO.robots || {}));
const live = pages.filter(p => !REDIRECT_FROM.has(p.pathname) && !NOINDEX.has(p.pathname));

/* ------------------------------------------------------------- sitemap.xml */
function lastmod(p) {
  const s = JSON.stringify(p.schema);
  const m = s.match(/"dateModified":"([^"]+)"/) || s.match(/"datePublished":"([^"]+)"/);
  return m ? m[1].slice(0, 10) : null;
}
function priority(p) {
  if (p.pathname === '/') return '1.0';
  const depth = p.pathname.split('/').filter(Boolean).length;
  if (/^\/(איטום-גגות|זיפות-גגות|איתור-נזילות|אזורי-שירות|צרו-קשר)\/$/.test(p.pathname)) return '0.9';
  return depth > 1 ? '0.6' : '0.8';
}

const urls = live.map(p => {
  const lm = lastmod(p);
  return `  <url>
    <loc>${CFG.origin}${p.rawPathname}</loc>${lm ? `
    <lastmod>${lm}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>${priority(p)}</priority>
  </url>`;
}).join('\n');

fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`, 'utf8');

/* -------------------------------------------------------------- robots.txt */
// Same policy as the WordPress robots.txt, minus the WP-only paths and with the
// stray encoding artefact on the Claude-Web line fixed.
const bots = ['OAI-SearchBot', 'ChatGPT-User', 'GPTBot'];
const botBlocks = bots.map(b => `User-agent: ${b}
Allow: /
Disallow: /search/
Disallow: /?s=
`).join('\n');

fs.writeFileSync(path.join(OUT, 'robots.txt'),
`${botBlocks}
User-agent: Google-Extended
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: *
Allow: /
Disallow: /search/
Disallow: /?s=

Sitemap: ${CFG.origin}/sitemap.xml
`, 'utf8');

/* ---------------------------------------------------------- host redirects */
const enc = (p) => '/' + p.split('/').filter(Boolean).map(encodeURIComponent).join('/') + '/';

// Cloudflare Pages / Netlify _redirects
const redirLines = CFG.redirects.flatMap(r => [
  `${enc(r.from)}  ${enc(r.to)}  301`,
  `${r.from}  ${r.to}  301`,
]);
fs.writeFileSync(path.join(OUT, '_redirects'),
  redirLines.join('\n') + '\n/*  /404.html  404\n', 'utf8');

// nginx
fs.writeFileSync('deploy/nginx-redirects.conf',
  CFG.redirects.map(r => `rewrite ^${enc(r.from).replace(/\/$/, '')}/?$ ${enc(r.to)} permanent;`).join('\n') + '\n', 'utf8');

// Apache
fs.writeFileSync(path.join(OUT, '.htaccess'),
`Options -Indexes
DirectoryIndex index.html

<IfModule mod_rewrite.c>
  RewriteEngine On
${CFG.redirects.map(r => `  RewriteRule ^${enc(r.from).replace(/^\//, '').replace(/\/$/, '')}/?$ ${enc(r.to)} [R=301,L]`).join('\n')}
</IfModule>

ErrorDocument 404 /404.html

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript image/svg+xml application/json
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType text/html "access plus 1 hour"
</IfModule>
`, 'utf8');

/* ------------------------------------------------------------------- 404 */
const sample = fs.readFileSync(path.join(OUT, 'איטום-גגות', 'index.html'), 'utf8');
const head = sample.slice(0, sample.indexOf('<main id="main">'));
const tail = sample.slice(sample.indexOf('</main>') + '</main>'.length);
const body = `<main id="main">
  <section class="section">
    <div class="wrap-narrow" style="text-align:center">
      <p style="font-size:4rem;font-weight:800;color:var(--brand);margin:0">404</p>
      <h1>העמוד לא נמצא</h1>
      <p class="hero-lede">ייתכן שהקישור השתנה או שהעמוד הוסר. אפשר לחזור לדף הבית או לפנות אלינו ישירות.</p>
      <p>
        <a class="btn btn--primary btn--lg" href="/">חזרה לדף הבית</a>
        <a class="btn btn--ghost btn--lg" href="tel:${CFG.phones[0].tel}">חייגו ${CFG.phones[0].label}</a>
      </p>
      <h2 style="margin-top:2.5rem">עמודים מבוקשים</h2>
      <ul class="link-grid" style="text-align:start">
        ${CFG.footer.services.map(s => `<li><a href="${s.href}">${s.text}</a></li>`).join('')}
      </ul>
    </div>
  </section>
</main>`;
const notFound = (head + body + tail)
  .replace(/<title>[^<]*<\/title>/, '<title>העמוד לא נמצא (404) | אלוף הגגות</title>')
  .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="העמוד המבוקש לא נמצא. חזרו לדף הבית של אלוף הגגות או צרו איתנו קשר.">')
  .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, follow">')
  .replace(/<link rel="canonical"[^>]*>\n?/, '')
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g, '');
fs.writeFileSync(path.join(OUT, '404.html'), notFound, 'utf8');

console.log('sitemap.xml urls:', live.length);
console.log('robots.txt, _redirects, .htaccess, deploy/nginx-redirects.conf, 404.html written');
