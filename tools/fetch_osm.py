#!/usr/bin/env python3
"""Holt Wege, Strassen, POIs und Eingaenge um die Koelnmesse via Overpass."""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/raw/osm"
URL = "https://overpass-api.de/api/interpreter"
BBOX = "50.932,6.965,50.954,7.005"
QUERY = f'''[out:json][timeout:120];(
way[highway]({BBOX});node[amenity]({BBOX});node[entrance]({BBOX});
node[shop]({BBOX});node[tourism]({BBOX}););out body;>;out skel qt;'''


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / "koelnmesse.json"
    request = urllib.request.Request(URL, data=urllib.parse.urlencode({"data": QUERY}).encode(),
                                     headers={"User-Agent": "BEUTELTIER/1.0"})
    with urllib.request.urlopen(request, timeout=180) as response:
        payload = json.load(response)
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT / "QUELLE.json").write_text(json.dumps({
        "title": "OpenStreetMap-Ausschnitt Koelnmesse", "provider": "OpenStreetMap-Mitwirkende",
        "url": "https://www.openstreetmap.org/copyright", "retrieval": payload.get("osm3s", {}).get("timestamp_osm_base"),
        "licence": "Open Data Commons Open Database License (ODbL) 1.0",
        "query": QUERY,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(payload['elements'])} OSM-Elemente -> {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
