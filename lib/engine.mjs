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

export function parseYearList(value, min = 1796, max = 2026) {
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
  const yearMin = data.polities.yearMin || 1796;
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

  function citizenshipNotes(year, polity, record) {
    const notes = [];
    if (!polity) return notes;
    if (polity.family === "austrian" && polity.id !== "lombardo-veneto") {
      notes.push(`In ${year} this municipality was under Austrian or Austro-Hungarian rule and was annexed to Italy after WWI (Treaty of Saint-Germain, 1919–1920) — a key jurisdictional date for pre-1920 vital records.`);
    }
    if (polity.id === "lombardo-veneto") {
      notes.push(`In ${year} this town was in the Austrian Regno Lombardo-Veneto. It joined the Kingdom of Italy in October 1866. Stato Civile Italiano here starts on 1 September 1871.`);
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
      events.push({
        year,
        historicalName: admin.span.name,
        province: admin.rule.provinceName,
        region: admin.rule.regionName,
        sovereign: polity.name,
        sovereignEn: polity.nameEn,
        record: record.name,
        recordEn: record.nameEn,
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
      result.rangeNote = `This chronicle year is outside 1796–2026. The jurisdiction below is 1 July ${pair.safeYear}, the nearest year in this atlas.`;
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

  function emptyResult(query, year) {
    const pair = yearPair(year);
    return stampYears({
      query: queryFields(pair, query),
      matched: false,
      matchType: null,
      alternates: [],
      stato_civile_office: null,
      parish_routing: { required: false, badge: "", diocese: "", archive: "", recordTypes: [], note: "" },
    }, pair);
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
      return stampYears({
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
      }, pair);
    }

    if (place.kind === "landmark") {
      const anchor = place.anchor ? resolvePlace(place.anchor, pair.requested) : null;
      return stampYears({
        ...(anchor && anchor.matched ? anchor : emptyResult(query, pair.requested)),
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
      return stampYears({
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
        stato_civile_office: officeFor(successor || place, laterName),
        parish_routing: { ...parishRouting(successor || place, { civil: true }), required: false, badge: "" },
        share: { query: `?year=${pair.requested}&place=${encodeURIComponent(query)}` },
      }, pair);
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
    const notes = citizenshipNotes(safeYear, polity, record);
    if (place.successorNote) notes.push(place.successorNote);

    return stampYears({
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
      citizenshipNotes: notes,
      timeline: timeline(place),
      alternates,
      share: {
        query: `?year=${pair.requested}&place=${encodeURIComponent(query)}`,
        canonical: `?year=${pair.requested}&place=${encodeURIComponent(admin.span.name)}`,
      },
    }, pair);
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
    const yearList = parseYearList(yearValue, yearMin, yearMax);
    const route = matchRoute(placeList);
    if (route) {
      return route.stops.map((stop) => ({ ...stop, routeId: route.id, routeTitle: route.titleEn || route.title }));
    }
    const fallbackYear = yearList[0] || 1866;
    return placeList.map((place, index) => ({
      year: yearList[index] !== undefined ? yearList[index] : yearList[yearList.length - 1] || fallbackYear,
      place,
      label: place,
    }));
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
    clampYear,
    epochFor,
  };
}
