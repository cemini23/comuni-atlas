import { analyzeSurname } from "./suite.mjs";

const THEME_KEY = "comuni-atlas-theme";
const SHARE_ORIGIN = "https://youratto.com/cognomi/";
const ITALY = { minLng: 6.55, maxLng: 18.85, minLat: 35.45, maxLat: 47.12, w: 1000, h: 1180 };
const SVG_NS = "http://www.w3.org/2000/svg";

const status = document.querySelector("#status");
const result = document.querySelector("#result");
const form = document.querySelector("#search-form");
const input = document.querySelector("#surname");
const provinceLayer = document.querySelector("#provinces");
const themeToggle = document.querySelector("#theme-toggle");
const bootError = document.querySelector("#boot-error");

const state = { db: null, places: [], geo: null };

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

function drawMap(region, secondary = []) {
  provinceLayer.replaceChildren();
  const extra = new Set(secondary || []);
  for (const feature of state.geo.features) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", featurePath(feature));
    path.setAttribute("class", "province");
    path.setAttribute("fill-rule", "evenodd");
    const name = feature.properties.reg_name;
    let fill = "#d9d0c0";
    if (region && name === region) fill = "#8d2f2b";
    else if (extra.has(name)) fill = "#c88a4b";
    path.setAttribute("fill", fill);
    provinceLayer.append(path);
  }
}

function shareUrl(surname) {
  const params = new URLSearchParams();
  if (surname) params.set("surname", surname);
  const qs = params.toString();
  return qs ? `${SHARE_ORIGIN}?${qs}` : SHARE_ORIGIN;
}

function writeQuery(surname) {
  const params = new URLSearchParams();
  if (surname) params.set("surname", surname);
  const qs = params.toString();
  const next = `${location.pathname}${qs ? `?${qs}` : ""}`;
  if (next !== `${location.pathname}${location.search}`) history.replaceState(null, "", next);
}

function render(raw) {
  const dossier = analyzeSurname(raw, state.db, state.places);
  document.title = `${dossier.surname} Surname Origin, Map & Italian Civil Records | Atto`;
  drawMap(dossier.region, dossier.secondaryRegions || []);
  const comuni = (dossier.topComuni || []).map((item) => {
    const href = `../web/?year=1885&place=${encodeURIComponent(item.name)}`;
    return `<li>${esc(item.name)} <a href="${esc(href)}">Inspect ${esc(item.name)} Archives in Atlas →</a></li>`;
  }).join("");
  const foundling = dossier.foundling
    ? `<h3>Foundling note</h3><p>${esc(dossier.foundling.hospital || "No single hospital")}. ${esc(dossier.foundling.city || "")} ${esc(dossier.foundling.note || "")}</p>`
    : "";
  const ports = (dossier.ports || []).map((port) => `<li>${esc(port.name)}. ${esc(port.note)}</li>`).join("");
  result.innerHTML = `
    <h2>${esc(dossier.surname)}</h2>
    <p><strong>Category.</strong> ${esc(dossier.category)}</p>
    <p><strong>Region.</strong> ${esc(dossier.region || "Pan-Italian (Widespread across regions)")}</p>
    ${(dossier.secondaryRegions || []).length ? `<p><strong>Secondary historical distribution.</strong> ${esc(dossier.secondaryRegions.join(", "))}</p>` : ""}
    ${dossier.meaning ? `<p><strong>Meaning.</strong> ${esc(dossier.meaning)}</p>` : ""}
    ${dossier.epicenterNote ? `<p>${esc(dossier.epicenterNote)}</p>` : ""}
    ${dossier.ambiguous ? "<p class=\"warn\">This surname is ambiguous.</p>" : ""}
    ${comuni ? `<h3>Name match</h3><ul class="dossier-list">${comuni}</ul>` : ""}
    ${foundling}
    ${ports ? `<h3>Ports</h3><ul class="dossier-list">${ports}</ul>` : ""}
  `;
  const secondary = (dossier.secondaryRegions || []).join(", ");
  status.textContent = dossier.region
    ? `Primary Regional Epicenter: ${dossier.region}.${secondary ? ` Secondary Historical Distribution: ${secondary}.` : ""}`
    : "Pan-Italian surname distributed across multiple regions.";
  writeQuery(dossier.surname);
  return dossier;
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
  const [db, index, geo] = await Promise.all([
    loadJson("cognomi-db.json"),
    loadJson("comuni-index.json"),
    loadJson("provinces.geojson"),
  ]);
  state.db = db;
  state.places = index.places || [];
  state.geo = geo;
  drawMap(null);
  const params = new URLSearchParams(location.search);
  const initial = params.get("surname") || params.get("cognome") || "";
  if (initial) input.value = initial;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (input.value.trim()) render(input.value);
  });
  document.querySelector("#share-map").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const surname = input.value.trim();
    const url = shareUrl(surname ? render(surname).surname : "");
    try {
      await navigator.clipboard.writeText(url);
      button.textContent = "Copied";
    } catch {
      button.textContent = url;
    }
  });
  if (initial) render(initial);
  else status.textContent = "Enter an Italian surname to explore its linguistic roots, regional distribution, matching comuni, and historical embarkation ports.";
}

main().catch((error) => {
  console.error(error);
  bootError.hidden = false;
  bootError.textContent = "The surname data did not load. Serve the repository root, then open /web-cognomi/.";
  status.textContent = "The surname data did not load.";
});
