/* Verifies a deployed host: every URL, the .htaccess rules, assets and headers.
   Usage: node tools/live-check.js https://host  */
const fs = require('fs'), https = require('https'), http = require('http');
const CFG = require('./site.config.js');

const BASE = (process.argv[2] || '').replace(/\/$/, '');
if (!BASE) { console.error('usage: node tools/live-check.js https://host'); process.exit(1); }

const pages = require('./site-pages.js').load();   // crawled + additions + published new pages
const REDIRECTS = CFG.redirects;
const SEO = require('./seo-overrides.js');
const NOINDEX = new Set(Object.keys(SEO.robots || {}));
const skip = new Set(REDIRECTS.map(r => r.from));
const live = pages.filter(p => !skip.has(p.pathname));

function req(url, { method = 'GET', redirect = false } = {}) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const r = lib.request(url, { method, headers: { 'User-Agent': 'SiteMigration-LiveCheck/1.0' } }, (res) => {
      let body = '';
      const limit = 400000;
      res.on('data', (c) => { if (body.length < limit) body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on('error', (e) => resolve({ status: 0, headers: {}, body: '', error: e.message }));
    r.setTimeout(30000, () => { r.destroy(); resolve({ status: 0, headers: {}, body: '', error: 'timeout' }); });
    r.end();
  });
}

const enc = (p) => '/' + p.split('/').filter(Boolean).map(encodeURIComponent).join('/') + '/';

(async () => {
  const fail = [];
  const note = (kind, detail) => fail.push({ kind, detail });

  /* ---- 1. every page returns 200 with the right title ---- */
  process.stdout.write('checking ' + live.length + ' pages');
  let ok = 0, checkedTitles = 0;
  const CONC = 8;
  let idx = 0;
  async function worker() {
    while (idx < live.length) {
      const p = live[idx++];
      const res = await req(BASE + p.rawPathname);
      if (res.status !== 200) { note('page not 200', p.pathname + ' -> ' + (res.status || res.error)); continue; }
      ok++;
      const m = res.body.match(/<title>([^<]*)<\/title>/);
      const expect = SEO.title[p.pathname] || p.title.replace(/[‐‑‒–—―−]/g, '-');
      if (m && m[1].trim() !== expect) note('title mismatch', p.pathname + ' :: ' + m[1].trim().slice(0, 50));
      else if (m) checkedTitles++;
      if (idx % 25 === 0) process.stdout.write('.');
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log('');
  console.log('  pages 200 OK: ' + ok + '/' + live.length + '   titles verified: ' + checkedTitles);

  /* ---- 2. the .htaccess 301s ---- */
  console.log('\nredirects (.htaccess):');
  for (const r of REDIRECTS) {
    const res = await req(BASE + enc(r.from), { method: 'HEAD' });
    const loc = res.headers.location || '';
    // Node reads headers as latin1; re-read as UTF-8 so a raw-UTF-8 Location
    // is understood, and keep going if the value is not decodable at all.
    let readable = Buffer.from(loc, 'latin1').toString('utf8');
    let decoded = readable;
    try { decoded = decodeURIComponent(readable); }
    catch (e) { decoded = readable + '   <-- MALFORMED (not valid percent-encoding)'; }
    const good = res.status === 301 && decoded.endsWith(r.to);
    console.log('  ' + (good ? 'OK  ' : 'FAIL') + ' ' + res.status + '  ' + r.from.slice(0, 42));
    console.log('        -> ' + (decoded || '(no Location)').slice(0, 90));
    if (!good) note('301 target wrong', r.from + ' -> ' + decoded.slice(0, 60));
  }

  /* ---- 3. assets ---- */
  console.log('\nassets:');
  const assets = [
    '/assets/css/site.css', '/assets/js/site.js',
    '/assets/fonts/assistant.css', '/assets/fonts/2sDcZGJYnIjSi6H75xkzamW5O7w.woff2',
    '/robots.txt', '/sitemap.xml',
    encodeURI(CFG.logo),
    encodeURI('/wp-content/uploads/2024/06/אלוף-הגגות.mp4'),
  ];
  for (const a of assets) {
    const res = await req(BASE + a, { method: 'HEAD' });
    const ct = res.headers['content-type'] || '';
    console.log('  ' + (res.status === 200 ? 'OK  ' : 'FAIL') + ' ' + res.status + '  ' + decodeURIComponent(a).slice(0, 52) + '  ' + ct.split(';')[0]);
    if (res.status !== 200) note('asset missing', a);
  }

  /* ---- 4. 404 page ---- */
  const nf = await req(BASE + '/this-page-does-not-exist-' + Date.now() + '/');
  const is404 = nf.status === 404 && /העמוד לא נמצא/.test(nf.body);
  console.log('\n404 handling: ' + (is404 ? 'OK' : 'FAIL') + '  status=' + nf.status +
    '  ourPage=' + (/העמוד לא נמצא/.test(nf.body) ? 'yes' : 'no'));
  if (!is404) note('404 page', 'status ' + nf.status);

  /* ---- 5. staging must not be indexable ---- */
  const root = await req(BASE + '/');
  const xr = root.headers['x-robots-tag'] || '';
  const isStaging = /hostingersite\.com/.test(BASE);
  console.log('\nX-Robots-Tag on ' + BASE.replace(/^https?:\/\//, '') + ': ' + (xr || '(none)'));
  if (isStaging && !/noindex/i.test(xr)) note('staging indexable', 'X-Robots-Tag missing - preview could be indexed');

  /* ---- 6. robots.txt is ours ---- */
  const rb = await req(BASE + '/robots.txt');
  const oursRobots = /Sitemap: https:\/\/roofschamp\.co\.il\/sitemap\.xml/.test(rb.body);
  console.log('robots.txt is ours: ' + (oursRobots ? 'yes' : 'NO - still the host default'));
  if (!oursRobots) note('robots.txt', 'not ours');

  /* ---- 7. sitemap ---- */
  const sm = await req(BASE + '/sitemap.xml');
  const n = (sm.body.match(/<loc>/g) || []).length;
  console.log('sitemap.xml urls: ' + n + (n === live.length - NOINDEX.size ? ' (expected)' : ' (expected ' + (live.length - NOINDEX.size) + ')'));

  /* ---- 8. noindex pages ---- */
  console.log('\nnoindex pages:');
  for (const p of NOINDEX) {
    const res = await req(BASE + enc(p));
    const has = /name="robots" content="noindex/.test(res.body);
    console.log('  ' + (has ? 'OK  ' : 'FAIL') + ' ' + p);
    if (!has) note('noindex missing', p);
  }

  /* ---- summary ---- */
  console.log('\n' + '='.repeat(52));
  if (!fail.length) console.log('ALL CHECKS PASSED');
  else {
    console.log(fail.length + ' ISSUES:');
    fail.slice(0, 20).forEach(f => console.log('  [' + f.kind + '] ' + f.detail));
  }
})();
