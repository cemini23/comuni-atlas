import { fold } from "./engine.mjs";

const THEME_KEY = "comuni-atlas-theme";
const SHARE_ORIGIN = "https://youratto.com/ansc";
const ITALY = { minLng: 6.55, maxLng: 18.85, minLat: 35.45, maxLat: 47.12, w: 1000, h: 1180 };
const SVG_NS = "http://www.w3.org/2000/svg";
const MATCH_LIMIT = 40;

const status = document.querySelector("#status");
const result = document.querySelector("#result");
const hits = document.querySelector("#hits");
const form = document.querySelector("#search-form");
const input = document.querySelector("#query");
const provinceLayer = document.querySelector("#provinces");
const themeToggle = document.querySelector("#theme-toggle");
const bootError = document.querySelector("#boot-error");

const state = { rows: [], index: new Map(), geo: null };

function mercator(lat) {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function project(lng, lat) {
  const x = ((lng - ITALY.minLng) / (ITALY.maxLng - ITALY.minLng)) * ITALY.w;
  const y = ((mercator(ITALY.maxLat) - mercator(lat)) / (mercator(ITALY.maxLat) - mercator(ITALY.minLat))) * ITALY.h;
  return [x, y];
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function builtUrl(name) {
  const pageRoot = new URL("../", import.meta.url);
  if (window.ATLAS_BASE_PATH) {
    const root = new URL(window.ATLAS_BASE_PATH, pageRoot);
    const folder = root.href.endsWith("/") ? root : new URL(`${root.href}/`);
    return new URL(`data/built/${name}`, folder);
  }
  return new URL(`../../data/built/${name}`, import.meta.url);
}

async function loadJson(name) {
  const response = await fetch(builtUrl(name));
  if (!response.ok) throw new Error(`${name} ${response.status}`);
  return response.json();
}

function ringPath(ring) {
  return `${ring.map((pair, index) => {
    const [x, y] = project(pair[0], pair[1]);
    return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join("")}Z`;
}

function featurePath(feature) {
  const geometry = feature.geometry || {};
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates || [];
  return polygons.map((polygon) => polygon.map((ring) => ringPath(ring)).join("")).join("");
}

function drawMap(region) {
  provinceLayer.replaceChildren();
  for (const feature of state.geo.features) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", featurePath(feature));
    path.setAttribute("class", "province");
    path.setAttribute("fill-rule", "evenodd");
    const match = region && feature.properties.reg_name === region;
    path.setAttribute("fill", match ? "#8d6b32" : "#d9d0c0");
    provinceLayer.append(path);
  }
}

function search(query) {
  const key = fold(query);
  if (!key) return [];
  const found = [];
  const seen = new Set();
  function push(row) {
    if (!row || seen.has(row) || found.length >= MATCH_LIMIT) return;
    seen.add(row);
    found.push(row);
  }
  function scan(test) {
    for (const [name, rows] of state.index) {
      if (found.length >= MATCH_LIMIT) break;
      if (!test(name)) continue;
      for (const row of rows) push(row);
    }
  }
  scan((name) => name === key);
  scan((name) => name.startsWith(key));
  scan((name) => name.includes(key));
  return found;
}

function writeQuery(name) {
  const params = new URLSearchParams();
  if (name) params.set("comune", name);
  const qs = params.toString();
  const next = `${location.pathname}${qs ? `?${qs}` : ""}`;
  if (next !== `${location.pathname}${location.search}`) history.replaceState(null, "", next);
}

function renderRow(row) {
  drawMap(row.region || "");
  const pecLabel = row.pecSource === "indicepa" ? "Official PEC" : "PEC pattern, confirm before you send";
  const aliases = (row.historicalAliases || []).join(", ");
  result.innerHTML = `
    <h2>${esc(row.name)}</h2>
    <p class="status">${esc(row.anscStatus)}</p>
    <p>${esc(row.rolloutNote)}</p>
    <p>${esc(row.historicalArchiveWarning)}</p>
    ${aliases ? `<p><strong>Historical names.</strong> ${esc(aliases)}</p>` : ""}
    <p><strong>${esc(pecLabel)}.</strong> ${esc(row.pec)}</p>
    <p><button type="button" id="copy-pec" data-pec="${esc(row.pec)}">Copy PEC</button></p>
    <p><strong>Address.</strong> ${esc(row.address)}</p>
    <p><button type="button" id="copy-address" data-address="${esc(row.address)}">Copy address</button></p>
    <p><button type="button" id="copy-share" data-share="${esc(`${SHARE_ORIGIN}?comune=${encodeURIComponent(row.name)}`)}">Copy Shareable Link</button></p>
    <p><a href="../web/?year=1885&amp;place=${encodeURIComponent(row.name)}">Inspect in Historical Atlas →</a></p>
    ${row.website ? `<p><a href="${esc(row.website)}" rel="noopener noreferrer">${esc(row.website)}</a></p>` : ""}
  `;
  document.title = `${row.name} PEC | Atto`;
  status.textContent = `${row.name} is in ${row.region || "an unlisted region"}. The color is that region, not an onboarding wave.`;
  writeQuery(row.name);
}

function renderHits(rows) {
  hits.replaceChildren();
  rows.forEach((row, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = String(index);
    button.textContent = `${row.name}${row.sigla ? ` (${row.sigla})` : ""}`;
    item.append(button);
    hits.append(item);
  });
  hits.dataset.rows = "";
  hits._rows = rows;
}

function applyTheme(theme) {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

async function copyText(button, value) {
  try {
    await navigator.clipboard.writeText(value);
    button.textContent = "Copied";
  } catch {
    button.textContent = value;
  }
}

async function main() {
  applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
  const [db, geo] = await Promise.all([
    loadJson("ansc-pec-db.json"),
    loadJson("provinces.geojson"),
  ]);
  state.rows = db.comuni || [];
  state.geo = geo;
  for (const row of state.rows) {
    const names = [row.name, ...(row.historicalAliases || [])];
    for (const name of names) {
      const key = fold(name);
      if (!key) continue;
      const list = state.index.get(key);
      if (list) {
        if (!list.includes(row)) list.push(row);
      } else {
        state.index.set(key, [row]);
      }
    }
  }
  drawMap("");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const rows = search(input.value);
    renderHits(rows);
    if (rows[0]) renderRow(rows[0]);
    else {
      result.innerHTML = "<p>No comune matches this name.</p>";
      drawMap("");
    }
    status.textContent = `${rows.length} match${rows.length === 1 ? "" : "es"} shown. The list stops at ${MATCH_LIMIT}.`;
  });
  hits.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const row = (hits._rows || [])[Number(button.dataset.index)];
    if (row) renderRow(row);
  });
  result.addEventListener("click", async (event) => {
    const pec = event.target.closest("#copy-pec");
    if (pec) {
      await copyText(pec, pec.dataset.pec || "");
      return;
    }
    const address = event.target.closest("#copy-address");
    if (address) {
      await copyText(address, address.dataset.address || "");
      return;
    }
    const share = event.target.closest("#copy-share");
    if (share) await copyText(share, share.dataset.share || "");
  });
  const params = new URLSearchParams(location.search);
  const initial = params.get("comune") || params.get("q") || "";
  if (initial) {
    input.value = initial;
    const rows = search(initial);
    renderHits(rows);
    if (rows[0]) renderRow(rows[0]);
  } else {
    status.textContent = `${state.rows.length} comuni are indexed. Share links use ${SHARE_ORIGIN}.`;
  }
}

main().catch((error) => {
  console.error(error);
  bootError.hidden = false;
  bootError.textContent = "The PEC data did not load. Serve the repository root, then open /web-ansc/.";
  status.textContent = "The PEC data did not load.";
});
