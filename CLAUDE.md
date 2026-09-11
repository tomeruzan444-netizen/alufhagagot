# אלוף הגגות - roofschamp.co.il

Static rebuild of a WordPress site. Live on Hostinger, deployed from the
`deploy` branch of github.com/tomeruzan444-netizen/alufhagagot.

## Writing content - mandatory

**Every new article, and every rewrite of an existing one, follows
[docs/content-guide.md](docs/content-guide.md).** Read it before writing.

The non-negotiables from it:

- אלוף הגגות has **two founders: משה and מנחם טולדו.** New articles are
  written in the first person by מנחם, who presents himself as *one of* the
  founders - never as the only one, never in place of משה.
- **Existing content is not rewritten.** Never change the author, founder or
  identity on an existing page - pages in משה's voice stay his. Improvements
  to existing pages are small additions or point fixes, approved first.
  Rewrites, merges, deletions or a change of author only on explicit request.
- "אני" for judgement, "אנחנו" for work the crew did. Never "החברה" /
  "אלוף הגגות מציעה".
- **No fact about the founders, the business or a job unless it is marked ✅
  in the fact sheet** in the guide. Otherwise write `[לאשר עם מנחם: ...]` and
  leave the article as a draft.
- At least 3 of the "רק מנחם היה כותב את זה" elements per article.
- None of the banned stock phrases ("בוודאי!", "חומרים איכותיים",
  "שאף טיפה לא תחדור", ...).
- **Before creating any page - including one the user explicitly asks for -
  check it does not already exist:** `npm run find -- "topic"` (or a proposed
  `/slug/`), in a few phrasings. It matches Hebrew variants a plain search
  misses (גג/גגות, בטון/מבטון, קרית/קריית). If a page on the topic exists, do
  not create a second one: report it and propose expanding the existing page
  (additively, with approval). If the topic is only a section of a page, stop
  and ask.
- **Every new content page is 800-1,100 words** of the article itself (H1,
  lede, body, FAQ - not menu, sidebar, form or footer), measured with
  `npm run words -- <draft file or /slug/>`. Never pad to reach it: short of
  800 means going back to Menachem for more material, or the topic is a
  section of an existing page. Utility pages (contact, thank-you, legal) are
  exempt, and existing pages are not rewritten to reach the range.
- No new city page without something true and local to say. Never a `-2` URL.
- **Every new page gets inbound links from the 1-3 most relevant existing
  pages**, in the body copy, with context. Prefer linking words that already
  exist (no copy change); a new sentence only when approved. Record each one
  in `tools/inbound-links.js` - the build fails if a rule stops matching.
- Run the pre-publish checklist at the end of the guide.

When Menachem confirms a fact, update the fact sheet and add a line to the
guide's version history.

## Site rules

- **Never change an existing URL.** They are percent-encoded Hebrew slugs that
  Google has indexed; a changed slug is a 404 and lost ranking.
- Content, titles and descriptions are preserved from the original site.
  Deliberate changes live in `tools/seo-overrides.js` and
  `tools/content-fixes.js` so they are reviewable, never inline edits.
- Only the plain hyphen `-` in copy. Long dashes are normalised at build time.

## Workflow

```
npm run find -- "topic"   # does the site already have a page on this?
npm run words -- draft.md # article length (new pages: 800-1,100)
npm run check     # build + verify against the original + SEO audit
npm run publish -- "commit message"   # verify, commit, push main + deploy
```

`publish` refuses to push if verification fails.

**Never run `npm run publish` to test anything** - it pushes to the live site.
Test with `npm run check` (or `node tools/build.js`), which never pushes. A
test that runs the real publish to see whether a guard fires will publish
whenever the guard does not fire; that is how test content once went live. Hostinger auto-deploys the
`deploy` branch within about 15 seconds. Hostinger's CDN caches HTML and 301s
for up to an hour; test with a `?cb=` cache-buster.

`node tools/live-check.js https://roofschamp.co.il` checks the live site;
`node tools/googlebot-check.js https://roofschamp.co.il` checks crawlability.
