---
name: comuni-atlas
description: Resolve an Italian town and year from 1563 to 2026 to the sovereign regime, historical province, modern comune, and State Archive. Use for civil-record lookup, jure sanguinis research context, or ?year=&place= atlas URLs. Do not guess coordinates.
---

# Comuni Atlas

Run the resolver. Do not invent a province, a coordinate, or an archive.

The date inside a year is 1 July. Citizenship notes are research flags, not legal advice.

## Resolve

From the repository root:

```bash
node cli/resolve.mjs --year 1884 --place "Castrogiovanni"
```

Read the JSON on stdout. A matched comune includes `stato_civile_office` (PEC, address, ANSC status) and `parish_routing` (diocese, archive, and whether that year needs a parish act). `pecSource` is `indicepa` or `pattern-fallback`. Confirm a pattern address before you send it.

- Exit 0 means every stop matched.
- Exit 2 means a stop did not match, or the surname string is empty.
- Exit 1 means the command is incomplete.

Surname and leva commands:

```bash
node cli/resolve.mjs --cognome Barone
node cli/resolve.mjs --surname Esposito
node cli/resolve.mjs --leva --year 1878 --place Isernia
```

`--cognome` prints a surname dossier and does not print the place. `census` is false. The dossier is a linguistic estimate, not a census. Colombo is ambiguous. Do not treat every Colombo as a foundling. Cabello has no Italian epicenter.

A matched place also includes `leva`, `catasto_guide`, and `parrocchie`.

- PEC from IndicePA is `pecSource` `indicepa`. A missing row is `pattern-fallback`. Confirm a pattern address before you send it.
- This atlas has no per-comune ANSC onboarding date. `rolloutWave` is null. `digitalSignatureReady` is false. `anscActive` is false.
- Leva is a finding aid. Call-up year is the birth year plus 20. It is not a service record.
- Rail lines and Roman consular roads are schematic corridors, not surveyed track.
- The cadastre guide is not a tile layer. It does not draw parcels. `earlierCensus` names an older household survey when the modern region has one.
- `archivalWarnings` lists a known archive loss for that province. An empty array means this model has no loss note.
- A year before 1563 is clamped to 1563. Dante's stops use the 1563 jurisdiction.
- Latin aliases such as Mediolanum resolve to the modern comune. Do not invent an alias that is not in the data.

The other tools are Parrocchie and dioceses, the Cognomi heatmap, the ANSC and PEC tracker, and Caduti and liste di leva. Their pages are `web-parrocchie/`, `web-cognomi/`, `web-ansc/`, and `web-caduti/`.

A comma-separated place list returns a trajectory. This curated route uses Quarto dei Mille in Genova, not the comune of Quarto in Napoli:

```bash
node cli/resolve.mjs --year 1860,1860,1860,1860 --place "Quarto,Marsala,Palermo,Napoli"
```

## Share a map

Use the live atlas:

- One town: `https://youratto.com/atlas?year=1884&place=Castrogiovanni`
- A chronicle: `https://youratto.com/atlas?route=garibaldi-mille` (`person` is an alias of `route`)
- The same chronicle from a place list: `https://youratto.com/atlas?year=1860,1860,1860,1860&place=Quarto,Marsala,Palermo,Napoli`

For a local check, serve the repository root, then open `/web/`. The site bundle in `dist/atlas/` uses `window.ATLAS_BASE_PATH=./`.

## Browser API

Wait until the page banner shows a year. Then call `window.atlasAPI`.

- `resolvePlace(place, year)` is read-only.
- `locate({ place, year })` and `inspect({ place, year })` move the map.
- `plotTrajectory({ place, year })` draws the route. `route` or `person` plays a chronicle.
- `playRoute(slug)` plays a chronicle.
- `setYear(year)` moves the scrubber.
- `getState()` returns the year, the place, and the view box.
- `exportCitation()` returns a Markdown citation for the open town.
- `exportAttoDossier()` returns an `atto.place-dossier.v1` object for the open town. `clipboardText` is the plain block for Atto **Paste from website**. The download file is `{comune-slug}-{year}.atto-place.json`.

`toAttoDossier(result, extras)` in `lib/suite.mjs` builds that object. Optional extras are `leva`, `catasto_guide`, and `parrocchie`. Do not invent archive fields that the resolver did not return.

You can also read the JSON block `#atlas-inspect-json`.
