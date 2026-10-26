#!/usr/bin/env python3
"""Write data/built/rail-catasti.json. Schematic corridors, not surveyed track."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILT = ROOT / "data" / "built"
MODANE = (6.658, 45.201)


def town_point(places: list[dict], name: str) -> list[float]:
    if name == "Modane":
        return [MODANE[0], MODANE[1]]
    hits = [place for place in places if place.get("name") == name and place.get("kind") in (None, "comune")]
    if not hits:
        raise SystemExit(f"missing rail town {name}")
    place = hits[0]
    if place.get("lat") is None or place.get("lng") is None:
        raise SystemExit(f"missing coordinates for {name}")
    return [place["lng"], place["lat"]]


def road(places: list[dict], road_id: str, name: str, opened: str, towns: list[str], note: str) -> dict:
    return {
        "id": road_id,
        "name": name,
        "opened": opened,
        "towns": towns,
        "note": note,
        "schematic": True,
        "coordinates": [town_point(places, town) for town in towns],
    }


def line(places: list[dict], line_id: str, name: str, year: int, opened: str, towns: list[str]) -> dict:
    return {
        "id": line_id,
        "name": name,
        "year": year,
        "opened": opened,
        "towns": towns,
        "schematic": True,
        "coordinates": [town_point(places, town) for town in towns],
    }


def build() -> dict:
    index = json.loads((BUILT / "comuni-index.json").read_text(encoding="utf-8"))
    places = index.get("places") or []
    lines = [
        line(places, "napoli-portici", "Napoli–Portici", 1839, "1839-10-03", ["Napoli", "Portici"]),
        line(places, "milano-monza", "Milano–Monza", 1840, "1840-08-17", ["Milano", "Monza"]),
        line(places, "torino-moncalieri", "Torino–Moncalieri", 1848, "1848", ["Torino", "Moncalieri"]),
        line(places, "torino-genova", "Torino–Genova", 1854, "1854", ["Torino", "Genova"]),
        line(places, "milano-venezia", "Milano–Venezia", 1857, "1857", ["Milano", "Brescia", "Verona", "Padova", "Venezia"]),
        line(places, "porrettana", "Porrettana Bologna–Pistoia", 1864, "1864", ["Bologna", "Porretta Terme", "Pistoia"]),
        line(places, "frejus-modane", "Fréjus/Modane", 1871, "1871", ["Torino", "Modane"]),
    ]
    years = sorted(item["year"] for item in lines)
    if years != [1839, 1840, 1848, 1854, 1857, 1864, 1871]:
        raise SystemExit(f"unexpected rail years {years}")
    roman_roads = [
        road(places, "via-appia", "Via Appia (312 BC)", "312 BC", ["Roma", "Latina", "Terracina", "Capua", "Benevento", "Taranto", "Brindisi"], "Roma to Brindisi through Terracina, Capua, and Benevento."),
        road(places, "via-flaminia", "Via Flaminia (220 BC)", "220 BC", ["Roma", "Terni", "Foligno", "Pesaro", "Rimini"], "Roma to Rimini through the Apennines."),
        road(places, "via-aemilia", "Via Aemilia (187 BC)", "187 BC", ["Rimini", "Forlì", "Bologna", "Modena", "Reggio nell'Emilia", "Parma", "Piacenza"], "Rimini to Piacenza along the Po plain."),
        road(places, "via-aurelia", "Via Aurelia (241 BC)", "241 BC", ["Roma", "Grosseto", "Livorno", "Pisa", "Genova"], "Roma to Genova along the Tyrrhenian coast."),
        road(places, "via-postumia", "Via Postumia (148 BC)", "148 BC", ["Genova", "Alessandria", "Cremona", "Verona", "Vicenza", "Udine", "Trieste"], "Genova to the Adriatic through the Po plain."),
        road(places, "via-popilia", "Via Popilia (132 BC)", "132 BC", ["Capua", "Salerno", "Cosenza", "Vibo Valentia", "Reggio di Calabria"], "Capua to the Strait of Messina."),
    ]
    payload = {
        "lines": lines,
        "romanRoads": roman_roads,
        "catasti": [
            {
                "id": "gregoriano",
                "name": "Catasto Gregoriano",
                "years": "1816–1835",
                "polities": ["papal"],
            },
            {
                "id": "austriaco",
                "name": "Catasto Lombardo-Veneto / Austriaco",
                "years": "1807–1853",
                "polities": ["lombardo-veneto", "austria", "austria-hungary"],
                "note": "Austria and Austria-Hungary use this id only in Lombardia, Veneto, and Friuli-Venezia Giulia. Lombardo-Veneto uses it on its own ground.",
            },
            {
                "id": "leopoldino",
                "name": "Catasto Ferdinandeo-Leopoldino",
                "years": "1817–1835",
                "polities": ["toscana"],
            },
            {
                "id": "murattiano",
                "name": "Catasto Provvisorio / Murattiano",
                "years": "1806–1815",
                "polities": ["murat", "napoli-borbone", "sicilia-borbone", "due-sicilie"],
                "note": "Pre-unification Southern Italian property cadastre (Catasto Provvisorio / Murattiano) preserved at the provincial Archivio di Stato.",
            },
            {
                "id": "rabbini",
                "name": "Catasto Rabbini / Antichi Catasti Sabaudi",
                "years": "1855–1870",
                "polities": ["regno-sardegna", "genova", "liguria-repubblica"],
            },
            {
                "id": "none",
                "name": "Consult local State or Provincial Archive cadastral series",
                "years": "",
                "polities": [],
            },
        ],
        "note": "Schematic corridors, not surveyed track.",
    }
    blob = json.dumps(payload, ensure_ascii=False, indent=2)
    if "iiif" in blob.lower():
        raise SystemExit("rail bundle must not name a tile service")
    (BUILT / "rail-catasti.json").write_text(blob, encoding="utf-8")
    return payload


def main() -> int:
    payload = build()
    print(f"rail lines {len(payload['lines'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
