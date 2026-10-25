import { createAtlas } from "./engine.mjs";
import { analyzeSurname, levaFromResolution } from "./suite.mjs";

const THEME_KEY = "comuni-atlas-theme";
const SHARE_ORIGIN = "https://youratto.com/caduti";
const ITALY = { minLng: 6.55, maxLng: 18.85, minLat: 35.45, maxLat: 47.12, w: 1000, h: 1180 };
const SVG_NS = "http://www.w3.org/2000/svg";
const ALBO = "This tool does not hold the Albo d'Oro name list.";

const status = document.querySelector("#status");
const result = document.querySelector("#result");
const regiments = document.querySelector("#regiments");
const form = document.querySelector("#leva-form");
const placeInput = document.querySelector("#place");
const yearInput = document.querySelector("#year");
const provinceLayer = document.querySelector("#provinces");
const pinLayer = document.querySelector("#pin");
const themeToggle = document.querySelector("#theme-toggle");
const bootError = document.querySelector("#boot-error");
const alboNote = document.querySelector("#albo-note");
const alboResult = document.querySelector("#albo-result");
const alboName = document.querySelector("#albo-name");

const state = { atlas: null, archives: null, geo: null, cognomi: null, index: null, guide: null };

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
  pinLayer.replaceChildren();
  if (!coordinates || coordinates.lat == null || coordinates.lng == null) return;
  const [x, y] = project(coordinates.lng, coordinates.lat);
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", x.toFixed(1));
  dot.setAttribute("cy", y.toFixed(1));
  dot.setAttribute("r", "8");
  dot.setAttribute("fill", "#8d2f2b");
  pinLayer.append(dot);
}

function birthYear() {
  const year = Number(yearInput.value);
  return Number.isFinite(year) ? year : 1878;
}

function shareUrl() {
  const params = new URLSearchParams();
  params.set("place", placeInput.value.trim());
  params.set("year", String(birthYear()));
  return `${SHARE_ORIGIN}?${params.toString()}`;
}

function writeQuery() {
  const params = new URLSearchParams();
  if (placeInput.value.trim()) params.set("place", placeInput.value.trim());
  params.set("year", String(birthYear()));
  const qs = params.toString();
  const next = `${location.pathname}${qs ? `?${qs}` : ""}`;
  if (next !== `${location.pathname}${location.search}`) history.replaceState(null, "", next);
}

function render() {
  const place = placeInput.value.trim();
  const year = birthYear();
  if (!place) return;
  const atBirth = state.atlas.resolvePlace(place, year);
  const atCallUp = state.atlas.resolvePlace(place, year + 20);
  const leva = levaFromResolution(year, atBirth, atCallUp, state.archives);
  const comune = atBirth.modernName || atBirth.historicalName || place;
  const href = `../web/?year=${encodeURIComponent(leva.callUpYear)}&place=${encodeURIComponent(comune)}`;
  const archive = leva.archive?.antenatiUrl
    ? `<a href="${esc(leva.archive.antenatiUrl)}" rel="noopener noreferrer">${esc(leva.archive.name)}</a>`
    : esc(leva.archive?.name || "");
  result.innerHTML = `
    <h2>${esc(comune)}</h2>
    <p><strong>Classe.</strong> ${esc(leva.classe)}</p>
    <p><strong>Call-up year.</strong> ${esc(leva.callUpYear)}</p>
    <p><strong>District.</strong> ${esc(leva.district)}</p>
    <p><strong>Archive.</strong> ${archive}</p>
    <p><strong>italianRolls.</strong> ${leva.italianRolls ? "true" : "false"}</p>
    <p>${esc(leva.note)}</p>
    <p><a href="${esc(href)}">Open ${esc(comune)} in the atlas at the call-up year</a></p>
  `;
  drawPin(atBirth.coordinates);
  document.title = `${comune} liste di leva ${year} | Atto`;
  status.textContent = atBirth.matched
    ? `${leva.district}. This is a finding aid, not a service record.`
    : "This place did not match.";
  writeQuery();
}

function recruited(guide, region) {
  return (guide?.regiments || []).filter((item) => {
    const regions = item.regions || [];
    if (!regions.length) return true;
    return Boolean(region) && regions.includes(region);
  });
}

function renderAlbo(surname) {
  alboNote.textContent = ALBO;
  const dossier = analyzeSurname(surname, state.cognomi, state.index?.places || []);
  const region = dossier.region || "";
  const towns = (dossier.topComuni || []).map((item) => (
    `<li><button type="button" data-place="${esc(item.name)}">${esc(item.name)}</button></li>`
  )).join("");
  const lines = recruited(state.guide, region).map((item) => (
    `<li>${esc(item.name)}. ${esc(item.note || "")}</li>`
  )).join("");
  alboResult.innerHTML = `
    <h3>${esc(dossier.surname || surname)}</h3>
    <p><strong>Region.</strong> ${esc(region || "No region in this atlas.")}</p>
    ${dossier.epicenterNote ? `<p>${esc(dossier.epicenterNote)}</p>` : ""}
    ${towns ? `<h3>Name match</h3><ul class="dossier-list">${towns}</ul>` : ""}
    ${lines ? `<h3>Regiments for this region</h3><ul class="dossier-list">${lines}</ul>` : ""}
    <p><a href="https://www.cadutigrandeguerra.it/" rel="noopener noreferrer">Search ${esc(dossier.surname || surname)} on Caduti della Grande Guerra</a></p>
    <p><a href="https://antenati.cultura.gov.it/" rel="noopener noreferrer">Search ${esc(dossier.surname || surname)} on Portale Antenati</a></p>
  `;
}

function renderRegiments(guide) {
  const items = (guide.regiments || []).map((item) => (
    `<article><h3>${esc(item.name)}</h3><p>${esc(item.note)}</p></article>`
  )).join("");
  regiments.innerHTML = `<p>${esc(guide.alboNote || ALBO)}</p><p>${esc(guide.ageModel || "")}</p>${items}`;
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
  const [index, polities, archives, routes, contacts, dioceses, geo, guide, cognomi] = await Promise.all([
    loadJson("comuni-index.json"),
    loadJson("polities.json"),
    loadJson("archives.json"),
    loadJson("routes.json"),
    loadJson("contacts.json"),
    loadJson("dioceses.json"),
    loadJson("provinces.geojson"),
    loadJson("caduti-leva-db.json"),
    loadJson("cognomi-db.json"),
  ]);
  state.atlas = createAtlas({ index, polities, archives, routes, contacts, dioceses });
  state.archives = archives;
  state.geo = geo;
  state.index = index;
  state.cognomi = cognomi;
  state.guide = guide;
  drawBase();
  renderRegiments(guide);
  const params = new URLSearchParams(location.search);
  if (params.get("place")) placeInput.value = params.get("place");
  if (params.get("year")) yearInput.value = params.get("year");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  document.querySelector("#albo-form").addEventListener("submit", (event) => {
    event.preventDefault();
    alboNote.textContent = ALBO;
    const surname = alboName.value.trim();
    if (!surname) {
      alboResult.innerHTML = "";
      return;
    }
    renderAlbo(surname);
  });
  alboResult.addEventListener("click", (event) => {
    const button = event.target.closest("[data-place]");
    if (!button) return;
    placeInput.value = button.dataset.place || "";
    render();
  });
  document.querySelector("#albo-name").addEventListener("input", () => {
    alboNote.textContent = ALBO;
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
  if (placeInput.value.trim()) render();
  else status.textContent = "Enter a birth place and a birth year. The model uses age 20.";
}

main().catch((error) => {
  console.error(error);
  bootError.hidden = false;
  bootError.textContent = "The leva data did not load. Serve the repository root, then open /web-caduti/.";
  status.textContent = "The leva data did not load.";
});
