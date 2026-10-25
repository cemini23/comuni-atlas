#!/usr/bin/env node
/**
 * Resolve an Italian place at a historical year.
 *
 *   node cli/resolve.mjs --year 1884 --place "Castrogiovanni"
 *   node cli/resolve.mjs --year 1852 --place Udine
 *   node cli/resolve.mjs --year 1910 --place Trento
 *   node cli/resolve.mjs --year 1860,1860,1860,1860 --place "Quarto,Marsala,Palermo,Napoli"
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAtlas } from "../lib/engine.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const built = join(root, "data", "built");

function readJson(name) {
  return JSON.parse(readFileSync(join(built, name), "utf8"));
}

function parseArgs(argv) {
  const args = { year: null, place: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--year") args.year = argv[++index];
    else if (token === "--place") args.place = argv[++index];
    else if (token === "--help" || token === "-h") args.help = true;
    else if (!token.startsWith("--") && args.place === null) args.place = token;
  }
  return args;
}

function usage() {
  return [
    "Usage: node cli/resolve.mjs --year 1884 --place \"Castrogiovanni\"",
    "The date inside a year is 1 July.",
    "Several places draw a route. A known route such as Quarto,Marsala,Palermo,Napoli uses the curated stops.",
  ].join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.place) {
  console.error(usage());
  process.exit(args.help ? 0 : 1);
}

const atlas = createAtlas({
  index: readJson("comuni-index.json"),
  polities: readJson("polities.json"),
  archives: readJson("archives.json"),
  routes: readJson("routes.json"),
  contacts: readJson("contacts.json"),
  dioceses: readJson("dioceses.json"),
});

const stops = atlas.stopsFromQuery(args.year, args.place);
const resolved = stops.map((stop) => {
  const result = atlas.resolvePlace(stop.place, stop.year);
  if (stop.label && stop.label !== stop.place) result.label = stop.label;
  if (stop.routeId) result.routeId = stop.routeId;
  return result;
});

const payload = resolved.length === 1
  ? resolved[0]
  : {
      mode: "trajectory",
      routeId: resolved.find((item) => item.routeId)?.routeId || null,
      stops: resolved,
    };

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
process.exit(resolved.every((item) => item.matched) ? 0 : 2);
