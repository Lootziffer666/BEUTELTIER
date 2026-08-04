#!/usr/bin/env python3
"""Holt das amtliche 3D-Gebaeudemodell LoD2 fuer das Messegelaende.

Geobasis NRW veroeffentlicht ganz Nordrhein-Westfalen als CityGML in
1-km-Kacheln. Vier davon decken die Koelnmesse ab. Darin steht, was BEUTELTIER
bisher an keiner Stelle hatte: **echte Gebaeudegrundrisse mit Hoehen**, amtlich
gemessen, statt aus Standflaechen abgeleitet und aus Annahmen gerechnet.

Der Abruf ist ein Bauschritt, kein Laufzeitverhalten. Was hier landet, wird
eingecheckt und danach offline gelesen -- wie alle anderen Quellen auch.

Aufruf:
    python3 tools/fetch_lod2.py
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "raw" / "lod2"

BASE = "https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/"

# Die vier 1-km-Kacheln in ETRS89/UTM32, die das Messegelaende ueberdecken.
# Die Koelnmesse liegt bei E 357.800..358.800, N 5.645.300..5.646.400.
TILES = ("LoD2_32_357_5645_1_NW.gml", "LoD2_32_357_5646_1_NW.gml",
         "LoD2_32_358_5645_1_NW.gml", "LoD2_32_358_5646_1_NW.gml")

USER_AGENT = "BEUTELTIER/1.0 (gamescom-Begleitapp; Datenaufbereitung)"


def fetch(name: str) -> int:
    target = OUT_DIR / name
    if target.exists() and target.stat().st_size > 0:
        print(f"  {name}: schon da ({target.stat().st_size / 1e6:.1f} MB)")
        return target.stat().st_size

    request = urllib.request.Request(BASE + name, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = response.read()
    target.write_bytes(payload)
    print(f"  {name}: {len(payload) / 1e6:.1f} MB geladen")
    return len(payload)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("3D-Gebaeudemodell LoD2 (Geobasis NRW) ...")
    total = 0
    for name in TILES:
        try:
            total += fetch(name)
        except Exception as error:  # noqa: BLE001 -- Abruf soll nicht hart brechen
            print(f"  ! {name}: {error}", file=sys.stderr)
            return 1

    (OUT_DIR / "QUELLE.json").write_text(json.dumps({
        "title": "3D-Gebaeudemodell LoD2 (CityGML), Einzelkacheln",
        "provider": "Geobasis NRW / Bezirksregierung Koeln",
        "portal": "https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/",
        "viewer": "https://dz.nrw.de -- Digitaler Zwilling NRW",
        "crs": "ETRS89 / UTM32N (EPSG:25832), Hoehen DHHN2016 NH",
        "licence": "Datenlizenz Deutschland Zero 2.0 (dl-de/zero-2-0)",
        "tiles": list(TILES),
        "note": ("Offene Geobasisdaten. Frei nutzbar, auch kommerziell, ohne "
                 "Bedingungen. Die Quelle wird trotzdem genannt -- Leitprinzip 1."),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n{total / 1e6:.1f} MB in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
