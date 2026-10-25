#!/usr/bin/env python3
"""Download IndicePA comune rows and write data/raw/ipa_contacts.json.

The script reads two public tab files:

- amministrazioni.txt holds the street address and the website.
- dom-dig.txt holds the certified email (PEC) of each office.

It keeps one PEC per comune. A protocollo or stato civile office wins over a side office.
It does not store the names of the people listed as responsible officers.
The build step copies this file into data/built/contacts.json.
A comune with no IndicePA row still gets a labeled pattern in the resolver.
"""

from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = RAW / "ipa_contacts.json"
UA = "comuni-atlas/1.0 (https://youratto.com/atlas)"
AMM_URL = (
    "https://indicepa.gov.it/ipa-dati/dataset/502ff370-1b2c-4310-94c7-f39ceb7500e3"
    "/resource/3ed63523-ff9c-41f6-a6fe-980f3d9e501f/download/amministrazioni.txt"
)
PEC_URL = (
    "https://indicepa.gov.it/ipa-dati/dataset/057fd0d7-8ba3-485a-8581-52c8237b8d2c"
    "/resource/9a9b4595-00a0-4c16-8bf4-1274ace9a10e/download/dom-dig.txt"
)
CATASTO = re.compile(r"^c_([a-z]\d{3})$", re.I)


def download(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=180) as response:
        raw = response.read()
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def rows(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text), delimiter="\t")
    return [{(key or "").strip().lower(): (value or "").strip() for key, value in row.items()} for row in reader]


def blank(value: str) -> str:
    text = (value or "").strip()
    if text.lower() in {"", "null", "none"}:
        return ""
    return text


def catasto_of(code: str) -> str:
    match = CATASTO.match(blank(code).lower())
    return match.group(1).upper() if match else ""


def website(value: str) -> str:
    text = blank(value)
    if not text or "." not in text:
        return ""
    if text.startswith("http://") or text.startswith("https://"):
        return text
    return f"https://{text.lstrip('/')}"


def pec_score(address: str, office: str) -> int:
    blob = f"{address} {office}".lower()
    score = 0
    if "protocollo" in blob:
        score += 6
    if "stato civile" in blob or "statocivile" in blob or "anagrafe" in blob:
        score += 5
    if "comune@" in blob or address.lower().startswith("protocollo"):
        score += 2
    if any(word in blob for word in ("ambiente", "tribut", "polizia", "suap", "commercio", "mensa")):
        score -= 3
    return score


def choose_pec(group: list[dict]) -> str:
    ranked = []
    for row in group:
        if blank(row.get("tipo", "")).upper() not in {"PEC", "PECP"}:
            continue
        address = blank(row.get("domicilio_digitale", ""))
        if "@" not in address:
            continue
        office = blank(row.get("des_aoo", ""))
        ranked.append((pec_score(address, office), address.lower(), address))
    if not ranked:
        return ""
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked[0][2]


def mail_fallback(row: dict) -> str:
    found = []
    for index in range(1, 6):
        address = blank(row.get(f"mail{index}", ""))
        kind = blank(row.get(f"tipo_mail{index}", "")).lower()
        if "@" not in address or "pec" not in kind:
            continue
        found.append((pec_score(address, ""), address.lower(), address))
    if not found:
        return ""
    found.sort(key=lambda item: (-item[0], item[1]))
    return found[0][2]


def address_of(row: dict) -> str:
    street = blank(row.get("indirizzo", ""))
    cap = blank(row.get("cap", ""))
    town = blank(row.get("comune", ""))
    province = blank(row.get("provincia", ""))
    place = " ".join(part for part in (cap, town) if part)
    if province:
        place = f"{place} ({province})".strip()
    return ", ".join(part for part in (street, place) if part)


def build(administrations: list[dict], pec_rows: list[dict]) -> dict:
    by_code: dict[str, list[dict]] = {}
    for row in pec_rows:
        code = blank(row.get("cod_amm", "")).lower()
        if catasto_of(code):
            by_code.setdefault(code, []).append(row)

    by_catasto = {}
    for row in administrations:
        code = blank(row.get("cod_amm", "")).lower()
        catasto = catasto_of(code)
        if not catasto:
            continue
        name = blank(row.get("des_amm", ""))
        if not name.lower().startswith("comune"):
            continue
        pec = choose_pec(by_code.get(code, [])) or mail_fallback(row)
        if not pec and not address_of(row):
            continue
        by_catasto[catasto] = {
            "pec": pec,
            "address": address_of(row),
            "website": website(row.get("sito_istituzionale", "")),
            "ipaCode": code,
            "name": name,
        }
    return {
        "source": "IndicePA amministrazioni.txt and dom-dig.txt. Public certified-email and street data. No officer names.",
        "retrieved": date.today().isoformat(),
        "count": len(by_catasto),
        "byCatasto": by_catasto,
    }


def read_contacts(path: Path = OUT) -> dict:
    if not path.exists():
        return {"source": "missing", "retrieved": "", "count": 0, "byCatasto": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    print("download amministrazioni.txt")
    administrations = rows(download(AMM_URL))
    print(f"administrazioni {len(administrations)}")
    print("download dom-dig.txt")
    pec_rows = rows(download(PEC_URL))
    print(f"pec rows {len(pec_rows)}")
    payload = build(administrations, pec_rows)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} comuni {payload['count']}")
    if payload["count"] < 1000:
        raise SystemExit("IndicePA returned too few comuni")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
