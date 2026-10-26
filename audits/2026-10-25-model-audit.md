# Model audit — comuni-atlas, 2026-10-25

Read-only audit. No source file was modified. Working notes and raw lane output are in `.audit/`.

## Spend ledger

| Lane | Model | In | Out | Cost | Notes |
|---|---|---|---|---|---|
| OpenRouter paid | anthropic/claude-sonnet-4.5 | 91,329 | 4,383 | **$0.3363** | cap $0.45; balance was $3.54 before the call |
| OpenRouter free 1 | google/gemma-4-31b-it:free | 29,393 (rejected) | — | $0 | HTTP 429, upstream rate limit |
| OpenRouter free 2 | nvidia/nemotron-3-super-120b-a12b:free | 29,393 (rejected) | — | $0 | HTTP 404 from the NVIDIA provider |
| OpenCode Zen 1 | — | — | — | $0 | `opencode models` failed: managed service port 49374 already in use |
| OpenCode Zen 2 | — | — | — | $0 | lane not started |
| Grok CLI | grok-4.6 | — | — | subscription | plan mode, `--no-subagents`; exited 0 with no findings (headless plan mode refused every Bash call) |
| Jev (TypeSafe) | jev-router | 2,046 | 308 | fraction of a cent (usage not priced in the response) | 7 claims, 6 verified / 1 unsupported |

**Total cash spend: $0.3363** of the $0.75 cap. The paid lane stopped at $0.70 as instructed; no follow-up call was needed.

Lanes that produced findings: my own local lane and the OpenRouter paid lane. Grok and Jev ran but added no new verified defect (see "Where the lanes disagreed"). Both free lanes were unavailable.

## Top findings

### 1. P0 — Every Lombard town gets the Veneto migration note, which contradicts its own timeline
`lib/engine.mjs:210` (`citizenshipNotes`, branch `polity.id === "lombardo-veneto"`)

Repro:
```bash
node cli/resolve.mjs --year 1852 --place Milano
```
Observed `citizenshipNotes[0]`:
> In 1852 this town was in the Austrian Regno Lombardo-Veneto. It joined the Kingdom of Italy in October 1866. Stato Civile Italiano here starts on 1 September 1871.

The same JSON payload contradicts it: `timeline` has `1859 Kingdom of Sardinia`, `1861 Kingdom of Italy`, and `1866 … Italian civil registration`. Milan and Lombardy left Austria in 1859 and entered the Italian civil-registration system with the national start (1866), not on 1 September 1871. The 1866/1871 text is only true for Veneto, Friuli, and Mantua (README.md:131 scopes it that way; the code does not).

Fix: split the note. Keep the October 1866 / 1 September 1871 sentence only for the Veneto provinces (Venezia, Verona, Vicenza, Padova, Rovigo, Belluno, Udine, Mantova), and give Lombardy its own 1859/1866 text, or derive both years from the place's timeline.

### 2. P1 — A year outside 1796–2026 is silently rewritten, and the intended warning never fires in the CLI
`cli/resolve.mjs:217` → `lib/engine.mjs:29` (`parseYearList` clamp) vs `lib/engine.mjs:259` (`stampYears`)

Repro:
```bash
node cli/resolve.mjs --year 2027 --place Udine
```
Observed: `query.year = 2026`, `modelYear = 2026`, no `rangeNote`, exit 0.
The same call through the engine keeps the request:
```bash
node --input-type=module -e "import {createAtlas} from './lib/engine.mjs'; … atlas.resolvePlace('Udine', 2027)"
```
returns `query.year: 2027` and `rangeNote: "This chronicle year is outside 1796–2026 …"`.
`parseYearList` clamps before `resolvePlace` runs, so `pair.requested === pair.safeYear` and the guard in `stampYears` is dead on this path. An agent asking for 2027 is told a 2026 answer with no notice. `--year 1795` behaves the same.

Fix: keep the raw year in `query.year` and let `stampYears` add the note, or emit the note in the CLI when `rawYears(args.year)` differs from the clamped stop year.

### 3. P1 — A curated route silently replaces the years the caller asked for
`lib/engine.mjs:605` (`stopsFromQuery` → `matchRoute`), CLI call at `cli/resolve.mjs:217`

Repro:
```bash
node cli/resolve.mjs --year "1884,1799,1902" --place "Lercara Friddi,Palermo,New York"
```
Observed stop years: `1878, 1902, 1902`. The three requested years are discarded because the place list matches `lercara-new-york`.
Reported independently by the OpenRouter paid lane (same repro). The usage text (`cli/resolve.mjs:79`) mentions "curated stops" but not that `--year` is ignored.

Fix: when the place list matches a route, either keep the caller's years for the stops that have them, or print a `note` field such as `"routeYears": true` so an agent can see the substitution.

### 4. P2 — `--tool caduti` is advertised and returns no caduti data
`cli/resolve.mjs:78` (usage) and `cli/resolve.mjs:240-246` (only `ansc` is handled)

Repro:
```bash
node cli/resolve.mjs --tool caduti --year 1878 --place Isernia
```
Observed: no key containing "cadut" in the payload; only `tool: "caduti"` is added. `cadutiDb` is loaded at `cli/resolve.mjs:210` and used only in an existence check (`:212`). The data file exists (`data/built/caduti-leva-db.json`, keys `source`, `alboNote`, `ageModel`, `regiments`), so the flag could attach it.

Fix: either attach the caduti finding aid for `--tool caduti`, or remove `caduti` from the usage line and `TOOLS`.

### 5. P2 — README exit-code table does not match the empty-surname path
`README.md:37` vs `cli/resolve.mjs:184-188`

Repro:
```bash
node cli/resolve.mjs --surname ""
```
Observed: exit 2, stderr `Surname is empty.` README.md says exit 2 means "no match" and exit 1 means "incomplete". `skills/comuni-atlas/SKILL.md:23` already states the correct rule ("Exit 2 means a stop did not match, or the surname string is empty"); the README does not.

Fix: copy the SKILL.md sentence into README.md:37.

### 6. P2 — README places modern Enna in the Province of Caltanissetta
`README.md:13`

Text: "Castrogiovanni in 1884 is modern Enna, in the Province of Caltanissetta."
The resolver returns `modernProvince { name: "Enna", code: "086" }`; Caltanissetta is the *historical* province for 1884. As written, the sentence states a wrong modern fact.

Fix: "Castrogiovanni in 1884 is modern Enna; in 1884 it was in the Province of Caltanissetta."

### 7. P2 — Palermo on 1 July 1860 is reported as Bourbon
`lib/engine.mjs` province rules (data-driven), surfaced by `resolvePlace`

Repro:
```bash
node cli/resolve.mjs --year 1860 --place Palermo
```
Observed: `sovereign.id = "due-sicilie"`, `records.id = "borbonico"`.
Garibaldi took Palermo on 30 May 1860; on 1 July 1860 the city was under his dictatorship, not the Bourbon kingdom. The README states that "The regime rules use the historical province code" (README.md:129), so this is a known model limit — but the card states it as fact for the exact date.

Fix: either add a 1860-05→1861-03 span for Sicilia (dictatorship, parish/borbonico registers), or add a note on the 1860 Sicilian results.

### 8. P2 — `?route=` with an unknown name does nothing and says nothing
`web/js/app.js:796` (`if (!specs.length) return show(options.place || "", …)`)

Repro: open `http://127.0.0.1:8137/web/?route=does-not-exist`.
Observed: page stays empty, URL keeps `?route=does-not-exist`, no message, no fallback year banner change. The user cannot tell a typo from a slow load.

Fix: on an unknown route id, clear the parameter (`writeQuery`) and show a note in the banner, or fall back to the first chronicle title list.

### 9. P3 — The public card repeats the "1 July" date but the year stamp can disagree in a chronicle
`web/js/app.js` (`paintYear` label / `renderCard`)

Not a defect I could reproduce as wrong data; listed for completeness: in a chronicle the stamp shows `Chronicle 1858` while the slider shows the clamped model year. Behaviour is honest (the banner says "Map 1 July 1796" for Dante) but the card's "Date" line shows the model year.

### 10. Verified as NOT vulnerable — do not spend time here
- The `?place=<img …>` payload does not execute: the card escapes with `esc()`, `document.title` is text, and `#atlas-inspect-json` is a `type="application/json"` block written with `textContent`.
- `window.ATLAS_BASE_PATH="./"` works under `/atlas/` and `/dist/atlas/`.
- All five curated routes resolve every stop (`unmatched: none`), including the Quarto dei Mille landmark.

## Full list by severity

**P0**
1. Lombard/Venetian citizenship note (`lib/engine.mjs:210`) — see finding 1.

**P1**
2. Silent year clamp drops `rangeNote` (`cli/resolve.mjs:217`, `lib/engine.mjs:29`, `:259`).
3. Route matching discards explicit `--year` values (`lib/engine.mjs:605`).

**P2**
4. `--tool caduti` no-op (`cli/resolve.mjs:78`, `:240`).
5. README exit-code rule (`README.md:37`).
6. README Caltanissetta wording (`README.md:13`).
7. Palermo 1 July 1860 regime (`lib/engine.mjs` rules data).
8. Unknown `?route=` is silent (`web/js/app.js:796`).

**P3**
9. Chronicle card "Date" shows the model year while the stamp shows the chronicle year (`web/js/app.js`).

## Lane disagreement

- The OpenRouter paid lane reported a "P1 XSS in document.title / `#atlas-inspect-json`". I tested it in Chromium: no dialog, no injected node, `document.title` is plain text and the JSON block is inert. **Dropped as a false positive.**
- The paid lane also reported ~15 doc-drift and style items (build-step wording, "checks" phrasing, Markdown-link nits) that I could not tie to a wrong output. **Dropped** under the Phase 6 rule.
- The paid lane missed the Lombard note defect (finding 1) even though the reproduction was in the ground truth. Its line numbers for `web/js/app.js` are also wrong (it cites line 1041/1182; the file has 1,127 lines pre-fix). Treat its file:line values as unreliable; every kept finding above is reproduced by me.

## Jev verification (TypeSafe)

| Claim | Verdict | Confidence |
|---|---|---|
| Castrogiovanni 1884 = Enna, in Caltanissetta in 1884 | verified | 1.00 |
| Udine 1852 in the Regno Lombardo-Veneto | verified | 0.92 |
| Trento 1910 in Tirolo under Austria-Hungary | verified | 1.00 |
| Call-up year = birth year + 20 (class 1878 → 1898) | verified | 1.00 |
| Sardinia not under the Napoleonic civil register | verified | 1.00 |
| Veneto/Friuli/Mantua Italian civil registration from 1 Sep 1871 | verified | 0.98 |
| "Sicilian civil registration began in 1820 under the Bourbons" | unsupported | 0.34 |

The unsupported claim was my wording, not a repo claim. The atlas says only that Sicily was not under the Napoleonic system (README.md:135), which the model respects (`Palermo 1810 → record: parish`).

## What I could not check

- Anything requiring the live site: every archive `antenatiUrl`, PEC addresses, and BeWeB URLs. README.md:139 already says the archive pages were not all requested.
- Grok: the run exited 0 but produced only plan narration. `--permission-mode plan` refuses Bash in a headless run ("a headless run cannot ask for approval"), so it could not run one fixture. Its file is `.audit/grok.md` (766 bytes). A second Grok run without plan mode would be needed to get findings, and that breaks the read-only rule.
- OpenCode Zen lanes: the CLI could not start its managed service (port 49374 in use). No models were run.
- OpenRouter free lanes: 429 and 404 as recorded above.
- The Python pipeline's network steps (`01`, `02`, `03`, `06`, `07`) were not rerun; only their static code was reviewed.
