#!/usr/bin/env python3
"""Download Openpolis Italy boundaries and write a small derived set.

Outputs
- data/raw/provinces.geojson   simplified modern provincial mesh
- data/raw/centroids.json      comune centroids keyed by 6-digit ISTAT code

The full municipality GeoJSON is about 36 MB. This script reads it, keeps only
centroids, and does not copy the full file into data/built/.
"""

from __future__ import annotations

import json
import math
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
UA = "comuni-atlas/0.1 (historical research; local atlas build)"
PROVINCES_URL = "https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_provinces.geojson"
MUNICIPALITIES_URL = "https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_IT_municipalities.geojson"
MUNICIPALITIES_CACHE = Path("/tmp/limits_IT_municipalities.geojson")
EPSILON = 0.012


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=240) as response, dest.open("wb") as handle:
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            handle.write(chunk)


def perp_distance(point, start, end) -> float:
    if start == end:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / math.hypot(dx, dy)


def rdp(points, epsilon: float):
    if len(points) < 3:
        return points
    start = points[0]
    end = points[-1]
    index = 0
    distance = -1.0
    for i in range(1, len(points) - 1):
        current = perp_distance(points[i], start, end)
        if current > distance:
            index = i
            distance = current
    if distance > epsilon:
        left = rdp(points[: index + 1], epsilon)
        right = rdp(points[index:], epsilon)
        return left[:-1] + right
    return [start, end]


def round_ring(ring):
    cleaned = []
    for lng, lat in ring:
        point = [round(float(lng), 5), round(float(lat), 5)]
        if not cleaned or cleaned[-1] != point:
            cleaned.append(point)
    if len(cleaned) >= 2 and cleaned[0] != cleaned[-1]:
        cleaned.append(cleaned[0])
    return cleaned


def simplify_ring(ring):
    rounded = round_ring(ring)
    if len(rounded) < 4:
        return rounded
    simple = round_ring(rdp(rounded, EPSILON))
    if len(simple) < 4:
        return rounded[:: max(1, len(rounded) // 8)]
    return simple


def simplify_geometry(geometry):
    kind = geometry["type"]
    coords = geometry["coordinates"]
    if kind == "Polygon":
        return {"type": "Polygon", "coordinates": [simplify_ring(ring) for ring in coords if len(ring) >= 4]}
    if kind == "MultiPolygon":
        polygons = []
        for polygon in coords:
            rings = [simplify_ring(ring) for ring in polygon if len(ring) >= 4]
            if rings and len(rings[0]) >= 4:
                polygons.append(rings)
        return {"type": "MultiPolygon", "coordinates": polygons}
    return geometry


def ring_area(ring) -> float:
    area = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        area += x1 * y2 - x2 * y1
    return area / 2.0


def ring_centroid(ring):
    area = ring_area(ring)
    if abs(area) < 1e-12:
        count = max(1, len(ring) - 1)
        lng = sum(point[0] for point in ring[:-1]) / count
        lat = sum(point[1] for point in ring[:-1]) / count
        return lng, lat, abs(area)
    cx = 0.0
    cy = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        cross = x1 * y2 - x2 * y1
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    return cx / (6 * area), cy / (6 * area), abs(area)


def geometry_centroid(geometry):
    polygons = []
    if geometry["type"] == "Polygon":
        polygons = [geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        polygons = geometry["coordinates"]
    best = None
    for polygon in polygons:
        if not polygon:
            continue
        lng, lat, area = ring_centroid(polygon[0])
        if best is None or area > best[2]:
            best = (lng, lat, area)
    if best is None:
        return None
    return {"lng": round(best[0], 5), "lat": round(best[1], 5)}


def simplify_provinces(source: Path, dest: Path) -> None:
    data = json.loads(source.read_text(encoding="utf-8"))
    features = []
    points = 0
    for feature in data["features"]:
        props = feature["properties"]
        geometry = simplify_geometry(feature["geometry"])
        points += json.dumps(geometry["coordinates"]).count("[")
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "prov_name": props.get("prov_name"),
                    "prov_istat_code": str(props.get("prov_istat_code")).zfill(3),
                    "prov_acr": props.get("prov_acr"),
                    "reg_name": props.get("reg_name"),
                },
                "geometry": geometry,
            }
        )
    dest.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"wrote {dest.relative_to(ROOT)} ({dest.stat().st_size} bytes, features {len(features)})")


def write_centroids(source: Path, dest: Path) -> None:
    print(f"read {source}")
    data = json.loads(source.read_text(encoding="utf-8"))
    centroids = {}
    for feature in data["features"]:
        props = feature["properties"]
        code = str(props.get("com_istat_code") or "").zfill(6)
        if not code.strip("0"):
            continue
        point = geometry_centroid(feature["geometry"])
        if point:
            centroids[code] = point
    dest.write_text(json.dumps(centroids, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {dest.relative_to(ROOT)} ({len(centroids)} centroids, {dest.stat().st_size} bytes)")


def main() -> int:
    force = "--force" in sys.argv
    RAW.mkdir(parents=True, exist_ok=True)
    full = RAW / "provinces_full.geojson"
    if force or not full.exists():
        print("get provinces")
        download(PROVINCES_URL, full)
    simplify_provinces(full, RAW / "provinces.geojson")
    if force or not MUNICIPALITIES_CACHE.exists():
        print("get municipalities")
        download(MUNICIPALITIES_URL, MUNICIPALITIES_CACHE)
    write_centroids(MUNICIPALITIES_CACHE, RAW / "centroids.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
