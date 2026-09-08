// Headless layout audit: finds elements wider than the viewport (horizontal
// overflow) and other responsive defects, across a set of representative pages.


const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8181';
const PATHS = process.argv.slice(2).length ? process.argv.slice(2) : [
  '/',
  '/איטום-גגות/',
  '/איטום-גגות-באורנית/',
  '/איטום-גגות-בגן-יבנה/',
  '/אזורי-שירות/',
  '/צרו-קשר/',
  '/חומרי-איטום/',
  '/הפרויקטים-של-אלוף-הגגות/',
];
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, dsf: 2, mobile: true },
  { name: 'tablet', width: 768, height: 1024, dsf: 2, mobile: true },
  { name: 'desktop', width: 1440, height: 900, dsf: 1, mobile: false },
];

(async () => {
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.default.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  const problems = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dsf, isMobile: vp.mobile });
    for (const p of PATHS) {
      try {
        await page.goto(BASE + encodeURI(p), { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.evaluate(() => new Promise(r => setTimeout(r, 350)));
      } catch (e) {
        console.log('  (skip ' + p + ' @' + vp.name + ': ' + String(e.message).slice(0, 60) + ')');
        continue;
      }
      const res = await page.evaluate((vw) => {
        const doc = document.documentElement;
        const out = {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          offenders: [],
          smallTapTargets: 0,
          smallText: 0,
        };
        {
          const all = document.querySelectorAll('body *');
          for (const el of all) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            // element sticks out past the viewport on either side
            if (r.right > vw + 1 || r.left < -1) {
              const cs = getComputedStyle(el);
              if (cs.position === 'fixed') continue;
              // inside a deliberate horizontal scroller (e.g. wide pricing
              // tables) sticking out is the intended behaviour, not a defect
              let sc = el.parentElement, inScroller = false;
              while (sc && sc !== document.body) {
                const o = getComputedStyle(sc).overflowX;
                if (o === 'auto' || o === 'scroll') { inScroller = true; break; }
                sc = sc.parentElement;
              }
              if (inScroller) continue;
              const desc = el.tagName.toLowerCase() +
                (el.id ? '#' + el.id : '') +
                (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
              out.offenders.push({
                el: desc,
                width: Math.round(r.width),
                left: Math.round(r.left),
                right: Math.round(r.right),
                cssWidth: cs.width, minWidth: cs.minWidth, whiteSpace: cs.whiteSpace,
                parent: el.parentElement ? el.parentElement.tagName.toLowerCase() + (el.parentElement.className && typeof el.parentElement.className === 'string' ? '.' + el.parentElement.className.trim().split(/\s+/)[0] : '') : '',
              });
            }
          }
          // keep the widest few, deduped by selector
          const seen = new Set();
          out.offenders = out.offenders
            .sort((a, b) => b.width - a.width)
            .filter(o => { if (seen.has(o.el)) return false; seen.add(o.el); return true; })
            .slice(0, 8);
        }
        // tap targets & font size (mobile only checks, cheap to always compute)
        document.querySelectorAll('a, button, input, textarea, select').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32)) out.smallTapTargets++;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < 12) out.smallText++;
        });
        return out;
      }, vp.width);

      if (res.offenders.length) {
        problems.push({ vp: vp.name, path: p, scrollWidth: res.scrollWidth, viewport: vp.width, offenders: res.offenders });
      }
    }
    await page.close();
  }

  await browser.close();

  if (!problems.length) {
    console.log('PASS — no horizontal overflow on any tested page/viewport.');
  } else {
    console.log('HORIZONTAL OVERFLOW on ' + problems.length + ' page/viewport combos:\n');
    for (const pr of problems.slice(0, 6)) {
      console.log(`[${pr.vp} ${pr.viewport}px] ${pr.path}  -> scrollWidth ${pr.scrollWidth}px`);
      pr.offenders.forEach(o => console.log(
        `    ${o.el}  w=${o.width} left=${o.left} right=${o.right} css-width=${o.cssWidth} min-width=${o.minWidth} (in ${o.parent})`));
      console.log('');
    }
    const uniq = {};
    problems.forEach(p => p.offenders.forEach(o => { uniq[o.el] = (uniq[o.el] || 0) + 1; }));
    console.log('most frequent offenders:');
    Object.entries(uniq).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .forEach(([k, v]) => console.log('   ' + v + 'x  ' + k));
  }
})();
