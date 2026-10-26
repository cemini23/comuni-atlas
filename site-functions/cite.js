/**
 * Serve citable place, surname, and route pages.
 * A query URL keeps the app shell and adds the answer in the HTML.
 * Accept: text/markdown returns Markdown and sets Vary: Accept.
 */

import {
  ORIGIN,
  buildLookups,
  canonicalFor,
  fold,
  indexShard,
  injectShell,
  landingMarkdown,
  renderAnswer,
  renderDocument,
  renderRoute,
  renderSurname,
  wantsMarkdown,
} from "./cite-page.mjs";

const RESERVED = new Set(["css", "js", "data", "comune", "route", "surname", "index.html"]);
const TOOLS = {
  "/atlas": "atlas",
  "/parrocchie": "parrocchie",
  "/ansc": "ansc",
  "/caduti": "caduti",
  "/cognomi": "cognomi",
};

const metaCache = { current: null };
const aliasCache = new Map();
const shardCache = new Map();

function decodePart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function classify(url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  let match = path.match(/^\/comune\/([^/]+)$/);
  if (match) return { kind: "root-comune", slug: decodePart(match[1]) };
  match = path.match(/^\/atlas\/comune\/([^/]+)$/);
  if (match) return { kind: "place", tool: "atlas", slug: decodePart(match[1]) };
  match = path.match(/^\/parrocchie\/comune\/([^/]+)$/);
  if (match) return { kind: "place", tool: "parrocchie", slug: decodePart(match[1]) };
  match = path.match(/^\/ansc\/comune\/([^/]+)$/);
  if (match) return { kind: "place", tool: "ansc", slug: decodePart(match[1]) };
  match = path.match(/^\/caduti\/comune\/([^/]+)$/);
  if (match) return { kind: "place", tool: "caduti", slug: decodePart(match[1]) };
  match = path.match(/^\/atlas\/route\/([^/]+)$/);
  if (match) return { kind: "route", id: decodePart(match[1]) };
  match = path.match(/^\/cognomi\/surname\/([^/]+)$/);
  if (match) return { kind: "surname", slug: decodePart(match[1]) };
  match = path.match(/^\/atlas\/([^/]+)$/);
  if (match) {
    const slug = decodePart(match[1]);
    if (slug.includes(".") || RESERVED.has(slug)) return null;
    return { kind: "place", tool: "atlas", slug };
  }
  if (Object.prototype.hasOwnProperty.call(TOOLS, path)) {
    return { kind: "landing", tool: TOOLS[path] };
  }
  return null;
}

function landingNeedsWork(url, request) {
  if (wantsMarkdown(request)) return true;
  const params = url.searchParams;
  const tool = TOOLS[url.pathname.replace(/\/+$/, "") || "/"];
  if (tool === "cognomi") return Boolean(params.get("surname") || params.get("cognome"));
  if (tool === "ansc") return Boolean(params.get("comune") || params.get("q"));
  if (tool === "parrocchie") return Boolean(params.get("comune") || params.get("diocese"));
  if (tool === "caduti") return Boolean(params.get("place"));
  return Boolean(params.get("place") || params.get("route") || params.get("person"));
}

async function fetchJson(context, origin, path) {
  const asset = await context.env.ASSETS.fetch(new Request(new URL(path, origin)));
  if (!asset.ok) throw new Error(`${path} ${asset.status}`);
  return asset.json();
}

async function loadMeta(context, origin) {
  if (!metaCache.current) {
    metaCache.current = fetchJson(context, origin, "/atlas/data/built/cite-index.json")
      .then((data) => buildLookups(data))
      .catch((error) => {
        metaCache.current = null;
        throw error;
      });
  }
  return metaCache.current;
}

function letterOf(key) {
  const text = fold(key);
  const letter = text[0] || "0";
  return /[a-z0-9]/.test(letter) ? letter : "0";
}

async function loadAlias(context, origin, letter) {
  if (!aliasCache.has(letter)) {
    aliasCache.set(letter, fetchJson(context, origin, `/atlas/data/built/cite-alias/${letter}.json`).catch((error) => {
      aliasCache.delete(letter);
      throw error;
    }));
  }
  return aliasCache.get(letter);
}

async function loadShard(context, origin, letter) {
  if (!shardCache.has(letter)) {
    shardCache.set(letter, fetchJson(context, origin, `/atlas/data/built/cite-place/${letter}.json`)
      .then((shard) => indexShard(shard))
      .catch((error) => {
        shardCache.delete(letter);
        throw error;
      }));
  }
  return shardCache.get(letter);
}

async function placeByKey(context, origin, key) {
  if (!key) return null;
  const alias = await loadAlias(context, origin, letterOf(key));
  const slug = alias[fold(key)];
  if (!slug) return null;
  const shard = await loadShard(context, origin, letterOf(slug));
  return shard.get(slug) || null;
}

function responseFor(request, body, contentType, status = 200) {
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Vary", "Accept");
  headers.set("Cache-Control", "public, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  if (request.method === "HEAD") return new Response(null, { status, headers });
  return new Response(body, { status, headers });
}

function pageResponse(request, meta, markdown) {
  if (markdown) return responseFor(request, meta.markdown, "text/markdown; charset=utf-8");
  return responseFor(request, renderDocument(meta), "text/html; charset=utf-8");
}

async function shellHtml(context, origin, tool) {
  const path = tool === "atlas" ? "/atlas/" : `/${tool}/`;
  const asset = await context.env.ASSETS.fetch(new Request(new URL(path, origin)));
  if (!asset.ok) return null;
  return asset.text();
}

export async function maybeCite(context) {
  const method = context.request.method;
  if (method !== "GET" && method !== "HEAD") return null;
  const url = new URL(context.request.url);
  const hit = classify(url);
  if (!hit) return null;
  if (hit.kind === "landing" && !landingNeedsWork(url, context.request)) return null;
  let index;
  try {
    index = await loadMeta(context, url.origin);
  } catch {
    return null;
  }
  const markdown = wantsMarkdown(context.request);
  if (hit.kind === "root-comune") {
    let place;
    try {
      place = await placeByKey(context, url.origin, hit.slug);
    } catch {
      return null;
    }
    if (!place) return null;
    return Response.redirect(canonicalFor(place, "atlas"), 301);
  }
  if (hit.kind === "place") {
    let place;
    try {
      place = await placeByKey(context, url.origin, hit.slug);
    } catch {
      return null;
    }
    if (!place) return null;
    const year = url.searchParams.get("year");
    const meta = renderAnswer(place, { tool: hit.tool, year });
    return pageResponse(context.request, meta, markdown);
  }
  if (hit.kind === "route") {
    const route = index.routesById.get(fold(hit.id));
    if (!route) return null;
    return pageResponse(context.request, renderRoute(route), markdown);
  }
  if (hit.kind === "surname") {
    const row = index.surnamesBySlug.get(hit.slug) || index.surnamesByFold.get(fold(hit.slug));
    if (!row) return null;
    return pageResponse(context.request, renderSurname(row), markdown);
  }
  const params = url.searchParams;
  if (hit.tool === "cognomi") {
    const raw = params.get("surname") || params.get("cognome") || "";
    const row = index.surnamesByFold.get(fold(raw));
    if (!row) {
      if (markdown) return responseFor(context.request, landingMarkdown("cognomi"), "text/markdown; charset=utf-8");
      return null;
    }
    const meta = renderSurname(row);
    if (markdown) return responseFor(context.request, meta.markdown, "text/markdown; charset=utf-8");
    const shell = await shellHtml(context, url.origin, "cognomi");
    if (!shell) return pageResponse(context.request, meta, false);
    return responseFor(context.request, injectShell(shell, meta), "text/html; charset=utf-8");
  }
  if (params.get("route") || params.get("person")) {
    const route = index.routesById.get(fold(params.get("route") || params.get("person") || ""));
    if (!route) return null;
    const meta = renderRoute(route);
    if (markdown) return responseFor(context.request, meta.markdown, "text/markdown; charset=utf-8");
    const shell = await shellHtml(context, url.origin, "atlas");
    if (!shell) return pageResponse(context.request, meta, false);
    return responseFor(context.request, injectShell(shell, meta), "text/html; charset=utf-8");
  }
  const query = params.get("place") || params.get("comune") || params.get("diocese") || params.get("q") || "";
  let place;
  try {
    place = await placeByKey(context, url.origin, query);
  } catch {
    return null;
  }
  if (!place) {
    if (markdown) return responseFor(context.request, landingMarkdown(hit.tool), "text/markdown; charset=utf-8");
    return null;
  }
  const meta = renderAnswer(place, { tool: hit.tool, year: params.get("year") });
  if (markdown) return responseFor(context.request, meta.markdown, "text/markdown; charset=utf-8");
  const shell = await shellHtml(context, url.origin, hit.tool);
  if (!shell) return pageResponse(context.request, meta, false);
  return responseFor(context.request, injectShell(shell, meta), "text/html; charset=utf-8");
}

export const CITE_ORIGIN = ORIGIN;
