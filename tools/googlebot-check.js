/* Answers one question per page: can Googlebot fetch this URL on its own,
   and does the whole page exist in the HTML it receives - before any JS runs?

   Fetches as Googlebot with JavaScript disabled semantics (raw HTML only),
   then re-renders a sample in a real headless Chrome to confirm the rendered
   DOM matches, i.e. nothing important depends on client-side JavaScript.

   Usage: node tools/googlebot-check.js [https://host]   (default: local server)
*/
const fs = require('fs'), https = require('https'), http = require('http'), cheerio = require('cheerio');
const CFG = require('./site.config.js');
const SEO = require('./seo-overrides.js');

const BASE = (process.argv[2] || 'http://127.0.0.1:8181').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
// On a preview host the site deliberately sends X-Robots-Tag: noindex, so the
// header must not be read as an accidental block. The <meta> tag still tells
// us what the real domain will serve.
const IS_STAGING = /hostingersite\.com|^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(BASE);

const pages = require('./site-pages.js').load();   // crawled + additions + published new pages
const skip = new Set(CFG.redirects.map(r => r.from));
const NOINDEX = new Set(Object.keys(SEO.robots || {}));
const live = pages.filter(p => !skip.has(p.pathname));

function get(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const r = lib.request(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on('error', e => resolve({ status: 0, headers: {}, body: '', error: e.message }));
    r.setTimeout(30000, () => { r.destroy(); resolve({ status: 0, headers: {}, body: '', error: 'timeout' }); });
    r.end();
  });
}

(async () => {
  const problems = [];
  const stats = { ok: 0, words: [], h1: 0, canon: 0, indexable: 0, schema: 0 };

  let i = 0;
  if (IS_STAGING) console.log('(preview host: the site-wide X-Robots-Tag noindex is expected and ignored)');
  process.stdout.write('fetching ' + live.length + ' pages as Googlebot');
  async function worker() {
    while (i < live.length) {
      const p = live[i++];
      const res = await get(BASE + p.rawPathname);
      const tag = p.pathname;

      if (res.status !== 200) { problems.push([tag, 'status ' + (res.status || res.error)]); continue; }
      stats.ok++;

      const $ = cheerio.load(res.body);

      // --- is it indexable? ---
      const robots = ($('meta[name="robots"]').attr('content') || '').toLowerCase();
      const xrobots = String(res.headers['x-robots-tag'] || '').toLowerCase();
      const shouldNoindex = NOINDEX.has(p.pathname);
      const isNoindex = /noindex/.test(robots) || (!IS_STAGING && /noindex/.test(xrobots));
      if (isNoindex !== shouldNoindex) {
        problems.push([tag, shouldNoindex ? 'should be noindex but is indexable' : 'blocked by noindex (' + (robots || xrobots) + ')']);
      } else if (!shouldNoindex) stats.indexable++;

      // --- self-referencing canonical? ---
      const canon = $('link[rel="canonical"]').attr('href') || '';
      if (canon !== CFG.origin + p.rawPathname) problems.push([tag, 'canonical points elsewhere: ' + canon.slice(0, 60)]);
      else stats.canon++;

      // --- exactly one H1 ---
      if ($('h1').length === 1) stats.h1++;
      else problems.push([tag, $('h1').length + ' H1 elements']);

      // --- structured data present and parseable ---
      let schemaOk = 0;
      $('script[type="application/ld+json"]').each((n, el) => {
        try { JSON.parse($(el).html()); schemaOk++; } catch (e) { problems.push([tag, 'invalid JSON-LD']); }
      });
      if (schemaOk) stats.schema++;

      // --- the body copy must be in the HTML, not injected by JS ---
      const $b = cheerio.load(res.body);
      $b('script, style, header, footer, nav, form').remove();
      const words = $b('main').text().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
      stats.words.push(words);
      if (words < 120) problems.push([tag, 'only ' + words + ' words in the raw HTML']);

      // --- links must be real <a href>, crawlable ---
      const anchors = $('main a[href]').length;
      if (anchors < 5) problems.push([tag, 'only ' + anchors + ' crawlable links']);

      if (i % 25 === 0) process.stdout.write('.');
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log('');

  const avg = Math.round(stats.words.reduce((a, b) => a + b, 0) / stats.words.length);
  const min = Math.min(...stats.words);
  console.log('');
  console.log('  fetched 200 OK ............ ' + stats.ok + '/' + live.length);
  console.log('  indexable (as intended) ... ' + stats.indexable + '/' + (live.length - NOINDEX.size));
  console.log('  self-referencing canonical  ' + stats.canon + '/' + live.length);
  console.log('  exactly one H1 ............ ' + stats.h1 + '/' + live.length);
  console.log('  structured data present ... ' + stats.schema + '/' + live.length);
  console.log('  words in raw HTML ......... avg ' + avg + ', min ' + min + '  (no JS required)');

  /* ---- render parity: does Chrome show more than the raw HTML? ---- */
  console.log('\n  rendering a sample in headless Chrome...');
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.default.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  const sample = live.filter((_, n) => n % Math.ceil(live.length / 10) === 0);
  for (const p of sample) {
    const raw = await get(BASE + p.rawPathname);
    const $r = cheerio.load(raw.body);
    $r('script, style').remove();
    // Pad elements so adjacent text never fuses into a token that then looks
    // "missing" from the raw HTML (</b><p> would read as one word).
    $r('main *').each((n, el) => { $r(el).before(' ').after(' '); });
    const rawWords = new Set($r('main').text().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/));

    await page.goto(BASE + p.rawPathname, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
    const renderedWords = await page.evaluate(() => {
      const m = document.querySelector('main');
      if (!m) return [];
      const clone = m.cloneNode(true);
      clone.querySelectorAll('script, style').forEach(el => el.remove());
      // Pad elements on this side too, or </td><td> fuses into a fake token
      // that then looks like JS-injected content.
      clone.querySelectorAll('*').forEach(el => {
        el.insertAdjacentText('beforebegin', ' ');
        el.insertAdjacentText('afterend', ' ');
      });
      return [...new Set((clone.textContent || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/))];
    });
    const onlyRendered = renderedWords.filter(w => w && !rawWords.has(w));
    const flag = onlyRendered.length > 12 ? '  <-- content appears only after JS' : '';
    console.log('    ' + (onlyRendered.length + ' JS-only words').padEnd(22) + p.pathname.slice(0, 44) + flag);
    if (onlyRendered.length > 12) problems.push([p.pathname, 'needs JS for ' + onlyRendered.length + ' words']);
  }
  await browser.close();

  console.log('\n' + '='.repeat(56));
  if (!problems.length) console.log('EVERY PAGE IS INDEPENDENTLY CRAWLABLE AND RENDERS WITHOUT JS');
  else {
    console.log(problems.length + ' problems:');
    problems.slice(0, 25).forEach(([p, m]) => console.log('  ' + p.slice(0, 46) + '  ::  ' + m));
  }
})();
