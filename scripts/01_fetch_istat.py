#!/usr/bin/env python3
"""Download modern comuni and the ANPR historical comune archive.

Sources
- https://github.com/matteocontrini/comuni-json
- ANPR archivio storico dei comuni (Ministero dell'Interno, ISTAT variations)

The script uses only the Python standard library. It writes files under data/raw/.
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
UA = "comuni-atlas/0.1 (historical research; local atlas build)"

SOURCES = {
    "comuni.json": "https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json",
    "anpr_archivio_comuni.csv": "https://www.anagrafenazionale.interno.it/wp-content/uploads/ANPR_archivio_comuni.csv",
}


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as response, dest.open("wb") as handle:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            handle.write(chunk)


def main() -> int:
    force = "--force" in sys.argv
    RAW.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        dest = RAW / name
        if dest.exists() and dest.stat().st_size > 1000 and not force:
            print(f"keep {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)")
            continue
        print(f"get {name}")
        download(url, dest)
        print(f"wrote {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
