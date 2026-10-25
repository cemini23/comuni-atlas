#!/usr/bin/env node
/**
 * Resolve an Italian place at a historical year, or a surname dossier.
 *
 *   node cli/resolve.mjs --year 1884 --place "Castrogiovanni"
 *   node cli/resolve.mjs --year 1852 --place Udine
 *   node cli/resolve.mjs --year 1842 --place Udine
 *   node cli/resolve.mjs --cognome Barone
 *   node cli/resolve.mjs --leva --year 1878 --place Isernia
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAtlas, fold } from "../lib/engine.mjs";
import { analyzeSurname, catastoGuide, filterParishes, levaFromResolution } from "../lib/suite.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const built = join(root, "data", "built");
const TOOLS = new Set(["parrocchie", "cognomi", "ansc", "caduti"]);

function readJson(name) {
  return JSON.parse(readFileSync(join(built, name), "utf8"));
}

function takesValue(argv, index) {
  const next = argv[index + 1];
  return next !== undefined && !next.startsWith("--");
}

function parseArgs(argv) {
  const args = {
    year: null,
    place: null,
    cognome: undefined,
    leva: false,
    tool: undefined,
    help: false,
    error: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--year") {
      if (!takesValue(argv, index)) args.error = true;
      else args.year = argv[++index];
    } else if (token === "--place") {
      if (!takesValue(argv, index)) args.error = true;
      else args.place = argv[++index];
    } else if (token === "--cognome" || token === "--surname") {
      if (!takesValue(argv, index)) args.error = true;
      else args.cognome = argv[++index];
    } else if (token === "--leva") {
      args.leva = true;
    } else if (token === "--tool") {
      if (!takesValue(argv, index)) args.error = true;
      else args.tool = argv[++index];
    } else if (token === "--help" || token === "-h") {
      args.help = true;
    } else if (!token.startsWith("--") && args.place === null) {
      args.place = token;
    } else if (token.startsWith("--")) {
      args.error = true;
    }
  }
  return args;
}

function usage() {
  return [
    "Usage: node cli/resolve.mjs --year 1884 --place \"Castrogiovanni\"",
    "       node cli/resolve.mjs --cognome Barone",
    "       node cli/resolve.mjs --surname Esposito",
    "       node cli/resolve.mjs --leva --year 1878 --place Isernia",
    "       node cli/resolve.mjs --tool parrocchie --year 1842 --place Udine",
    "The date inside a year is 1 July.",
    "--cognome and --surname print a surname dossier. They do not print the place.",
    "--leva adds the conscription finding aid. A matched place prints it too.",
    "--tool is parrocchie, cognomi, ansc, or caduti. It does not remove place fields.",
    "Several places draw a route. A known route such as Quarto,Marsala,Palermo,Napoli uses the curated stops.",
  ].join("\n");
}

function rawYears(value) {
  if (value === undefined || value === null || value === "") return [];
  return String(value)
    .split(/[,;|\s]+/)
    .map((part) => Number(part.trim()))
    .filter((year) => Number.isFinite(year));
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function regionOf(result) {
  return result?.modernProvince?.region || result?.historicalProvince?.region || "";
}

function churchesFor(result, parrocchieDb) {
  const rows = parrocchieDb.churches || [];
  const names = new Set(
    [result.modernName, result.historicalName, result.query?.place]
      .filter(Boolean)
      .map((name) => fold(name)),
  );
  return rows.filter((row) => {
    if (result.istat && row.istat && row.istat === result.istat) return true;
    return names.has(fold(row.comune));
  });
}

function enrich(result, birthYear, atlas, archives, parrocchieDb) {
  const atCallUp = atlas.resolvePlace(result.query?.place || result.modernName || "", birthYear + 20);
  const leva = levaFromResolution(birthYear, result, atCallUp, archives);
  const sovereignId = result.sovereign?.id || "";
  const region = regionOf(result);
  let options = {};
  if (sovereignId === "regno-italia") {
    const earlier = atlas.resolvePlace(result.query?.place || result.modernName || "", 1850);
    options = {
      fallbackId: earlier.sovereign?.id || "",
      fallbackRegion: regionOf(earlier),
    };
  }
  const guide = catastoGuide(sovereignId, region, options);
  const parish = result.parish_routing || {};
  return {
    ...result,
    leva,
    catasto_guide: {
      ...guide,
      antenatiUrl: result.archive?.antenatiUrl || "",
    },
    parrocchie: {
      diocese: parish.diocese || "",
      archive: parish.archive || "",
      bewebUrl: parish.bewebUrl || "",
      matches: filterParishes(churchesFor(result, parrocchieDb), birthYear),
    },
  };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.error(usage());
  process.exit(0);
}
if (args.error || (args.tool !== undefined && !TOOLS.has(args.tool))) {
  console.error(usage());
  process.exit(1);
}
if (args.cognome !== undefined) {
  if (String(args.cognome).trim() === "") {
    console.error("Surname is empty.");
    process.exit(2);
  }
  const index = readJson("comuni-index.json");
  const cognomi = readJson("cognomi-db.json");
  writeJson(analyzeSurname(args.cognome, cognomi, index.places || []));
  process.exit(0);
}
if (!args.place) {
  console.error(usage());
  process.exit(1);
}

const index = readJson("comuni-index.json");
const polities = readJson("polities.json");
const archives = readJson("archives.json");
const routes = readJson("routes.json");
const contacts = readJson("contacts.json");
const dioceses = readJson("dioceses.json");
const parrocchieDb = readJson("parrocchie-db.json");
const cognomiDb = readJson("cognomi-db.json");
const anscDb = readJson("ansc-pec-db.json");
const cadutiDb = readJson("caduti-leva-db.json");
const railDb = readJson("rail-catasti.json");
if (!cognomiDb || !anscDb || !cadutiDb || !railDb) {
  throw new Error("suite bundle is missing");
}

const atlas = createAtlas({ index, polities, archives, routes, contacts, dioceses });
const stops = atlas.stopsFromQuery(args.year, args.place);
const resolved = stops.map((stop) => {
  const result = atlas.resolvePlace(stop.place, stop.year);
  if (stop.label && stop.label !== stop.place) result.label = stop.label;
  if (stop.routeId) result.routeId = stop.routeId;
  return result;
});

const years = rawYears(args.year);
let payload;
if (resolved.length === 1) {
  const birthYear = years[0] !== undefined ? years[0] : resolved[0].query?.year;
  payload = resolved[0].matched
    ? enrich(resolved[0], birthYear, atlas, archives, parrocchieDb)
    : resolved[0];
} else {
  payload = {
    mode: "trajectory",
    routeId: resolved.find((item) => item.routeId)?.routeId || null,
    stops: resolved,
  };
}

writeJson(payload);
process.exit(resolved.every((item) => item.matched) ? 0 : 2);
