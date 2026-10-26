/**
 * Citable HTML and Markdown for one comune, surname, or route.
 * No DOM and no Node APIs. The site function and the build script both use it.
 */

export const PRODUCT = "Italia Storica Atlas";
export const PUBLISHER = "Atto";
export const ORIGIN = "https://youratto.com";
export const PUBLISHED = "2026-10-26";

const TOOL_PATH = {
  atlas: "/atlas/",
  parrocchie: "/parrocchie/",
  ansc: "/ansc/",
  caduti: "/caduti/",
  cognomi: "/cognomi/",
};

export function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[ch]));
}

export function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function slugify(name) {
  const slug = String(name || "comune")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "comune";
}

export function clampYear(year, min = 1563, max = 2026) {
  const numeric = Number(year);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

export function eventAt(place, year) {
  const numeric = clampYear(year);
  if (numeric == null || !place?.events?.length) return null;
  for (const event of place.events) {
    if (event.year <= numeric && numeric <= event.to) return event;
  }
  return null;
}

export function preferredSlug(place) {
  return place?.slug || place?.slugs?.[0] || slugify(place?.modernName || place?.name || "comune");
}

export function canonicalFor(place, tool = "atlas") {
  const slug = preferredSlug(place);
  if (tool === "parrocchie") return `${ORIGIN}/parrocchie/comune/${slug}/`;
  if (tool === "ansc") return `${ORIGIN}/ansc/comune/${slug}/`;
  if (tool === "caduti") return `${ORIGIN}/caduti/comune/${slug}/`;
  return `${ORIGIN}/atlas/comune/${slug}/`;
}

export function levaLine(place, birthYear) {
  const year = clampYear(birthYear) ?? Number(birthYear);
  const call = year + 20;
  const event = eventAt(place, call) || eventAt(place, year);
  const province = event?.province || place?.province || "the historical province";
  return `Distretto Militare di ${province} — Classe di Leva ${year} (Call-up year ${call}).`;
}

function names(place, year) {
  const event = eventAt(place, year);
  const historical = event?.name || place.name;
  const modern = place.modernName && place.modernName !== historical ? place.modernName : "";
  return { historical, modern, event };
}

function provinceSentence(place, year) {
  const { historical, modern, event } = names(place, year);
  const modernBit = modern ? ` The modern comune is ${modern}.` : "";
  const codes = ` The ISTAT code is ${place.istat || "not on file"}. The catasto code is ${place.catasto || "not on file"}.`;
  if (!event) {
    return `${historical} has no jurisdiction row on 1 July ${year} in the ${PRODUCT}.${modernBit}${codes}`;
  }
  const civil = event.civil
    ? "Civil registration is in force."
    : "Civil registration is not the legal register. Request the parish copy and the diocesan archive.";
  const region = event.region ? ` (${event.region})` : "";
  return `In ${year}, ${historical} was in the Province of ${event.province}${region}. The sovereign was ${event.sovereign}.${modernBit}${codes} ${civil} The State Archive is ${event.archive || "the provincial Archivio di Stato"}.`;
}

function dioceseSentence(place) {
  const name = place.diocese || "the local diocese";
  const archive = place.dioceseArchive ? ` The diocesan archive is ${place.dioceseArchive}.` : "";
  const church = place.church ? ` The church on file is ${place.church}.` : "";
  const cathedral = place.cathedral ? ` The cathedral is ${place.cathedral}.` : "";
  return `The diocese is ${name}.${archive}${cathedral}${church}`;
}

function pecSentence(place) {
  return `The PEC address is ${place.pec || "not on file"}. The municipio address is ${place.address || "not on file"}. The office is ${place.office || "Ufficio di Stato Civile"}.`;
}

function tableRows(place) {
  return (place.events || []).map((event) => (
    `<tr><td><time datetime="${esc(event.year)}">${esc(event.year)}</time></td><td><time datetime="${esc(event.to)}">${esc(event.to)}</time></td><td>${esc(event.name)}</td><td>${esc(event.province)}</td><td>${esc(event.sovereign)}</td><td>${esc(event.record)}</td></tr>`
  )).join("");
}

function mdTable(place) {
  const lines = ["| From | To | Name | Province | Sovereign | Register |", "| --- | --- | --- | --- | --- | --- |"];
  for (const event of place.events || []) {
    lines.push(`| ${event.year} | ${event.to} | ${event.name} | ${event.province} | ${event.sovereign} | ${event.record} |`);
  }
  return lines.join("\n");
}

function titleFor(place, year, tool, specific) {
  const { historical, modern } = names(place, year);
  const modernBit = modern ? ` (${modern})` : "";
  if (tool === "parrocchie") return `${historical}${modernBit} parishes in ${year} | ${PRODUCT}`;
  if (tool === "ansc") return `${historical}${modernBit} PEC | ${PRODUCT}`;
  if (tool === "caduti") return `${historical}${modernBit} liste di leva ${year} | ${PRODUCT}`;
  if (specific) return `${historical}${modernBit} in ${year} — Stato Civile & Archive Lookup | ${PRODUCT}`;
  return `${historical}${modernBit} — ${PRODUCT}`;
}

function h1For(title) {
  return title.replace(` | ${PRODUCT}`, "").replace(` — ${PRODUCT}`, "");
}

export function renderAnswer(place, options = {}) {
  const tool = options.tool || "atlas";
  const min = 1563;
  const max = 2026;
  const requested = clampYear(options.year, min, max);
  const year = requested ?? (eventAt(place, 1884) ? 1884 : (place.events?.at(-1)?.year || 1866));
  const specific = requested != null;
  const title = titleFor(place, year, tool, specific || tool !== "atlas");
  const province = provinceSentence(place, year);
  const diocese = dioceseSentence(place);
  const pec = pecSentence(place);
  const leva = levaLine(place, tool === "caduti" ? year : year);
  const { historical } = names(place, year);
  const canonical = canonicalFor(place, tool === "cognomi" ? "atlas" : tool);
  const mapHref = `${ORIGIN}/atlas/?year=${encodeURIComponent(year)}&place=${encodeURIComponent(historical)}`;
  const leadBits = {
    atlas: province,
    parrocchie: `${diocese} ${province}`,
    ansc: `${pec} ${province}`,
    caduti: `${leva} ${province}`,
  };
  const lead = leadBits[tool] || province;
  const description = `${lead} Published by ${PUBLISHER}.`.slice(0, 300);
  const rows = tableRows(place);
  const summary = `<article id="cited-answer" class="cited-answer">
<p>Published by <a href="${ORIGIN}">${PUBLISHER}</a> on <time datetime="${PUBLISHED}">26 October 2026</time>. This page is part of the ${PRODUCT}.</p>
<h1 class="cite-title">${esc(h1For(title))}</h1>
<p>${esc(lead)}</p>
<p><a href="${esc(canonical)}">Full place page: province table, diocese, PEC, and liste di leva</a></p>
</article>`;
  const article = `<article id="cited-answer" class="cited-answer">
<p>Published by <a href="${ORIGIN}">${PUBLISHER}</a> on <time datetime="${PUBLISHED}">26 October 2026</time>. This page is part of the ${PRODUCT}.</p>
<h1 class="cite-title">${esc(h1For(title))}</h1>
<p>${esc(lead)}</p>
<h2>Which province was ${esc(historical)} in?</h2>
<p>${esc(province)}</p>
<table>
<caption>Province and sovereign for ${esc(historical)}</caption>
<thead><tr><th>From</th><th>To</th><th>Name</th><th>Province</th><th>Sovereign</th><th>Register</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<h2>Which diocese covers ${esc(place.modernName || historical)}?</h2>
<p>${esc(diocese)}</p>
<h2>What is the PEC address?</h2>
<p>${esc(pec)}</p>
<h2>Where are the liste di leva?</h2>
<p>The call-up year is the birth year plus 20. ${esc(leva)} This is a finding aid, not a service record.</p>
<p><a href="${esc(mapHref)}">Open ${esc(historical)} on the map</a>. <a href="${esc(canonical)}">Stable page</a>. <a href="${ORIGIN}/parrocchie/comune/${esc(preferredSlug(place))}/">Parishes</a>. <a href="${ORIGIN}/ansc/comune/${esc(preferredSlug(place))}/">PEC</a>. <a href="${ORIGIN}/caduti/comune/${esc(preferredSlug(place))}/">Liste di leva</a>.</p>
</article>`;
  const markdown = `# ${h1For(title)}

Published by [${PUBLISHER}](${ORIGIN}) on ${PUBLISHED}. This page is part of the ${PRODUCT}.

${lead}

## Which province was ${historical} in?

${province}

${mdTable(place)}

## Which diocese covers ${place.modernName || historical}?

${diocese}

## What is the PEC address?

${pec}

## Where are the liste di leva?

The call-up year is the birth year plus 20. ${leva} This is a finding aid, not a service record.

[Open ${historical} on the map](${mapHref})

[Stable page](${canonical})
`;
  return { title, description, canonical, summary, article, markdown, year };
}

export function renderSurname(row) {
  const hospital = row.hospital || "";
  const city = row.city ? ` in ${row.city}` : "";
  const region = row.region || "not assigned to one region";
  const lead = hospital
    ? `${row.surname} is a foundling surname of the ${hospital}${city}. The region is ${region}. This is a linguistic estimate, not a census.`
    : `${row.surname} is an Italian surname. The region lean is ${region}. ${row.note || ""} This is a linguistic estimate, not a census.`;
  const title = `${row.surname} Surname Origin, Map & Italian Civil Records | ${PRODUCT}`;
  const canonical = `${ORIGIN}/cognomi/surname/${row.slug}/`;
  const summary = `<article id="cited-answer" class="cited-answer">
<p>Published by <a href="${ORIGIN}">${PUBLISHER}</a> on <time datetime="${PUBLISHED}">26 October 2026</time>. This page is part of the ${PRODUCT}.</p>
<h1 class="cite-title">${esc(row.surname)} surname</h1>
<p>${esc(lead)}</p>
<p><a href="${esc(canonical)}">Full surname page</a></p>
</article>`;
  const article = `<article id="cited-answer" class="cited-answer">
<p>Published by <a href="${ORIGIN}">${PUBLISHER}</a> on <time datetime="${PUBLISHED}">26 October 2026</time>. This page is part of the ${PRODUCT}.</p>
<h1 class="cite-title">${esc(row.surname)} surname</h1>
<p>${esc(lead)}</p>
<h2>Where does ${esc(row.surname)} point?</h2>
<p>${esc(lead)}</p>
<p>Category: ${esc(row.category || "unclassified")}. ${row.meaning ? `Meaning: ${esc(row.meaning)}.` : ""}</p>
<p><a href="${ORIGIN}/cognomi/?surname=${encodeURIComponent(row.surname)}">Open the surname map</a>.</p>
</article>`;
  const markdown = `# ${row.surname} surname

Published by [${PUBLISHER}](${ORIGIN}). This page is part of the ${PRODUCT}.

${lead}

[Open the surname map](${ORIGIN}/cognomi/?surname=${encodeURIComponent(row.surname)})
`;
  return {
    title,
    description: lead.slice(0, 300),
    canonical,
    summary,
    article,
    markdown,
  };
}

export function renderRoute(route) {
  const titleText = route.titleEn || route.title || route.id;
  const title = `${titleText} — ${PRODUCT}`;
  const canonical = `${ORIGIN}/atlas/route/${route.id}/`;
  const summary = `<article id="cited-answer" class="cited-answer">
<p>Published by <a href="${ORIGIN}">${PUBLISHER}</a> on <time datetime="${PUBLISHED}">26 October 2026</time>. This page is part of the ${PRODUCT}.</p>
<h1 class="cite-title">${esc(titleText)}</h1>
<p>${esc(route.summary || "")}</p>
<p><a href="${esc(canonical)}">Full route page with every stop</a></p>
</article>`;
  const stops = (route.stops || []).map((stop) => (
    `<tr><td><time datetime="${esc(stop.year)}">${esc(stop.year)}</time></td><td>${esc(stop.place)}</td><td>${esc(stop.label || "")}</td></tr>`
  )).join("");
  const article = `<article id="cited-answer" class="cited-answer">
<p>Published by <a href="${ORIGIN}">${PUBLISHER}</a> on <time datetime="${PUBLISHED}">26 October 2026</time>. This page is part of the ${PRODUCT}.</p>
<h1 class="cite-title">${esc(titleText)}</h1>
<p>${esc(route.summary || "")}</p>
<h2>What are the stops?</h2>
<table>
<caption>Stops on ${esc(titleText)}</caption>
<thead><tr><th>Year</th><th>Place</th><th>Note</th></tr></thead>
<tbody>${stops}</tbody>
</table>
<p><a href="${ORIGIN}/atlas/?route=${encodeURIComponent(route.id)}">Open this route on the map</a>.</p>
</article>`;
  const mdStops = (route.stops || []).map((stop) => `| ${stop.year} | ${stop.place} | ${stop.label || ""} |`).join("\n");
  const markdown = `# ${titleText}

Published by [${PUBLISHER}](${ORIGIN}). This page is part of the ${PRODUCT}.

${route.summary || ""}

## What are the stops?

| Year | Place | Note |
| --- | --- | --- |
${mdStops}

[Open this route on the map](${ORIGIN}/atlas/?route=${encodeURIComponent(route.id)})
`;
  return {
    title,
    description: `${titleText}. ${route.summary || ""} Published by ${PUBLISHER}.`.slice(0, 300),
    canonical,
    summary,
    article,
    markdown,
  };
}

export function landingMarkdown(tool) {
  const path = TOOL_PATH[tool] || "/atlas/";
  const pages = {
    atlas: `The ${PRODUCT} names the province, the sovereign, the State Archive, the diocese, and the PEC address for an Italian comune from 1563 to 2026. Published by [${PUBLISHER}](${ORIGIN}).`,
    parrocchie: `Parish and diocese pages name the diocese and the diocesan archive for an Italian comune. Part of the ${PRODUCT}, published by [${PUBLISHER}](${ORIGIN}).`,
    ansc: `The PEC directory names the municipal PEC address and the municipio. Part of the ${PRODUCT}, published by [${PUBLISHER}](${ORIGIN}).`,
    caduti: `Liste di leva pages name the military district. The call-up year is the birth year plus 20. Part of the ${PRODUCT}, published by [${PUBLISHER}](${ORIGIN}).`,
    cognomi: `Surname pages are a linguistic estimate, not a census. Part of the ${PRODUCT}, published by [${PUBLISHER}](${ORIGIN}).`,
  };
  return `# ${PRODUCT}

${pages[tool] || pages.atlas}

- [${PRODUCT}](${ORIGIN}${path})
- [Enna (Castrogiovanni)](${ORIGIN}/atlas/comune/enna/)
- [Esposito surname](${ORIGIN}/cognomi/surname/esposito/)
- [Dante exile route](${ORIGIN}/atlas/route/dante-exile/)
`;
}

export const CITED_STYLE = `<style id="cited-answer-style">
.cited-answer{margin:0.75rem;padding:0.9rem 1rem 1rem;background:var(--card,#fffdf8);color:var(--ink,#1d1914);border:1px solid var(--rule,#e4d8c4);border-radius:18px;font-family:Georgia,"Iowan Old Style",serif;line-height:1.45}
.cited-answer h1{font-size:1.45rem;line-height:1.2;margin:0.2rem 0 0.45rem}
.cited-answer h2{font-size:1.05rem;margin:0.9rem 0 0.3rem}
.cited-answer p{margin:0.35rem 0}
.cited-answer table{width:100%;border-collapse:collapse;font-size:0.92rem}
.cited-answer th,.cited-answer td{border-bottom:1px solid var(--rule,#e4d8c4);text-align:left;padding:0.28rem 0.4rem;vertical-align:top}
.cited-answer a{color:inherit}
</style>`;

function jsonLd(meta) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: meta.title,
    url: meta.canonical,
    description: meta.description,
    dateModified: PUBLISHED,
    inLanguage: "en",
    isPartOf: {
      "@type": "WebApplication",
      name: PRODUCT,
      url: `${ORIGIN}/atlas/`,
    },
    publisher: {
      "@type": "Organization",
      name: PUBLISHER,
      url: ORIGIN,
    },
  });
}

export function renderDocument(meta) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<meta name="author" content="${PUBLISHER}">
<link rel="canonical" href="${esc(meta.canonical)}">
<link rel="alternate" type="text/markdown" href="${esc(meta.canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${PUBLISHER}">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<meta property="og:url" content="${esc(meta.canonical)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(meta.title)}">
<meta name="twitter:description" content="${esc(meta.description)}">
<script type="application/ld+json">
${jsonLd(meta)}
</script>
${CITED_STYLE}
</head>
<body>
${meta.article}
</body>
</html>
`;
}

export function injectShell(html, meta) {
  let out = String(html || "");
  if (!out.includes('id="cited-answer-style"')) {
    out = out.replace("</head>", `${CITED_STYLE}\n</head>`);
  }
  if (!out.includes('id="cited-answer"')) {
    out = out.replace("<body>", `<body>\n${meta.summary || meta.article}\n`);
  }
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
  out = replaceMeta(out, "name", "description", meta.description);
  out = replaceMeta(out, "property", "og:title", meta.title);
  out = replaceMeta(out, "property", "og:description", meta.description);
  out = replaceMeta(out, "property", "og:url", meta.canonical);
  out = replaceMeta(out, "name", "twitter:title", meta.title);
  out = replaceMeta(out, "name", "twitter:description", meta.description);
  if (out.includes('rel="canonical"')) {
    out = out.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(meta.canonical)}">`);
  } else {
    out = out.replace("</head>", `<link rel="canonical" href="${esc(meta.canonical)}">\n</head>`);
  }
  out = out.replace(/<h1 class="atlas-title">([\s\S]*?)<\/h1>/, "<p class=\"atlas-title\">$1</p>");
  return out;
}

function replaceMeta(html, attr, key, value) {
  const tag = `<meta ${attr}="${key}" content="${esc(value)}">`;
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*">`);
  if (re.test(html)) return html.replace(re, tag);
  return html.replace("</head>", `${tag}\n</head>`);
}

export function packPlaces(places) {
  const strings = [];
  const ids = new Map();
  const sid = (value) => {
    const text = value == null ? "" : String(value);
    if (ids.has(text)) return ids.get(text);
    const id = strings.length;
    strings.push(text);
    ids.set(text, id);
    return id;
  };
  return {
    strings,
    places: places.map((place) => ({
      id: place.id,
      slug: place.slug,
      slugs: place.slugs,
      name: sid(place.name),
      modernName: sid(place.modernName),
      istat: place.istat || "",
      catasto: place.catasto || "",
      province: sid(place.province),
      sigla: place.sigla || "",
      region: sid(place.region),
      suppressed: place.suppressed ? 1 : 0,
      pop: place.pop || 0,
      lat: place.lat,
      lng: place.lng,
      aliases: (place.aliases || []).map(sid),
      events: (place.events || []).map((event) => [
        event.year,
        event.to,
        sid(event.name),
        sid(event.province),
        sid(event.region),
        sid(event.sovereign),
        sid(event.record),
        event.civil ? 1 : 0,
        sid(event.archive),
      ]),
      pec: place.pec || "",
      address: place.address || "",
      office: sid(place.office),
      diocese: sid(place.diocese),
      dioceseArchive: sid(place.dioceseArchive),
      cathedral: sid(place.cathedral),
      church: sid(place.church),
    })),
  };
}

export function unpackPlace(packed, strings) {
  const text = (id) => strings[id] || "";
  return {
    id: packed.id,
    slug: packed.slug,
    slugs: packed.slugs || [],
    name: text(packed.name),
    modernName: text(packed.modernName),
    istat: packed.istat || "",
    catasto: packed.catasto || "",
    province: text(packed.province),
    sigla: packed.sigla || "",
    region: text(packed.region),
    suppressed: Boolean(packed.suppressed),
    pop: packed.pop || 0,
    lat: packed.lat,
    lng: packed.lng,
    aliases: (packed.aliases || []).map(text),
    events: (packed.events || []).map((row) => ({
      year: row[0],
      to: row[1],
      name: text(row[2]),
      province: text(row[3]),
      region: text(row[4]),
      sovereign: text(row[5]),
      record: text(row[6]),
      civil: Boolean(row[7]),
      archive: text(row[8]),
    })),
    pec: packed.pec || "",
    address: packed.address || "",
    office: text(packed.office),
    diocese: text(packed.diocese),
    dioceseArchive: text(packed.dioceseArchive),
    cathedral: text(packed.cathedral),
    church: text(packed.church),
  };
}

export function indexShard(shard) {
  const bySlug = new Map();
  for (const packed of shard.places || []) {
    const place = unpackPlace(packed, shard.strings || []);
    bySlug.set(place.slug, place);
  }
  return bySlug;
}

export function buildLookups(data) {
  const bySlug = new Map();
  const byFold = new Map();
  const score = (place) => (place.suppressed ? 0 : 1e9) + (place.pop || 0);
  const consider = (key, place) => {
    if (!key) return;
    const prev = byFold.get(key);
    if (!prev || score(place) > score(prev)) byFold.set(key, place);
  };
  for (const place of data.places || []) {
    for (const slug of place.slugs || []) bySlug.set(slug, place);
    if (place.slug) bySlug.set(place.slug, place);
    consider(fold(place.name), place);
    consider(fold(place.modernName), place);
    consider(fold(place.slug), place);
    for (const slug of place.slugs || []) consider(fold(slug), place);
    for (const alias of place.aliases || []) consider(fold(alias), place);
    for (const event of place.events || []) consider(fold(event.name), place);
  }
  const surnamesBySlug = new Map();
  const surnamesByFold = new Map();
  for (const row of data.surnames || []) {
    surnamesBySlug.set(row.slug, row);
    surnamesByFold.set(fold(row.surname), row);
    surnamesByFold.set(fold(row.slug), row);
  }
  const routesById = new Map();
  for (const route of data.routes || []) routesById.set(fold(route.id), route);
  return { data, bySlug, byFold, surnamesBySlug, surnamesByFold, routesById };
}

export function wantsMarkdown(request) {
  const accept = request.headers.get("accept") || "";
  if (!accept.toLowerCase().includes("text/markdown")) return false;
  let markdown = null;
  let html = null;
  for (const part of accept.split(",")) {
    const [typeRaw, ...params] = part.split(";").map((item) => item.trim());
    const type = typeRaw.toLowerCase();
    let quality = 1;
    for (const param of params) {
      if (param.toLowerCase().startsWith("q=")) quality = Number(param.slice(2));
    }
    if (!Number.isFinite(quality)) quality = 1;
    if (type === "text/markdown") markdown = quality;
    if (type === "text/html" || type === "application/xhtml+xml") html = quality;
  }
  if (markdown == null) return false;
  if (html == null) return true;
  return markdown >= html;
}
