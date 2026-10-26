# Italia Storica Atlas

[Live Interactive Atlas on youratto.com/atlas](https://youratto.com/atlas?year=1884&place=Castrogiovanni)

Italia Storica Atlas is a historical atlas of Italian towns from 1563 to 2026. It names the sovereign regime, the historical province, the modern comune, and the State Archive for civil records. The date inside a year is 1 July. 1563 is the year the Council of Trent required parish baptism and marriage books.

The mesh is the modern provincial mesh. Color shows the regime on that ground for the selected year. The lines are modern borders.

## Open the live map

These links open the hosted atlas:

- [Castrogiovanni in 1884](https://youratto.com/atlas?year=1884&place=Castrogiovanni) is modern Enna; in 1884 it was in the Province of Caltanissetta.
- [Udine in 1852](https://youratto.com/atlas?year=1852&place=Udine) is in the Regno Lombardo-Veneto.
- [Trento in 1910](https://youratto.com/atlas?year=1910&place=Trento) is in Tirolo under Austrian rule.
- [Garibaldi's Thousand in 1860](https://youratto.com/atlas?route=garibaldi-mille) runs from Quarto dei Mille through Marsala, Palermo, and Napoli to Teano.
- [Dante's exile](https://youratto.com/atlas?route=dante-exile) runs from Firenze to Ravenna. Those years are before 1563. The map shows 1563.
- [Sicily to New York](https://youratto.com/atlas?route=sicily-to-ny) runs from Castrogiovanni through Palermo and Napoli to Ellis Island.
- [Veneto to Buenos Aires](https://youratto.com/atlas?route=veneto-to-buenos-aires) runs from Udine through Genova to the Hotel de Inmigrantes.
- [A sample migration](https://youratto.com/atlas?year=1878,1902,1902&place=Lercara%20Friddi,Palermo,New%20York) runs from Lercara Friddi through Palermo to New York.

## Run the map on this machine

Serve this repository from its root. Then open the `web` page.

1. Run `python3 -m http.server 8765` in this repository.
2. Open `http://127.0.0.1:8765/web/?year=1884&place=Castrogiovanni`.

The page has no build step and loads no remote map library. Asset URLs are relative. An empty `window.ATLAS_BASE_PATH` reads `data/built/` from the repository root. The site bundle sets that value to `./` so the same page works at `/atlas`.

## Resolve a town

Run this command from the repository root:

`node cli/resolve.mjs --year 1884 --place "Castrogiovanni"`

The command prints JSON on stdout. Usage and errors go to stderr. Exit code 0 means every stop matched. Exit code 2 means a stop did not match, or the surname string is empty. Exit code 1 means the command is incomplete.

Use these checks:

- Castrogiovanni in 1884 is modern Enna; in 1884 it was in the Province of Caltanissetta.
- Udine in 1852 is in the Regno Lombardo-Veneto. Civil registration there starts on 1 September 1871.
- Trento in 1910 is in Tirolo under Austrian rule.

The same command also prints a cadastre guide, a leva finding aid, and the diocese for one matched town.

`node cli/resolve.mjs --cognome Barone`

`node cli/resolve.mjs --leva --year 1878 --place Isernia`

`--surname` is the same flag as `--cognome`. A surname result is a linguistic estimate. `census` is false. It is not a count of families.

## Open the genealogy suite

Four more pages sit next to the atlas. Each page is static HTML. None of them uses a build step.

- Parrocchie and dioceses: `web-parrocchie/`
- Cognomi heatmap: `web-cognomi/`
- ANSC and PEC tracker: `web-ansc/`
- Caduti and liste di leva: `web-caduti/`

Serve the repository root. Then open `/web-parrocchie/`, `/web-cognomi/`, `/web-ansc/`, or `/web-caduti/`.

A PEC from IndicePA is labeled official. A missing row uses the pattern `protocollo@pec.comune.{slug}.{sigla}.it`. Confirm that pattern before you send it. This atlas has no per-comune ANSC onboarding date. ANPR covers the living population. Historical Stato Civile books stay on paper.

The leva block is a finding aid. Call-up year is the birth year plus 20. It is not a service record. Rail lines and Roman consular roads are schematic corridors, not surveyed track. The cadastre badge is a guide. It is not a tile layer and it does not draw parcels.

The atlas year control runs from 1563 to 2026. Presets include 1563 (Council of Trent) and 1741 (Catasto Onciario). You can show Roman consular roads, compare a second year, and copy an archival citation. Some provinces show an archive-loss warning. A Latin town name such as Mediolanum resolves to the modern comune.

Parrocchie names the patron saint of a diocesan seat when one is on file. From 1563 the page lists baptism and marriage books. From 1614 it also lists burial books and the Stato delle Anime.

The cognomi map paints the primary region in crimson and any secondary regions in amber.

The ANSC page can draft an Italian PEC subject and a request under DPR 396/2000. Caduti can show six World War I front sectors next to the home military district.

## Share a view

One town uses this form:

`https://youratto.com/atlas?year=1884&place=Castrogiovanni`

A chronicle uses `route`. The same page also accepts `person` as an alias:

`https://youratto.com/atlas?route=garibaldi-mille`

A comma list still opens that chronicle when the places are Quarto, Marsala, Palermo, and Napoli:

`https://youratto.com/atlas?year=1860,1860,1860,1860&place=Quarto,Marsala,Palermo,Napoli`

In that route, `Quarto` is the landmark Quarto dei Mille in Genova. The comune named Quarto, in the province of Napoli, is a different place.

Press `/` to search. The arrow keys change the year by 1. Shift plus an arrow changes the year by 10. Space plays the years. Esc closes the card.

## Use it from an agent

Read `skills/comuni-atlas/SKILL.md`.

Run the CLI. Do not guess a coordinate, a province, or an archive.

The page sets `window.atlasAPI` after the data loads:

- `resolvePlace(place, year)` returns a result and does not move the map.
- `locate({ place, year })` and `inspect({ place, year })` move the map and open the card.
- `setYear(year)` moves the year control.
- `plotTrajectory({ place, year })` draws a route. `place` and `year` can be comma-separated lists. `route` or `person` plays a chronicle.
- `playRoute(slug)` plays a chronicle such as `garibaldi-mille`.
- `getState()` returns the year, the place, the route, and the view box.
- `exportCitation()` returns a Markdown citation for the open town.
- `exportAttoDossier()` returns the place dossier for the open town. Pass `{ place, year }` to resolve a different town.

The current result is also in the JSON block `#atlas-inspect-json`.

## Copy a place dossier for Atto

The atlas card and the ANSC card can hand the open town to the Atto desktop app.

1. Open a town.
2. Press **Copy Dossier for Atto App**. The button copies a plain text block.
3. In Atto, open **Documents** and use **Paste from website**.
4. Or press **Download .atto.json**. The file name is `{comune-slug}-{year}.atto-place.json`.

The schema name is `atto.place-dossier.v1`. The text block lists the historical name, the modern comune, the ISTAT code, the sovereign in that year, the historical province, the State Archive and its Antenati URL, the comune PEC and the municipio address, and the diocese and its BeWeB URL.

`toAttoDossier(result, extras)` in `lib/suite.mjs` builds the object. Optional extras are `leva`, `catasto_guide`, and `parrocchie`. On the ANSC page, a birth year in the request form sets the dossier year. An empty year uses the latest year in the dataset.

## Build the data files

Compiled files already sit in `data/built`. Rebuild them with the Python scripts. The scripts use the Python standard library only.

1. Run `python3 scripts/01_fetch_istat.py` to download the open data.
2. Run `python3 scripts/02_fetch_geojson.py` to simplify the province mesh.
3. Run `python3 scripts/06_fetch_ipa_pec.py` to download municipal PEC rows.
4. Run `python3 scripts/07_fetch_dioceses.py` to refresh the diocese cache. The province table works with no network.
5. Run `python3 scripts/04_build_bundle.py` to compile the atlas and the suite files.
6. Run `bash scripts/05_export_for_site.sh` to write `dist/atlas/`, `dist/parrocchie/`, `dist/cognomi/`, `dist/ansc/`, `dist/caduti/`, and `dist/index.html`.
7. Optional. Put `FIRECRAWL_API_KEY` in `.env`. Then run `python3 scripts/03_firecrawl_antenati.py`.

The atlas runs with no API key. `data/built/archives.json` already lists the State Archives. Store a Firecrawl key only in `.env`. That file is gitignored.

## Host the map

1. Run `bash scripts/05_export_for_site.sh`.
2. Copy `dist/atlas/` into the site as `public/atlas/` or as a root `atlas/` folder.
3. Open `/atlas/?year=1884&place=Castrogiovanni`.

`youratto.com` serves this bundle from `apps/site/atlas/`. The public URL is [https://youratto.com/atlas](https://youratto.com/atlas).

## Limits

ANPR often dates an old city from a later decree. A living comune whose first ANPR date is on or before 31 December 1922 is extended to 1563. Torino, Roma, Genova, and Gaeta are in that set. A suppressed town keeps the stricter annexation windows. Elena in 1890 does not exist yet. A living town created in that same window, such as Riccione in 1922, is also extended. Read that early span as a province hint. The regime spans that start in 1796 stay the same. Earlier spans name the pre-1796 sovereign and stop on 31 December 1795.

The regime rules use the historical province code. Benevento city is the local exception. Other enclaves are not modeled one by one. Frazioni are not a national gazetteer.

Veneto, Friuli, and Mantua stay on parish registers through 31 August 1871. Stato Civile Italiano there starts on 1 September 1871. Before civil registration, the card names the diocese and the diocesan archive.

A PEC from IndicePA is labeled official. A missing row uses the pattern `protocollo@pec.comune.{slug}.{sigla}.it`. Confirm that pattern before you send a request. ANSC does not replace the paper registers from about 1809 to the 1990s.

Sicily was not under the Napoleonic civil system in this model. The island of Sardinia was not under it either.

Trento, Bolzano, Trieste, Gorizia, Istria, and Zara carry a jure sanguinis research flag for the years before Italian annexation. That flag is a research note. It is not legal advice.

Antenati links use a stable URL pattern. This copy did not request every archive page.

## Built by Atto

[Atto](https://youratto.com) is the local-first macOS vault and DIY toolkit for Italian civil records and family history. This atlas is the public lookup that feeds that work.

The atlas answers one question for a town and a year: the sovereign regime, the historical province, the modern comune, and the State Archive. Atto keeps the family tree, the Stato Civile requests, and the citizenship packet on your Mac. Copy the place dossier from the atlas or from the ANSC page, then paste it into Atto on the Documents tab.

Use the same resolver from `cli/resolve.mjs` and `lib/engine.mjs`. The live map is [https://youratto.com/atlas](https://youratto.com/atlas).
