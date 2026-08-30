#!/usr/bin/env bash
# Render Soliyog social templates to PNG.
#   ./render.sh                  -> render every *.html in this folder
#   ./render.sh openings-card-1080x1350.html
# Output goes to ./exports/<name>.png at 2x scale.
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p exports

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || CHROME="$(command -v google-chrome || command -v chromium || true)"
[ -n "$CHROME" ] || { echo "Chrome not found. Set \$CHROME."; exit 1; }

files=("$@")
[ ${#files[@]} -eq 0 ] && files=(*-*x*.html)

for f in "${files[@]}"; do
  base="${f%.html}"
  # dimensions = the last WIDTHxHEIGHT token anywhere in the filename
  dims="$(printf '%s' "$base" | grep -oE '[0-9]+x[0-9]+' | tail -1)"
  w="${dims%x*}"; h="${dims#*x}"
  [ -n "$dims" ] || { echo "skip $f — no WxH in name"; continue; }
  echo "→ $f  (${w}x${h})"
  "$CHROME" --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --allow-file-access-from-files \
    --force-device-scale-factor=2 \
    --window-size="${w},${h}" \
    --virtual-time-budget=6000 \
    --screenshot="exports/${base}.png" \
    "file://$(pwd)/${f}" 2>/dev/null
done

echo "Done → $(pwd)/exports/"
