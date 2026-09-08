#!/bin/bash
url="$1"
# slug = path portion, url-decoded not needed; use md5 of url as filename to stay safe
slug=$(printf '%s' "$url" | sed 's|https://roofschamp.co.il||; s|^/||; s|/$||')
[ -z "$slug" ] && slug="__home__"
name=$(printf '%s' "$slug" | md5sum | cut -c1-16)
out="_source/html/$name.html"
if [ -s "$out" ]; then exit 0; fi
code=$(curl -sS -m 60 -A "Mozilla/5.0 (compatible; SiteMigration/1.0)" -w '%{http_code}' -o "$out" "$url")
printf '%s\t%s\t%s\t%s\n' "$name" "$code" "$url" "$slug" >> _source/crawl.log
