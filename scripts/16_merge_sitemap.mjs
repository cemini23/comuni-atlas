#!/usr/bin/env node
/**
 * Insert comune, surname, and route URLs into the site sitemap.
 * node scripts/16_merge_sitemap.mjs data/built/cite-index.json /path/to/sitemap.xml
 */

import { readFileSync, writeFileSync } from "node:fs";

const [indexPath, sitemapPath] = process.argv.slice(2);
if (!indexPath || !sitemapPath) {
  console.error("Usage: node scripts/16_merge_sitemap.mjs cite-index.json sitemap.xml");
  process.exit(1);
}

const data = JSON.parse(readFileSync(indexPath, "utf8"));
const start = "<!-- cite-places:start -->";
const end = "<!-- cite-places:end -->";
const locs = [];

function add(url) {
  locs.push(`  <url>\n    <loc>${url}</loc>\n    <lastmod>2026-10-26</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`);
}

const placeSlugs = data.slugs || (data.places || []).map((place) => place.slug);
for (const slug of placeSlugs) {
  if (!slug) continue;
  add(`https://youratto.com/atlas/comune/${slug}/`);
}
for (const row of data.surnames || []) {
  if (!row.slug) continue;
  add(`https://youratto.com/cognomi/surname/${row.slug}/`);
}
for (const route of data.routes || []) {
  if (!route.id) continue;
  add(`https://youratto.com/atlas/route/${route.id}/`);
}

const block = `${start}\n${locs.join("\n")}\n  ${end}`;
let xml = readFileSync(sitemapPath, "utf8");
if (xml.includes(start) && xml.includes(end)) {
  xml = xml.replace(new RegExp(`${start}[\\s\\S]*${end}`), block);
} else {
  xml = xml.replace("</urlset>", `${block}\n</urlset>`);
}
writeFileSync(sitemapPath, xml);
console.log(`sitemap locs added ${locs.length}`);
