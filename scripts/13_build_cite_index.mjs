#!/usr/bin/env node
/**
 * Write data/built/cite-index.json for the citable place pages.
 * Run from the repository root: node scripts/13_build_cite_index.mjs
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAtlas } from "../lib/engine.mjs";
import { analyzeSurname } from "../lib/suite.mjs";
import {
  PUBLISHED,
  PRODUCT,
  buildLookups,
  fold,
  indexShard,
  levaLine,
  packPlaces,
  renderAnswer,
  slugify,
} from "../lib/cite-page.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const built = join(root, "data", "built");

function readJson(name) {
  return JSON.parse(readFileSync(join(built, name), "utf8"));
}

const RESERVED = new Set([
  "css", "js", "data", "comune", "route", "surname", "index.html",
  "assets", "atlas", "parrocchie", "cognomi", "ansc", "caduti",
]);

const index = readJson("comuni-index.json");
const polities = readJson("polities.json");
const archives = readJson("archives.json");
const routes = readJson("routes.json");
const contacts = readJson("contacts.json");
const dioceses = readJson("dioceses.json");
const cognomi = readJson("cognomi-db.json");
const atlas = createAtlas({ index, polities, archives, routes, contacts, dioceses });

const described = [];
for (const place of index.places) {
  const facts = atlas.describePlace(place);
  if (!facts) continue;
  const aliases = new Set([facts.name, facts.modernName]);
  for (const event of facts.events) aliases.add(event.name);
  facts.aliases = [...aliases].filter(Boolean);
  described.push(facts);
}

const used = new Set(RESERVED);
function takeSlug(base, place) {
  let slug = base || "comune";
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  const suffix = String(place.catasto || place.id || "x").toLowerCase().replace(/[^a-z0-9]+/g, "");
  slug = `${base}-${suffix || "x"}`;
  if (used.has(slug)) slug = `${slug}-${place.id}`;
  used.add(slug);
  return slug;
}

for (const place of described) {
  const base = slugify(place.suppressed ? (place.events.at(-1)?.name || place.name) : (place.modernName || place.name));
  place.slug = takeSlug(base, place);
  place.slugs = [place.slug];
}
for (const place of described) {
  for (const alias of place.aliases) {
    const extra = slugify(alias);
    if (!extra || used.has(extra) || RESERVED.has(extra)) continue;
    used.add(extra);
    place.slugs.push(extra);
  }
}

const surnames = Object.values(cognomi.surnames || {}).map((row) => {
  const dossier = analyzeSurname(row.surname, cognomi, index.places);
  return {
    slug: slugify(dossier.surname || row.surname),
    surname: dossier.surname || row.surname,
    region: dossier.region || "",
    category: dossier.category || "",
    meaning: dossier.meaning || "",
    note: dossier.epicenterNote || dossier.foundling?.note || "",
    hospital: dossier.foundling?.hospital || "",
    city: dossier.foundling?.city || "",
    secondary: dossier.secondaryRegions || [],
  };
});

const routeRows = (routes.routes || []).map((route) => ({
  id: route.id,
  title: route.title || "",
  titleEn: route.titleEn || "",
  summary: route.summary || "",
  stops: (route.stops || []).map((stop) => ({
    year: stop.year,
    place: stop.place,
    label: stop.label || "",
  })),
}));

const payload = {
  version: 1,
  published: PUBLISHED,
  product: PRODUCT,
  publisher: "Atto",
  publisherUrl: "https://youratto.com",
  yearMin: atlas.yearMin,
  yearMax: atlas.yearMax,
  places: described,
  surnames,
  routes: routeRows,
};

const lookups = buildLookups(payload);
const enna = lookups.byFold.get("castrogiovanni");
if (!enna) throw new Error("Castrogiovanni did not resolve");
const ennaPage = renderAnswer(enna, { tool: "atlas", year: 1884 });
for (const needle of ["Caltanissetta", "086009", "Piazza Coppola", "Piazza Armerina", "protocollo@pec.comune.enna.it"]) {
  if (!ennaPage.article.includes(needle)) {
    throw new Error(`Enna 1884 page is missing ${needle}. Diocese=${enna.diocese} address=${enna.address} istat=${enna.istat} catasto=${enna.catasto}`);
  }
}
const udine = lookups.byFold.get("udine");
if (!udine) throw new Error("Udine did not resolve");
const leva = levaLine(udine, 1842);
if (!leva.includes("Distretto Militare di Udine") || !leva.includes("Classe di Leva 1842")) {
  throw new Error(`Udine leva line is wrong: ${leva}`);
}
const udinePage = renderAnswer(udine, { tool: "caduti", year: 1842 });
if (!udinePage.article.includes("Distretto Militare di Udine") || !udinePage.article.includes("Classe di Leva 1842")) {
  throw new Error("Udine caduti page is missing the district line");
}
const esposito = surnames.find((row) => row.slug === "esposito");
if (!esposito || !String(esposito.hospital).includes("Real Casa dell'Annunziata") || esposito.region !== "Campania") {
  throw new Error(`Esposito row is wrong: ${JSON.stringify(esposito)}`);
}
if (!routeRows.some((route) => route.id === "dante-exile" && /Ravenna/.test(route.summary))) {
  throw new Error("Dante route summary is missing");
}

const slim = {
  version: 1,
  published: PUBLISHED,
  product: PRODUCT,
  publisher: "Atto",
  publisherUrl: "https://youratto.com",
  yearMin: atlas.yearMin,
  yearMax: atlas.yearMax,
  slugs: described.map((place) => place.slug),
  surnames,
  routes: routeRows,
};
const aliasDir = join(built, "cite-alias");
const placeDir = join(built, "cite-place");
rmSync(aliasDir, { recursive: true, force: true });
rmSync(placeDir, { recursive: true, force: true });
mkdirSync(aliasDir, { recursive: true });
mkdirSync(placeDir, { recursive: true });

const aliasBuckets = new Map();
const scoreOf = (place) => (place.suppressed ? 0 : 1e9) + (place.pop || 0);
const aliasScore = new Map();
function putAlias(key, place) {
  if (!key) return;
  const letter = key[0];
  const prev = aliasScore.get(key) || 0;
  const next = scoreOf(place);
  if (aliasScore.has(key) && prev >= next) return;
  aliasScore.set(key, next);
  if (!aliasBuckets.has(letter)) aliasBuckets.set(letter, {});
  aliasBuckets.get(letter)[key] = place.slug;
}
for (const place of described) {
  putAlias(fold(place.slug), place);
  for (const slug of place.slugs || []) putAlias(fold(slug), place);
  for (const alias of place.aliases || []) putAlias(fold(alias), place);
  for (const event of place.events || []) putAlias(fold(event.name), place);
}
for (const [letter, table] of aliasBuckets) {
  writeFileSync(join(aliasDir, `${letter}.json`), JSON.stringify(table));
}

const placeBuckets = new Map();
for (const place of described) {
  const letter = (place.slug[0] || "0").toLowerCase();
  if (!placeBuckets.has(letter)) placeBuckets.set(letter, []);
  placeBuckets.get(letter).push(place);
}
let shardBytes = 0;
for (const [letter, group] of placeBuckets) {
  const body = JSON.stringify(packPlaces(group));
  shardBytes += Buffer.byteLength(body);
  writeFileSync(join(placeDir, `${letter}.json`), body);
}

const out = join(built, "cite-index.json");
writeFileSync(out, JSON.stringify(slim));
console.log(`wrote ${out}`);
console.log(`places ${described.length} surnames ${surnames.length} routes ${routeRows.length} shardBytes ${shardBytes}`);
console.log(`enna slug ${enna.slug} slugs ${enna.slugs.join(",")}`);
console.log(`enna diocese ${enna.diocese}`);
console.log(`udine ${leva}`);
const alias = JSON.parse(readFileSync(join(aliasDir, "c.json"), "utf8"));
const slug = alias[fold("Castrogiovanni")];
if (slug !== enna.slug) throw new Error(`alias shard mapped Castrogiovanni to ${slug}`);
const shard = indexShard(JSON.parse(readFileSync(join(placeDir, `${slug[0]}.json`), "utf8")));
const round = shard.get(slug);
const roundPage = renderAnswer(round, { tool: "atlas", year: 1884 });
if (!roundPage.article.includes("Caltanissetta") || !roundPage.article.includes("086009")) {
  throw new Error("shard round-trip lost the Enna answer");
}
