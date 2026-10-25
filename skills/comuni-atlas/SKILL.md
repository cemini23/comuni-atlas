---
name: comuni-atlas
description: Resolve an Italian town and year from 1796 to 2026 to the sovereign regime, historical province, modern comune, and State Archive. Use for civil-record lookup, jure sanguinis research context, or ?year=&place= atlas URLs. Do not guess coordinates.
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
- Exit 2 means a stop did not match.
- Exit 1 means the command is incomplete.

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

You can also read the JSON block `#atlas-inspect-json`.
