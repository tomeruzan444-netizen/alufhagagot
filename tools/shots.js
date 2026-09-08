// Full-page screenshots at real device viewports.
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8181';

const JOBS = [
  { name: 'home-mobile', path: '/', w: 390, h: 844, mobile: true, full: true },
  { name: 'home-desktop', path: '/', w: 1440, h: 900, mobile: false, full: false },
  { name: 'city-mobile', path: '/איטום-גגות-באורנית/', w: 390, h: 844, mobile: true, full: false },
  { name: 'city-desktop', path: '/איטום-גגות-באורנית/', w: 1440, h: 900, mobile: false, full: false },
  { name: 'service-desktop', path: '/איטום-גגות/', w: 1440, h: 900, mobile: false, full: false },
  { name: 'nav-tablet', path: '/', w: 1100, h: 800, mobile: false, full: false },
];

(async () => {
  const puppeteer = await import('puppeteer-core');
  const browser = await puppeteer.default.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  for (const j of JOBS) {
    const page = await browser.newPage();
    await page.setViewport({ width: j.w, height: j.h, deviceScaleFactor: 2, isMobile: j.mobile, hasTouch: j.mobile });
    await page.goto(BASE + encodeURI(j.path), { waitUntil: 'networkidle2', timeout: 45000 });
    await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
    await page.screenshot({ path: '_shots/' + j.name + '.png', fullPage: !!j.full });
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      bodyW: document.body.getBoundingClientRect().width,
    }));
    console.log(j.name.padEnd(18) + j.w + 'px  ->  scrollWidth=' + m.scroll + ' clientWidth=' + m.client + ' bodyWidth=' + Math.round(m.bodyW));
    await page.close();
  }
  await browser.close();
})();
