#!/usr/bin/env bash
# Package the five static apps into dist/ for public hosting.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MARKER='window.ATLAS_BASE_PATH = window.ATLAS_BASE_PATH || "";'
BUNDLE='window.ATLAS_BASE_PATH = window.ATLAS_BASE_PATH || "./";'

package_app() {
  local src="$1"
  local dest="$2"
  shift 2
  rm -rf "$dest"
  mkdir -p "$dest/js" "$dest/css" "$dest/data/built"
  cp "$src/index.html" "$dest/index.html"
  cp "$src/css/style.css" "$dest/css/style.css"
  cp "$src/js/"*.js "$src/js/"*.mjs "$dest/js/"
  cp "$ROOT/lib/engine.mjs" "$dest/js/engine.mjs"
  cp "$ROOT/lib/suite.mjs" "$dest/js/suite.mjs"
  local name
  for name in "$@"; do
    cp "$ROOT/data/built/$name" "$dest/data/built/$name"
  done
  python3 - "$dest" "$MARKER" "$BUNDLE" <<'PY'
import pathlib, sys
dest, marker, bundle = sys.argv[1:]
root = pathlib.Path(dest)
replacements = [
    ("../web-parrocchie/", "../parrocchie/"),
    ("../web-cognomi/", "../cognomi/"),
    ("../web-ansc/", "../ansc/"),
    ("../web-caduti/", "../caduti/"),
    ("../web/", "../atlas/"),
]
index = root / "index.html"
text = index.read_text(encoding="utf-8")
if marker not in text:
    raise SystemExit(f"{index} is missing the ATLAS_BASE_PATH marker")
text = text.replace(marker, bundle, 1)
for old, new in replacements:
    text = text.replace(old, new)
index.write_text(text, encoding="utf-8")
for path in list((root / "js").glob("*.js")) + list((root / "js").glob("*.mjs")):
    body = path.read_text(encoding="utf-8")
    updated = body
    for old, new in replacements:
        updated = updated.replace(old, new)
    if updated != body:
        path.write_text(updated, encoding="utf-8")
PY
}

package_app "$ROOT/web" "$ROOT/dist/atlas" \
  comuni-index.json polities.json archives.json routes.json contacts.json dioceses.json \
  provinces.geojson parrocchie-db.json cognomi-db.json ansc-pec-db.json caduti-leva-db.json rail-catasti.json
package_app "$ROOT/web-parrocchie" "$ROOT/dist/parrocchie" \
  comuni-index.json polities.json archives.json routes.json contacts.json dioceses.json \
  parrocchie-db.json provinces.geojson
package_app "$ROOT/web-cognomi" "$ROOT/dist/cognomi" \
  cognomi-db.json comuni-index.json provinces.geojson
package_app "$ROOT/web-ansc" "$ROOT/dist/ansc" \
  ansc-pec-db.json provinces.geojson
package_app "$ROOT/web-caduti" "$ROOT/dist/caduti" \
  comuni-index.json polities.json archives.json routes.json contacts.json dioceses.json \
  provinces.geojson caduti-leva-db.json cognomi-db.json

cat > "$ROOT/dist/index.html" <<'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Atto Open Genealogy Suite</title>
</head>
<body>
  <h1>Atto Open Genealogy Suite</h1>
  <ul>
    <li><a href="atlas/">Historical Atlas</a></li>
    <li><a href="parrocchie/">Parrocchie and Dioceses</a></li>
    <li><a href="cognomi/">Cognomi Heatmap</a></li>
    <li><a href="ansc/">ANSC and PEC Tracker</a></li>
    <li><a href="caduti/">Caduti and Liste di Leva</a></li>
  </ul>
</body>
</html>
HTML

DEST="$ROOT/dist/atlas"
test -f "$DEST/js/engine.mjs"
test -f "$DEST/js/suite.mjs"
test -f "$DEST/data/built/comuni-index.json"
test -f "$DEST/data/built/polities.json"
test -f "$DEST/data/built/archives.json"
test -f "$DEST/data/built/routes.json"
test -f "$DEST/data/built/contacts.json"
test -f "$DEST/data/built/dioceses.json"
test -f "$DEST/data/built/provinces.geojson"
test -f "$DEST/data/built/parrocchie-db.json"
test -f "$DEST/data/built/cognomi-db.json"
test -f "$DEST/data/built/ansc-pec-db.json"
test -f "$DEST/data/built/caduti-leva-db.json"
test -f "$DEST/data/built/rail-catasti.json"
grep -q 'src="js/app.js"' "$DEST/index.html"
grep -q 'href="css/style.css"' "$DEST/index.html"
grep -q 'ATLAS_BASE_PATH = window.ATLAS_BASE_PATH || "./"' "$DEST/index.html"
test -f "$ROOT/dist/parrocchie/index.html"
test -f "$ROOT/dist/cognomi/index.html"
test -f "$ROOT/dist/ansc/index.html"
test -f "$ROOT/dist/caduti/index.html"
test -f "$ROOT/dist/index.html"

echo "wrote dist/atlas dist/parrocchie dist/cognomi dist/ansc dist/caduti dist/index.html"
