/**
 * Shared resolver for the CLI and the static atlas.
 * No Node or DOM APIs. Load the JSON, then call createAtlas(data).
 */

export function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function fold(value) {
  return norm(value).replace(/ /g, "");
}

export function parseYearList(value, min = 1563, max = 2026) {
  if (value === undefined || value === null || value === "") return [];
  const raw = Array.isArray(value) ? value.join(",") : String(value);
  return raw
    .split(/[,;|\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((year) => Number.isFinite(year))
    .map((year) => Math.max(min, Math.min(max, Math.round(year))));
}

function parseYearsRaw(value) {
  if (value === undefined || value === null || value === "") return [];
  const raw = Array.isArray(value) ? value.join(",") : String(value);
  return raw
    .split(/[,;|\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((year) => Number.isFinite(year));
}

export function parsePlaceList(value) {
  if (!value) return [];
  return String(value)
    .split(/\s*(?:,|;|\||→|->)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function spanAt(spans, iso) {
  if (!spans) return null;
  for (const span of spans) {
    if (span.from <= iso && iso <= span.to) return span;
  }
  return null;
}

function isoForYear(year) {
  return `${year}-07-01`;
}

const VENETO_1871 = new Set(["Venezia", "Verona", "Vicenza", "Padova", "Rovigo", "Belluno", "Udine", "Mantova"]);
const PARISH_UNTIL_1871 = new Set(["023", "024", "025", "026", "027", "028", "029", "030", "093", "020"]);
const PARISH_UNTIL_1870 = new Set(["056", "057", "058", "059", "060"]);
const PARISH_UNTIL_1919 = new Set(["021", "022", "031", "032"]);
const SICILY_CODES = new Set(["081", "082", "083", "084", "085", "086", "087", "088", "089"]);
const SARDINIA_CODES = new Set(["090", "091", "092", "095", "104", "105", "106", "107", "111"]);
const IN_FORCE_FLOOR = "1948-01-01";
const EARLY_END = "1795-12-31";
const VENETO_CIVIL = "1871-08-31";
const LAZIO_1870 = "1870-09-20";
const ALPINE_1919 = "1918-11-03";
const NAPOLEONIC_FROM = 1806;
const NAPOLEONIC_TO = 1814;
const HINT_NOTE = "early span is a province hint, not a fact";
const PRE1796_NOTE = "Earlier spans name the pre-1796 sovereign and stop on 31 December 1795.";
const VENETO_NOTE = "Veneto, Friuli, and Mantua stay on parish registers through 31 August 1871.";
const MANTUA_NOTE = "Mantua municipal civil books begin in June 1871. The State Archive holds Italian registers from 1866-1871, with gaps.";
const LAZIO_NOTE = "Lazio and Rome enter the Kingdom in 1870. Civil registration starts there from late 1870; some comuni hold books only from 1871.";
const ALPINE_NOTE = "Trentino, Alto Adige, Gorizia, Trieste, and Istria enter the Kingdom after 1918. Civil registration there starts from 1919, not 1866.";
const ISLAND_NOTE = "Sicily and the island of Sardinia were not under the Napoleonic civil system in this model.";
const FRAZIONE_NOTE = "Frazioni are not a national gazetteer.";
const CURRENT_ONLY_NOTE = "This is today's comune. The atlas has no historical gazetteer row for this year.";

const STATUTE_CIVIL_REGISTRATION = {
  id: "065U2602",
  title: "R.D. 15 novembre 1865, n. 2602 - Per l'Ordinamento dello Stato Civile",
  urn: "urn:nir:stato:regio.decreto:1865-11-15;2602",
  source: "Normattiva",
};
const STATUTE_CIVIL_CODE = {
  id: "065U2358",
  title: "R.D. 25 giugno 1865, n. 2358 - Codice civile",
  urn: "urn:nir:stato:regio.decreto:1865-06-25;2358",
  source: "Normattiva",
};
const STATUTE_CITIZENSHIP = {
  id: "012U0555",
  title: "L. 13 giugno 1912, n. 555 - Sulla cittadinanza italiana",
  urn: "urn:nir:stato:legge:1912-06-13;555",
  source: "Normattiva",
  repealedBy: "L. 5 febbraio 1992, n. 91",
};
const STATUTE_NOTE = "Dated instruments held on Normattiva. Check the entry-into-force day before you quote a date.";

// After the Restoration most Italian states abolished civil registration. The
// Two Sicilies kept it, and Tuscany and Savoy ran their own. The State Archives
// hold these series, not Normattiva.
const STATUTE_BOURBON = {
  id: "due-sicilie-stato-civile",
  title: "Stato civile del Regno delle Due Sicilie (1809-1865)",
  urn: null,
  source: "archive-holdings",
  verifiedBy: "Archivio di Stato di Napoli 1809-1865; Archivio di Stato di Palermo 1820-1865",
};
const STATUTE_TUSCANY = {
  id: "toscana-stato-civile",
  title: "Stato civile del Granducato di Toscana (1817-1865)",
  urn: null,
  source: "archive-holdings",
  verifiedBy: "Stato civile del Granducato, from 1817",
};
const STATUTE_SAVOY = {
  id: "sardegna-stato-civile",
  title: "Stato civile del Regno di Sardegna (1838-1865)",
  urn: null,
  source: "archive-holdings",
  verifiedBy: "Regolamento per la tenuta dei registri dello Stato civile, 1837",
};
const STATUTE_NAPOLEONIC = {
  id: "stato-civile-napoleonico",
  title: "Stato Civile Napoleonico (1806-1814)",
  urn: null,
  source: "archive-holdings",
  verifiedBy: "State Archive civil series, on Antenati",
};
const BOURBON_MAINLAND_NOTE = "The Two Sicilies kept civil registration after 1815. The mainland series runs from 1809 to 1865.";
const BOURBON_SICILY_NOTE = "The Two Sicilies kept civil registration after 1815. The Sicilian series runs from 1820 to 1865.";
const TUSCANY_NOTE = "Tuscany kept civil registration from 1817, usually kept as a duplicate of the parish register.";
const SAVOY_NOTE = "The Kingdom of Sardinia kept civil registration from 1838. Priests often kept the register.";

export const ERA_STATES = ["in-force", "replayed", "current-only"];

// The local date civil registration becomes the legal register. The 1865 decree
// applied to the Kingdom as it stood, so each annexed territory has its own start.
function registrationStart(code, provinceName, recordId, ruleFrom) {
  const c = String(code || "").padStart(3, "0");
  if (recordId === "borbonico") {
    const sicily = SICILY_CODES.has(c);
    return {
      from: sicily ? "1820-01-01" : "1809-01-01",
      note: sicily ? BOURBON_SICILY_NOTE : BOURBON_MAINLAND_NOTE,
      checked: sicily ? "1820-01-01" : "1809-01-01",
      regime: true,
      statute: STATUTE_BOURBON,
    };
  }
  if (recordId === "granducale") {
    return { from: "1817-01-01", note: TUSCANY_NOTE, checked: "1817-01-01", regime: true, statute: STATUTE_TUSCANY };
  }
  if (recordId === "sabaudo") {
    return { from: "1838-01-01", note: SAVOY_NOTE, checked: "1838-01-01", regime: true, statute: STATUTE_SAVOY };
  }
  if (recordId === "napoleonico") {
    return { from: ruleFrom || "1806-01-01", note: "", checked: ruleFrom || null, regime: true, statute: STATUTE_NAPOLEONIC };
  }
  if (VENETO_1871.has(provinceName) || PARISH_UNTIL_1871.has(c)) {
    return { from: "1871-09-01", note: VENETO_NOTE, checked: VENETO_CIVIL, regime: false, statute: STATUTE_CIVIL_REGISTRATION };
  }
  if (PARISH_UNTIL_1870.has(c)) {
    return { from: "1870-09-20", note: LAZIO_NOTE, checked: LAZIO_1870, regime: false, statute: STATUTE_CIVIL_REGISTRATION };
  }
  if (PARISH_UNTIL_1919.has(c)) {
    return { from: "1919-01-01", note: ALPINE_NOTE, checked: ALPINE_1919, regime: false, statute: STATUTE_CIVIL_REGISTRATION };
  }
  return { from: "1866-01-01", note: "", checked: null, regime: false, statute: STATUTE_CIVIL_REGISTRATION };
}

function packEvidence(year, place, state, verification, notes, basis, statute = null) {
  const list = Array.isArray(notes) ? notes.slice() : [];
  let next = ERA_STATES.includes(state) ? state : "replayed";
  if (next === "in-force" && list.length) next = "replayed";
  const dates = [...new Set((verification || []).filter((item) => typeof item === "string" && item))].sort();
  return {
    year,
    place,
    state: next,
    verification: dates,
    basis,
    notes: list,
    statute: statute || {
      civilRegistration: null,
      civilCode: null,
      citizenship: null,
      note: STATUTE_NOTE,
    },
  };
}

const ARCHIVAL_WARNINGS = {
  "083": "1908 Messina-Reggio Earthquake — Many municipal Stato Civile registers prior to December 1908 were destroyed; check surviving second originals at the Archivio di Stato and Diocesan parish duplicates.",
  "080": "1908 Messina-Reggio Earthquake — Many municipal Stato Civile registers prior to December 1908 were destroyed; check surviving second originals at the Archivio di Stato and Diocesan parish duplicates.",
  "066": "1915 Avezzano Earthquake — Check State Archive second originals and Diocesan files if municipal books are missing.",
  "060": "1943–1944 WWII Gustav Line Bombings — Several town halls lost 19th-century registers during WWII; check the Tribunale / Archivio di Stato reconstructed series and parish archives.",
  "059": "1943–1944 WWII Gustav Line Bombings — Several town halls lost 19th-century registers during WWII; check the Tribunale / Archivio di Stato reconstructed series and parish archives.",
  "094": "1943–1944 WWII Gustav Line Bombings — Several town halls lost 19th-century registers during WWII; check the Tribunale / Archivio di Stato reconstructed series and parish archives.",
  "030": "1917–1918 WWI Occupation & 1976 Friuli Earthquake — Check both Udine State Archive and Archdiocesan parish copies.",
  "093": "1917–1918 WWI Occupation & 1976 Friuli Earthquake — Check both Udine State Archive and Archdiocesan parish copies.",
};

function archivalWarnings(codes) {
  const seen = new Set();
  const notes = [];
  for (const code of codes) {
    const text = ARCHIVAL_WARNINGS[String(code || "").padStart(3, "0")];
    if (!text || seen.has(text)) continue;
    seen.add(text);
    notes.push(text);
  }
  return notes;
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left || !right) return Math.max(left.length, right.length);
  if (Math.abs(left.length - right.length) > 2) return 3;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = current;
    }
  }
  return row[right.length];
}

export function createAtlas(data) {
  const places = data.index.places || [];
  const rules = data.polities.provinceRules || {};
  const polityById = new Map((data.polities.polities || []).map((item) => [item.id, item]));
  const recordById = new Map((data.polities.records || []).map((item) => [item.id, item]));
  const archiveById = new Map((data.archives.archives || []).map((item) => [item.id, item]));
  const epochs = data.polities.epochs || [];
  const routes = data.routes.routes || [];
  const ports = data.routes.ports || [];
  const contacts = (data.contacts && data.contacts.byCatasto) || {};
  const dioceses = data.dioceses || {};
  const byCatasto = new Map(places.filter((place) => place.catasto).map((place) => [place.catasto, place]));
  const yearMin = data.polities.yearMin || 1563;
  const yearMax = data.polities.yearMax || 2026;

  function clampYear(year) {
    const parsed = Number(year);
    if (!Number.isFinite(parsed)) return 1866;
    return Math.max(yearMin, Math.min(yearMax, Math.round(parsed)));
  }

  function catalogPolity(id) {
    return polityById.get(id) || { id, name: id, nameEn: id, family: "" };
  }

  function catalogRecord(id) {
    return recordById.get(id) || { id, name: id, nameEn: id, civil: false, note: "" };
  }

  function catalogArchive(id) {
    if (!id) return null;
    const archive = archiveById.get(id);
    if (!archive) return { id, name: id, antenatiUrl: "" };
    return {
      id: archive.id,
      name: archive.name,
      kind: archive.kind,
      antenatiUrl: archive.antenatiUrl,
    };
  }

  function labelsFor(place) {
    const labels = [];
    // A suppressed town keeps its last historical name. That name is not the
    // modern name of a living comune, so a landmark can win the same spelling.
    if (place.name) labels.push({ name: place.name, modern: !place.suppressed, timeless: true });
    for (const alias of place.aliases || []) labels.push({ name: alias, timeless: true });
    for (const span of place.spans || []) labels.push({ name: span.name, from: span.from, to: span.to });
    return labels;
  }

  function scorePlace(place, queryNorm, queryFold, iso) {
    let best = 0;
    let matchType = null;
    for (const label of labelsFor(place)) {
      const folded = fold(label.name);
      const normalized = norm(label.name);
      if (!folded) continue;
      let score = 0;
      let type = "fuzzy";
      if (folded === queryFold || normalized === queryNorm) {
        const covers = label.from && label.from <= iso && iso <= label.to;
        if (covers) {
          score = 140;
          type = "historical-name";
        } else if (label.modern) {
          score = 120;
          type = "modern-name";
        } else if (label.timeless) {
          score = 110;
          type = "alias";
        } else {
          score = 90;
          type = "historical-name-other-year";
        }
      } else if (queryNorm.length >= 4 && (normalized.startsWith(queryNorm) || folded.startsWith(queryFold))) {
        score = 60;
        type = "prefix";
      }
      if (score > best) {
        best = score;
        matchType = type;
      }
    }
    best += Math.min(place.population || 0, 2000000) / 5000000;
    return { score: best, matchType };
  }

  function fuzzyScore(place, queryFold) {
    if (queryFold.length < 5) return 0;
    let best = 3;
    const candidates = [place.name, ...(place.aliases || [])];
    for (const span of place.spans || []) candidates.push(span.name);
    for (const name of candidates) {
      const folded = fold(name);
      if (!folded) continue;
      best = Math.min(best, levenshtein(queryFold, folded));
    }
    if (best <= 1 || (best === 2 && queryFold.length >= 8)) return 70 - best;
    return 0;
  }

  function rank(query, year) {
    const queryNorm = norm(query);
    const queryFold = fold(query);
    const iso = isoForYear(clampYear(year));
    if (!queryFold) return [];
    let ranked = places.map((place) => ({ place, ...scorePlace(place, queryNorm, queryFold, iso) }));
    const top = ranked.reduce((max, item) => Math.max(max, item.score), 0);
    if (top < 80) {
      ranked = places.map((place) => {
        const fuzzy = fuzzyScore(place, queryFold);
        return { place, score: fuzzy, matchType: fuzzy ? "fuzzy" : null };
      });
    }
    return ranked
      .filter((item) => item.score >= 50)
      .sort((left, right) => right.score - left.score || (right.place.population || 0) - (left.place.population || 0) || left.place.id.localeCompare(right.place.id));
  }

  function administration(place, iso) {
    const span = spanAt(place.spans, iso);
    if (!span) return null;
    const base = spanAt(rules[span.provinceCode] || [], iso);
    const override = (place.overrides || []).find((item) => item.from <= iso && iso <= item.to);
    if (!base && !override) return { span, rule: null };
    const rule = { ...(base || {}), ...(override || {}) };
    return { span, rule };
  }

  function epochFor(year) {
    return epochs.find((epoch) => year >= epoch.from && year <= epoch.to) || null;
  }

  function citizenshipNotes(year, polity, record, provinceName = "") {
    const notes = [];
    if (!polity) return notes;
    if (polity.family === "austrian" && polity.id !== "lombardo-veneto") {
      notes.push(`In ${year} this municipality was under Austrian or Austro-Hungarian rule and was annexed to Italy after WWI (Treaty of Saint-Germain, 1919–1920) — a key jurisdictional date for pre-1920 vital records.`);
    }
    if (polity.id === "lombardo-veneto") {
      if (VENETO_1871.has(provinceName)) {
        notes.push(`In ${year} this town was in the Austrian Regno Lombardo-Veneto. It joined the Kingdom of Italy in October 1866. Stato Civile Italiano here starts on 1 September 1871.`);
      } else {
        notes.push(`In ${year} this town was in the Austrian Regno Lombardo-Veneto. Lombardy joined the Kingdom of Sardinia in 1859 and the Kingdom of Italy in 1861. Stato Civile Italiano here starts on 1 January 1866.`);
      }
    }
    if (polity.id === "papal") {
      notes.push(`In ${year} this town was in the Papal States. The Kingdom's civil register was not yet in force.`);
    }
    if (record && record.civil === false && record.id !== "outside") {
      notes.push("The legal register for this year is ecclesiastical. Search the parish copy and the diocesan archive, not only the State Archive.");
    }
    return notes;
  }

  function timeline(place) {
    if (!place.spans || !place.spans.length) return [];
    const events = [];
    let previous = "";
    const firstYear = Math.max(yearMin, Number(place.spans[0].from.slice(0, 4)));
    for (let year = firstYear; year <= yearMax; year += 1) {
      const admin = administration(place, isoForYear(year));
      if (!admin || !admin.rule) continue;
      const key = [admin.span.name, admin.span.provinceCode, admin.rule.polityId, admin.rule.recordId].join("|");
      if (key === previous) continue;
      const polity = catalogPolity(admin.rule.polityId);
      const record = catalogRecord(admin.rule.recordId);
      const evidence = evidenceForComune(place, yearPair(year), place.name);
      events.push({
        year,
        historicalName: admin.span.name,
        province: admin.rule.provinceName,
        region: admin.rule.regionName,
        sovereign: polity.name,
        sovereignEn: polity.nameEn,
        record: record.name,
        recordEn: record.nameEn,
        state: evidence.state,
        verification: evidence.verification,
        basis: evidence.basis,
        notes: evidence.notes,
      });
      previous = key;
    }
    return events;
  }

  const ANSC_NOTE = "Active on ANPR. While modern acts are digitized through ANSC, historical Stato Civile registers (1809–1990s) are maintained in physical volumes at the Comune and the provincial Archivio di Stato.";
  const PARISH_TYPES = ["Atto di Battesimo", "Matrimonio Canonico", "Stato delle Anime"];

  function yearPair(year) {
    const numeric = Number(year);
    const requested = Number.isFinite(numeric) ? Math.round(numeric) : 1866;
    const safeYear = clampYear(requested);
    return { requested, safeYear, iso: isoForYear(safeYear) };
  }

  function stampYears(result, pair) {
    if (pair.requested !== pair.safeYear) {
      result.rangeNote = `This chronicle year is outside ${yearMin}–${yearMax}. The jurisdiction below is 1 July ${pair.safeYear}, the nearest year in this atlas.`;
    }
    return result;
  }

  function queryFields(pair, place) {
    return { year: pair.requested, modelYear: pair.safeYear, place, date: pair.iso };
  }

  function beweb(place) {
    const params = new URLSearchParams({
      action: "ricerca/risultati",
      view: "griglia",
      locale: "it",
      dominio: "7",
      ambito: "FONDI",
      liberaluogo: place || "Italia",
    });
    return `https://www.beweb.chiesacattolica.it/beniarchivistici/?l=it_IT#${params.toString()}`;
  }

  function dioceseFor(place) {
    const base = (dioceses.byProvince || {})[place.provinceCode] || null;
    const extra = place.istat ? (dioceses.byIstat || {})[place.istat] : null;
    if (!base && !extra) {
      const search = place.province || place.name || "Italia";
      return {
        name: place.province ? `Diocese of the province of ${place.province}` : "Local diocese",
        archive: place.province ? `Archivio Storico Diocesano for the province of ${place.province}` : "Archivio Storico Diocesano",
        cathedral: "",
        church: "",
        bewebUrl: beweb(search),
        note: "This province code has no diocese row. Search BeWeB by the town name.",
        source: "fallback",
      };
    }
    return {
      ...(base || {}),
      ...(extra || {}),
      church: (extra && extra.church) || (base && base.church) || "",
      bewebUrl: (base && base.bewebUrl) || (extra && extra.bewebUrl) || beweb((base && base.searchPlace) || place.name),
      source: (extra && extra.source) || (base && base.source) || "province-seat",
    };
  }

  function officeFor(place, modernName) {
    const successor = place.successorCatasto ? byCatasto.get(place.successorCatasto) : null;
    const own = place.catasto ? contacts[place.catasto] : null;
    const heir = !own && successor && successor.catasto ? contacts[successor.catasto] : null;
    const row = own || heir || null;
    const comuneName = heir ? successor.name : (modernName || place.name);
    const sigla = String((heir && successor.sigla) || place.sigla || "it").toLowerCase();
    const slug = norm(comuneName).replace(/ /g, "-").replace(/^-|-$/g, "") || "comune";
    const pattern = `protocollo@pec.comune.${slug}.${sigla}.it`;
    const fromIndex = Boolean(row && row.pec);
    return {
      name: `Ufficio di Stato Civile del Comune di ${comuneName}`,
      comune: comuneName,
      pec: fromIndex ? row.pec : pattern,
      pecSource: fromIndex ? "indicepa" : "pattern-fallback",
      address: (row && row.address) || `Municipio di ${comuneName}`,
      addressSource: row && row.address ? "indicepa" : "pattern-fallback",
      website: (row && row.website) || "",
      anscStatus: place.suppressed ? (heir ? "successor-comune" : "suppressed") : "anpr-population",
      anscNote: ANSC_NOTE,
      note: heir
        ? "IndicePA lists the successor comune. Send the request there."
        : (fromIndex ? "" : "Standard municipal PEC address format — verify on the official Comune website before sending your request."),
    };
  }

  function parishRouting(place, record) {
    const diocese = dioceseFor(place);
    const required = !record || record.civil === false;
    return {
      required,
      badge: required ? "Pre-Civil Registration Era — Parish & Diocesan Records Required" : "",
      diocese: diocese.name || "",
      archive: diocese.archive || "",
      cathedral: diocese.cathedral || "",
      church: diocese.church || "",
      bewebUrl: diocese.bewebUrl || beweb(diocese.searchPlace || place.name),
      recordTypes: PARISH_TYPES,
      note: required
        ? "Civil registration is not the legal register on this date. Request an Atto di Battesimo, a Matrimonio Canonico, or a Stato delle Anime from the parish and the diocesan archive."
        : "Civil registration is in force. If the town-hall books were lost, ask the diocesan archive for the parish copy.",
      provinceNote: diocese.note || "",
      source: diocese.source || "",
    };
  }

  function boundaryDates(place, iso) {
    const spans = place.spans || [];
    let previous = null;
    let next = null;
    for (const span of spans) {
      if (span.to < iso && (!previous || span.to > previous.to)) previous = span;
      if (span.from > iso && (!next || span.from < next.from)) next = span;
    }
    const dates = [];
    if (previous) {
      if (previous.to) dates.push(previous.to);
      if (previous.anprFrom) dates.push(previous.anprFrom);
    }
    if (next) {
      if (next.from) dates.push(next.from);
      if (next.anprFrom) dates.push(next.anprFrom);
    }
    return dates;
  }

  function evidenceForComune(place, pair, queryLabel) {
    const iso = pair.iso;
    const year = pair.safeYear;
    const label = queryLabel || place.name || "";
    const span = spanAt(place.spans, iso);
    const admin = span ? administration(place, iso) : null;
    const rule = admin && admin.rule;
    const code = String((span && span.provinceCode) || place.provinceCode || "").padStart(3, "0");
    const provinceName = (rule && rule.provinceName) || "";
    const dates = [iso];
    const notes = [];
    const hint = Boolean(span && span.backfill && span.anprFrom && iso < span.anprFrom);
    const currentOnly = Boolean(span && span.gazetteer === "istat-current-only");
    if (hint) notes.push(HINT_NOTE);
    if (iso <= EARLY_END) {
      notes.push(PRE1796_NOTE);
      dates.push(EARLY_END);
    }
    const registration = registrationStart(code, provinceName, rule && rule.recordId, rule && rule.from);
    const civilInForce = iso >= registration.from;
    if (registration.regime) {
      if (civilInForce && registration.note) notes.push(registration.note);
      if (registration.checked) dates.push(registration.checked);
    } else if (registration.note && !civilInForce) {
      notes.push(registration.note);
      if (registration.checked) dates.push(registration.checked);
      if (code === "020" || provinceName === "Mantova") notes.push(MANTUA_NOTE);
    }
    if (year >= NAPOLEONIC_FROM && year <= NAPOLEONIC_TO && (SICILY_CODES.has(code) || SARDINIA_CODES.has(code))) {
      notes.push(ISLAND_NOTE);
    }
    if (span && span.anprFrom) dates.push(span.anprFrom);
    if (rule && rule.from) dates.push(rule.from);
    if (!span) dates.push(...boundaryDates(place, iso));

    let state = "replayed";
    let basis = "istat-provincial-mesh+anpr-archivio";
    const sameProvince = Boolean(rule && place.province && rule.provinceName === place.province);
    const openRule = Boolean(rule && rule.to === `${yearMax}-12-31`);
    if (!span) {
      basis = place.suppressed ? "istat-provincial-mesh+suppressed-comuni" : "istat-provincial-mesh+anpr-archivio";
    } else if (currentOnly) {
      if (year === yearMax && sameProvince && openRule && !place.suppressed && iso >= IN_FORCE_FLOOR) {
        state = "in-force";
        basis = "istat-provincial-mesh";
      } else {
        state = "current-only";
        basis = "istat-current-only";
        notes.push(CURRENT_ONLY_NOTE);
      }
    } else if (hint) {
      basis = "istat-provincial-mesh+anpr-backfill";
    } else if (place.suppressed) {
      basis = "istat-provincial-mesh+suppressed-comuni";
    } else if (year === yearMax && sameProvince && openRule && iso >= IN_FORCE_FLOOR) {
      state = "in-force";
      basis = "istat-provincial-mesh";
    }
    const statute = {
      civilRegistration: civilInForce
        ? { ...registration.statute, localFrom: registration.from }
        : null,
      civilCode: year >= 1866 ? STATUTE_CIVIL_CODE : null,
      citizenship: year >= 1912 && year <= 1992 ? STATUTE_CITIZENSHIP : null,
      note: STATUTE_NOTE,
    };
    return packEvidence(pair.requested, label, state, dates, notes, basis, statute);
  }

  function withEvidence(result, evidence, pair) {
    return stampYears({ ...result, ...evidence }, pair);
  }

  function emptyResult(query, year) {
    const pair = yearPair(year);
    return withEvidence({
      query: queryFields(pair, query),
      matched: false,
      matchType: null,
      alternates: [],
      stato_civile_office: null,
      parish_routing: { required: false, badge: "", diocese: "", archive: "", recordTypes: [], note: "" },
    }, packEvidence(pair.requested, query, "current-only", [pair.iso], [FRAZIONE_NOTE], "no-gazetteer-entry"), pair);
  }

  function resolvePlace(query, year = 1866) {
    const pair = yearPair(year);
    const safeYear = pair.safeYear;
    const iso = pair.iso;
    const ranked = rank(query, safeYear);
    if (!ranked.length) return emptyResult(query, safeYear);
    const best = ranked[0];
    const place = best.place;
    const alternates = ranked.slice(1, 5).map((item) => ({
      id: item.place.id,
      name: item.place.name,
      province: item.place.province || "",
      matchType: item.matchType,
    }));
    const ambiguous = ranked.length > 1 && ranked[1].score >= 100 && ranked[0].score - ranked[1].score < 1;

    if (place.kind === "external") {
      return withEvidence({
        query: queryFields(pair, query),
        matched: true,
        kind: "external",
        matchType: best.matchType,
        ambiguous,
        historicalName: place.name,
        modernName: place.name,
        istat: null,
        catasto: null,
        coordinates: { lat: place.lat, lng: place.lng },
        sovereign: null,
        epoch: epochFor(safeYear),
        historicalProvince: null,
        modernProvince: null,
        provinceShift: { shifted: false, warning: "" },
        records: null,
        archive: null,
        comuneOffice: null,
        citizenshipNotes: ["This stop is outside Italian jurisdiction. Use it as a migration endpoint."],
        timeline: [],
        note: place.note || "",
        alternates,
        stato_civile_office: null,
        parish_routing: { required: false, badge: "", diocese: "", archive: "", recordTypes: [], note: "This stop is outside Italy." },
        share: { query: `?year=${pair.requested}&place=${encodeURIComponent(query)}` },
      }, packEvidence(pair.requested, query, "current-only", [iso], [], "migration-endpoint"), pair);
    }

    if (place.kind === "landmark") {
      const anchor = place.anchor ? resolvePlace(place.anchor, pair.requested) : null;
      const base = anchor && anchor.matched ? anchor : emptyResult(query, pair.requested);
      return withEvidence({
        ...base,
        matched: true,
        kind: "landmark",
        matchType: best.matchType,
        historicalName: place.name,
        modernName: anchor && anchor.modernName ? anchor.modernName : place.name,
        coordinates: { lat: place.lat, lng: place.lng },
        note: place.note || "",
        landmark: true,
        query: queryFields(pair, query),
        share: { query: `?year=${pair.requested}&place=${encodeURIComponent(query)}` },
      }, {
        year: pair.requested,
        place: query,
        state: base.state,
        verification: base.verification || [],
        basis: base.basis,
        notes: base.notes || [],
      }, pair);
    }

    const admin = administration(place, iso);
    const successor = place.successorCatasto ? byCatasto.get(place.successorCatasto) : null;
    if (!admin || !admin.rule) {
      const laterName = successor ? successor.name : place.name;
      const lastSpan = (place.spans || [])[(place.spans || []).length - 1];
      const continued = lastSpan ? spanAt(rules[lastSpan.provinceCode] || [], iso) : null;
      const cededRule = continued && (continued.polityId === "ceduto-1947" || continued.polityId === "outside" || continued.recordId === "outside")
        ? continued
        : null;
      const cededPolity = cededRule ? catalogPolity(cededRule.polityId) : null;
      const cededRecord = cededRule ? catalogRecord(cededRule.recordId) : null;
      return withEvidence({
        query: queryFields(pair, query),
        matched: true,
        existed: false,
        kind: "comune",
        matchType: best.matchType,
        historicalName: place.name,
        modernName: successor ? successor.name : place.name,
        istat: place.istat || (successor && successor.istat) || null,
        catasto: place.catasto || null,
        sovereign: cededPolity
          ? { id: cededPolity.id, name: cededPolity.name, nameEn: cededPolity.nameEn, family: cededPolity.family, color: cededPolity.color }
          : null,
        records: cededRecord
          ? { id: cededRecord.id, name: cededRecord.name, nameEn: cededRecord.nameEn, civilRegistration: Boolean(cededRecord.civil), note: cededRule.note || "" }
          : null,
        historicalProvince: cededRule
          ? { name: cededRule.provinceName || "", code: lastSpan.provinceCode, sigla: cededRule.sigla || "", region: cededRule.regionName || "" }
          : null,
        coordinates: {
          lat: place.lat || (successor && successor.lat) || null,
          lng: place.lng || (successor && successor.lng) || null,
        },
        note: place.successorNote || "This comune did not exist on 1 July of the selected year.",
        successor: successor ? { name: successor.name, istat: successor.istat, catasto: successor.catasto } : null,
        alternates,
        archivalWarnings: archivalWarnings([place.provinceCode, lastSpan && lastSpan.provinceCode]),
        stato_civile_office: officeFor(successor || place, laterName),
        parish_routing: { ...parishRouting(successor || place, { civil: true }), required: false, badge: "" },
        share: { query: `?year=${pair.requested}&place=${encodeURIComponent(query)}` },
      }, evidenceForComune(place, pair, query), pair);
    }

    const polity = catalogPolity(admin.rule.polityId);
    const record = catalogRecord(admin.rule.recordId);
    const archive = catalogArchive(admin.rule.archiveId);
    const modernRule = spanAt(rules[place.provinceCode] || [], isoForYear(yearMax));
    const modernArchive = modernRule ? catalogArchive(modernRule.archiveId) : null;
    const alsoSee = modernArchive && archive && modernArchive.id !== archive.id ? [{
      ...modernArchive,
      reason: "Archive of the modern province. Older duplicates may still sit in the historical province archive.",
    }] : [];
    const historicalProvince = {
      name: admin.rule.provinceName,
      code: admin.span.provinceCode,
      sigla: admin.rule.sigla || "",
      region: admin.rule.regionName || "",
    };
    const modernProvince = {
      name: place.province || (successor && successor.province) || historicalProvince.name,
      code: place.provinceCode || (successor && successor.provinceCode) || historicalProvince.code,
      sigla: place.sigla || (successor && successor.sigla) || "",
      region: place.region || (successor && successor.region) || "",
    };
    const shifted = historicalProvince.name !== modernProvince.name || historicalProvince.code !== modernProvince.code;
    let warning = "";
    const crownland = ["Tirolo", "Litorale austriaco", "Gorizia e Gradisca"].includes(historicalProvince.name);
    if (crownland) {
      warning = `In ${safeYear}, ${admin.span.name} was in ${historicalProvince.name} under Austrian rule. The modern province is ${modernProvince.name}.`;
    } else if (shifted) {
      warning = `In ${safeYear}, ${admin.span.name} belonged to the Province of ${historicalProvince.name} (${historicalProvince.region}). The modern province is ${modernProvince.name}.`;
    }
    const modernName = successor && place.suppressed ? successor.name : place.name;
    const notes = citizenshipNotes(safeYear, polity, record, historicalProvince.name);
    if (safeYear === 1860 && historicalProvince.region === "Sicilia") {
      notes.push("From May 1860 Sicily was under Garibaldi's dictatorship. This atlas still names the Bourbon kingdom and its registers for 1 July 1860.");
    }
    if (place.successorNote) notes.push(place.successorNote);

    return withEvidence({
      query: queryFields(pair, query),
      matched: true,
      existed: true,
      kind: "comune",
      matchType: best.matchType,
      ambiguous,
      historicalName: admin.span.name,
      modernName,
      istat: place.istat || (successor && successor.istat) || null,
      catasto: place.catasto || null,
      suppressed: Boolean(place.suppressed),
      successor: successor ? { name: successor.name, istat: successor.istat, catasto: successor.catasto } : null,
      coordinates: {
        lat: place.lat || (successor && successor.lat) || null,
        lng: place.lng || (successor && successor.lng) || null,
      },
      sovereign: { id: polity.id, name: polity.name, nameEn: polity.nameEn, family: polity.family, color: polity.color },
      epoch: epochFor(safeYear),
      historicalProvince,
      modernProvince,
      provinceShift: { shifted, warning },
      records: {
        id: record.id,
        name: record.name,
        nameEn: record.nameEn,
        civilRegistration: Boolean(record.civil),
        note: [record.note, admin.rule.note].filter(Boolean).join(" "),
      },
      archive: archive ? { ...archive, alsoSee } : null,
      comuneOffice: {
        name: `Ufficio di Stato Civile del Comune di ${modernName}`,
        note: "The first original stays at the comune. The State Archive holds the duplicate (secondo originale) where a civil series exists.",
      },
      stato_civile_office: officeFor(place, modernName),
      parish_routing: parishRouting(place, record),
      archivalWarnings: archivalWarnings([
        place.provinceCode,
        historicalProvince.code,
        modernProvince.code,
        admin.span.provinceCode,
      ]),
      citizenshipNotes: notes,
      timeline: timeline(place),
      alternates,
      share: {
        query: `?year=${pair.requested}&place=${encodeURIComponent(query)}`,
        canonical: `?year=${pair.requested}&place=${encodeURIComponent(admin.span.name)}`,
      },
    }, evidenceForComune(place, pair, query), pair);
  }

  function search(query, limit = 8) {
    return rank(query, yearMax).slice(0, limit).map((item) => ({
      id: item.place.id,
      name: item.place.name,
      kind: item.place.kind,
      province: item.place.province || "",
      sigla: item.place.sigla || "",
      matchType: item.matchType,
    }));
  }

  function banner(year) {
    const safeYear = clampYear(year);
    const iso = isoForYear(safeYear);
    const counts = new Map();
    for (const spans of Object.values(rules)) {
      const rule = spanAt(spans, iso);
      if (!rule) continue;
      counts.set(rule.polityId, (counts.get(rule.polityId) || 0) + 1);
    }
    const present = [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([id, count]) => ({ ...catalogPolity(id), provinces: count }));
    return { year: safeYear, epoch: epochFor(safeYear), polities: present };
  }

  function matchRoute(placeList) {
    const key = placeList.map((place) => fold(place)).join("|");
    return routes.find((route) => (route.match || []).map((place) => fold(place)).join("|") === key) || null;
  }

  function provinceAt(code, year) {
    const rule = spanAt(rules[String(code || "").padStart(3, "0")] || [], isoForYear(clampYear(year)));
    if (!rule) return null;
    const polity = catalogPolity(rule.polityId);
    return {
      provinceName: rule.provinceName,
      regionName: rule.regionName,
      archiveId: rule.archiveId,
      polity,
      record: catalogRecord(rule.recordId),
      color: polity.color,
    };
  }

  function stopsFromRoute(routeId) {
    const key = fold(routeId);
    const route = routes.find((item) => fold(item.id) === key);
    if (!route) return [];
    return route.stops.map((stop) => ({
      ...stop,
      routeId: route.id,
      routeTitle: route.titleEn || route.title,
    }));
  }

  function stopsFromQuery(yearValue, placeValue) {
    const placeList = parsePlaceList(placeValue);
    const yearList = parseYearsRaw(yearValue);
    const route = matchRoute(placeList);
    if (route) {
      return route.stops.map((stop, index) => ({
        ...stop,
        year: yearList[index] !== undefined ? yearList[index] : stop.year,
        routeId: route.id,
        routeTitle: route.titleEn || route.title,
      }));
    }
    const fallbackYear = yearList[0] || 1866;
    return placeList.map((place, index) => ({
      year: yearList[index] !== undefined ? yearList[index] : yearList[yearList.length - 1] || fallbackYear,
      place,
      label: place,
    }));
  }

  function describePlace(place) {
    if (!place || place.kind === "external" || place.kind === "landmark") return null;
    const events = [];
    let previous = "";
    let open = null;
    const firstYear = place.spans && place.spans.length
      ? Math.max(yearMin, Number(String(place.spans[0].from).slice(0, 4)))
      : yearMin;
    const closeOpen = (endYear) => {
      if (open) open.to = endYear;
    };
    for (let year = firstYear; year <= yearMax; year += 1) {
      const admin = administration(place, isoForYear(year));
      const rule = admin && admin.rule;
      const key = rule
        ? [admin.span.name, admin.span.provinceCode, rule.polityId, rule.recordId, rule.provinceName].join("|")
        : "";
      if (key === previous) continue;
      closeOpen(year - 1);
      previous = key;
      if (!rule) {
        open = null;
        continue;
      }
      const polity = catalogPolity(rule.polityId);
      const record = catalogRecord(rule.recordId);
      const archive = catalogArchive(rule.archiveId);
      const evidence = evidenceForComune(place, yearPair(year), place.name);
      open = {
        year,
        to: yearMax,
        name: admin.span.name,
        province: rule.provinceName || "",
        region: rule.regionName || "",
        sovereign: polity.name || "",
        record: record.nameEn || record.name || "",
        civil: Boolean(record.civil),
        archive: archive ? archive.name : "",
        state: evidence.state,
        verification: evidence.verification,
        basis: evidence.basis,
        notes: evidence.notes,
      };
      events.push(open);
    }
    closeOpen(yearMax);
    const successor = place.successorCatasto ? byCatasto.get(place.successorCatasto) : null;
    const modernName = successor && place.suppressed ? successor.name : place.name;
    const office = officeFor(place, modernName);
    const diocese = dioceseFor(place);
    return {
      id: place.id,
      name: place.name,
      modernName,
      istat: place.istat || (successor && successor.istat) || "",
      catasto: place.catasto || "",
      province: place.province || "",
      sigla: place.sigla || "",
      region: place.region || "",
      suppressed: Boolean(place.suppressed),
      pop: place.population || 0,
      lat: place.lat || (successor && successor.lat) || null,
      lng: place.lng || (successor && successor.lng) || null,
      events,
      pec: office.pec || "",
      address: office.address || "",
      office: office.name || "",
      diocese: diocese.name || "",
      dioceseArchive: diocese.archive || "",
      cathedral: diocese.cathedral || "",
      church: diocese.church || "",
    };
  }

  return {
    yearMin,
    yearMax,
    places,
    routes,
    ports,
    resolvePlace,
    search,
    banner,
    provinceAt,
    matchRoute,
    stopsFromRoute,
    stopsFromQuery,
    describePlace,
    clampYear,
    epochFor,
  };
}
