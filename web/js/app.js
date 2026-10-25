import { createAtlas, parseYearList } from "./engine.mjs";
import { installAtlasApi } from "./atlas-api.js";
import { onPopState, readQuery, writeQuery } from "./router.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const THEME_KEY = "comuni-atlas-theme";
const SHARE_ORIGIN = "https://youratto.com/atlas";
const DEFAULT_TITLE = "Atto Historical Atlas (1796–2026)";
const ITALY = { minLng: 6.55, maxLng: 18.85, minLat: 35.45, maxLat: 47.12, w: 1000, h: 1180 };
const WIDE = { w: 1600, h: 1000 };

const banner = document.querySelector("#regime-banner");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchResults = document.querySelector("#search-results");
const legend = document.querySelector("#legend");
const svg = document.querySelector("#map");
const provinceLayer = document.querySelector("#provinces");
const arcLayer = document.querySelector("#arcs");
const pinLayer = document.querySelector("#pins");
const yearStamp = document.querySelector("#year-stamp");
const hoverTip = document.querySelector("#hover-tip");
const mapWrap = document.querySelector(".map-wrap");
const routeBar = document.querySelector("#route-bar");
const routeTitle = document.querySelector("#route-title");
const routeStops = document.querySelector("#route-stops");
const card = document.querySelector("#card");
const slider = document.querySelector("#year-slider");
const readout = document.querySelector("#year-readout");
const bootError = document.querySelector("#boot-error");
const themeToggle = document.querySelector("#theme-toggle");

const state = {
  atlas: null,
  geo: null,
  year: 1861,
  yearRaw: "1861",
  placeRaw: "",
  stops: [],
  index: 0,
  frame: "italy",
  wideLat: { min: ITALY.minLat, max: ITALY.maxLat },
  view: { x: 0, y: 0, w: ITALY.w, h: ITALY.h },
};

let searchTimer = 0;
let resolveTimer = 0;
let routeTimer = 0;
let yearTimer = 0;
let flyToken = 0;

function mercator(lat) {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function yFromLat(lat, minLat, maxLat, height) {
  const top = mercator(maxLat);
  const bottom = mercator(minLat);
  return ((top - mercator(lat)) / (top - bottom)) * height;
}

function projectItaly(lng, lat) {
  const x = ((lng - ITALY.minLng) / (ITALY.maxLng - ITALY.minLng)) * ITALY.w;
  const y = yFromLat(lat, ITALY.minLat, ITALY.maxLat, ITALY.h);
  return [x, y];
}

/** Italy keeps the right half. The Atlantic is compressed into the left half. */
function projectWide(lng, lat) {
  const x = lng >= 6.2
    ? 760 + ((lng - 6.2) / (18.85 - 6.2)) * 800
    : 30 + ((lng - -78) / (6.2 - -78)) * 730;
  const y = yFromLat(lat, state.wideLat.min, state.wideLat.max, WIDE.h);
  return [x, y];
}

function project(lng, lat) {
  return state.frame.startsWith("wide") ? projectWide(lng, lat) : projectItaly(lng, lat);
}

function fullView() {
  return state.frame.startsWith("wide")
    ? { x: 0, y: 0, w: WIDE.w, h: WIDE.h }
    : { x: 0, y: 0, w: ITALY.w, h: ITALY.h };
}

function applyView(box) {
  state.view = box;
  svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
}

function flyTo(box) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  flyToken += 1;
  const token = flyToken;
  if (reduce) {
    applyView(box);
    return;
  }
  const from = { ...state.view };
  const start = performance.now();
  function frame(now) {
    if (token !== flyToken) return;
    const t = Math.min(1, (now - start) / 480);
    const eased = 1 - (1 - t) ** 3;
    applyView({
      x: from.x + (box.x - from.x) * eased,
      y: from.y + (box.y - from.y) * eased,
      w: from.w + (box.w - from.w) * eased,
      h: from.h + (box.h - from.h) * eased,
    });
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function boxAround(points) {
  const full = fullView();
  if (!points.length) return full;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(40, maxX - minX);
  const spanY = Math.max(40, maxY - minY);
  let w = Math.max(full.w * 0.28, spanX * 2.4);
  let h = w * (full.h / full.w);
  if (h < spanY * 2.4) {
    h = Math.max(full.h * 0.28, spanY * 2.4);
    w = h * (full.w / full.h);
  }
  w = Math.min(w, full.w);
  h = Math.min(h, full.h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: Math.min(full.x + full.w - w, Math.max(full.x, cx - w / 2)),
    y: Math.min(full.y + full.h - h, Math.max(full.y, cy - h / 2)),
    w,
    h,
  };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function ringPath(ring) {
  if (!ring || ring.length < 3) return "";
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

function outsideItaly(stop) {
  const lng = stop?.coordinates?.lng;
  const lat = stop?.coordinates?.lat;
  if (lng == null || lat == null) return false;
  return lng < 6 || lng > 19 || lat < 35 || lat > 48;
}

function frameFor(stops) {
  if (!stops.some(outsideItaly)) return "italy";
  let min = ITALY.minLat;
  let max = ITALY.maxLat;
  for (const stop of stops) {
    const lat = stop?.coordinates?.lat;
    if (lat == null) continue;
    min = Math.min(min, lat - 1.2);
    max = Math.max(max, lat + 1.2);
  }
  state.wideLat = { min, max };
  return `wide:${min.toFixed(2)}:${max.toFixed(2)}`;
}

function buildProvinces() {
  provinceLayer.replaceChildren();
  for (const feature of state.geo.features) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", featurePath(feature));
    path.setAttribute("class", "province");
    path.setAttribute("fill", "#d9d0c0");
    path.setAttribute("fill-rule", "evenodd");
    path.dataset.code = feature.properties.prov_istat_code;
    path.dataset.name = feature.properties.prov_name;
    provinceLayer.append(path);
  }
}

function paintYear(year) {
  const atlas = state.atlas;
  for (const path of provinceLayer.children) {
    const info = atlas.provinceAt(path.dataset.code, year);
    path.setAttribute("fill", info?.color || "#d9d0c0");
    path.dataset.polity = info?.polity?.nameEn || "";
  }
  yearStamp.textContent = String(year);
  readout.textContent = String(year);
  slider.value = String(year);
  const report = atlas.banner(year);
  const names = report.polities.slice(0, 4).map((item) => item.nameEn).join(", ");
  banner.textContent = `${report.epoch?.name || "Atlas"} · 1 July ${year}. ${names}.`;
  legend.replaceChildren();
  for (const item of report.polities) {
    const row = document.createElement("div");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = item.color || "#b7aa96";
    row.append(swatch, document.createTextNode(`${item.nameEn} (${item.provinces})`));
    legend.append(row);
  }
}

function markProvinces(result) {
  for (const path of provinceLayer.children) {
    path.classList.remove("is-modern", "is-historical");
  }
  if (!result || result.kind === "external") return;
  const modern = result.modernProvince?.code;
  const historical = result.historicalProvince?.code;
  for (const path of provinceLayer.children) {
    if (historical && path.dataset.code === historical && historical !== modern) {
      path.classList.add("is-historical");
    }
    if (modern && path.dataset.code === modern) path.classList.add("is-modern");
  }
}

function projectedStops() {
  return state.stops.map((stop, index) => {
    const lat = stop.coordinates?.lat;
    const lng = stop.coordinates?.lng;
    if (lat == null || lng == null) return null;
    const [x, y] = project(lng, lat);
    return { x, y, index, stop };
  }).filter(Boolean);
}

function arcPath(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(90, length * 0.22);
  const cx = (from.x + to.x) / 2 + (-dy / length) * bend;
  const cy = (from.y + to.y) / 2 + (dx / length) * bend;
  return `M${from.x.toFixed(1)},${from.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)}`;
}

function drawOverlay() {
  arcLayer.replaceChildren();
  pinLayer.replaceChildren();
  const points = projectedStops();
  for (let index = 0; index < points.length - 1; index += 1) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", arcPath(points[index], points[index + 1]));
    path.setAttribute("class", index === state.index - 1 ? "arc is-active" : "arc");
    arcLayer.append(path);
  }
  for (const point of points) {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "pin-dot");
    dot.setAttribute("cx", point.x.toFixed(1));
    dot.setAttribute("cy", point.y.toFixed(1));
    dot.setAttribute("r", point.index === state.index ? "6.5" : "4.5");
    dot.dataset.index = String(point.index);
    dot.style.cursor = "pointer";
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "pin-label");
    label.setAttribute("x", (point.x + 8).toFixed(1));
    label.setAttribute("y", (point.y - 8).toFixed(1));
    label.textContent = point.stop.label || point.stop.historicalName || point.stop.query?.place || "";
    pinLayer.append(dot, label);
  }
}

function line(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<p><strong>${esc(label)}.</strong> ${esc(value)}</p>`;
}

function shareUrl(year, place) {
  const params = new URLSearchParams();
  if (year !== undefined && year !== null && String(year) !== "") params.set("year", String(year));
  if (place) params.set("place", place);
  const qs = params.toString();
  return qs ? `${SHARE_ORIGIN}?${qs}` : SHARE_ORIGIN;
}

function comuneSlug(name) {
  const slug = String(name || "comune")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "comune";
}

function pageTitle(result) {
  if (!result) return DEFAULT_TITLE;
  const year = result.query?.year || state.year;
  const historical = result.historicalName || result.query?.place || "Place";
  const modern = result.modernName && result.modernName !== historical ? ` (${result.modernName})` : "";
  if (!result.matched) return `${historical} in ${year} — Atto Historical Atlas`;
  return `${historical}${modern} in ${year} — Stato Civile & Archive Lookup | Atto Historical Atlas`;
}

function shareButton() {
  return `<p><button type="button" id="copy-view">Copy Shareable Link</button></p>`;
}

function inspectorCta(result) {
  if (!result?.matched || result.kind === "external") return "";
  const modern = result.modernName || result.historicalName || "this town";
  const code = result.modernProvince?.code || result.historicalProvince?.code || "";
  const place = code ? `${modern} (${code})` : modern;
  const href = `https://youratto.com?utm_source=atlas&utm_medium=inspector&utm_campaign=${encodeURIComponent(comuneSlug(modern))}`;
  return `<aside class="atto-cta">
    <p><strong>Tracking records from ${esc(place)}?</strong></p>
    <p>Build your offline family tree, track Stato Civile &amp; Archivio di Stato requests, and organize your citizenship packet locally on your Mac with <strong>Atto</strong>.</p>
    <p><a class="pill" href="${esc(href)}">See How Atto Works →</a></p>
  </aside>`;
}

async function copyShare(button) {
  const url = shareUrl(state.yearRaw || state.year, state.placeRaw);
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = "Copied";
  } catch {
    button.textContent = url;
  }
}

function renderCard(result) {
  if (!result) {
    card.hidden = true;
    card.innerHTML = "";
    document.title = DEFAULT_TITLE;
    return;
  }
  card.hidden = false;
  const place = result.historicalName || result.query?.place || "Place";
  const year = result.query?.year || state.year;
  document.title = pageTitle(result);
  if (!result.matched) {
    const hints = state.atlas.search(result.query?.place || "", 5).map((item) => (
      `<li><button type="button" data-place="${esc(item.name)}">${esc(item.name)}${item.sigla ? ` (${esc(item.sigla)})` : ""}</button></li>`
    )).join("");
    card.innerHTML = `<h2>No match</h2><p>No town matches this name for the selected year.</p>${hints ? `<h3>Close names</h3><ul>${hints}</ul>` : ""}`;
    publish(result);
    return;
  }
  if (result.existed === false) {
    card.innerHTML = [
      `<h2>${esc(result.historicalName || result.modernName)}</h2>`,
      line("Year", `1 July ${year}`),
      `<p class="warn">${esc(result.note || "This comune did not exist on this date.")}</p>`,
      result.successor ? line("Later comune", `${result.successor.name} · ISTAT ${result.successor.istat || "—"}`) : "",
      shareButton(),
      inspectorCta(result),
    ].join("");
    publish(result);
    return;
  }
  const archive = result.archive;
  const archiveHtml = archive?.antenatiUrl
    ? `<p><strong>Archive.</strong> <a href="${esc(archive.antenatiUrl)}" rel="noopener noreferrer">${esc(archive.name)}</a></p>`
    : line("Archive", archive?.name || "");
  const also = (archive?.alsoSee || []).map((item) => (
    `<li><a href="${esc(item.antenatiUrl || "")}" rel="noopener noreferrer">${esc(item.name)}</a>. ${esc(item.reason || "")}</li>`
  )).join("");
  const notes = (result.citizenshipNotes || []).map((note) => `<li>${esc(note)}</li>`).join("");
  const timeline = (result.timeline || []).map((event) => (
    `<li><strong>${esc(event.year)}</strong> ${esc(event.historicalName)} — ${esc(event.sovereign)} — ${esc(event.province)}</li>`
  )).join("");
  const alternates = result.ambiguous
    ? (result.alternates || []).map((item) => `<li><button type="button" data-place="${esc(item.name)}">${esc(item.name)}</button></li>`).join("")
    : "";
  const coords = result.coordinates?.lat != null
    ? `${Number(result.coordinates.lat).toFixed(5)}, ${Number(result.coordinates.lng).toFixed(5)}`
    : "";
  card.innerHTML = [
    `<h2>${esc(place)}</h2>`,
    line("Modern name", result.modernName),
    line("Date", `1 July ${year}`),
    line("Match", result.matchType || ""),
    result.note ? `<p>${esc(result.note)}</p>` : "",
    result.ambiguous ? `<p class="warn">Another town scores almost the same. Choose one from the list.</p>` : "",
    alternates ? `<ul>${alternates}</ul>` : "",
    line("ISTAT", result.istat || ""),
    line("Catasto", result.catasto || ""),
    line("Sovereign", result.sovereign ? `${result.sovereign.name} · ${result.sovereign.nameEn}` : ""),
    line("Epoch", result.epoch?.name || ""),
    line("Historical province", result.historicalProvince ? `${result.historicalProvince.name} (${result.historicalProvince.code}) · ${result.historicalProvince.region}` : ""),
    line("Modern province", result.modernProvince ? `${result.modernProvince.name} (${result.modernProvince.code}) · ${result.modernProvince.region}` : ""),
    result.provinceShift?.warning ? `<p class="warn">${esc(result.provinceShift.warning)}</p>` : "",
    line("Register", result.records ? `${result.records.nameEn}${result.records.civilRegistration ? " · civil register" : " · not a civil register"}` : ""),
    result.records?.note ? `<p>${esc(result.records.note)}</p>` : "",
    archiveHtml,
    also ? `<h3>Also see</h3><ul>${also}</ul>` : "",
    result.comuneOffice ? line("Comune office", result.comuneOffice.name) : "",
    notes ? `<h3>Research notes</h3><ul>${notes}</ul>` : "",
    line("Coordinates", coords),
    timeline ? `<h3>Changes</h3><ol class="timeline">${timeline}</ol>` : "",
    shareButton(),
    inspectorCta(result),
  ].join("");
  publish(result);
}

function renderRoute() {
  if (state.stops.length < 2) {
    routeBar.hidden = true;
    routeStops.replaceChildren();
    return;
  }
  routeBar.hidden = false;
  const title = state.stops[0]?.routeTitle || "Route";
  routeTitle.textContent = title;
  routeStops.replaceChildren();
  state.stops.forEach((stop, index) => {
    const item = document.createElement("li");
    if (index === state.index) item.className = "is-current";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = String(index);
    const label = stop.label || stop.historicalName || stop.query?.place || "Stop";
    button.textContent = `${stop.query?.year || ""} ${label}`;
    item.append(button);
    routeStops.append(item);
  });
}

function publish(result) {
  const payload = state.stops.length > 1
    ? { mode: "trajectory", routeId: state.stops.find((item) => item.routeId)?.routeId || null, stops: state.stops, current: state.index }
    : result;
  let node = document.querySelector("#atlas-inspect-json");
  if (!node) {
    node = document.createElement("script");
    node.type = "application/json";
    node.id = "atlas-inspect-json";
    document.body.append(node);
  }
  node.textContent = JSON.stringify(payload);
}

function payload() {
  if (state.stops.length > 1) {
    return {
      mode: "trajectory",
      routeId: state.stops.find((item) => item.routeId)?.routeId || null,
      stops: state.stops,
    };
  }
  return state.stops[0] || null;
}

function syncMap(fly) {
  const nextFrame = frameFor(state.stops);
  if (nextFrame !== state.frame || !provinceLayer.childElementCount) {
    state.frame = nextFrame;
    buildProvinces();
    applyView(fullView());
  }
  paintYear(state.year);
  drawOverlay();
  markProvinces(state.stops[state.index] || null);
  renderRoute();
  if (fly) flyTo(boxAround(projectedStops()));
}

function show(placeRaw, yearRaw, options = {}) {
  stopPlayback();
  const atlas = state.atlas;
  const specs = atlas.stopsFromQuery(yearRaw || state.year, placeRaw);
  if (!specs.length) {
    state.placeRaw = "";
    state.stops = [];
    state.index = 0;
    searchInput.value = "";
    renderCard(null);
    syncMap(false);
    if (options.writeUrl) writeQuery({ year: state.year, place: "" });
    return null;
  }
  state.placeRaw = placeRaw;
  state.yearRaw = specs.map((stop) => stop.year).join(",");
  state.stops = specs.map((stop) => {
    const result = atlas.resolvePlace(stop.place, stop.year);
    if (stop.label && stop.label !== stop.place) result.label = stop.label;
    if (stop.routeId) result.routeId = stop.routeId;
    if (stop.routeTitle) result.routeTitle = stop.routeTitle;
    return result;
  });
  state.index = 0;
  state.year = state.stops[0]?.query?.year || atlas.clampYear(yearRaw);
  searchInput.value = placeRaw;
  searchResults.replaceChildren();
  renderCard(state.stops[0]);
  syncMap(Boolean(options.fly));
  if (options.writeUrl !== false) writeQuery({ year: state.yearRaw, place: state.placeRaw });
  return payload();
}

function selectStop(index) {
  if (!state.stops.length) return;
  state.index = Math.max(0, Math.min(state.stops.length - 1, index));
  const stop = state.stops[state.index];
  state.year = stop?.query?.year || state.year;
  paintYear(state.year);
  drawOverlay();
  markProvinces(stop);
  renderCard(stop);
  renderRoute();
}

function setYear(year, options = {}) {
  const atlas = state.atlas;
  const safe = atlas.clampYear(year);
  state.year = safe;
  paintYear(safe);
  if (state.stops.length > 1) return payload();
  state.yearRaw = String(safe);
  if (!state.placeRaw) {
    if (options.writeUrl !== false) writeQuery({ year: safe, place: "" });
    return state.atlas.banner(safe);
  }
  window.clearTimeout(resolveTimer);
  resolveTimer = window.setTimeout(() => {
    const result = atlas.resolvePlace(state.placeRaw, safe);
    state.stops = [result];
    state.index = 0;
    renderCard(result);
    syncMap(false);
    if (options.writeUrl !== false) writeQuery({ year: safe, place: state.placeRaw });
  }, 40);
  return null;
}

function stopPlayback() {
  window.clearInterval(routeTimer);
  window.clearInterval(yearTimer);
  routeTimer = 0;
  yearTimer = 0;
  const routePlay = document.querySelector("#route-play");
  const yearPlay = document.querySelector("#play-years");
  if (routePlay) routePlay.textContent = "Play route";
  if (yearPlay) yearPlay.textContent = "Play years";
}

function placeList(opts) {
  if (opts.place) return String(opts.place);
  if (Array.isArray(opts.places)) return opts.places.join(",");
  return "";
}

function yearList(opts) {
  if (opts.year !== undefined && opts.year !== null && opts.year !== "") return String(opts.year);
  if (Array.isArray(opts.years)) return opts.years.join(",");
  return "";
}

function installController() {
  const controller = {
    locate(opts = {}) {
      const place = placeList(opts) || state.placeRaw;
      const year = yearList(opts) || String(state.year);
      return show(place, year, { fly: true, writeUrl: true });
    },
    inspect(opts = {}) {
      return controller.locate(opts);
    },
    plotTrajectory(opts = {}) {
      return show(placeList(opts), yearList(opts) || String(state.year), { fly: true, writeUrl: true });
    },
    setYear(year) {
      setYear(year, { writeUrl: true });
      return controller.getState();
    },
    resolvePlace(place, year) {
      return state.atlas.resolvePlace(place, year ?? state.year);
    },
    getState() {
      const box = svg.getAttribute("viewBox").split(/\s+/).map(Number);
      const current = state.stops[state.index];
      return {
        year: state.year,
        place: current?.query?.place || state.placeRaw || "",
        routeId: state.stops.find((item) => item.routeId)?.routeId || null,
        stopIndex: state.index,
        viewport: {
          viewBox: box,
          mode: state.frame.startsWith("wide") ? "migration" : "italy",
        },
      };
    },
  };
  installAtlasApi(controller);
}

function applyTheme(theme) {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

function bootTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === "dark" ? "dark" : "light");
  themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}

function bindEvents() {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    show(searchInput.value.trim(), String(state.year), { fly: true, writeUrl: true });
  });
  searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      const query = searchInput.value.trim();
      searchResults.replaceChildren();
      if (query.length < 2 || query.includes(",")) return;
      for (const item of state.atlas.search(query, 8)) {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.name;
        const small = document.createElement("small");
        small.textContent = [item.sigla, item.province].filter(Boolean).join(" · ");
        if (small.textContent) button.append(" ", small);
        button.addEventListener("click", () => {
          show(item.name, String(state.year), { fly: true, writeUrl: true });
        });
        li.append(button);
        searchResults.append(li);
      }
    }, 140);
  });
  slider.addEventListener("input", () => {
    setYear(slider.value, { writeUrl: true });
  });
  document.querySelector("#year-prev").addEventListener("click", () => setYear(state.year - 1));
  document.querySelector("#year-next").addEventListener("click", () => setYear(state.year + 1));
  document.querySelector("#play-years").addEventListener("click", () => {
    if (yearTimer) {
      stopPlayback();
      return;
    }
    stopPlayback();
    document.querySelector("#play-years").textContent = "Stop";
    yearTimer = window.setInterval(() => {
      if (state.year >= state.atlas.yearMax) {
        stopPlayback();
        return;
      }
      setYear(state.year + 1);
    }, 180);
  });
  document.querySelector("#route-prev").addEventListener("click", () => selectStop(state.index - 1));
  document.querySelector("#route-next").addEventListener("click", () => selectStop(state.index + 1));
  document.querySelector("#route-play").addEventListener("click", () => {
    if (routeTimer) {
      stopPlayback();
      return;
    }
    if (state.stops.length < 2) return;
    if (state.index >= state.stops.length - 1) selectStop(0);
    stopPlayback();
    document.querySelector("#route-play").textContent = "Stop";
    routeTimer = window.setInterval(() => {
      if (state.index >= state.stops.length - 1) {
        stopPlayback();
        return;
      }
      selectStop(state.index + 1);
    }, 1400);
  });
  routeStops.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    selectStop(Number(button.dataset.index));
  });
  pinLayer.addEventListener("click", (event) => {
    const dot = event.target.closest?.("[data-index]");
    if (!dot) return;
    selectStop(Number(dot.dataset.index));
  });
  card.addEventListener("click", async (event) => {
    const placeButton = event.target.closest("[data-place]");
    if (placeButton) {
      show(placeButton.dataset.place, String(state.year), { fly: true, writeUrl: true });
      return;
    }
    if (event.target.closest("#copy-view")) {
      await copyShare(event.target.closest("#copy-view"));
    }
  });
  document.querySelector("#route-share").addEventListener("click", async (event) => {
    await copyShare(event.currentTarget);
  });
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.preset === "migration") {
        show("Lercara Friddi,Palermo,New York", "1878,1902,1902", { fly: true, writeUrl: true });
        return;
      }
      setYear(Number(button.dataset.preset), { writeUrl: true });
    });
  });
  mapWrap.addEventListener("mousemove", (event) => {
    const path = event.target.closest?.(".province");
    if (!path) {
      hoverTip.hidden = true;
      return;
    }
    const polity = path.dataset.polity || "unknown";
    hoverTip.hidden = false;
    hoverTip.textContent = `Modern province of ${path.dataset.name}. Sovereign in ${state.year}: ${polity}.`;
    const rect = mapWrap.getBoundingClientRect();
    hoverTip.style.left = `${event.clientX - rect.left + 14}px`;
    hoverTip.style.top = `${event.clientY - rect.top + 14}px`;
  });
  mapWrap.addEventListener("mouseleave", () => {
    hoverTip.hidden = true;
  });
  window.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable;
    if (event.key === "/" && !typing) {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
    if (event.key === "Escape") {
      searchResults.replaceChildren();
      searchInput.blur();
      if (!card.hidden) {
        state.placeRaw = "";
        state.stops = [];
        state.index = 0;
        renderCard(null);
        syncMap(false);
        writeQuery({ year: state.year, place: "" });
        flyTo(fullView());
      }
      return;
    }
    if (typing || event.target === slider) return;
    if (event.key === " " && event.target?.tagName !== "BUTTON") {
      event.preventDefault();
      document.querySelector("#play-years").click();
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setYear(state.year + step);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setYear(state.year - step);
    }
  });
  onPopState((query) => {
    const years = parseYearList(query.year);
    state.year = years[0] || 1861;
    if (query.place) show(query.place, query.year || String(state.year), { fly: true, writeUrl: false });
    else {
      state.placeRaw = "";
      state.stops = [];
      renderCard(null);
      paintYear(state.year);
      syncMap(false);
    }
  });
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

async function main() {
  bootTheme();
  banner.textContent = "Loading the atlas…";
  const [index, polities, archives, routes, geo] = await Promise.all([
    loadJson("comuni-index.json"),
    loadJson("polities.json"),
    loadJson("archives.json"),
    loadJson("routes.json"),
    loadJson("provinces.geojson"),
  ]);
  state.atlas = createAtlas({ index, polities, archives, routes });
  state.geo = geo;
  slider.min = String(state.atlas.yearMin);
  slider.max = String(state.atlas.yearMax);
  bindEvents();
  installController();
  const query = readQuery();
  const years = parseYearList(query.year);
  state.year = years[0] || 1861;
  state.yearRaw = query.year || String(state.year);
  state.frame = "italy";
  buildProvinces();
  applyView(fullView());
  paintYear(state.year);
  if (query.place) show(query.place, query.year || String(state.year), { fly: true, writeUrl: false });
}

main().catch((error) => {
  console.error(error);
  bootError.hidden = false;
  bootError.textContent = "The atlas data did not load. Serve the repository root, then open /web/. Example: python3 -m http.server";
  banner.textContent = "The atlas did not load.";
});
