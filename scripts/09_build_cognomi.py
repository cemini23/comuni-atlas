#!/usr/bin/env python3
"""Write data/built/cognomi-db.json. This is a linguistic estimate, not a census."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILT = ROOT / "data" / "built"
PAN = "pan-Italian or unclassified. No comune cluster in this atlas."

USER_NAMES = [
    "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci",
    "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Costa", "Giordano",
    "Mancini", "Rizzo", "Lombardi", "Moretti", "Barbieri", "Fontana", "Santoro",
    "Mariani", "Rinaldi", "Caruso", "Ferrara", "Galli", "Martini", "Leone", "Longo",
    "Gentile", "Martinelli", "Vitale", "Lombardo", "Serra", "Coppola", "De Santis",
    "D'Angelo", "Marchetti", "Parisi", "Villa", "Conte", "Ferraro", "Ferri", "Fabbri",
    "Bianco", "Marini", "Grasso", "Valentini", "Messina", "Sala", "De Rosa", "D'Amico",
    "Pellegrini", "Palumbo", "Sanna", "Farina", "Ruggiero", "Monti", "Testa", "Cattaneo",
    "Barone", "Cabello",
]


def norm(value: str) -> str:
    text = unicodedata.normalize("NFD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("'", "").replace("’", "").replace("`", "")
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return text


def fold(value: str) -> str:
    return norm(value).replace(" ", "")


def row(surname: str, category: str, meaning: str = "", region=None, epicenter: str = "", ambiguous: bool = False, foundling=None) -> dict:
    return {
        "surname": surname,
        "category": category,
        "meaning": meaning,
        "region": region,
        "epicenterNote": epicenter,
        "ambiguous": ambiguous,
        "foundling": foundling,
    }


def foundling_rows() -> list[dict]:
    return [
        {
            "surnames": ["Esposito", "Esposto", "Degli Esposti", "Delli Esposti"],
            "keys": [fold(name) for name in ["Esposito", "Esposto", "Degli Esposti", "Delli Esposti"]],
            "category": "foundling",
            "region": "Campania",
            "hospital": "Real Casa dell'Annunziata",
            "city": "Napoli",
            "note": "Foundling surname of the Real Casa dell'Annunziata in Napoli.",
            "wins": True,
        },
        {
            "surnames": ["Innocenti", "Degli Innocenti", "Degl'Innocenti"],
            "keys": [fold(name) for name in ["Innocenti", "Degli Innocenti", "Degl'Innocenti"]],
            "category": "foundling",
            "region": "Toscana",
            "hospital": "Ospedale degli Innocenti",
            "city": "Firenze",
            "note": "Foundling surname of the Ospedale degli Innocenti in Firenze.",
            "wins": True,
        },
        {
            "surnames": ["Proietti"],
            "keys": [fold("Proietti")],
            "category": "foundling",
            "region": "Lazio",
            "hospital": "Santo Spirito in Sassia",
            "city": "Roma",
            "note": "Foundling surname of Santo Spirito in Sassia in Roma.",
            "wins": True,
        },
        {
            "surnames": ["Casadei", "Diotallevi"],
            "keys": [fold(name) for name in ["Casadei", "Diotallevi"]],
            "category": "foundling",
            "region": "Emilia-Romagna",
            "hospital": None,
            "city": "Bologna",
            "note": "Bologna and Romagna tradition. This is a naming tradition, not a count.",
            "wins": True,
        },
        {
            "surnames": ["Trovato"],
            "keys": [fold("Trovato")],
            "category": "foundling",
            "region": None,
            "hospital": None,
            "city": None,
            "note": "found infant; several hospitals used this name",
            "wins": True,
        },
        {
            "surnames": ["Colombo"],
            "keys": [fold("Colombo")],
            "category": "nickname",
            "region": None,
            "hospital": "Ospedale Maggiore",
            "city": "Milano",
            "meaning": "dove",
            "note": "Some Milan foundlings received Colombo. Do not treat every Colombo as a foundling.",
            "wins": False,
        },
    ]


def explicit() -> dict[str, dict]:
    nick = {
        "Rossi": "red",
        "Bianchi": "white",
        "Bruno": "brown",
        "Grasso": "",
        "Testa": "",
        "Longo": "",
        "Leone": "",
        "Gallo": "",
        "Galli": "",
        "Greco": "ethnic nickname",
    }
    table = {}
    for surname, meaning in nick.items():
        table[surname] = row(surname, "nickname", meaning, None, PAN)
    table["Barone"] = row(
        "Barone",
        "nickname",
        "baron",
        None,
        "Frequent in the South. No single town.",
    )
    table["Romano"] = row("Romano", "nickname", "ethnic", None, PAN)
    table["Lombardi"] = row(
        "Lombardi",
        "nickname",
        "ethnic nickname",
        "Lombardia",
        "Ethnic nickname. Region lean Lombardia. Not a single town.",
    )
    table["Lombardo"] = row(
        "Lombardo",
        "nickname",
        "ethnic nickname",
        "Lombardia",
        "Ethnic nickname. Region lean Lombardia. Not a single town.",
    )
    for surname, meaning in {
        "Ferrari": "smith",
        "Ferraro": "smith",
        "Fabbri": "smiths",
        "Barbieri": "barbers",
    }.items():
        table[surname] = row(surname, "occupational", meaning, None, PAN)
    for surname in [
        "De Luca", "De Santis", "D'Angelo", "De Rosa", "D'Amico", "Ricci",
        "Rinaldi", "Martinelli", "Martini", "Mariani", "Valentini",
    ]:
        table[surname] = row(surname, "patronymic", "", None, PAN)
    table["Sanna"] = row("Sanna", "patronymic", "", "Sardegna", "Sardinian given-name surname")
    table["Cattaneo"] = row("Cattaneo", "patronymic", "", "Lombardia", "Lombard medieval name")
    for surname in ("Ferrara", "Messina"):
        table[surname] = row(
            surname,
            "toponymic",
            "",
            None,
            "This is a name match with a comune of the same name. It is not a census.",
        )
    table["Cabello"] = row(
        "Cabello",
        "unclassified",
        "Spanish or Hispanic form. This atlas assigns no Italian epicenter.",
        None,
        "Spanish or Hispanic form. This atlas assigns no Italian epicenter.",
    )
    table["Colombo"] = row(
        "Colombo",
        "nickname",
        "dove",
        None,
        PAN,
        True,
        {
            "hospital": "Ospedale Maggiore",
            "city": "Milano",
            "note": "Some Milan foundlings received Colombo. Do not treat every Colombo as a foundling.",
        },
    )
    table["Venturini"] = row(
        "Venturini",
        "nickname",
        "of fortune",
        None,
        "Several cities used this name. Not only Sicily.",
    )
    return table


def classify_remaining(surname: str, comuni: set[str], foundlings: dict[str, dict]) -> dict:
    hit = foundlings.get(fold(surname))
    if hit and hit.get("wins") is not False:
        return row(
            surname,
            "foundling",
            "",
            hit.get("region"),
            hit.get("note") or PAN,
            False,
            {"hospital": hit.get("hospital"), "city": hit.get("city"), "note": hit.get("note") or ""},
        )
    if fold(surname) in comuni:
        return row(
            surname,
            "toponymic",
            "",
            None,
            "This is a name match with a comune of the same name. It is not a census.",
        )
    return row(surname, "unclassified", "", None, PAN)


def build() -> dict:
    index = json.loads((BUILT / "comuni-index.json").read_text(encoding="utf-8"))
    routes = json.loads((BUILT / "routes.json").read_text(encoding="utf-8"))
    comuni = {
        fold(place.get("name") or "")
        for place in index.get("places") or []
        if place.get("kind") in (None, "comune")
    }
    foundlings = foundling_rows()
    by_key = {}
    for item in foundlings:
        for key in item["keys"]:
            by_key[key] = item
    table = explicit()
    surnames = {}
    names = list(USER_NAMES)
    for item in foundlings:
        for surname in item["surnames"]:
            if surname not in names:
                names.append(surname)
    if "Venturini" not in names:
        names.append("Venturini")
    for surname in names:
        if surname in table:
            item = table[surname]
        else:
            item = classify_remaining(surname, comuni, by_key)
        hit = by_key.get(fold(surname))
        if hit and hit.get("wins") is not False:
            item = row(
                surname,
                "foundling",
                item.get("meaning") or "",
                hit.get("region"),
                hit.get("note") or item.get("epicenterNote") or "",
                False,
                {"hospital": hit.get("hospital"), "city": hit.get("city"), "note": hit.get("note") or ""},
            )
        surnames[fold(surname)] = item
    missing = [name for name in USER_NAMES if fold(name) not in surnames]
    if missing:
        raise SystemExit(f"missing curated surnames: {missing}")
    ports = [
        {"id": port["id"], "name": port["name"], "lat": port["lat"], "lng": port["lng"]}
        for port in routes.get("ports") or []
    ]
    payload = {
        "source": "linguistic-estimate",
        "census": False,
        "surnames": surnames,
        "foundlings": foundlings,
        "ports": ports,
    }
    (BUILT / "cognomi-db.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return payload


def main() -> int:
    payload = build()
    print(f"cognomi {len(payload['surnames'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
