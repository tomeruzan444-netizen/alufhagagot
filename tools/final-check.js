// End-to-end browser check across a wide sample: fonts, broken images,
// JS errors, sidebar presence, dropdown, and URL/metadata parity.
const fs = require('fs'), path = require('path');
const CFG = require('./site.config.js');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8181';

const pages = JSON.parse(fs.readFileSync('_source/pages.json', 'utf8'));
const skip = new Set(CFG.redirects.map(r => r.from));
const live = pages.filter(p => !skip.has(p.pathname));

// Long dashes are intentionally normalised to "-" site-wide.
const normDash = (v) => v == null ? v : String(v).replace(/[‐‑‒–—―−]/g, '-');

const N = Number(process.env.SAMPLE || 30);
const step = Math.max(1, Math.floor(live.length / N));
const sample = live.filter((_, i) => i % step === 0);

(async () => {
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.default.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
  });

  const bad = { fonts: [], images: [], errors: [], sidebar: [], meta: [], overflow: [] };
  let checked = 0, sidebarsFound = 0, imagesChecked = 0;

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  for (const p of sample) {
    const errs = [];
    const onErr = e => errs.push(String(e.message || e).slice(0, 100));
    page.on('pageerror', onErr);
    try {
      await page.goto(BASE + p.rawPathname, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
    } catch (e) {
      bad.errors.push(p.pathname + ' :: load failed');
      page.off('pageerror', onErr);
      continue;
    }

    const r = await page.evaluate(() => {
      // fonts actually rendered in visible content
      const fonts = new Set();
      document.querySelectorAll('main *').forEach(el => {
        if (!el.firstChild || el.firstChild.nodeType !== 3) return;
        if (!el.textContent.trim()) return;
        fonts.add(getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim());
      });
      const broken = [...document.querySelectorAll('img')]
        .filter(i => i.complete && i.naturalWidth === 0).map(i => i.getAttribute('src'));
      return {
        fonts: [...fonts],
        broken,
        imgCount: document.querySelectorAll('img').length,
        sidebar: document.querySelectorAll('.layout-side .side-card').length,
        hasSubnav: document.querySelectorAll('.has-sub .subnav a').length,
        title: document.title,
        desc: (document.querySelector('meta[name=description]') || {}).content || null,
        canonical: (document.querySelector('link[rel=canonical]') || {}).href || null,
        schema: document.querySelectorAll('script[type="application/ld+json"]').length,
        h1: document.querySelectorAll('h1').length,
        scrollW: document.documentElement.scrollWidth,
      };
    });
    page.off('pageerror', onErr);

    checked++;
    imagesChecked += r.imgCount;
    if (r.sidebar) sidebarsFound++;

    const nonAssistant = r.fonts.filter(f => f && f !== 'Assistant');
    if (nonAssistant.length) bad.fonts.push(p.pathname + ' :: ' + nonAssistant.join(', '));
    if (r.broken.length) bad.images.push(p.pathname + ' :: ' + r.broken.slice(0, 2).join(', '));
    if (errs.length) bad.errors.push(p.pathname + ' :: ' + errs[0]);
    if (r.scrollW > 1441) bad.overflow.push(p.pathname + ' :: ' + r.scrollW);
    if (r.title !== normDash(p.title)) bad.meta.push(p.pathname + ' :: title differs');
    if ((r.desc || null) !== normDash(p.description || null)) bad.meta.push(p.pathname + ' :: description differs');
    if (r.canonical !== (p.canonical || CFG.origin + p.rawPathname)) bad.meta.push(p.pathname + ' :: canonical differs');
    if (r.schema !== p.schema.length) bad.meta.push(p.pathname + ' :: schema count differs');
    if (r.h1 !== 1) bad.meta.push(p.pathname + ' :: h1 count = ' + r.h1);
    if (!r.hasSubnav) bad.meta.push(p.pathname + ' :: no dropdown submenu');
  }

  await browser.close();

  console.log('pages loaded in a real browser:', checked);
  console.log('images rendered:', imagesChecked);
  console.log('pages with a sidebar:', sidebarsFound + '/' + checked);
  console.log('');
  const rows = [
    ['fonts other than Assistant', bad.fonts],
    ['broken images', bad.images],
    ['JavaScript errors', bad.errors],
    ['horizontal overflow', bad.overflow],
    ['metadata / structure', bad.meta],
  ];
  for (const [label, list] of rows) {
    console.log((list.length ? 'FAIL' : 'PASS') + '  ' + label.padEnd(28) + (list.length ? list.length + ' issues' : 'clean'));
    list.slice(0, 5).forEach(x => console.log('        ' + x));
  }
})();
