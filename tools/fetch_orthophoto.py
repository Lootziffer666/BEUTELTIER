#!/usr/bin/env python3
"""Holt die amtlichen Orthophotos des Messegelaendes.

Der Nutzer fragte, warum die Texturen fehlen, wenn die Daten doch schon
abgegriffen werden. Berechtigt -- und die Antwort ist zweigeteilt:

* Das **texturierte 3D-Mesh** von Geobasis NRW gibt es, es ist genau das,
  was der Digitale Zwilling zeigt. Es wird aber in Teilgebieten von 26 bis
  147 **Gigabyte** ausgeliefert, ohne Einzelkacheln. Das ist fuer eine App,
  die offline auf einem Messegelaende laufen soll, keine Option.
* Die **Orthophotos** gibt es kachelweise: 10 cm Bodenaufloesung, vier
  Quadratkilometer decken das Gelaende ab, rund 20 MB je Kachel. Das ist
  ein echtes Luftbild des Messegelaendes -- Boden und Daecher, fotografiert,
  nicht erfunden.

Waende zeigt ein Senkrechtluftbild nicht. Die bleiben prozedural, und das
steht auch dran.

Aufruf:
    python3 tools/fetch_orthophoto.py
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "raw" / "dop"

BASE = ("https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/"
        "dop_jp2_f10/")

# Dieselben vier 1-km-Kacheln wie beim Gebaeudemodell, damit sich Bild und
# Geometrie ohne Umrechnung decken.
TILES = ("dop10rgbi_32_357_5645_1_nw_2025.jp2",
         "dop10rgbi_32_357_5646_1_nw_2025.jp2",
         "dop10rgbi_32_358_5645_1_nw_2025.jp2",
         "dop10rgbi_32_358_5646_1_nw_2025.jp2")

USER_AGENT = "BEUTELTIER/1.0 (gamescom-Begleitapp; Datenaufbereitung)"


def fetch(name: str) -> int:
    target = OUT_DIR / name
    if target.exists() and target.stat().st_size > 0:
        print(f"  {name}: schon da ({target.stat().st_size / 1e6:.1f} MB)")
        return target.stat().st_size

    request = urllib.request.Request(BASE + name, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=600) as response:
        payload = response.read()
    target.write_bytes(payload)
    print(f"  {name}: {len(payload) / 1e6:.1f} MB geladen")
    return len(payload)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Digitale Orthophotos (Geobasis NRW) ...")
    total = 0
    for name in TILES:
        try:
            total += fetch(name)
        except Exception as error:  # noqa: BLE001 -- Abruf soll nicht hart brechen
            print(f"  ! {name}: {error}", file=sys.stderr)
            return 1

    (OUT_DIR / "QUELLE.json").write_text(json.dumps({
        "title": "Digitale Orthophotos (JPEG2000, 10-fache Kompression)",
        "provider": "Geobasis NRW",
        "portal": BASE,
        "resolutionM": 0.1,
        "crs": "ETRS89 / UTM32N (EPSG:25832)",
        "vintage": "2025",
        "licence": "Datenlizenz Deutschland Zero 2.0 (dl-de/zero-2-0)",
        "tiles": list(TILES),
        "note": ("Senkrechtluftbild. Zeigt Boden und Daecher, keine Waende -- "
                 "die bleiben prozedural und sind als solche gekennzeichnet."),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n{total / 1e6:.1f} MB in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
