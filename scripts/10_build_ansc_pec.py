#!/usr/bin/env python3
"""Write data/built/ansc-pec-db.json. No per-comune ANSC onboarding date."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILT = ROOT / "data" / "built"
ANSC_NOTE = (
    "The population register (ANPR) includes the Italian comuni. ANSC, the digital "
    "Stato Civile archive, does not replace the paper books. Acts from about 1809 to "
    "the 1990s still need a request to the Ufficio di Stato Civile or the Archivio di "
    "Stato, even when the comune sends new acts to ANSC."
)
ROLLOUT = (
    "Active on ANPR. While modern acts are digitized through ANSC, historical "
    "Stato Civile registers (1809–1990s) are maintained in physical volumes at "
    "the Comune and the provincial Archivio di Stato."
)


def norm(value: str) -> str:
    text = unicodedata.normalize("NFD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().replace("'", "").replace("’", "").replace("`", "")
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return text


def tier(population) -> str:
    if population is None:
        return ""
    if population < 5000:
        return "under-5k"
    if population < 20000:
        return "5k-20k"
    if population < 100000:
        return "20k-100k"
    return "100k+"


def historical_aliases(place: dict) -> list[str]:
    current = norm(place.get("name") or "")
    seen = []
    for span in place.get("spans") or []:
        name = span.get("name") or ""
        if name and norm(name) != current and name not in seen:
            seen.append(name)
    for alias in place.get("aliases") or []:
        if alias and norm(alias) != current and alias not in seen:
            seen.append(alias)
    return seen


def office(place: dict, by_catasto: dict, contacts: dict) -> dict:
    successor = by_catasto.get(place.get("successorCatasto")) if place.get("successorCatasto") else None
    own = contacts.get(place.get("catasto")) if place.get("catasto") else None
    heir = None
    if not own and successor and successor.get("catasto"):
        heir = contacts.get(successor["catasto"])
    row = own or heir or None
    if heir and successor:
        comune_name = successor.get("name") or place.get("name") or ""
        sigla = str(successor.get("sigla") or "it").lower()
    else:
        comune_name = place.get("name") or ""
        sigla = str(place.get("sigla") or "it").lower()
    slug = norm(comune_name).replace(" ", "-").strip("-") or "comune"
    pattern = f"protocollo@pec.comune.{slug}.{sigla}.it"
    from_index = bool(row and row.get("pec"))
    if place.get("suppressed"):
        status = "successor-comune" if heir else "suppressed"
    else:
        status = "anpr-population"
    return {
        "pec": row["pec"] if from_index else pattern,
        "pecSource": "indicepa" if from_index else "pattern-fallback",
        "address": (row or {}).get("address") or f"Municipio di {comune_name}",
        "website": (row or {}).get("website") or "",
        "anscStatus": status,
    }


def build() -> dict:
    index = json.loads((BUILT / "comuni-index.json").read_text(encoding="utf-8"))
    contacts = json.loads((BUILT / "contacts.json").read_text(encoding="utf-8")).get("byCatasto") or {}
    places = index.get("places") or []
    by_catasto = {place["catasto"]: place for place in places if place.get("catasto")}
    rows = []
    for place in places:
        if not place.get("istat") and not place.get("catasto"):
            continue
        card = office(place, by_catasto, contacts)
        rows.append({
            "name": place.get("name") or "",
            "historicalAliases": historical_aliases(place),
            "province": place.get("province") or "",
            "region": place.get("region") or "",
            "istat": place.get("istat") or "",
            "catasto": place.get("catasto") or "",
            "sigla": place.get("sigla") or "",
            "populationTier": tier(place.get("population")),
            "pec": card["pec"],
            "pecSource": card["pecSource"],
            "address": card["address"],
            "website": card["website"],
            "anscStatus": card["anscStatus"],
            "rolloutWave": None,
            "rolloutNote": ROLLOUT,
            "digitalSignatureReady": False,
            "anscActive": False,
            "historicalArchiveWarning": ANSC_NOTE,
        })
    payload = {
        "source": "comuni-index-and-indicepa-or-pattern",
        "rolloutNote": ROLLOUT,
        "comuni": rows,
    }
    (BUILT / "ansc-pec-db.json").write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return payload


def main() -> int:
    payload = build()
    print(f"ansc comuni {len(payload['comuni'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
