// Maps the ORIGINAL live site's visual layout: which blocks sit side by side.
// Used to find the real sidebar structure that the flat block stream lost.
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const URLS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'https://roofschamp.co.il/',
];

(async () => {
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.default.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  for (const url of URLS) {
    console.log('\n===== ' + decodeURIComponent(url) + ' =====');
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.evaluate(() => new Promise(r => setTimeout(r, 2500)));
    } catch (e) { console.log('  load failed: ' + e.message.slice(0, 60)); continue; }

    const rows = await page.evaluate(() => {
      const root = document.querySelector('.elementor-location-single') || document.querySelector('main');
      if (!root) return [];
      const out = [];

      function label(el) {
        const w = el.querySelector('[data-widget_type]');
        const txt = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 55);
        const widgets = [...el.querySelectorAll('[data-widget_type]')]
          .map(n => n.getAttribute('data-widget_type').replace('.default', ''));
        return { widgets: [...new Set(widgets)].slice(0, 5).join(','), txt };
      }

      // walk containers; report any whose direct element children sit side by side
      const stack = [root];
      while (stack.length) {
        const el = stack.shift();
        const kids = [...el.children].filter(c => {
          const r = c.getBoundingClientRect();
          return r.width > 40 && r.height > 20;
        });
        if (kids.length >= 2) {
          const rects = kids.map(k => k.getBoundingClientRect());
          // side by side = they overlap vertically but not horizontally
          let sideBySide = false;
          for (let i = 0; i < rects.length - 1; i++) {
            const a = rects[i], b = rects[i + 1];
            const vOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            const hOverlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            if (vOverlap > 40 && hOverlap < 5) { sideBySide = true; break; }
          }
          if (sideBySide) {
            out.push({
              container: el.className.split(/\s+/).slice(0, 3).join('.').slice(0, 60),
              top: Math.round(el.getBoundingClientRect().top + window.scrollY),
              cols: kids.map((k, i) => {
                const r = rects[i];
                const info = label(k);
                return {
                  x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
                  sticky: getComputedStyle(k).position + '/' + (getComputedStyle(k.firstElementChild || k).position),
                  widgets: info.widgets, txt: info.txt,
                };
              }),
            });
          }
        }
        for (const c of el.children) stack.push(c);
      }
      // de-duplicate nested repeats: keep outermost per top offset
      const seen = new Set();
      return out.filter(o => { const k = o.top + ':' + o.cols.length; if (seen.has(k)) return false; seen.add(k); return true; });
    });

    rows.forEach(r => {
      console.log('\n  [y=' + r.top + '] ' + r.container + '  (' + r.cols.length + ' side-by-side)');
      r.cols.forEach(c => console.log(
        `     x=${String(c.x).padStart(4)} w=${String(c.w).padStart(4)} h=${String(c.h).padStart(4)} pos=${c.sticky}  ${c.widgets}  | ${c.txt}`));
    });
    if (!rows.length) console.log('  (no side-by-side containers found)');
  }

  await browser.close();
})();
