/* Builds the internal link mesh that the WordPress site never had.

   71 of 166 pages had zero inbound internal links - Google could only reach
   them through the sitemap, so they received almost no internal authority.

   Every page now carries two sidebar cards:
     - "אזורי שירות נוספים"  -> a rotating window over the city pages
     - "מדריכים ושירותים"    -> a rotating window over the topic pages
   The rotation is deterministic, so links are stable between builds, and the
   window walks the whole list, guaranteeing every page receives inbound links.
*/

const CITY_PER_PAGE = 12;
const TOPIC_PER_PAGE = 8;

// Pages that are linked from the header/footer already, or that should not
// collect extra inbound links.
const EXCLUDE = new Set([
  '/', '/עמוד-תודה/', '/category/uncategorized/',
  '/מדיניות-פרטיות/', '/הצהרת-נגישות/', '/תנאי-שימוש/',
]);

const isCity = (p) => /^\/(איטום-גגות-ב|איטום-ב)/.test(p) &&
  !/^\/(איטום-גגות-במרכז|איטום-גגות-בצפון|איטום-גגות-בדרום|איטום-גגות-בקריות)\//.test(p);

/** Short, readable label: "/איטום-גגות-בחדרה/" -> "חדרה". */
function label(page) {
  // The slug is the most reliable source - some H1s and titles disagree with
  // the page they sit on, so derive the label from the URL instead.
  let s = decodeURIComponent(page.pathname).replace(/^\/|\/$/g, '').replace(/-\d+$/, '');
  s = s.replace(/-/g, ' ').trim();
  const stripped = s
    .replace(/^איטום גגות ב/, '')
    .replace(/^איטום גגות /, '')
    .replace(/^איטום ב/, '');
  const out = (stripped || s).trim();
  // keep it short enough for a sidebar list
  return out.length > 30 ? out.slice(0, 29).trim() + '…' : out;
}

function build(livePages) {
  const cities = [], topics = [];
  livePages.forEach(p => {
    if (EXCLUDE.has(p.pathname)) return;
    (isCity(p.pathname) ? cities : topics).push({ href: p.rawPathname, text: label(p), path: p.pathname });
  });
  cities.sort((a, b) => a.path.localeCompare(b.path, 'he'));
  topics.sort((a, b) => a.path.localeCompare(b.path, 'he'));

  // Two pages can share a city name (e.g. "…-בבית-אריה" and "…-בבית-אריה-2").
  // Keep both reachable but make the labels tell them apart.
  [cities, topics].forEach(list => {
    const seen = new Map();
    list.forEach(item => {
      const n = (seen.get(item.text) || 0) + 1;
      seen.set(item.text, n);
      if (n > 1) item.text = item.text + ' (' + n + ')';
    });
  });

  const map = new Map();
  livePages.forEach((p, i) => {
    const pick = (list, count, stride) => {
      if (!list.length) return [];
      const out = [];
      const start = (i * stride) % list.length;
      for (let k = 0; k < Math.min(count, list.length); k++) {
        const item = list[(start + k) % list.length];
        if (item.path !== p.pathname) out.push(item);
      }
      return out;
    };
    map.set(p.pathname, {
      cities: pick(cities, CITY_PER_PAGE, CITY_PER_PAGE - 1),
      topics: pick(topics, TOPIC_PER_PAGE, TOPIC_PER_PAGE - 1),
    });
  });

  return { map, cities, topics };
}

module.exports = { build, isCity, label };
