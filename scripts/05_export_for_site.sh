#!/usr/bin/env bash
# Package web/ + data/built/ into dist/atlas/ for public/atlas/ or atlas/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/dist/atlas"
MARKER='window.ATLAS_BASE_PATH = window.ATLAS_BASE_PATH || "";'
BUNDLE='window.ATLAS_BASE_PATH = window.ATLAS_BASE_PATH || "./";'

rm -rf "$DEST"
mkdir -p "$DEST/js" "$DEST/css" "$DEST/data/built"

cp "$ROOT/web/index.html" "$DEST/index.html"
cp "$ROOT/web/css/style.css" "$DEST/css/style.css"
cp "$ROOT/web/js/app.js" "$ROOT/web/js/router.js" "$ROOT/web/js/atlas-api.js" "$DEST/js/"
cp "$ROOT/lib/engine.mjs" "$DEST/js/engine.mjs"
cp "$ROOT/data/built/"*.json "$ROOT/data/built/"*.geojson "$DEST/data/built/"

python3 - "$DEST/index.html" "$MARKER" "$BUNDLE" <<'PY'
import pathlib, sys
path, marker, bundle = sys.argv[1:]
file = pathlib.Path(path)
text = file.read_text(encoding="utf-8")
if marker not in text:
    raise SystemExit("index.html is missing the ATLAS_BASE_PATH marker")
file.write_text(text.replace(marker, bundle, 1), encoding="utf-8")
PY

test -f "$DEST/js/engine.mjs"
test -f "$DEST/data/built/comuni-index.json"
test -f "$DEST/data/built/polities.json"
test -f "$DEST/data/built/archives.json"
test -f "$DEST/data/built/routes.json"
test -f "$DEST/data/built/provinces.geojson"
grep -q 'src="js/app.js"' "$DEST/index.html"
grep -q 'href="css/style.css"' "$DEST/index.html"
grep -q 'ATLAS_BASE_PATH = window.ATLAS_BASE_PATH || "./"' "$DEST/index.html"

echo "wrote dist/atlas"
