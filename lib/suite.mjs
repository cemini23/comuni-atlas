/**
 * Genealogy suite helpers. No file system and no DOM.
 * The CLI and the static apps both import this module.
 */

import { fold, norm } from "./engine.mjs";

const NONE = {
  id: "none",
  name: "No cadastre in this guide",
  years: "",
  laterThanSurvey: false,
  note: "",
};

const AUSTRIACO = {
  id: "austriaco",
  name: "Catasto Lombardo-Veneto / Austriaco",
  years: "1807–1853",
};

const MURATTIANO = {
  id: "murattiano",
  name: "Catasto Provvisorio / Murattiano",
  years: "1806–1815",
};

const SURVEYS = {
  papal: { id: "gregoriano", name: "Catasto Gregoriano", years: "1816–1835" },
  "lombardo-veneto": AUSTRIACO,
  toscana: { id: "leopoldino", name: "Catasto Ferdinandeo-Leopoldino", years: "1817–1835" },
  murat: MURATTIANO,
  "napoli-borbone": MURATTIANO,
  "sicilia-borbone": MURATTIANO,
  "due-sicilie": MURATTIANO,
};

const AUSTRIAN_REGIONS = ["Lombardia", "Veneto", "Friuli-Venezia Giulia"];
const PREFIXES = new Set(["de", "di", "d", "del", "della", "dello", "degli", "dei", "dai"]);
const PORT_LABEL = "heuristic port, not a passenger record";
const AGE_NOTE = "The model uses age 20. Call-up year is the birth year plus 20. Some classes were called at 18 or 21. This is a finding aid, not a service record.";
const FOGLI_NOTE = "Fogli Matricolari are books held with the liste.";
const AUSTRIAN_NOTE = "Italian liste di leva on this ground start after annexation. This call-up year is an Austrian conscription year.";
const LATER_NOTE = "This query year is later than the survey. The cadastre is a finding aid for the pre-unification ground.";
const NAPLES_NOTE = "This is the Kingdom of Naples finding aid.";
const NO_EPICENTER = "There is no epicenter.";

function guideRow(row, note = "") {
  return {
    id: row.id,
    name: row.name,
    years: row.years,
    laterThanSurvey: false,
    note,
  };
}

function mapSovereign(sovereignId, region) {
  if (sovereignId === "austria" || sovereignId === "austria-hungary") {
    if (AUSTRIAN_REGIONS.includes(region)) return guideRow(AUSTRIACO);
    return { ...NONE };
  }
  const row = SURVEYS[sovereignId];
  if (!row) return { ...NONE };
  return guideRow(row, row.id === "murattiano" ? NAPLES_NOTE : "");
}

export function catastoGuide(sovereignId, region, options = {}) {
  if (sovereignId === "regno-italia") {
    const mapped = mapSovereign(options.fallbackId, options.fallbackRegion || region || "");
    if (!mapped || mapped.id === "none") return { ...NONE };
    return {
      ...mapped,
      laterThanSurvey: true,
      note: LATER_NOTE,
    };
  }
  return mapSovereign(sovereignId, region || "");
}

function archiveList(archives) {
  if (Array.isArray(archives)) return archives;
  return (archives && archives.archives) || [];
}

function pickArchive(archives, code, provinceName) {
  const candidates = archiveList(archives).filter((item) => (item.provinces || []).includes(code));
  if (!candidates.length) return null;
  if (provinceName) {
    const named = candidates.find((item) => String(item.name || "").endsWith(provinceName));
    if (named) return named;
  }
  return candidates[0];
}

export function levaFromResolution(birthYear, atBirth, atCallUp, archives) {
  const year = Number(birthYear);
  const callUpYear = year + 20;
  const provinceName = atCallUp?.historicalProvince?.name || "";
  const code = atCallUp?.historicalProvince?.code || "";
  const sovereignId = atCallUp?.sovereign?.id || "";
  const austrian = sovereignId === "lombardo-veneto" || sovereignId === "austria" || sovereignId === "austria-hungary";
  const italianRolls = Boolean(atCallUp?.matched) && !austrian;
  const archive = pickArchive(archives, code, provinceName);
  const role = italianRolls ? "liste-di-leva" : "later-italian-archive";
  const note = italianRolls
    ? `${AGE_NOTE} ${FOGLI_NOTE}`
    : `${AGE_NOTE} ${FOGLI_NOTE} ${AUSTRIAN_NOTE}`;
  return {
    birthYear: year,
    classe: year,
    callUpYear,
    district: `Distretto Militare di ${provinceName}`,
    historicalProvince: provinceName,
    italianRolls,
    archive: {
      name: archive?.name || "",
      antenatiUrl: archive?.antenatiUrl || "",
      role,
    },
    note,
  };
}

export function filterParishes(rows, year) {
  const numeric = Number(year);
  return (rows || []).filter((row) => {
    const inception = row?.inceptionYear;
    if (inception === null || inception === undefined || inception === "") return true;
    if (!Number.isFinite(numeric)) return true;
    return Number(inception) <= numeric;
  });
}

function foundlingKeys(row) {
  if (Array.isArray(row.keys) && row.keys.length) return row.keys.map((key) => fold(key));
  return (row.surnames || []).map((name) => fold(name));
}

function foundlingHit(db, folded) {
  for (const row of db?.foundlings || []) {
    if (foundlingKeys(row).includes(folded)) return row;
  }
  return null;
}

function comuneNamed(places, folded) {
  let best = null;
  for (const place of places || []) {
    if (place.kind && place.kind !== "comune") continue;
    if (fold(place.name) !== folded) continue;
    if (!best || (place.population || 0) > (best.population || 0)) best = place;
  }
  return best;
}

function portById(db) {
  const map = new Map();
  for (const port of db?.ports || []) map.set(port.id, port);
  return map;
}

function portsFor(region, db) {
  const table = portById(db);
  let ids = ["genova"];
  if (region === "Sicilia") ids = ["palermo", "messina"];
  else if (["Campania", "Basilicata", "Calabria", "Puglia", "Molise", "Abruzzo"].includes(region)) ids = ["napoli"];
  else if (["Sardegna", "Lombardia", "Piemonte", "Liguria", "Valle d'Aosta/Vallée d'Aoste", "Emilia-Romagna"].includes(region)) ids = ["genova"];
  else if (region === "Veneto" || region === "Friuli-Venezia Giulia") ids = ["trieste", "genova"];
  else if (region === "Toscana") ids = ["livorno", "genova"];
  return ids
    .map((id) => table.get(id))
    .filter(Boolean)
    .map((port) => ({
      id: port.id,
      name: port.name,
      lat: port.lat,
      lng: port.lng,
      note: PORT_LABEL,
    }));
}

function foundlingBlock(hit) {
  return {
    hospital: hit.hospital ?? null,
    city: hit.city ?? null,
    note: hit.note || "",
  };
}

export function analyzeSurname(raw, db, places) {
  const typed = String(raw ?? "").trim();
  const folded = fold(typed);
  const curated = (db && db.surnames && db.surnames[folded]) || null;
  const dossier = {
    mode: "surname",
    surname: (curated && curated.surname) || typed,
    category: (curated && curated.category) || "unclassified",
    census: false,
    estimate: true,
    ambiguous: Boolean(curated && curated.ambiguous),
    meaning: (curated && curated.meaning) || "",
    region: curated && curated.region ? curated.region : null,
    epicenterNote: (curated && curated.epicenterNote) || "",
    topComuni: [],
    foundling: curated && curated.foundling ? { ...curated.foundling } : null,
    ports: [],
    rules: [],
  };

  const hit = foundlingHit(db, folded);
  if (hit && hit.wins === false) {
    dossier.ambiguous = true;
    if (!dossier.category || dossier.category === "unclassified" || dossier.category === "foundling") {
      dossier.category = hit.category || "nickname";
    }
    dossier.meaning = dossier.meaning || hit.meaning || "";
    dossier.foundling = foundlingBlock(hit);
    if (hit.note) dossier.rules.push(hit.note);
  } else if (hit) {
    dossier.category = "foundling";
    if (hit.region) dossier.region = hit.region;
    dossier.foundling = foundlingBlock(hit);
    if (hit.meaning && !dossier.meaning) dossier.meaning = hit.meaning;
  }

  if (folded === "colombo") {
    dossier.ambiguous = true;
    if (dossier.category === "foundling" || dossier.category === "unclassified") dossier.category = "nickname";
    dossier.meaning = dossier.meaning || "dove";
    dossier.foundling = dossier.foundling || {
      hospital: "Ospedale Maggiore",
      city: "Milano",
      note: "Some Milan foundlings received Colombo. Do not treat every Colombo as a foundling.",
    };
  }

  const parts = norm(typed).split(" ").filter(Boolean);
  if (dossier.category === "unclassified" && parts.length >= 2 && PREFIXES.has(parts[0])) {
    dossier.category = "patronymic";
    dossier.rules.push("patronymic prefix");
  }

  if (dossier.category === "unclassified" && (folded.endsWith("ieri") || folded.endsWith("iere") || folded.endsWith("aro"))) {
    dossier.category = "occupational";
    dossier.rules.push("occupational suffix");
  }

  if (folded.endsWith("ich") || folded.endsWith("utti") || folded.endsWith("ussi")) {
    if (dossier.category === "unclassified") dossier.category = "patronymic";
    if (!dossier.region) dossier.region = "Friuli-Venezia Giulia";
    dossier.rules.push("patronymic lean, Friuli-Venezia Giulia");
  }

  if (folded.endsWith("u") && !folded.endsWith("ou")) {
    if (!dossier.region) dossier.region = "Sardegna";
    dossier.rules.push("Sardinian final u");
  }

  if (folded.endsWith("igo") || (folded.endsWith("an") && !folded.endsWith("ato"))) {
    if (!dossier.region) dossier.region = "Veneto";
    dossier.rules.push("weak Veneto lean");
  }

  const named = comuneNamed(places, folded);
  const categoryOpen = dossier.category === "unclassified" || dossier.category === "toponymic";
  if (named && categoryOpen) {
    dossier.category = "toponymic";
    dossier.topComuni = [{
      name: named.name,
      istat: named.istat || null,
      estimate: true,
    }];
  } else if (!named) {
    if (folded.endsWith("i")) dossier.rules.push("possible northern plural");
    else if (folded.endsWith("o")) dossier.rules.push("possible southern singular");
  }

  if (!dossier.category) dossier.category = "unclassified";
  dossier.ports = portsFor(dossier.region, db);
  if (!dossier.region) {
    if (!String(dossier.epicenterNote).toLowerCase().includes("epicenter")) {
      dossier.epicenterNote = dossier.epicenterNote
        ? `${dossier.epicenterNote} ${NO_EPICENTER}`
        : NO_EPICENTER;
    }
    dossier.rules.push(NO_EPICENTER);
  }

  dossier.census = false;
  dossier.estimate = true;
  dossier.mode = "surname";
  return dossier;
}
