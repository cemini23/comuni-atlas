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
  ansc-pec-db.json provinces.geojson comuni-index.json polities.json archives.json routes.json contacts.json dioceses.json
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
  <link rel="stylesheet" href="atlas/css/style.css">
  <style>
    .hub {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      gap: 0.75rem;
      padding: 0.75rem 1.1rem 1.5rem;
    }
    .hub h2 { margin: 0 0 0.35rem; font-size: 1.15rem; }
    .hub p { margin: 0.35rem 0; }
    .hub ul { margin: 0.45rem 0 0; padding-left: 1.15rem; }
    .hub li { margin: 0.2rem 0; }
  </style>
</head>
<body>
  <header class="top">
    <div class="suite-bar">
      <a class="brand" href="https://youratto.com">
        <svg class="mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="5" y="6" width="16" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-10 13 16)"/>
          <rect x="11" y="8" width="16" height="20" rx="2" fill="var(--parchment)" stroke="currentColor" stroke-width="1.6"/>
          <rect x="20.2" y="11" width="1.8" height="4" fill="#009246"/>
          <rect x="22" y="11" width="1.8" height="4" fill="#fff"/>
          <rect x="23.8" y="11" width="1.8" height="4" fill="#CE2B37"/>
        </svg>
        <span>Atto</span>
      </a>
      <nav class="suite-pills" aria-label="Atto genealogy suite">
        <a class="pill" href="atlas/">Historical Atlas</a>
        <a class="pill" href="parrocchie/">Parrocchie</a>
        <a class="pill" href="cognomi/">Cognomi</a>
        <a class="pill" href="ansc/">ANSC</a>
        <a class="pill" href="caduti/">Caduti</a>
      </nav>
      <a class="pill" href="https://youratto.com">Organize Your Packet in Atto for Mac &amp; Windows →</a>
    </div>
    <div class="title-block">
      <h1 class="atlas-title">Atto Open Genealogy Suite</h1>
      <p class="badge">Look up a town, a diocese, a surname, a PEC address, or a call-up district.</p>
    </div>
    <div class="top-actions">
      <button type="button" id="theme-toggle" aria-pressed="false">Dark mode</button>
    </div>
  </header>
  <p class="banner" role="status">Five local tools. Each card opens one tool and a worked example.</p>
  <main class="hub">
    <article class="panel card">
      <h2>Historical Atlas</h2>
      <p>Look up an Italian town from 1563 to 2026.</p>
      <p><a class="pill" href="atlas/">Open the atlas</a></p>
      <ul>
        <li><a href="atlas/?year=1884&amp;place=Castrogiovanni">Castrogiovanni in 1884</a></li>
        <li><a href="atlas/?year=1880&amp;place=Colledimacine">Colledimacine in 1880</a></li>
        <li><a href="atlas/?year=1933&amp;place=Sellia">Sellia in 1933</a></li>
      </ul>
    </article>
    <article class="panel card">
      <h2>Parrocchie and Dioceses</h2>
      <p>Find the diocese and the diocesan archive for a town.</p>
      <p><a class="pill" href="parrocchie/">Open parishes</a></p>
      <ul>
        <li><a href="parrocchie/?year=1842&amp;comune=Lercara%20Friddi">Lercara Friddi in 1842</a></li>
      </ul>
    </article>
    <article class="panel card">
      <h2>Cognomi Heatmap</h2>
      <p>See where an Italian surname points.</p>
      <p><a class="pill" href="cognomi/">Open surnames</a></p>
      <ul>
        <li><a href="cognomi/?surname=Esposito">Esposito</a></li>
      </ul>
    </article>
    <article class="panel card">
      <h2>ANSC and PEC</h2>
      <p>Find the PEC address and the municipio.</p>
      <p><a class="pill" href="ansc/">Open the directory</a></p>
      <ul>
        <li><a href="ansc/?comune=Castrogiovanni">Castrogiovanni</a></li>
      </ul>
    </article>
    <article class="panel card">
      <h2>Caduti and Liste di Leva</h2>
      <p>Find the call-up district for a birth year.</p>
      <p><a class="pill" href="caduti/">Open the finding aid</a></p>
      <ul>
        <li><a href="caduti/?year=1878&amp;place=Isernia">Isernia, birth year 1878</a></li>
      </ul>
    </article>
  </main>
  <script>
    (function () {
      var key = "comuni-atlas-theme";
      var button = document.getElementById("theme-toggle");
      function apply(theme) {
        if (theme === "dark") document.documentElement.dataset.theme = "dark";
        else delete document.documentElement.dataset.theme;
        button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
        button.textContent = theme === "dark" ? "Light mode" : "Dark mode";
      }
      apply(localStorage.getItem(key) === "dark" ? "dark" : "light");
      button.addEventListener("click", function () {
        var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        localStorage.setItem(key, next);
        apply(next);
      });
    })();
  </script>
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
