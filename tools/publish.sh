#!/bin/bash
# Rebuilds, verifies, and publishes both branches.
#
#   main   - the whole project (source, tooling, crawled original, build output)
#   deploy - only the built site, with index.html at the branch root, which is
#            what Hostinger clones into public_html
#
# Usage:  npm run publish -- "commit message"

set -e
cd "$(dirname "$0")/.."

MSG="${1:-Update site}"

echo "==> build"
node tools/build.js > /dev/null
node tools/seo-files.js > /dev/null

echo "==> verify"
if ! node tools/verify.js | grep -q "PASS  content"; then
  echo "verification failed - not publishing"
  node tools/verify.js | head -20
  exit 1
fi
node tools/verify.js | sed -n '3,13p'

echo "==> audit"
node tools/seo-audit.js | sed -n '3,9p'

echo "==> commit main"
git add -A
if git diff --cached --quiet; then
  echo "    (nothing to commit)"
else
  git commit -q -m "$MSG

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
fi
git push -q origin main

echo "==> publish deploy branch (build/ at root)"
SPLIT=$(git subtree split --prefix=build main)
git push -q --force origin "$SPLIT:refs/heads/deploy"

echo ""
echo "done."
echo "  main   $(git rev-parse --short main)"
echo "  deploy $(git rev-parse --short "$SPLIT")"
echo "  Hostinger will pull the deploy branch on its next webhook or manual Pull."
