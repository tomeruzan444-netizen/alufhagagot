# אלוף הגגות - roofschamp.co.il

Static rebuild of a WordPress site. Live on Hostinger, deployed from the
`deploy` branch of github.com/tomeruzan444-netizen/alufhagagot.

## Writing content - mandatory

**Every new article, and every rewrite of an existing one, follows
[docs/content-guide.md](docs/content-guide.md).** Read it before writing.

The non-negotiables from it:

- Written in the first person by **מנחם טולדו**. "אני" for judgement,
  "אנחנו" for work the crew did. Never "החברה" / "אלוף הגגות מציעה".
- **No fact about Menachem, the business or a job unless it is marked ✅ in
  the fact sheet** in the guide. Otherwise write `[לאשר עם מנחם: ...]` and
  leave the article as a draft.
- At least 3 of the "רק מנחם היה כותב את זה" elements per article.
- None of the banned stock phrases ("בוודאי!", "חומרים איכותיים",
  "שאף טיפה לא תחדור", ...).
- No new city page without something true and local to say. Never a `-2` URL.
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
npm run check     # build + verify against the original + SEO audit
npm run publish -- "commit message"   # verify, commit, push main + deploy
```

`publish` refuses to push if verification fails. Hostinger auto-deploys the
`deploy` branch within about 15 seconds. Hostinger's CDN caches HTML and 301s
for up to an hour; test with a `?cb=` cache-buster.

`node tools/live-check.js https://roofschamp.co.il` checks the live site;
`node tools/googlebot-check.js https://roofschamp.co.il` checks crawlability.
