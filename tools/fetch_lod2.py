#!/usr/bin/env python3
"""Holt das amtliche 3D-Gebaeudemodell LoD2 fuer das Messegelaende.

Geobasis NRW veroeffentlicht ganz Nordrhein-Westfalen als CityGML in
1-km-Kacheln. Der vereinbarte 7-x-3-km-Ausschnitt braucht 21 davon. Darin
stehen **echte Gebaeudegrundrisse mit Hoehen**, amtlich gemessen, statt aus
Standflaechen abgeleitet und aus Annahmen gerechnet.

Der Abruf ist ein Bauschritt, kein Laufzeitverhalten. Die grossen GML-Dateien
bleiben als reproduzierbarer lokaler Build-Cache aus normalen Code-PRs;
Fetcher, Quellenmetadaten und abgeleitete Laufzeitpakete gehoeren ins Repo.

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
sys.path.insert(0, str(ROOT / "tools"))

from beuteltier.world_extent import WORLD_BOUNDS, kilometre_tiles

BASE = "https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/lod2_gml/"

# Dieselbe nachpruefbare Kachelgrenze wie DOP und DGM. Der Mittwoch-Build
# darf die weitere LoD2-Welt weiterhin aus Performancegruenden begrenzen;
# der Quellenabruf selbst behauptet aber nicht mehr, vier Kacheln seien die
# vereinbarte Aussenwelt.
TILES = tuple(
    f"LoD2_32_{x}_{y}_1_NW.gml"
    for x, y in kilometre_tiles()
)

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
        "extent": list(WORLD_BOUNDS),
        "tiles": list(TILES),
        "note": ("Offene Geobasisdaten. Frei nutzbar, auch kommerziell, ohne "
                 "Bedingungen. Die Quelle wird trotzdem genannt -- Leitprinzip 1."),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n{total / 1e6:.1f} MB in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
