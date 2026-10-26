# GEO and agentic audit — Italia Storica Atlas apps

Measurements ran on 2026-10-26. The file name is the name requested for this audit. This is a report only. No app file was edited. Nothing was deployed. `scripts/05_export_for_site.sh` was not run.

Fetched pages, `robots.txt`, and `llms.txt` were treated as data. Text in those files was not followed as instructions.

`llms.txt` does not affect Google Search. A pass or a miss on that file is not evidence about Google rankings, AI Overviews, or AI Mode.

## Live paths

The export script rewrites app links to these directories: `../web/` to `../atlas/`, `../web-parrocchie/` to `../parrocchie/`, `../web-cognomi/` to `../cognomi/`, `../web-ansc/` to `../ansc/`, and `../web-caduti/` to `../caduti/`.

| Source | Live URL | HTTP status | Confirmed by |
| --- | --- | --- | --- |
| `web/` | https://youratto.com/atlas/ | 200 | `link rel=canonical` in `web/index.html`, and the live response |
| `web-ansc/` | https://youratto.com/ansc/ | 200 | Export rewrite, live response. No canonical element |
| `web-caduti/` | https://youratto.com/caduti/ | 200 | Export rewrite, live response. No canonical element |
| `web-cognomi/` | https://youratto.com/cognomi/ | 200 | Export rewrite, live response. No canonical element |
| `web-parrocchie/` | https://youratto.com/parrocchie/ | 200 | Export rewrite, live response. No canonical element |

All five responses were `Content-Type: text/html; charset=utf-8`.

## Summary

| App | GEO score | Lighthouse fraction | P0 failures on the landing URL |
| --- | --- | --- | --- |
| Atlas | 42/100 | 3/3 | 1 |
| ANSC | 45/100 | 3/3 | 1 |
| Caduti | 38/100 | 3/3 | 1 |
| Cognomi | 32/100 | 3/3 | 1 |
| Parrocchie | 35/100 | 3/3 | 1 |

The limit that blocks an agent today is the place answer. The HTML shell is real, but the province, the archive, the PEC, the diocese, and the surname note are written by JavaScript after load. A crawler that does not run JavaScript cannot quote them.

The atlas chronicle URL `https://youratto.com/atlas/?route=dante-exile` also failed the CLS limit of 0.1. That URL is not the landing URL in the table. The measured total was 0.188. See Findings.

The Claude SEO HTTP check (`agentic_check.py`) marked the shell as server-rendered for four apps and warned on Cognomi. That check counts words in the raw HTML. It does not check the place answer. Both results are reported below.

## Lighthouse

Command, with JSON output added so the fraction could be read exactly:

`npx --yes lighthouse@latest <url> --only-categories=agentic-browsing --no-enable-error-reporting --quiet --chrome-flags="--headless=new" --output=json --output-path=...`

Lighthouse 13.5.0. Host browser `HeadlessChrome/156.0.0.0`. The run used the CLI default mobile emulation (`moto g power (2022)`). axe-core 4.14.0. No run warnings. Desktop was not run.

The fraction is the count of passing counted audits over N. N/A audits are not in N. The category `score` field is a weighted mean. It is not the fraction. This run's mean was 1. The fraction is still 3/3.

| App | Fraction | Fetch time (UTC) |
| --- | --- | --- |
| Atlas | 3/3 | 2026-10-26T13:22:51.511Z |
| ANSC | 3/3 | 2026-10-26T13:23:05.324Z |
| Caduti | 3/3 | 2026-10-26T13:23:17.475Z |
| Cognomi | 3/3 | 2026-10-26T13:23:30.007Z |
| Parrocchie | 3/3 | 2026-10-26T13:23:42.500Z |

Counted audits, all five apps, all passed (score at least 0.9):

| Audit | Mode | Result |
| --- | --- | --- |
| `agent-accessibility-tree` | binary | pass, score 1, "All audits passed", 0 failing items |
| `cumulative-layout-shift` | numeric | pass, score 1, numeric value 0 |
| `llms-txt` | binary | pass, score 1 |

N/A, dropped out of N, all five apps:

| Audit | Mode in this run |
| --- | --- |
| `webmcp-form-coverage` | notApplicable |
| `webmcp-registered-tools` | notApplicable |
| `webmcp-schema-validity` | notApplicable |
| `ard-schema` | notApplicable |

Informative audits in this run: none. A higher N is not a better site. WebMCP and `ai-catalog.json` were absent, so those audits dropped out.

Lighthouse CLS was 0 on the five landing URLs. A separate PerformanceObserver run, required by this audit, recorded a small shift on the atlas landing page. Both numbers are in the per-app section. The observer total is the one compared with 0.1.

## Per-app findings

### Host files (shared)

`https://youratto.com/robots.txt` returned 200, `text/plain; charset=utf-8`, 66 bytes. Body:

```
User-agent: *
Allow: /

Sitemap: https://youratto.com/sitemap.xml
```

There is one group. No named crawler group. No `Disallow`. No `Content-Signal`. No `Agentmap`.

RFC 9309 selects the named group when one exists. None of these tokens has a named group, so each one uses `User-agent: *` and `Allow: /`. The file allows the path. That is not a statement about ranking.

| Claim | Crawler | Group used | Allowed by this file |
| --- | --- | --- | --- |
| Citable in ChatGPT Search | OAI-SearchBot | `*` | yes |
| OpenAI model training | GPTBot | `*` | yes |
| Citable in Claude search | Claude-SearchBot | `*` | yes |
| Anthropic model training | ClaudeBot | `*` | yes |
| Perplexity search | PerplexityBot | `*` | yes |
| Google Search, AI Overviews, AI Mode | Googlebot | `*` | yes |
| Gemini training and grounding | Google-Extended | `*` | yes |
| Common Crawl training | CCBot | `*` | yes |

Googlebot was not in the skill's agent list. The same file was applied by hand. `Google-Extended` does not govern Google Search. GPTBot does not govern ChatGPT Search. ClaudeBot does not govern Claude search.

`https://youratto.com/llms.txt` returned 200, `text/plain; charset=utf-8`, 1693 bytes. It has an H1 (`# Atto`), a short description, and Markdown links, including the five tool URLs. `llms-full.txt` was not present (skill probe 404). Lighthouse `llms-txt` passed. The file describes the Atto desktop app. It does not use the name "Italia Storica Atlas". The atlas link text is "Atlas".

`https://youratto.com/ai-catalog.json` returned 404, `text/html`, 4541 bytes. Title: "Page not found — Atto". `meta name=robots` is `noindex`. Canonical is `https://youratto.com/404.html`.

`https://youratto.com/.well-known/ai-catalog.json` returned the same 404 page.

`https://youratto.com/.well-known/agent-card.json` returned the same 404 page.

`https://youratto.com/this-path-does-not-exist-geo-audit-20261026` returned 404, not 200. The skill probe `https://youratto.com/claude-seo-404-probe-b6c8f8d2` also returned 404. A catch-all 200 was not observed.

`Accept: text/markdown` on each app URL returned 200 and `Content-Type: text/html; charset=utf-8`. The `Vary` header on that probe was empty. No `rel=alternate` of type `text/markdown`. The skill also recorded `https://youratto.com/atlas.md` as 404. The skill marked `vary_accept` true because the document `Vary` value it saw was `accept-encoding`. That header is for compression. It is not `Vary: Accept`.

Sitemap `https://youratto.com/sitemap.xml` returned 200, `application/xml`, 4279 bytes, 25 URLs. The five tools appear once each, with no query string. No per-comune URL is in the sitemap.

### Atlas — https://youratto.com/atlas/

| Check | Result |
| --- | --- |
| Raw size | 9813 bytes, 200, `text/html` |
| Raw word count | 242 words in `body`, after removal of `head`, `script`, `style`, and `svg` |
| Rendered word count | 263 words on the landing URL. 650 words on `?year=1884&place=Castrogiovanni`. 805 words on `?route=dante-exile` |
| Title | `Atto Historical Atlas (1563–2026)` |
| Meta description | Present. It describes a town lookup from 1563 to 2026 |
| Canonical | `https://youratto.com/atlas/` |
| `og:type` | `website` |
| JSON-LD | One block, parsed. Types: `WebApplication`, `Offer`, `Organization`, `Dataset` |
| Headings | `h1` Atto Historical Atlas (1563–2026). No `h2`. No `h3` |
| `time`, byline, publication date | None. The years 1563 and 2026 are the coverage range |
| CLS, observer, 1280×900 | Landing 0.048 (1 shift). Place URL 0.023. Route URL 0.188 |
| Images with no `alt` attribute | 0. The page has no `img` elements |
| Interactive elements with no accessible name | 0 in the accessibility tree (36 roles on the landing URL, 48 on the place URL) |

The raw place URL is the same 9813-byte document as the landing URL. It does not contain `Caltanissetta`, `086009`, or `Piazza Coppola`. The string `Castrogiovanni` is only the search placeholder. After JavaScript, the same URL shows the card: modern name Enna, 1 July 1884, ISTAT 086009, catasto C342, sovereign Regno d'Italia, and the address Piazza Coppola. `document.title` becomes `Castrogiovanni (Enna) in 1884 — Stato Civile & Archive Lookup | Atto Historical Atlas`. The `h1` stays the generic atlas title. The canonical stays `https://youratto.com/atlas/`.

`https://youratto.com/atlas/castrogiovanni/`, `https://youratto.com/atlas/enna/`, and `https://youratto.com/comune/castrogiovanni/` each returned 404.

The rendered route URL contains Firenze, chronicle year 1302, and Ravenna. Those strings are absent from the raw HTML. `Dante` appears in the rendered landing page and is absent from the raw HTML. The chronicle list is filled by script.

`noscript` says the atlas needs JavaScript.

### ANSC — https://youratto.com/ansc/

| Check | Result |
| --- | --- |
| Raw size | 6608 bytes, 200, `text/html` |
| Raw word count | 247 |
| Rendered word count | 261 on the landing URL. 501 on `?comune=Enna` |
| Title in raw HTML | `ANSC & PEC Tracker \| Atto` |
| Title after script on `?comune=Enna` | `Enna PEC \| Atto` |
| Meta description | Present. It cites 7,900+ comuni, PEC, ANPR, and DPR 396/2000 |
| Canonical | Absent |
| `og:type` | Absent |
| JSON-LD | None |
| Headings | `h1` ANSC & PEC Tracker. `h2` Request checklist, Art. 106–108 DPR 396/2000. `h2` Quick Italian Request Subject & Line Generator |
| `time`, byline, publication date | None. "2000" in the statute number is not a publication date |
| CLS, observer | Landing 0. Route-style place URL 0.090 |
| Images with no `alt` | 0. No `img` elements |
| Unnamed interactive elements | 0 (24 roles on the landing URL, 64 after Enna loaded) |

The raw HTML does not contain `protocollo@pec.comune.enna.it` or `Piazza Coppola`. After script, the Enna panel shows that PEC and the address Piazza Coppola, 2, 94100 Enna (EN).

### Caduti — https://youratto.com/caduti/

| Check | Result |
| --- | --- |
| Raw size | 5329 bytes, 200, `text/html` |
| Raw word count | 159 |
| Rendered word count | 222 on the landing URL. 297 on `?place=Udine&year=1842` |
| Title in raw HTML | `Caduti & Liste di Leva \| Atto` |
| Title after script | `Udine liste di leva 1842 \| Atto` |
| Meta description | Present. It names Classe di Leva, Distretti Militari, and Fogli Matricolari |
| Canonical | Absent |
| `og:type` | Absent |
| JSON-LD | None |
| Headings | `h1` Caduti & Liste di Leva. `h2` Liste di Leva. `h2` Surname basin. `h2` Regiment guide |
| `time`, byline, publication date | None |
| CLS, observer | Landing 0. Place URL 0.025 |
| Images with no `alt` | 0 |
| Unnamed interactive elements | 0 (22 roles landing, 24 after the query) |

After script, the page shows `Distretto Militare di Udine — Classe di Leva 1842 (Call-up year 1862)`. That sentence is not in the raw HTML.

### Cognomi — https://youratto.com/cognomi/

| Check | Result |
| --- | --- |
| Raw size | 4647 bytes, 200, `text/html` |
| Raw word count | 121 |
| Rendered word count | 121 on the landing URL. 159 on `?surname=Esposito` |
| Title in raw HTML | `Cognomi Heatmap \| Atto` |
| Title after script | `Esposito Surname Origin, Map & Italian Civil Records \| Atto` |
| Meta description | Present. It names etymology, toponyms, foundling hospitals, and ports |
| Canonical | Absent |
| `og:type` | Absent |
| JSON-LD | None |
| Headings | `h1` Cognomi Heatmap only |
| `time`, byline, publication date | None |
| CLS, observer | 0 on the landing URL and on the Esposito URL |
| Images with no `alt` | 0 |
| Unnamed interactive elements | 0 (18 roles) |

The skill SSR check warned here: 125 words, no JavaScript-shell marker. The other apps passed that word check. After script, Esposito is described as a foundling name of the Real Casa dell'Annunziata in Napoli, region Campania. That sentence is not in the raw HTML.

### Parrocchie — https://youratto.com/parrocchie/

| Check | Result |
| --- | --- |
| Raw size | 4971 bytes, 200, `text/html` |
| Raw word count | 165 |
| Rendered word count | 165 on the landing URL. 1361 on `?comune=Enna&year=1884` |
| Title in raw HTML | `Parrocchie & Dioceses \| Atto` |
| Title after script | `Enna parishes in 1884 \| Atto` |
| Meta description | Present. It names the diocese, the cathedral, and pre-1866 parish records |
| Canonical | Absent |
| `og:type` | Absent |
| JSON-LD | None |
| Headings | `h1` Parrocchie & Dioceses only |
| `time`, byline, publication date | None |
| CLS, observer | Landing 0. Enna URL 0.044 |
| Images with no `alt` | 0 |
| Unnamed interactive elements | 0 (20 roles on the landing URL) |

A first render used `?place=Enna`. That parameter is ignored. The app reads `comune` and `diocese`. The corrected URL rendered the answer: historical name Castrogiovanni, diocese Piazza Armerina, Archivio Storico Diocesano di Piazza Armerina. Those facts are not in the raw HTML.

The string "Italia Storica" was absent from the raw HTML and from the rendered text of every URL in this audit.

## What the query URLs mean for this app

### Crawlable content

The shell is in the HTML. The lookup answer is not.

Evidence: the atlas query URL and the atlas landing URL have the same raw size, 9813 bytes, and the same canonical. The raw body lacks `Caltanissetta` and `086009`. Chrome, after load, shows both strings and raises the word count from 263 to 650. The same split holds on ANSC, Caduti, Cognomi, and Parrocchie. Default landing pages do not show a large word gap, because they do not select a place. The gap appears on the query URL, and only after script.

An AI crawler that does not run JavaScript sees the instructions, the title, and the empty card. It does not see which province Castrogiovanni was in during 1884.

### Parameter URLs

`?year=` and `?place=` do not need to be indexed as an open set. Each pair is a view of one dataset, and the set of pairs is large. They do need a stable, crawlable document when a person or an agent is meant to cite one town in one year.

The atlas marks every query URL with the canonical `https://youratto.com/atlas/`. That base URL does not contain the place answer. The rendered `document.title` does contain it. The `h1` does not. The other four apps set `document.title` from script and emit no canonical at all.

Duplicate-content risk: every query URL is the same HTML file. A crawler that indexes the query string indexes many URLs with one shell. A crawler that obeys the atlas canonical indexes only the shell, and drops the answer. This report does not guess how Google will choose. It records that the answer and the canonical point at different documents.

`https://youratto.com/sitemap.xml` lists the five tools and does not list query URLs.

### One page per place

No stable path per comune was found.

| URL | Status |
| --- | --- |
| `https://youratto.com/atlas/castrogiovanni/` | 404 |
| `https://youratto.com/atlas/enna/` | 404 |
| `https://youratto.com/comune/castrogiovanni/` | 404 |
| `https://youratto.com/atlas/?year=1884&place=Castrogiovanni` | 200, same raw HTML as `/atlas/` |

The answer for "which province was Castrogiovanni in, in 1884" exists only after script, behind the query string.

### Entity naming

The live pages connect the tools to Atto and to youratto.com. They do not use the name "Italia Storica Atlas".

Evidence: the atlas `h1` is "Atto Historical Atlas (1563–2026)". The badge says "Open-Source Historical Atlas by Atto". JSON-LD `provider` and `creator` are `Organization` with name `Atto` and URL `https://youratto.com`. The header brand links to `https://youratto.com`. A text search of the raw and rendered pages did not find "Italia Storica".

A search engine can connect these URLs to Atto. It cannot connect them to the name "Italia Storica Atlas" from the page text, because that name is not on the page.

## Findings by priority

### P0 — The lookup answer is not in the raw HTML

Evidence: raw atlas query body lacks `Caltanissetta`, `086009`, and `Piazza Coppola`. Rendered body contains them. ANSC raw body lacks the Enna PEC. Rendered body contains `protocollo@pec.comune.enna.it`. Caduti, Cognomi, and Parrocchie show the same split. The atlas `noscript` element says JavaScript is required.

Effect: a crawler that does not run JavaScript cannot quote the province, the archive, the PEC, the diocese, or the surname note. The skill word check still passes four apps, because the shell has 159 to 247 words.

Fix: write the resolved card into the HTML for each URL that should be cited. Keep the script for the map. The first screen of that HTML should state the answer in one or two sentences.

### P0 — CLS on the Dante route URL is over 0.1

Evidence: PerformanceObserver installed before navigation, `hadRecentInput` ignored, viewport 1280×900, system Chrome. `https://youratto.com/atlas/?route=dante-exile` total 0.188 from 1 shift. The five landing URLs were at or under 0.1 (atlas 0.048, the other four 0). Lighthouse mobile CLS on the five landing URLs was 0.

Effect: an agent that opens a shared chronicle link can hit a layout shift above the 0.1 limit. The landing page itself met the limit in this run.

Fix: reserve space for the route bar and the card before the chronicle data arrives. Re-measure the route URL with the same observer. The total must be at or under 0.1.

### P0 — Interactive names — pass

Evidence: after render, the accessibility tree had 0 unnamed roles in `button`, `link`, `textbox`, `searchbox`, `combobox`, `slider`, `checkbox`, `radio`, `switch`, and `tab`. The DOM check of links, buttons, inputs, and named roles also found 0. Lighthouse `agent-accessibility-tree` passed with 0 failing items. This includes the place and surname URLs that were rendered.

No fix on this item.

### P0 — Images — pass

Evidence: 0 `img` elements in the raw HTML and in the rendered DOM. Missing `alt` count is 0. The atlas map is an `svg` with `role="img"` and `aria-label="Map of Italian provinces colored by historical regime"` in the source. No empty-`alt` image was found, so the decorative-logo case did not arise.

No fix on this item.

### P0 — robots.txt — reachable

Evidence: 200, 66 bytes, one `User-agent: *` group, `Allow: /`, sitemap declared. The eight crawlers in the table above are allowed. The policy is explicit. It is not split by purpose. `Content-Signal` is absent. Absence of `Content-Signal` is not a Google Search defect. Google has said it does not act on that line.

Fix, only if training and search should differ: add a named group per crawler. Do not block `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot`, or `Googlebot` if those search surfaces should cite the pages. Leave training tokens as a separate choice. This audit does not choose the training policy.

### P1 — llms.txt — present and valid for the Lighthouse rule

Evidence: 200, 1693 bytes, H1, Markdown links, Lighthouse `llms-txt` pass. It does not affect Google Search.

Fix: optional. If the file should describe this atlas, name the atlas and say that a place answer is not in the static HTML until that changes. Keep Markdown links. A list of bare URLs would fail the Lighthouse rule.

### P1 — Markdown negotiation — not present

Evidence: `Accept: text/markdown` returned `text/html` and an empty `Vary`. `atlas.md` returned 404. No Markdown alternate link.

Effect: an agent that asks for Markdown receives the HTML shell.

Fix: serve a Markdown twin of each citable page with `Vary: Accept`. Do not treat this as a Google Search change.

### P1 — Unknown URLs — pass

Evidence: two unknown paths and three invented place paths returned 404, with `noindex` and a canonical to `/404.html`. Not a 200.

No fix on this item.

### P2 — WebMCP, ai-catalog, well-known

Evidence: Lighthouse marked the three WebMCP audits and `ard-schema` notApplicable. The skill scan found one form, `search-form`, with no `toolname` or `tooldescription`, and zero `registerTool` calls. `ai-catalog.json`, `/.well-known/ai-catalog.json`, and `/.well-known/agent-card.json` returned 404. The sitemap lists `https://youratto.com/mcp/`. That page was not fetched.

Effect: none on the Lighthouse fraction while these audits stay N/A. Add a catalog or a tool only when the resource is real.

### P3 — Agent card and commerce profile

Evidence: `/.well-known/agent-card.json` and the skill probe of `/.well-known/ucp` returned 404. These apps are not a checkout and not an agent endpoint.

No fix until such an endpoint exists.

## GEO sub-scores

The technical row uses this split of 20 points: 8 for the lookup answer in raw HTML, 4 for an open `robots.txt`, 3 for a valid `llms.txt`, 3 for real 404s, 2 for Markdown negotiation. The lookup answer scores 2 of 8, because the shell is present and the answer is not. Host checks are the same for every app. Technical total: 12/20 for each app.

`llms.txt` is inside this technical score because this audit's rubric lists it. It still has no Google Search effect.

| Criterion | Weight | Atlas | ANSC | Caduti | Cognomi | Parrocchie | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Citability | 25 | 9 | 12 | 8 | 6 | 8 | The first 60 words are the tool navigation, then a definition. ANSC also states "7,900+" and DPR 396/2000 in an `h2`. No page states the looked-up fact in the raw HTML. |
| Structural readability | 20 | 8 | 11 | 10 | 6 | 7 | One `h1` each. ANSC has 2 `h2`. Caduti has 3 `h2`. No `h3`. No question headings. No `table`. Atlas has 2 lists. Cognomi has 1. |
| Multi-modal content | 15 | 7 | 5 | 5 | 5 | 5 | No `img` and no video element. The atlas `svg` has an accessible name in the HTML. After script, each app drew 110 province paths. The demo is a link, not an embed. |
| Authority and brand | 20 | 6 | 5 | 3 | 3 | 3 | No author, no `time`, no visible updated date. Atlas JSON-LD names Atto. ANSC names IndicePA and DPR 396/2000 in the shell. Searches on 2026-10-26 did not find a Wikipedia article, a Reddit thread, a YouTube video, or a LinkedIn page for this product. |
| Technical accessibility | 20 | 12 | 12 | 12 | 12 | 12 | Shell is in the HTML. The answer is not. `robots.txt` allows the eight crawlers. `llms.txt` passes Lighthouse. Unknown URLs return 404. Markdown negotiation does not. |
| Total | 100 | 42 | 45 | 38 | 32 | 35 | |

Brand searches that were run: web search for "Italia Storica Atlas", "Atto Historical Atlas", "youratto.com", and the same names with `site:en.wikipedia.org`, `site:reddit.com`, `site:youtube.com`, and `site:linkedin.com`. English Wikipedia opensearch for `youratto`, `youratto.com`, `Italia Storica Atlas`, and `Atto Historical Atlas` returned no matching article. The hits were other historical atlases, ATTO Technology, and a game called YATTO. These searches do not prove that no mention exists.

Platform citation scores for Google AI Overviews, ChatGPT, and Perplexity were not measured. No DataForSEO or SE Ranking pull was run.

## Top 5 changes

Ordered by the effect on an agent that must cite a town.

1. Put the resolved answer in the HTML of any URL that should be cited. Evidence: the Castrogiovanni raw document lacks `Caltanissetta` and `086009`, and the rendered document has them. The same split is on the other four apps.
2. Give that URL its own canonical, `title`, description, and `h1` that state the place and the year. Evidence: the rendered Castrogiovanni title changes, the `h1` does not, and the canonical stays `https://youratto.com/atlas/`. The other four apps change `document.title` in script and have no canonical.
3. Publish one stable path per comune, or a small set of year snapshots, and list those paths in the sitemap. Evidence: `/atlas/castrogiovanni/` returns 404, and the sitemap has 25 URLs and no place URL.
4. Use one product name on the page, and state that youratto.com publishes it. Evidence: the pages say "Atto Historical Atlas" and "Open-Source Historical Atlas by Atto". They never say "Italia Storica Atlas".
5. Reserve space for the chronicle route bar so CLS stays at or under 0.1. Evidence: `?route=dante-exile` measured 0.188 with the observer. The landing URLs met the limit.

## What was not tested

| Check | Status | Why |
| --- | --- | --- |
| Raw HTML, headings, JSON-LD, canonical, word counts | Measured | urllib, no script |
| Rendered DOM, titles, answer strings | Measured | system Chrome, Playwright driver |
| CLS with PerformanceObserver before navigation | Measured | 1280×900. Lighthouse mobile CLS was also recorded and was 0 |
| Accessible names and missing `alt` | Measured | accessibility tree plus DOM. Lighthouse tree audit passed |
| `robots.txt`, `llms.txt`, catalogs, 404, Markdown `Accept` | Measured | |
| Lighthouse agentic-browsing, mobile, five landing URLs | Measured | Lighthouse 13.5.0 |
| Lighthouse desktop | Not measured | The requested command uses the CLI default, which emulated a phone |
| PageSpeed Insights, both strategies | Not measured | Local Lighthouse was used instead |
| `agent_ux_check.py` | Failed | Playwright's bundled Chromium binary is missing. It was not installed. The tree counts above replace that score. No 0–100 agent-UX score is reported |
| WAF and user-agent matrix | Not measured | The audit did not send agent user-agent tokens |
| Live citation in ChatGPT, Perplexity, or AI Overviews | Not measured | No citation API was called |
| RSL 1.0 | Not measured | |
| `https://youratto.com/mcp/` | Not measured | It is in the sitemap. It is not one of the five apps |
| Parrocchie `?place=` | Measured, then discarded as the wrong parameter | The app reads `comune`. The `?comune=Enna&year=1884` run is the one in the scores |

## Check ledger

| Check | Status |
| --- | --- |
| Five live URLs resolve | Measured. All 200 |
| Raw versus rendered text | Measured. Answer text is rendered only |
| Schema parse | Measured. Atlas parses. Four apps have no JSON-LD |
| Crawler lines, kept separate | Measured |
| `llms.txt` | Measured. Present. Lighthouse pass. No Google Search effect |
| Real 404 | Measured. Pass |
| Markdown delivery | Measured. Absent |
| CLS limit on landing URLs | Measured. Pass |
| CLS on the Dante route | Measured. Fail, 0.188 |
| Accessible names | Measured. Pass |
| Images without `alt` | Measured. Pass, zero `img` |
| Lighthouse fraction | Measured. 3/3 each |
| GEO scores | Scored from the measurements in this file |
