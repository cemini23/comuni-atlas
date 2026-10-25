#!/usr/bin/env python3
"""Write data/built/caduti-leva-db.json. A finding aid, not a casualty roll."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILT = ROOT / "data" / "built"


def build() -> dict:
    payload = {
        "source": "finding-aid",
        "alboNote": "Military conscription rolls (Liste di Leva) record every male draftee's exact birth comune and parents' names (paternità e maternità) around age 20.",
        "ageModel": "call-up year = birth year + 20",
        "regiments": [
            {
                "id": "alpini",
                "name": "Alpini",
                "note": "Alpine basins: Piemonte, Valle d'Aosta/Vallée d'Aoste, Liguria alpine notes, Lombardia north, Veneto, Friuli-Venezia Giulia, and Trentino-Alto Adige/Südtirol.",
                "regions": [
                    "Piemonte",
                    "Valle d'Aosta/Vallée d'Aoste",
                    "Liguria",
                    "Lombardia",
                    "Veneto",
                    "Friuli-Venezia Giulia",
                    "Trentino-Alto Adige/Südtirol",
                ],
            },
            {
                "id": "bersaglieri",
                "name": "Bersaglieri",
                "note": "Designated districts. No single province.",
                "regions": [],
            },
            {
                "id": "brigata-sassari",
                "name": "Brigata Sassari",
                "note": "Sardegna.",
                "regions": ["Sardegna"],
            },
            {
                "id": "fanteria",
                "name": "Fanteria",
                "note": "The default line of the district.",
                "regions": [],
            },
        ],
    }
    (BUILT / "caduti-leva-db.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


def main() -> int:
    build()
    print("caduti-leva-db.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
