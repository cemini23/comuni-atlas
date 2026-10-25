import { createAtlas, fold } from "./engine.mjs";
import { filterParishes } from "./suite.mjs";

const THEME_KEY = "comuni-atlas-theme";
const SHARE_ORIGIN = "https://youratto.com/parrocchie/";
const ITALY = { minLng: 6.55, maxLng: 18.85, minLat: 35.45, maxLat: 47.12, w: 1000, h: 1180 };
const SVG_NS = "http://www.w3.org/2000/svg";

const status = document.querySelector("#status");
const result = document.querySelector("#result");
const form = document.querySelector("#search-form");
const comuneInput = document.querySelector("#comune");
const yearInput = document.querySelector("#year");
const provinceLayer = document.querySelector("#provinces");
const seatLayer = document.querySelector("#seats");
const themeToggle = document.querySelector("#theme-toggle");
const bootError = document.querySelector("#boot-error");

const state = { db: null, geo: null, atlas: null };

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

function drawBase() {
  provinceLayer.replaceChildren();
  for (const feature of state.geo.features) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", featurePath(feature));
    path.setAttribute("class", "province");
    path.setAttribute("fill", "#d9d0c0");
    path.setAttribute("fill-rule", "evenodd");
    provinceLayer.append(path);
  }
}

function drawPin(coordinates) {
  seatLayer.replaceChildren();
  if (!coordinates || coordinates.lat == null || coordinates.lng == null) return;
  const [x, y] = project(coordinates.lng, coordinates.lat);
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", x.toFixed(1));
  dot.setAttribute("cy", y.toFixed(1));
  dot.setAttribute("r", "8");
  dot.setAttribute("fill", "#8d2f2b");
  seatLayer.append(dot);
}

function yearValue() {
  const year = Number(yearInput.value);
  return Number.isFinite(year) ? year : 1842;
}

function shareUrl() {
  const params = new URLSearchParams();
  if (comuneInput.value.trim()) params.set("comune", comuneInput.value.trim());
  params.set("year", String(yearValue()));
  const diocese = new URLSearchParams(location.search).get("diocese");
  if (diocese) params.set("diocese", diocese);
  return `${SHARE_ORIGIN}?${params.toString()}`;
}

function writeQuery() {
  const params = new URLSearchParams();
  if (comuneInput.value.trim()) params.set("comune", comuneInput.value.trim());
  params.set("year", String(yearValue()));
  const diocese = new URLSearchParams(location.search).get("diocese");
  if (diocese && !comuneInput.value.trim()) params.set("diocese", diocese);
  const qs = params.toString();
  const next = `${location.pathname}${qs ? `?${qs}` : ""}`;
  if (next !== `${location.pathname}${location.search}`) history.replaceState(null, "", next);
}

function matches(query, year) {
  const key = fold(query);
  const churches = filterParishes(state.db.churches || [], year).filter((row) => {
    if (!key) return false;
    return [row.comune, row.name, row.diocese].some((value) => fold(value).includes(key));
  });
  const dioceses = (state.db.dioceses || []).filter((row) => {
    if (!key) return false;
    return [row.name, row.searchPlace, row.seatComune, row.cathedral].some((value) => fold(value).includes(key));
  });
  return { churches: churches.slice(0, 40), dioceses: dioceses.slice(0, 12) };
}

function churchCard(row, year) {
  const hot = row.chiesaMadre ? "is-madre" : (row.kind === "diocesan-seat" ? "is-seat" : "");
  const badges = [
    row.chiesaMadre ? "Chiesa madre" : "",
    row.kind === "diocesan-seat" ? "Diocesan seat" : "",
  ].filter(Boolean).join(" · ");
  const inception = row.inceptionYear != null
    ? `<p><strong>Inception.</strong> ${esc(row.inceptionYear)}</p>`
    : "";
  const place = row.comune || row.searchPlace || "";
  const href = `../web/?year=${encodeURIComponent(year)}&place=${encodeURIComponent(place)}`;
  return `<article class="${hot}">
    <h2>${esc(row.name || row.diocese)}</h2>
    ${badges ? `<p class="status">${esc(badges)}</p>` : ""}
    <p><strong>Comune.</strong> ${esc(place)}</p>
    <p><strong>Diocese.</strong> ${esc(row.diocese || "")}</p>
    <p><strong>Atto di Battesimo.</strong> Ask the parish or the diocesan archive.</p>
    <p><strong>Matrimonio Canonico.</strong> Ask the parish or the diocesan archive.</p>
    <p><strong>Diocesan archive.</strong> ${esc(row.archive || "")}</p>
    ${inception}
    <p><a href="${esc(row.bewebUrl)}" rel="noopener noreferrer">Search this place on BeWeB →</a></p>
    <p><a href="${esc(href)}">View in Historical Atlas (${esc(year)})</a></p>
  </article>`;
}

function routingCard(resolved, year) {
  const parish = resolved.parish_routing || {};
  const place = resolved.modernName || resolved.historicalName || "";
  const civil = Boolean(resolved.records?.civilRegistration);
  const href = `../web/?year=${encodeURIComponent(year)}&place=${encodeURIComponent(place)}`;
  const beweb = parish.bewebUrl
    ? `<p><a href="${esc(parish.bewebUrl)}" rel="noopener noreferrer">Search this place on BeWeB →</a></p>`
    : "";
  return `<article class="is-seat">
    <h2>${esc(resolved.historicalName || place)}</h2>
    <p class="status">Parish and diocesan routing</p>
    <p><strong>Historical name.</strong> ${esc(resolved.historicalName || "")}</p>
    <p><strong>Modern name.</strong> ${esc(resolved.modernName || "")}</p>
    <p><strong>Diocese.</strong> ${esc(parish.diocese || "")}</p>
    <p><strong>Diocesan archive.</strong> ${esc(parish.archive || "")}</p>
    <p><strong>Cathedral.</strong> ${esc(parish.cathedral || "")}</p>
    ${beweb}
    <p><strong>Civil registration in ${esc(year)}.</strong> ${civil ? "Yes. The civil register is in force." : "No. Parish registers hold the vital records."}</p>
    <p><a href="${esc(href)}">View in Historical Atlas (${esc(year)})</a></p>
  </article>`;
}

function render() {
  const year = yearValue();
  const query = comuneInput.value.trim();
  const found = matches(query, year);
  const placeLabel = query || "Italy";
  document.title = `${placeLabel} parishes in ${year} | Atto`;
  let resolved = null;
  if (query && state.atlas) {
    const hit = state.atlas.resolvePlace(query, year);
    if (hit.matched && (hit.kind === "comune" || hit.kind === "landmark")) resolved = hit;
  }
  status.textContent = query
    ? `${resolved ? "1 town route. " : ""}${found.dioceses.length} diocese rows and ${found.churches.length} church rows for ${year}.`
    : "Search any Italian comune or diocese to locate pre-unification parish and diocesan archives.";
  if (resolved?.coordinates) drawPin(resolved.coordinates);
  else if (found.dioceses[0]) drawPin({ lat: found.dioceses[0].lat, lng: found.dioceses[0].lng });
  else drawPin(null);
  const blocks = [
    ...(resolved ? [routingCard(resolved, year)] : []),
    ...found.dioceses.map((row) => churchCard({
      name: row.cathedral || row.name,
      comune: row.seatComune,
      diocese: row.name,
      archive: row.archive,
      bewebUrl: row.bewebUrl,
      kind: "diocesan-seat",
      chiesaMadre: false,
      inceptionYear: null,
    }, year)),
    ...found.churches.map((row) => churchCard(row, year)),
  ];
  result.innerHTML = blocks.join("") || "<p>No diocese or church row matches this search.</p>";
  writeQuery();
}

function applyTheme(theme) {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

async function main() {
  applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
  const [db, geo, index, polities, archives, routes, contacts, dioceses] = await Promise.all([
    loadJson("parrocchie-db.json"),
    loadJson("provinces.geojson"),
    loadJson("comuni-index.json"),
    loadJson("polities.json"),
    loadJson("archives.json"),
    loadJson("routes.json"),
    loadJson("contacts.json"),
    loadJson("dioceses.json"),
  ]);
  state.db = db;
  state.geo = geo;
  state.atlas = createAtlas({ index, polities, archives, routes, contacts, dioceses });
  drawBase();
  const params = new URLSearchParams(location.search);
  comuneInput.value = params.get("comune") || params.get("diocese") || "";
  if (params.get("year")) yearInput.value = params.get("year");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  document.querySelector("#copy-link").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(shareUrl());
      button.textContent = "Copied";
    } catch {
      button.textContent = shareUrl();
    }
  });
  if (comuneInput.value) render();
  else status.textContent = "Search any Italian comune or diocese to locate pre-unification parish and diocesan archives.";
}

main().catch((error) => {
  console.error(error);
  bootError.hidden = false;
  bootError.textContent = "The parish data did not load. Serve the repository root, then open /web-parrocchie/.";
  status.textContent = "The parish data did not load.";
});
