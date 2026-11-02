---
name: comuni-atlas
description: Which archive holds the records for this town in this year. Use when someone was born in a village that no longer exists, or when you need the province, the archive, or whether the border changed. Returns JSON for an Italian town and year from 1563 to 2026. Do not guess a coordinate.
---

# Comuni Atlas

Run the resolver. Do not invent a province, a coordinate, or an archive.

The date inside a year is 1 July. Citizenship notes are research flags, not legal advice.

The command answers a plain question. Which archive holds the records for this town in this year? The person was born in a village that no longer exists. Which province held it? Which archive holds the books? Did the border change?

## Place matching stays deterministic

A place name from a record is a fact. A coordinate is a guess. A model that picks a comune is also a guess.

Do not send a place name to a model to choose a comune. The resolver matches strings, aliases, exonyms, and the suppressed-comune list. That match is deterministic. Exit 0, exit 2, and exit 1 stay the contract.

The resolver has a deterministic string-distance pass. It is not a model. It does not abstain. Do not extend that pass with a model. Do not treat it as the fuzzy mode below. That mode is not implemented.

A later change may add a model only when all four rules hold:

1. Candidate generation is deterministic. Use strings, aliases, exonyms, and the suppressed-comune list. Use no model.
2. The model may rank. It may not create. It cannot add a comune that the deterministic pass did not produce.
3. Abstention is the default. Below the stated score, the answer is exit 2.
4. The output carries the alternative. Exit 0 includes `"match": "fuzzy"` and the candidate list, so a person can see the choice.

If those four rules cannot all be met, leave the match deterministic. A fuzzy match that cannot abstain is forbidden. A missing village would become a confident comune. The command would exit 0. The archive would look right and be wrong.

## Evidence state

Every place answer includes `state`, `verification`, `basis`, and `notes`. Keep every other field. Do not change an exit code.

| Field | Meaning |
| --- | --- |
| `state` | `in-force`, `replayed`, or `current-only`. Every answer has one. |
| `verification` | The ISO dates the resolver checked for this answer. |
| `basis` | The source class, such as `istat-provincial-mesh+anpr-archivio`. |
| `notes` | The era caveat, when one applies. |

`in-force` means today's ISTAT province for the atlas current year. The answer is held from that dated mesh. This atlas does not claim a pre-1948 statute. An earlier year is not `in-force`.

`replayed` means the answer was rebuilt by applying each dated change. `verification` names the dates that were checked.

`current-only` means today's answer, with no historical claim. A name with no gazetteer entry is `current-only` and exit 2. A matched external stop, such as New York, is `current-only` and exit 0.

A matched answer with `state` `current-only` is still exit 0. Read `state` before you trust the archive.

Notes you can receive:

- `early span is a province hint, not a fact`
- `Earlier spans name the pre-1796 sovereign and stop on 31 December 1795.`
- `Veneto, Friuli, and Mantua stay on parish registers through 31 August 1871.`
- `Sicily and the island of Sardinia were not under the Napoleonic civil system in this model.`
- `Frazioni are not a national gazetteer.`

Do not cite an external statute corpus for this answer. A corpus that starts in 1947 is not a source for a pre-1948 year. The atlas owns its own sourcing for 1796–1947.

## Resolve

From the repository root:

```bash
node cli/resolve.mjs --year 1884 --place "Castrogiovanni"
```

Read the JSON on stdout. Do not expect prose. A matched comune includes `state`, `verification`, `basis`, `notes`, `stato_civile_office` (PEC, address, ANSC status), and `parish_routing` (diocese, archive, and whether that year needs a parish act). `pecSource` is `indicepa` or `pattern-fallback`. Confirm a pattern address before you send it.

- Exit 0 means every stop matched. `state` can still be `current-only`.
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

- `resolvePlace(place, year)` is read-only. It returns the same `state`, `verification`, `basis`, and `notes` as the CLI.
- `locate({ place, year })` and `inspect({ place, year })` move the map.
- `plotTrajectory({ place, year })` draws the route. `route` or `person` plays a chronicle.
- `playRoute(slug)` plays a chronicle.
- `setYear(year)` moves the scrubber.
- `getState()` returns the year, the place, and the view box.
- `exportCitation()` returns a Markdown citation for the open town.
- `exportAttoDossier()` returns an `atto.place-dossier.v1` object for the open town. `clipboardText` is the plain block for Atto **Paste from website**. The download file is `{comune-slug}-{year}.atto-place.json`.

`toAttoDossier(result, extras)` in `lib/suite.mjs` builds that object. Optional extras are `leva`, `catasto_guide`, and `parrocchie`. Do not invent archive fields that the resolver did not return.

You can also read the JSON block `#atlas-inspect-json`.
