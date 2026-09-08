// Generates a .webp sibling for every raster image, leaving originals untouched
// so the historical /wp-content/uploads/... URLs keep working for Google Images.
const fs = require('fs'), path = require('path');
const sharp = require('sharp');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

(async () => {
  const root = path.join('build', 'wp-content', 'uploads');
  if (!fs.existsSync(root)) { console.log('no uploads dir'); return; }
  const files = walk(root).filter(f => /\.(png|jpe?g)$/i.test(f));
  let origBytes = 0, webpBytes = 0, made = 0, failed = [];

  for (const f of files) {
    const dest = f.replace(/\.(png|jpe?g)$/i, '.webp');
    try {
      const src = fs.statSync(f).size;
      if (!fs.existsSync(dest)) {
        await sharp(f).webp({ quality: 82, effort: 5 }).toFile(dest);
        made++;
      }
      origBytes += src;
      webpBytes += fs.statSync(dest).size;
    } catch (e) {
      failed.push(f + ' :: ' + e.message);
    }
  }

  console.log('source images:', files.length);
  console.log('webp created:', made);
  console.log('original total:', (origBytes / 1048576).toFixed(2) + ' MB');
  console.log('webp total:   ', (webpBytes / 1048576).toFixed(2) + ' MB');
  console.log('saving:', (100 - webpBytes / origBytes * 100).toFixed(1) + '%');
  if (failed.length) { console.log('FAILED:'); failed.forEach(f => console.log('  ' + f)); }
})();
