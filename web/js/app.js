import { createAtlas, fold, parseYearList } from "./engine.mjs";
import { catastoGuide } from "./suite.mjs";
import { installAtlasApi } from "./atlas-api.js";
import { onPopState, readQuery, writeQuery } from "./router.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const THEME_KEY = "comuni-atlas-theme";
const SHARE_ORIGIN = "https://youratto.com/atlas/";
const DEFAULT_TITLE = "Atto Historical Atlas (1796–2026)";
const ITALY = { minLng: 6.55, maxLng: 18.85, minLat: 35.45, maxLat: 47.12, w: 1000, h: 1180 };
const WIDE = { w: 1600, h: 1000 };
const WIDE_SPLIT_LAT = 34;
const WIDE_NORTH_SHARE = 0.62;

const banner = document.querySelector("#regime-banner");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchResults = document.querySelector("#search-results");
const legend = document.querySelector("#legend");
const svg = document.querySelector("#map");
const provinceLayer = document.querySelector("#provinces");
const arcLayer = document.querySelector("#arcs");
const pinLayer = document.querySelector("#pins");
const portLayer = document.querySelector("#ports");
const railLayer = document.querySelector("#rail");
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
  routeId: "",
  portsOn: true,
  railOn: false,
  rail: null,
  stops: [],
  index: 0,
  frame: "italy",
  wideLat: { min: ITALY.minLat, max: ITALY.maxLat },
  view: { x: 0, y: 0, w: ITALY.w, h: ITALY.h },
  lastResult: null,
  portOpen: false,
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
  return [x, wideY(lat)];
}

/** Give the European band most of the height; keep the Americas below it. */
function wideY(lat) {
  const north = state.wideLat.max;
  const south = state.wideLat.min;
  if (south >= WIDE_SPLIT_LAT || north <= WIDE_SPLIT_LAT) {
    return yFromLat(lat, south, north, WIDE.h);
  }
  const top = mercator(north);
  const mid = mercator(WIDE_SPLIT_LAT);
  const bottom = mercator(south);
  const splitY = WIDE.h * WIDE_NORTH_SHARE;
  const y = mercator(lat);
  if (y >= mid) return ((top - y) / (top - mid)) * splitY;
  return splitY + ((mid - y) / (mid - bottom)) * (WIDE.h - splitY);
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
    // The southern band is compressed, so it needs a wider latitude margin.
    const pad = lat < WIDE_SPLIT_LAT ? 8 : 1.5;
    min = Math.min(min, lat - pad);
    max = Math.max(max, lat + 1.5);
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

function paintYear(year, label = year) {
  const atlas = state.atlas;
  const model = atlas.clampYear(year);
  for (const path of provinceLayer.children) {
    const info = atlas.provinceAt(path.dataset.code, model);
    path.setAttribute("fill", info?.color || "#d9d0c0");
    path.dataset.polity = info?.polity?.nameEn || "";
  }
  yearStamp.textContent = String(label);
  readout.textContent = String(model);
  slider.value = String(model);
  const report = atlas.banner(model);
  const names = report.polities.slice(0, 4).map((item) => item.nameEn).join(", ");
  const stamp = String(label) === String(model) ? `1 July ${model}` : `Chronicle ${label}. Map 1 July ${model}`;
  banner.textContent = `${report.epoch?.name || "Atlas"} · ${stamp}. ${names}.`;
  legend.replaceChildren();
  for (const item of report.polities) {
    const row = document.createElement("div");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = item.color || "#b7aa96";
    row.append(swatch, document.createTextNode(`${item.nameEn} (${item.provinces})`));
    legend.append(row);
  }
  drawRail(model);
  markSelectionControls();
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
    label.textContent = point.stop.query?.place || point.stop.historicalName || point.stop.label || "";
    pinLayer.append(dot, label);
  }
  drawPorts();
}

function drawRail(year = state.year) {
  if (!railLayer) return;
  railLayer.replaceChildren();
  if (!state.railOn || !state.rail) return;
  const current = Number(year);
  for (const line of state.rail.lines || []) {
    if (Number(line.year) > current) continue;
    const points = (line.coordinates || []).map(([lng, lat]) => {
      const [x, y] = project(lng, lat);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    if (points.length < 2) continue;
    const path = document.createElementNS(SVG_NS, "polyline");
    path.setAttribute("class", "rail-line");
    path.setAttribute("fill", "none");
    path.setAttribute("points", points.join(" "));
    railLayer.append(path);
  }
}

function drawPorts() {
  if (!portLayer) return;
  portLayer.replaceChildren();
  if (!state.portsOn || !state.atlas) return;
  const stops = projectedStops();
  (state.atlas.ports || []).forEach((port, index) => {
    const [x, y] = project(port.lng, port.lat);
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "port-dot");
    dot.setAttribute("cx", x.toFixed(1));
    dot.setAttribute("cy", y.toFixed(1));
    dot.setAttribute("r", "7");
    dot.dataset.port = String(index);
    portLayer.append(dot);
    const nearStop = stops.some((stop) => Math.hypot(stop.x - x, stop.y - y) < 18);
    if (nearStop) return;
    const rail = /rail crossing/i.test(port.name);
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "pin-label port-label");
    label.setAttribute("x", (x + (rail ? -10 : 9)).toFixed(1));
    label.setAttribute("y", (y + 4).toFixed(1));
    if (rail) label.setAttribute("text-anchor", "end");
    label.textContent = port.name.replace(/\s+alpine rail crossing$/i, "");
    portLayer.append(label);
  });
}

function renderPort(port) {
  state.portOpen = true;
  card.hidden = false;
  document.title = `${port.name} — Emigration port | Atto Historical Atlas`;
  card.innerHTML = [
    closeButton(),
    `<h2>${esc(port.name)}</h2>`,
    `<p class="warn">Historic emigration hub, ${esc(port.years)}.</p>`,
    line("Peak years", port.peak),
    line("Catchment", port.catchment),
    line("Routes", port.routes),
    line("Passenger lists", port.archives),
    shareButton(),
  ].join("");
}

function line(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<p><strong>${esc(label)}.</strong> ${esc(value)}</p>`;
}

function shareUrl(year, place, route = "") {
  const params = new URLSearchParams();
  if (route) params.set("route", route);
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

function closeButton() {
  return `<button type="button" class="card-close" data-close aria-label="Clear the selection">×</button>`;
}

function inspectorCta(result) {
  if (!result?.matched || result.kind === "external") return "";
  const modern = result.modernName || result.historicalName || "this town";
  const code = result.modernProvince?.code || result.historicalProvince?.code || "";
  const place = code ? `${modern} (${code})` : modern;
  const href = `https://youratto.com?utm_source=atlas&utm_medium=inspector&utm_campaign=${encodeURIComponent(comuneSlug(modern))}`;
  return `<aside class="atto-cta">
    <p><strong>Tracking records from ${esc(place)}?</strong></p>
    <p>Atto for Mac &amp; Windows builds archive Find links, spots name and date mismatches across acts, and keeps your civil-record packet organized offline on your computer.</p>
    <p><a class="pill" href="${esc(href)}">See How Atto Works →</a></p>
  </aside>`;
}

async function copyShare(button) {
  const stop = state.stops[state.index];
  const url = state.routeId
    ? shareUrl(stop?.query?.year || state.year, stop?.query?.place || state.placeRaw, state.routeId)
    : shareUrl(state.yearRaw || state.year, state.placeRaw);
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = "Copied";
  } catch {
    button.textContent = url;
  }
}

function anscStatusLabel(status) {
  if (status === "anpr-population") return "Active Municipality (ANPR / Stato Civile)";
  if (status === "successor-comune") return "Merged / Suppressed Comune (Request via Successor Municipality)";
  if (status === "suppressed") return "Historical Suppressed Comune";
  return status || "";
}

function officeSection(result) {
  const office = result.stato_civile_office;
  if (!office) return "";
  const modern = result.modernName || office.comune || "this town";
  const href = `https://youratto.com?utm_source=atlas&utm_medium=pec&utm_campaign=${encodeURIComponent(comuneSlug(modern))}`;
  const pecLabel = office.pecSource === "indicepa" ? "Official PEC" : "PEC pattern, confirm before you send";
  const website = office.website
    ? `<p><strong>Website.</strong> <a href="${esc(office.website)}" rel="noopener noreferrer">${esc(office.website)}</a></p>`
    : "";
  return `<section class="office-box">
    <h3>Ufficio dello Stato Civile (Request Certificates)</h3>
    <p><strong>${esc(pecLabel)}.</strong> ${esc(office.pec)}</p>
    <p><button type="button" id="copy-pec" data-pec="${esc(office.pec)}">Copy PEC</button></p>
    ${line("Municipio", office.address)}
    ${website}
    ${office.note ? `<p>${esc(office.note)}</p>` : ""}
    <p><strong>ANSC.</strong> ${esc(anscStatusLabel(office.anscStatus))}. ${esc(office.anscNote)}</p>
    <p class="atto-cta">Sending a request to ${esc(modern)}? Atto for Mac &amp; Windows builds archive Find links, spots name and date mismatches across acts, and keeps your civil-record packet organized offline on your computer. <a href="${esc(href)}"><strong>Open Atto</strong> →</a></p>
  </section>`;
}

const CATASTO_FALLBACK = new Set([
  "regno-italia",
  "repubblica",
  "regno-sardegna",
  "francia",
  "napoleonico-italia",
]);

function catastoSection(result) {
  if (!result?.matched) return "";
  const region = result.modernProvince?.region || result.historicalProvince?.region || "";
  const sovereignId = result.sovereign?.id || "";
  let options = {};
  if (CATASTO_FALLBACK.has(sovereignId) && state.atlas) {
    const earlier = state.atlas.resolvePlace(result.query?.place || result.modernName || "", 1850);
    options = {
      fallbackId: earlier?.sovereign?.id || "",
      fallbackRegion: earlier?.modernProvince?.region || earlier?.historicalProvince?.region || "",
    };
  }
  const guide = catastoGuide(sovereignId, region, options);
  const link = result.archive?.antenatiUrl
    ? `<p><a href="${esc(result.archive.antenatiUrl)}" rel="noopener noreferrer">State Archive guide on Portale Antenati</a></p>`
    : "";
  const years = guide.years ? ` ${esc(guide.years)}` : "";
  return `<section class="catasto-box">
    <h3>Cadastre guide</h3>
    <p><strong>${esc(guide.name)}</strong>${years}</p>
    ${guide.note ? `<p>${esc(guide.note)}</p>` : ""}
    ${link}
  </section>`;
}

function parishSection(result) {
  const parish = result.parish_routing;
  if (!parish?.required) return "";
  const church = parish.church ? line("Historic church", parish.church) : "";
  return `<section class="parish-box">
    <p class="parish-badge">⚠️ Pre-Civil Registration Era — Parish &amp; Diocesan Records Required</p>
    ${line("Diocese", parish.diocese)}
    ${line("Diocesan archive", parish.archive)}
    ${line("Cathedral", parish.cathedral)}
    ${church}
    <p><strong>Request.</strong> ${esc((parish.recordTypes || []).join(", "))}</p>
    <p>${esc(parish.note || "")}</p>
    ${parish.provinceNote ? `<p>${esc(parish.provinceNote)}</p>` : ""}
    <p><a href="${esc(parish.bewebUrl)}" rel="noopener noreferrer">Search this diocese on BeWeB →</a></p>
  </section>`;
}

function renderCard(result) {
  state.portOpen = false;
  state.lastResult = result || null;
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
    card.innerHTML = `${closeButton()}<h2>No match</h2><p>No town matches this name for the selected year.</p>${hints ? `<h3>Close names</h3><ul>${hints}</ul>` : ""}`;
    publish(result);
    return;
  }
  if (result.existed === false) {
    card.innerHTML = [
      closeButton(),
      `<h2>${esc(result.historicalName || result.modernName)}</h2>`,
      line("Year", `1 July ${year}`),
      `<p class="warn">${esc(result.note || "This comune did not exist on this date.")}</p>`,
      result.successor ? line("Later comune", `${result.successor.name} · ISTAT ${result.successor.istat || "—"}`) : "",
      officeSection(result),
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
    closeButton(),
    `<h2>${esc(place)}</h2>`,
    line("Modern name", result.modernName),
    result.rangeNote ? line("Chronicle year", year) : line("Date", `1 July ${year}`),
    result.note ? `<p>${esc(result.note)}</p>` : "",
    result.ambiguous ? `<p class="warn">Multiple Italian municipalities share a similar name. Select a municipality below:</p>` : "",
    alternates ? `<ul>${alternates}</ul>` : "",
    line("ISTAT", result.istat || ""),
    line("Catasto", result.catasto || ""),
    line("Sovereign", result.sovereign ? `${result.sovereign.name} · ${result.sovereign.nameEn}` : ""),
    catastoSection(result),
    line("Epoch", result.epoch?.name || ""),
    line("Historical province", result.historicalProvince ? `${result.historicalProvince.name} (${result.historicalProvince.code}) · ${result.historicalProvince.region}` : ""),
    line("Modern province", result.modernProvince ? `${result.modernProvince.name} (${result.modernProvince.code}) · ${result.modernProvince.region}` : ""),
    result.provinceShift?.warning ? `<p class="warn">${esc(result.provinceShift.warning)}</p>` : "",
    result.label ? line("Stop", result.label) : "",
    result.rangeNote ? `<p class="warn">${esc(result.rangeNote)}</p>` : "",
    parishSection(result),
    line("Register", result.records ? `${result.records.nameEn}${result.records.civilRegistration ? " · civil register" : " · not a civil register"}` : ""),
    result.records?.note ? `<p>${esc(result.records.note)}</p>` : "",
    archiveHtml,
    also ? `<h3>Also see</h3><ul>${also}</ul>` : "",
    officeSection(result),
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
    const place = stop.query?.place || stop.historicalName || "Stop";
    const year = stop.query?.year || "";
    button.textContent = `${year} ${place}`.trim();
    button.title = stop.label || place;
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
  if (!fly) flyToken += 1;
  const nextFrame = frameFor(state.stops);
  if (nextFrame !== state.frame || !provinceLayer.childElementCount) {
    state.frame = nextFrame;
    buildProvinces();
    applyView(fullView());
  }
  const currentStop = state.stops[state.index] || null;
  paintYear(state.year, currentStop?.query?.year ?? state.year);
  drawOverlay();
  markProvinces(currentStop);
  renderRoute();
  if (fly) flyTo(boxAround(projectedStops()));
}

function clearSelection(options = {}) {
  stopPlayback();
  state.placeRaw = "";
  state.routeId = "";
  state.stops = [];
  state.index = 0;
  state.yearRaw = String(state.year);
  searchInput.value = "";
  searchResults.replaceChildren();
  renderCard(null);
  syncMap(false);
  if (options.writeUrl !== false) writeQuery({ year: state.year, place: "", route: "" });
  if (options.fly !== false) flyTo(fullView());
}

/** A port card is a side lookup: closing it returns to the selected town. */
function dismissCard() {
  if (state.portOpen && state.lastResult) {
    renderCard(state.lastResult);
    return;
  }
  clearSelection();
}

function markSelectionControls() {
  const nav = document.querySelector("#chronicles");
  if (nav) {
    for (const button of nav.querySelectorAll("[data-route]")) {
      const active = Boolean(state.routeId) && fold(button.dataset.route) === fold(state.routeId);
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }
  for (const button of document.querySelectorAll("[data-preset]")) {
    const preset = button.dataset.preset;
    const active = preset === "migration"
      ? Boolean(state.routeId) && fold(state.routeId) === "lercara-new-york"
      : !state.routeId && !state.placeRaw && Number(preset) === Number(state.year);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function writeView() {
  const stop = state.stops[state.index];
  if (state.routeId && stop) {
    writeQuery({ route: state.routeId, year: stop.query?.year || state.year, place: stop.query?.place || "" });
    return;
  }
  writeQuery({ year: state.yearRaw || state.year, place: state.placeRaw, route: "" });
}

function materialize(specs) {
  return specs.map((stop) => {
    const result = state.atlas.resolvePlace(stop.place, stop.year);
    if (stop.label && stop.label !== stop.place) result.label = stop.label;
    if (stop.routeId) result.routeId = stop.routeId;
    if (stop.routeTitle) result.routeTitle = stop.routeTitle;
    return result;
  });
}

function focusStop(year, place) {
  if (!place || String(place).includes(",")) return 0;
  const wantedPlace = fold(place);
  const wantedYear = year ? String(year).split(/[,;|\s]+/)[0] : "";
  const index = state.stops.findIndex((stop) => {
    const names = [stop.query?.place, stop.historicalName, stop.modernName, stop.label];
    const samePlace = names.some((name) => name && fold(name) === wantedPlace);
    if (!samePlace) return false;
    if (!wantedYear) return true;
    return String(stop.query?.year) === wantedYear;
  });
  return index >= 0 ? index : 0;
}

function show(placeRaw, yearRaw, options = {}) {
  stopPlayback();
  const atlas = state.atlas;
  const specs = atlas.stopsFromQuery(yearRaw || state.year, placeRaw);
  if (!specs.length) {
    state.placeRaw = "";
    state.routeId = "";
    state.stops = [];
    state.index = 0;
    searchInput.value = "";
    renderCard(null);
    syncMap(false);
    if (options.writeUrl) writeQuery({ year: state.year, place: "", route: "" });
    return null;
  }
  state.placeRaw = placeRaw;
  state.routeId = specs.find((stop) => stop.routeId)?.routeId || "";
  state.yearRaw = specs.map((stop) => stop.year).join(",");
  state.stops = materialize(specs);
  state.index = 0;
  const first = state.stops[0];
  state.year = first?.query?.modelYear || first?.query?.year || atlas.clampYear(yearRaw);
  searchInput.value = specs.length > 1 ? (first?.query?.place || placeRaw) : placeRaw;
  searchResults.replaceChildren();
  renderCard(first);
  syncMap(Boolean(options.fly));
  if (options.writeUrl !== false) writeView();
  return payload();
}

function showRoute(routeId, options = {}) {
  const specs = state.atlas.stopsFromRoute(routeId);
  if (!specs.length) return show(options.place || "", options.year || String(state.year), options);
  stopPlayback();
  state.routeId = specs[0].routeId;
  state.placeRaw = specs.map((stop) => stop.place).join(",");
  state.yearRaw = specs.map((stop) => stop.year).join(",");
  state.stops = materialize(specs);
  state.index = focusStop(options.year, options.place);
  const current = state.stops[state.index];
  state.year = current?.query?.modelYear || current?.query?.year || state.year;
  searchInput.value = current?.historicalName || current?.query?.place || "";
  searchResults.replaceChildren();
  renderCard(current);
  syncMap(options.fly !== false);
  if (options.writeUrl !== false) writeView();
  return payload();
}

function selectStop(index) {
  if (!state.stops.length) return;
  state.index = Math.max(0, Math.min(state.stops.length - 1, index));
  const stop = state.stops[state.index];
  state.year = stop?.query?.modelYear || stop?.query?.year || state.year;
  paintYear(state.year, stop?.query?.year || state.year);
  drawOverlay();
  markProvinces(stop);
  renderCard(stop);
  renderRoute();
  writeView();
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
  const resolveNow = () => {
    const result = atlas.resolvePlace(state.placeRaw, safe);
    state.stops = [result];
    state.index = 0;
    renderCard(result);
    syncMap(false);
    if (options.writeUrl !== false) writeQuery({ year: safe, place: state.placeRaw });
    return payload();
  };
  window.clearTimeout(resolveTimer);
  if (options.debounce === true) {
    resolveTimer = window.setTimeout(resolveNow, 40);
    return null;
  }
  return resolveNow();
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
      if (opts.route || opts.person) return controller.playRoute(opts.route || opts.person);
      return show(placeList(opts), yearList(opts) || String(state.year), { fly: true, writeUrl: true });
    },
    playRoute(slug) {
      return showRoute(slug, { fly: true, writeUrl: true });
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
    setYear(slider.value, { writeUrl: true, debounce: true });
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
    if (event.target.closest("[data-close]")) {
      dismissCard();
      return;
    }
    const placeButton = event.target.closest("[data-place]");
    if (placeButton) {
      show(placeButton.dataset.place, String(state.year), { fly: true, writeUrl: true });
      return;
    }
    const pecButton = event.target.closest("#copy-pec");
    if (pecButton) {
      try {
        await navigator.clipboard.writeText(pecButton.dataset.pec || "");
        pecButton.textContent = "Copied";
      } catch {
        pecButton.textContent = pecButton.dataset.pec || "Copy failed";
      }
      return;
    }
    if (event.target.closest("#copy-view")) {
      await copyShare(event.target.closest("#copy-view"));
    }
  });
  portLayer?.addEventListener("click", (event) => {
    const dot = event.target.closest?.("[data-port]");
    if (!dot) return;
    const port = state.atlas.ports[Number(dot.dataset.port)];
    if (port) renderPort(port);
  });
  document.querySelector("#ports-toggle")?.addEventListener("click", (event) => {
    state.portsOn = !state.portsOn;
    event.currentTarget.setAttribute("aria-pressed", state.portsOn ? "true" : "false");
    event.currentTarget.textContent = state.portsOn ? "Hide emigration ports" : "Show emigration ports";
    drawPorts();
  });
  document.querySelector("#rail-toggle")?.addEventListener("click", (event) => {
    state.railOn = !state.railOn;
    event.currentTarget.setAttribute("aria-pressed", state.railOn ? "true" : "false");
    event.currentTarget.textContent = state.railOn ? "Hide historical railways" : "Show historical railways";
    drawRail();
  });
  document.querySelector("#chronicles")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-route]");
    if (!button) return;
    if (state.routeId && fold(button.dataset.route) === fold(state.routeId)) {
      clearSelection();
      return;
    }
    showRoute(button.dataset.route, { fly: true, writeUrl: true });
  });
  document.querySelector("#route-clear")?.addEventListener("click", () => clearSelection());
  document.querySelector("#sea")?.addEventListener("click", () => {
    if (!card.hidden || state.stops.length) dismissCard();
  });
  document.querySelector("#route-share").addEventListener("click", async (event) => {
    await copyShare(event.currentTarget);
  });
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.preset === "migration") {
        if (state.routeId && fold(state.routeId) === "lercara-new-york") {
          clearSelection();
          return;
        }
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
      if (document.activeElement === searchInput) searchInput.blur();
      if (!card.hidden) dismissCard();
      else if (state.stops.length) clearSelection();
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
  onPopState((query) => openQuery(query, false));
}

function renderChronicles() {
  const nav = document.querySelector("#chronicles");
  if (!nav) return;
  nav.replaceChildren();
  for (const route of state.atlas.routes) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.route = route.id;
    button.textContent = route.titleEn || route.title;
    nav.append(button);
  }
}

function openQuery(query, fly) {
  const years = parseYearList(query.year);
  state.year = years[0] || state.year || 1861;
  if (query.route) {
    showRoute(query.route, { fly, writeUrl: false, year: query.year, place: query.place });
    return;
  }
  if (query.place) {
    show(query.place, query.year || String(state.year), { fly, writeUrl: false });
    return;
  }
  clearSelection({ fly, writeUrl: false });
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
  const [index, polities, archives, routes, contacts, dioceses, geo, rail] = await Promise.all([
    loadJson("comuni-index.json"),
    loadJson("polities.json"),
    loadJson("archives.json"),
    loadJson("routes.json"),
    loadJson("contacts.json"),
    loadJson("dioceses.json"),
    loadJson("provinces.geojson"),
    loadJson("rail-catasti.json"),
  ]);
  state.atlas = createAtlas({ index, polities, archives, routes, contacts, dioceses });
  state.geo = geo;
  state.rail = rail;
  slider.min = String(state.atlas.yearMin);
  slider.max = String(state.atlas.yearMax);
  bindEvents();
  installController();
  renderChronicles();
  const query = readQuery();
  const years = parseYearList(query.year);
  state.year = years[0] || 1861;
  state.yearRaw = query.year || String(state.year);
  state.frame = "italy";
  buildProvinces();
  applyView(fullView());
  paintYear(state.year);
  drawPorts();
  if (query.route || query.place) openQuery(query, true);
}

main().catch((error) => {
  console.error(error);
  bootError.hidden = false;
  bootError.textContent = "The atlas data did not load. Serve the repository root, then open /web/. Example: python3 -m http.server";
  banner.textContent = "The atlas did not load.";
});
