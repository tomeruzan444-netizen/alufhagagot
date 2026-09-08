// Downloads every asset to build/wp-content/uploads/... keeping the exact original path
// (Hebrew filenames included) so that image URLs and Google Images rankings are preserved.
const fs = require('fs'), path = require('path'), https = require('https');
const ORIGIN = 'https://roofschamp.co.il';
const list = fs.readFileSync('_source/assets.txt', 'utf8').trim().split('\n').filter(Boolean);

function localPath(url) {
  const p = decodeURIComponent(new URL(url).pathname); // real Hebrew chars on disk
  return path.join('build', p.replace(/^\//, ''));
}

function fetch(url, dest, redirects = 0) {
  return new Promise((resolve) => {
    const encoded = new URL(url).origin + encodeURI(decodeURIComponent(new URL(url).pathname));
    https.get(encoded, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SiteMigration/1.0)' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
        res.resume();
        const next = res.headers.location.startsWith('http') ? res.headers.location : ORIGIN + res.headers.location;
        return resolve(fetch(next, dest, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return resolve({ url, ok: false, status: res.statusCode }); }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve({ url, ok: true, bytes: fs.statSync(dest).size })));
      out.on('error', (e) => resolve({ url, ok: false, status: e.message }));
    }).on('error', (e) => resolve({ url, ok: false, status: e.message }));
  });
}

(async () => {
  const results = [];
  const CONCURRENCY = 6;
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const url = list[idx++];
      const dest = localPath(url);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { results.push({ url, ok: true, cached: true }); continue; }
      results.push(await fetch(url, dest));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const failed = results.filter(r => !r.ok);
  const bytes = results.reduce((a, r) => a + (r.bytes || 0), 0);
  console.log('downloaded:', results.filter(r => r.ok).length + '/' + list.length);
  console.log('total size:', (bytes / 1048576).toFixed(1) + ' MB');
  if (failed.length) {
    console.log('FAILED (' + failed.length + '):');
    failed.forEach(f => console.log('  ' + f.status + '  ' + f.url));
  }
  fs.writeFileSync('_source/assets-result.json', JSON.stringify(results, null, 2));
})();
