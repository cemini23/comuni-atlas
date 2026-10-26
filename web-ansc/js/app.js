import { createAtlas, fold } from "./engine.mjs";
import { catastoGuide, toAttoDossier } from "./suite.mjs";

const THEME_KEY = "comuni-atlas-theme";
const SHARE_ORIGIN = "https://youratto.com/ansc/";
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

const CATASTO_FALLBACK = new Set([
  "regno-italia",
  "repubblica",
  "regno-sardegna",
  "francia",
  "napoleonico-italia",
]);

const state = { rows: [], index: new Map(), geo: null, selected: null, atlas: null };

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

function anscStatusLabel(status) {
  if (status === "anpr-population") return "Active Municipality — Ufficio dello Stato Civile & ANPR";
  if (status === "successor-comune") return "Historical Suppressed Comune — Request via Successor Municipality";
  if (status === "suppressed") return "Historical Suppressed Comune";
  return status || "";
}

function requestDraft() {
  const comune = state.selected?.name || "";
  const ancestor = document.querySelector("#ancestor-name")?.value.trim() || "";
  const year = document.querySelector("#ancestor-year")?.value.trim() || "";
  const act = document.querySelector("#act-type")?.value || "Estratto di Nascita con paternità e maternità";
  if (!comune) {
    return {
      subject: "",
      body: "Select a comune first. The request is addressed to that Ufficio dello Stato Civile.",
    };
  }
  const person = ancestor || "[nome e cognome dell'antenato]";
  const eventYear = year || "[anno]";
  return {
    subject: `Richiesta di ${act} — ${person} — ${eventYear} — Comune di ${comune}`,
    body: `Spett.le Ufficio dello Stato Civile del Comune di ${comune}, ai sensi degli articoli 106, 107 e 108 del DPR 396/2000, chiedo il rilascio del seguente atto: ${act}, relativo a ${person}, anno ${eventYear}. Cordiali saluti.`,
  };
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

function attoFileName(dossier) {
  const place = dossier.modernName || dossier.historicalName || dossier.query?.place || "comune";
  const year = dossier.query?.year == null ? "year" : dossier.query.year;
  return `${comuneSlug(place)}-${year}.atto-place.json`;
}

function downloadJson(filename, data) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function loadAtlas() {
  if (state.atlas) return Promise.resolve(state.atlas);
  if (!state.atlasPromise) {
    state.atlasPromise = Promise.all([
      loadJson("comuni-index.json"),
      loadJson("polities.json"),
      loadJson("archives.json"),
      loadJson("routes.json"),
      loadJson("contacts.json"),
      loadJson("dioceses.json"),
    ]).then(([index, polities, archives, routes, contacts, dioceses]) => {
      state.atlas = createAtlas({ index, polities, archives, routes, contacts, dioceses });
      return state.atlas;
    });
  }
  return state.atlasPromise;
}

function dossierYear(atlas) {
  const typed = Number(document.querySelector("#ancestor-year")?.value.trim());
  if (Number.isInteger(typed) && typed >= atlas.yearMin && typed <= atlas.yearMax) return typed;
  return atlas.yearMax;
}

function rowResult(row, year) {
  return {
    matched: true,
    query: { place: row.name, year },
    historicalName: row.name,
    modernName: row.name,
    istat: row.istat || "",
    catasto: row.catasto || "",
    modernProvince: {
      name: row.province || "",
      code: "",
      sigla: row.sigla || "",
      region: row.region || "",
    },
    stato_civile_office: {
      name: `Ufficio di Stato Civile del Comune di ${row.name}`,
      pec: row.pec || "",
      address: row.address || "",
      website: row.website || "",
    },
  };
}

function guideFor(atlas, result) {
  if (!result?.matched || !result.sovereign) return undefined;
  const region = result.modernProvince?.region || result.historicalProvince?.region || "";
  const sovereignId = result.sovereign.id || "";
  let options = {};
  if (CATASTO_FALLBACK.has(sovereignId)) {
    const earlier = atlas.resolvePlace(result.query?.place || result.modernName || "", 1850);
    options = {
      fallbackId: earlier?.sovereign?.id || "",
      fallbackRegion: earlier?.modernProvince?.region || earlier?.historicalProvince?.region || "",
    };
  }
  return {
    ...catastoGuide(sovereignId, region, options),
    antenatiUrl: result.archive?.antenatiUrl || "",
  };
}

async function activeDossier() {
  const row = state.selected;
  if (!row) return null;
  const atlas = await loadAtlas();
  const year = dossierYear(atlas);
  const resolved = atlas.resolvePlace(row.name, year);
  const sameTown = !row.istat || !resolved?.istat || resolved.istat === row.istat;
  const result = resolved?.matched && sameTown ? resolved : rowResult(row, year);
  const extras = {};
  const guide = guideFor(atlas, result);
  if (guide) extras.catasto_guide = guide;
  if (result.parish_routing) {
    extras.parrocchie = {
      diocese: result.parish_routing.diocese || "",
      archive: result.parish_routing.archive || "",
      bewebUrl: result.parish_routing.bewebUrl || "",
      required: Boolean(result.parish_routing.required),
    };
  }
  return toAttoDossier(result, extras);
}

function paintRequest() {
  const subject = document.querySelector("#request-subject");
  const body = document.querySelector("#request-body");
  if (!subject || !body) return;
  const draft = requestDraft();
  subject.textContent = draft.subject;
  body.textContent = draft.body;
}

function renderRow(row) {
  state.selected = row;
  drawMap(row.region || "");
  const pecLabel = row.pecSource === "indicepa" ? "Official PEC" : "PEC pattern, confirm before you send";
  const aliases = (row.historicalAliases || []).join(", ");
  result.innerHTML = `
    <h2>${esc(row.name)}</h2>
    <p class="status">${esc(anscStatusLabel(row.anscStatus))}</p>
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
  status.textContent = `${row.name} (${row.province || row.sigla}, ${row.region}) — Official PEC & Municipio routing.`;
  writeQuery(row.name);
  paintRequest();
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
  paintRequest();
  for (const id of ["ancestor-name", "ancestor-year", "act-type"]) {
    document.querySelector(`#${id}`)?.addEventListener("input", paintRequest);
    document.querySelector(`#${id}`)?.addEventListener("change", paintRequest);
  }
  document.querySelector("#copy-request")?.addEventListener("click", async (event) => {
    const draft = requestDraft();
    const text = draft.subject ? `Oggetto: ${draft.subject}\n\n${draft.body}` : draft.body;
    await copyText(event.currentTarget, text);
  });
  document.querySelector("#copy-atto-dossier")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!state.selected) {
      button.textContent = "Select a comune first.";
      return;
    }
    button.textContent = "Loading dossier…";
    let dossier;
    try {
      dossier = await activeDossier();
    } catch {
      button.textContent = "The dossier did not load.";
      return;
    }
    try {
      await navigator.clipboard.writeText(dossier.clipboardText);
      button.textContent = "Copied — Paste into Atto → Documents";
    } catch {
      button.textContent = dossier.clipboardText || "Copy failed";
    }
  });
  document.querySelector("#download-atto-json")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!state.selected) {
      button.textContent = "Select a comune first.";
      return;
    }
    const label = button.textContent;
    button.textContent = "Loading dossier…";
    try {
      const dossier = await activeDossier();
      downloadJson(attoFileName(dossier), dossier);
      button.textContent = label;
    } catch {
      button.textContent = "The dossier did not load.";
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const rows = search(input.value);
    renderHits(rows);
    if (rows[0]) renderRow(rows[0]);
    else {
      state.selected = null;
      result.innerHTML = "<p>No comune matches this name.</p>";
      drawMap("");
      paintRequest();
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
    status.textContent = "Search any of Italy's 7,900+ municipalities or historical Comuni Soppressi for official PEC and Municipio contact details.";
  }
}

main().catch((error) => {
  console.error(error);
  bootError.hidden = false;
  bootError.textContent = "The PEC data did not load. Serve the repository root, then open /web-ansc/.";
  status.textContent = "The PEC data did not load.";
});
