/* Private monthly client reports.

     node tools/reports.js          (runs as part of `npm run build`)

   One file per report in content/reports/*.html. Each file is a page body:
   a <title>, its own <style>, and the markup - the same shape an artifact
   page has. The first line declares where it goes:

     <!-- path: /דוחות/ספטמבר-2026/ -->

   These pages are NOT part of the site:
     - they are not in tools/site-pages.js, so they never reach the sitemap,
       the sidebar link rotation, the SEO audit or the content checks;
     - nothing on the site links to them;
     - every one gets <meta name="robots" content="noindex, nofollow, ...">,
       and the directory gets an .htaccess with the same thing as an
       X-Robots-Tag header, which also covers requests Google makes for the
       file itself.

   robots.txt deliberately does NOT disallow the folder: a blocked URL cannot
   be read, so Google would never see the noindex - and a blocked-but-linked
   URL can still be listed. Letting it read the page and obey noindex is the
   combination that actually keeps it out. */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'content', 'reports');
const OUT = path.join(__dirname, '..', 'build');
const ROBOTS = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

const HTACCESS = `# Private client reports - never indexed, whatever a crawler asks for.
<IfModule mod_headers.c>
  Header set X-Robots-Tag "${ROBOTS}"
</IfModule>
`;

function build() {
  if (!fs.existsSync(SRC)) return 0;
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.html'));
  const dirs = new Set();
  for (const file of files) {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    const m = src.match(/<!--\s*path:\s*(\/[^\s>]*\/)\s*-->/);
    if (!m) throw new Error('content/reports/' + file + ': missing <!-- path: /.../ --> on the first line');
    const pathname = m[1];
    const title = (src.match(/<title>([\s\S]*?)<\/title>/) || [, 'דוח'])[1].trim();

    const rest = src.replace(m[0], '').trim();
    const split = rest.indexOf('<div class="wrap"');
    if (split < 0) throw new Error('content/reports/' + file + ': expected a <div class="wrap"> body');
    const head = rest.slice(0, split).replace(/<title>[\s\S]*?<\/title>/, '').trim();
    const body = rest.slice(split).trim();

    const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="${ROBOTS}">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
${head}
</head>
<body>
${body}
</body>
</html>
`;
    const dir = path.join(OUT, ...pathname.split('/').filter(Boolean));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    dirs.add(path.dirname(dir));
  }
  // one .htaccess per reports folder, so the header covers every file in it
  for (const dir of dirs) fs.writeFileSync(path.join(dir, '.htaccess'), HTACCESS, 'utf8');
  return files.length;
}

if (require.main === module) {
  const n = build();
  console.log('private reports written:', n, '(noindex + X-Robots-Tag, not in sitemap, not linked)');
}

module.exports = { build };
