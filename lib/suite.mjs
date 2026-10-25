/**
 * Genealogy suite helpers. No file system and no DOM.
 * The CLI and the static apps both import this module.
 */

import { fold, norm } from "./engine.mjs";

const NONE = {
  id: "none",
  name: "Consult local State or Provincial Archive cadastral series",
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

const RABBINI = {
  id: "rabbini",
  name: "Catasto Rabbini / Antichi Catasti Sabaudi",
  years: "1855–1870",
};

const SURVEYS = {
  papal: { id: "gregoriano", name: "Catasto Gregoriano", years: "1816–1835" },
  "lombardo-veneto": AUSTRIACO,
  toscana: { id: "leopoldino", name: "Catasto Ferdinandeo-Leopoldino", years: "1817–1835" },
  murat: MURATTIANO,
  "napoli-borbone": MURATTIANO,
  "sicilia-borbone": MURATTIANO,
  "due-sicilie": MURATTIANO,
  "regno-sardegna": RABBINI,
  genova: RABBINI,
  "liguria-repubblica": RABBINI,
};

const AUSTRIAN_REGIONS = ["Lombardia", "Veneto", "Friuli-Venezia Giulia"];
const PREFIXES = new Set(["de", "di", "da", "d", "del", "della", "dello", "degli", "dei", "dai"]);
const PORT_LABEL = "Primary historical port of embarkation for this region";
const AGE_NOTE = "Draft call-up (Classe di Leva) occurred in the year the draftee turned 20 (with wartime call-ups at ages 18–19).";
const FOGLI_NOTE = "Request both the Lista di Leva (draft roll) and the Foglio Matricolare (service sheet) from the State Archive.";
const AUSTRIAN_NOTE = "Italian liste di leva on this ground start after annexation. This call-up year is an Austrian conscription year.";
const PAPAL_NOTE = "The Papal States did not keep universal national conscription rolls before annexation.";
const OUTSIDE_NOTE = "This ground is outside Italian jurisdiction at the call-up year.";
const LATER_NOTE = "Pre-unification 19th-century property cadastre preserved at the provincial Archivio di Stato.";
const NAPLES_NOTE = "Pre-unification Southern Italian property cadastre (Catasto Provvisorio / Murattiano) preserved at the provincial Archivio di Stato.";
const NO_EPICENTER = "Distributed across multiple Italian regions.";

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
  const direct = mapSovereign(sovereignId, region || "");
  const useFallback = (sovereignId === "regno-italia" || direct.id === "none") && options.fallbackId;
  if (!useFallback) {
    if (sovereignId === "regno-italia") return { ...NONE };
    return direct;
  }
  const mapped = mapSovereign(options.fallbackId, options.fallbackRegion || region || "");
  if (!mapped || mapped.id === "none") return { ...NONE };
  return {
    ...mapped,
    laterThanSurvey: true,
    note: LATER_NOTE,
  };
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
  const recordId = atCallUp?.records?.id || "";
  const austrian = sovereignId === "lombardo-veneto" || sovereignId === "austria" || sovereignId === "austria-hungary";
  const papal = sovereignId === "papal";
  const ceded = sovereignId === "ceduto-1947" || sovereignId === "outside" || recordId === "outside";
  const italianRolls = Boolean(atCallUp?.matched) && !austrian && !papal && !ceded;
  const archive = pickArchive(archives, code, provinceName);
  const role = italianRolls ? "liste-di-leva" : "later-italian-archive";
  const jurisdiction = austrian ? AUSTRIAN_NOTE : papal ? PAPAL_NOTE : ceded ? OUTSIDE_NOTE : "";
  const note = jurisdiction ? `${AGE_NOTE} ${FOGLI_NOTE} ${jurisdiction}` : `${AGE_NOTE} ${FOGLI_NOTE}`;
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

function pushComune(dossier, place) {
  if (!place) return;
  const key = fold(place.name);
  if (dossier.topComuni.some((item) => fold(item.name) === key)) return;
  dossier.topComuni.push({
    name: place.name,
    istat: place.istat || null,
    estimate: true,
  });
  if (!dossier.region && place.region) dossier.region = place.region;
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
      note: "Historically conferred at the Ospedale Maggiore di Milano (derived from the hospital's dove emblem), alongside independent occupational and nickname origins across Lombardy.",
    };
  }

  const parts = norm(typed).split(" ").filter(Boolean);
  if (parts.length >= 2 && PREFIXES.has(parts[0])) {
    const tailPlace = comuneNamed(places, fold(parts.slice(1).join(" ")));
    if (tailPlace) {
      pushComune(dossier, tailPlace);
      if (dossier.category === "unclassified" || dossier.category === "patronymic") {
        dossier.category = "toponymic";
      }
      dossier.rules.push("prefix plus comune");
    } else if (dossier.category === "unclassified") {
      dossier.category = "patronymic";
      dossier.rules.push("patronymic prefix");
    }
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
    pushComune(dossier, named);
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
