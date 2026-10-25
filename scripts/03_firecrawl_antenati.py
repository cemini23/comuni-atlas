#!/usr/bin/env python3
"""Optional Firecrawl scrape of Portale Antenati archive index.

Reads FIRECRAWL_API_KEY from the environment or from a .env file in the
repository root. The key is never printed.

The atlas does not need this script. data/built/archives.json already lists
the State Archives and their Antenati URL pattern. A successful run writes
data/raw/antenati_firecrawl.json for a later bundle refresh.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
TARGET = "https://antenati.cultura.gov.it/archivi/"
API = "https://api.firecrawl.dev/v1/scrape"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> int:
    load_env(ROOT / ".env")
    key = os.environ.get("FIRECRAWL_API_KEY", "").strip()
    if not key:
        print("FIRECRAWL_API_KEY is missing. The offline archive list is unchanged.", file=sys.stderr)
        return 1
    payload = json.dumps({"url": TARGET, "formats": ["markdown", "links"]}).encode("utf-8")
    request = urllib.request.Request(
        API,
        data=payload,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": "comuni-atlas/0.1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        print(f"Firecrawl HTTP {exc.code}. {detail}", file=sys.stderr)
        return 1
    except urllib.error.URLError as exc:
        print(f"Firecrawl request failed. {exc.reason}", file=sys.stderr)
        return 1
    RAW.mkdir(parents=True, exist_ok=True)
    dest = RAW / "antenati_firecrawl.json"
    dest.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {dest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
