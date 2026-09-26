#!/usr/bin/env bash
# Builds a static, relative-path snapshot of the running production server for the hosted preview.
# Usage: npm run build && npm run start, then: npm run snapshot [outDir]   (default: preview/)
set -euo pipefail
OUT="${1:-preview}"
BASE="${BASE_URL:-http://localhost:3100}"
rm -rf "$OUT" && mkdir -p "$OUT/photos"
cp -r .next/static "$OUT/assets-static"
mkdir -p "$OUT/assets" && mv "$OUT/assets-static" "$OUT/assets/static"
cp public/photos/*.jpg "$OUT/photos/"
# The preview host reserves paths starting with "_" and needs relative URLs.
curl -s "$BASE" \
  | sed -e 's#/_next/#assets/#g; s#"/photos/#"photos/#g; s#\\"/photos/#\\"photos/#g' \
        -e 's#<head>#<head><title>Wayfarer Preview</title>#' \
        -e 's#<script[^>]*polyfills[^>]*></script>##' > "$OUT/index.html"
sed -i 's#p="/_next/"#p="assets/"#' "$OUT"/assets/static/chunks/webpack-*.js
rm -f "$OUT"/assets/static/chunks/polyfills-*.js
echo "Snapshot written to $OUT/"
