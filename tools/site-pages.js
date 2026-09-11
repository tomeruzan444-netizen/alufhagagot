/* The page list every tool works from: the crawled WordPress pages, the
   approved additions to them (content-additions.js), and the new pages in
   content/pages/ (new-pages.js).

   Drafts are left out unless asked for - they never reach the live site. */

const fs = require('fs'), path = require('path');
const ADDITIONS = require('./content-additions.js');
const NEW = require('./new-pages.js');

const ROOT = path.join(__dirname, '..');

let cache = null;
/** The crawled pages exactly as the crawl saved them. */
function crawled() {
  if (!cache) cache = JSON.parse(fs.readFileSync(path.join(ROOT, '_source/pages.json'), 'utf8'));
  return cache;
}

function load({ drafts = false } = {}) {
  const base = crawled();
  return ADDITIONS.apply(base).concat(NEW.load(base, { drafts }));
}

module.exports = { crawled, load };
