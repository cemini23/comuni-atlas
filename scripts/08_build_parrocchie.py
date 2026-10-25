#!/usr/bin/env python3
"""Write data/built/parrocchie-db.json from the province diocese table.

Church coordinates stay null. Seat coordinates are the comune of the
search place. BeWeB links are rebuilt with scripts/07_fetch_dioceses.py.
The Wikidata cache is optional. Its bewebUrl values are dropped.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILT = ROOT / "data" / "built"
RAW = ROOT / "data" / "raw"
SEAT_ALIASES = {
    "Reggio Emilia": "Reggio nell'Emilia",
    "Reggio Calabria": "Reggio di Calabria",
}


def beweb():
    path = ROOT / "scripts" / "07_fetch_dioceses.py"
    spec = importlib.util.spec_from_file_location("diocese_beweb", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.beweb


def norm_name(value: str) -> str:
    return (value or "").casefold()


def chiesa_madre(label: str) -> bool:
    text = (label or "").casefold()
    return "chiesa madre" in text or "matrice" in text or "pieve" in text


def place_index(places: list[dict]) -> dict[str, dict]:
    best: dict[str, dict] = {}
    for place in places:
        if place.get("kind") not in (None, "comune"):
            continue
        key = norm_name(place.get("name") or "")
        if not key:
            continue
        current = best.get(key)
        if current is None or (place.get("population") or 0) > (current.get("population") or 0):
            best[key] = place
    return best


def lookup_seat(search: str, by_name: dict[str, dict]) -> dict | None:
    target = SEAT_ALIASES.get(search, search)
    return by_name.get(norm_name(target))


def church_row(name: str, comune: str, istat: str, province: str, diocese: str, archive: str, url: str, kind: str, lat, lng) -> dict:
    return {
        "name": name,
        "comune": comune,
        "istat": istat or "",
        "province": province or "",
        "diocese": diocese or "",
        "inceptionYear": None,
        "century": None,
        "patronSaint": "",
        "lat": lat,
        "lng": lng,
        "archive": archive or "",
        "bewebUrl": url,
        "priorTo1866": None,
        "kind": kind,
        "chiesaMadre": chiesa_madre(name),
        "coordinateNote": "Seat town, not a surveyed church door." if kind == "diocesan-seat" else "",
    }


def build() -> dict:
    link = beweb()
    dioceses_doc = json.loads((BUILT / "dioceses.json").read_text(encoding="utf-8"))
    index = json.loads((BUILT / "comuni-index.json").read_text(encoding="utf-8"))
    by_name = place_index(index.get("places") or [])
    by_istat = {}
    for place in index.get("places") or []:
        if place.get("istat"):
            by_istat[place["istat"]] = place
    by_province = dioceses_doc.get("byProvince") or {}
    if len(by_province) != 107:
        raise SystemExit(f"expected 107 diocese seats, found {len(by_province)}")

    dioceses = []
    churches = []
    for code in sorted(by_province):
        row = by_province[code]
        search = row.get("searchPlace") or ""
        seat = lookup_seat(search, by_name)
        if seat is None:
            raise SystemExit(f"no comune for diocese seat {search}")
        url = link(search)
        if "beniarchivistici/ricerca" in url:
            raise SystemExit("beweb() returned the ricerca path")
        item = {
            "code": code,
            "name": row.get("name") or "",
            "archive": row.get("archive") or "",
            "cathedral": row.get("cathedral") or "",
            "searchPlace": search,
            "bewebUrl": url,
            "note": row.get("note") or "",
            "seatComune": seat.get("name") or search,
            "lat": seat.get("lat"),
            "lng": seat.get("lng"),
            "coordinateNote": "Seat town, not a surveyed church door.",
        }
        dioceses.append(item)
        churches.append(church_row(
            item["cathedral"] or item["name"],
            item["seatComune"],
            seat.get("istat") or "",
            code,
            item["name"],
            item["archive"],
            url,
            "diocesan-seat",
            seat.get("lat"),
            seat.get("lng"),
        ))

    cache_path = RAW / "dioceses_wikidata.json"
    if cache_path.exists():
        cache = json.loads(cache_path.read_text(encoding="utf-8")).get("byIstat") or {}
        for istat, row in cache.items():
            if not isinstance(row, dict):
                continue
            label = (row.get("church") or "").strip()
            if not label:
                continue
            place = by_istat.get(istat)
            province = (place or {}).get("provinceCode") or ""
            seat = by_province.get(province) or {}
            comune = (place or {}).get("name") or ""
            diocese = (row.get("name") or seat.get("name") or "")
            archive = seat.get("archive") or ""
            url = link(comune or seat.get("searchPlace") or "Italia")
            churches.append(church_row(
                label,
                comune,
                istat,
                province,
                diocese,
                archive,
                url,
                "church",
                None,
                None,
            ))

    payload = {
        "source": "province-seats-plus-optional-wikidata-church-names",
        "dioceses": dioceses,
        "churches": churches,
    }
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if "beniarchivistici/ricerca" in blob:
        raise SystemExit("parrocchie bundle still contains the ricerca path")
    (BUILT / "parrocchie-db.json").write_text(blob, encoding="utf-8")
    return payload


def main() -> int:
    payload = build()
    print(f"parrocchie dioceses {len(payload['dioceses'])} churches {len(payload['churches'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
