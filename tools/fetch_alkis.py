#!/usr/bin/env python3
"""Holt die realen vereinfachten ALKIS-Grundrissdaten fuer Koeln."""
from __future__ import annotations

import json
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/raw/alkis"
NAME = "gru_vereinf_05315000_Köln_EPSG25832_GeoPackage.zip"
URL = "https://www.opengeodata.nrw.de/produkte/geobasis/lk/akt/gru_vereinfacht_gpkg/" + NAME


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    archive = OUT / "koeln.zip"
    if not archive.exists():
        request = urllib.request.Request(URL, headers={"User-Agent": "BEUTELTIER/1.0"})
        with urllib.request.urlopen(request, timeout=600) as response, archive.open("wb") as target:
            while chunk := response.read(1024 * 1024):
                target.write(chunk)
    with zipfile.ZipFile(archive) as source:
        member = next(name for name in source.namelist() if name.endswith(".gpkg"))
        if not (OUT / member).exists():
            source.extract(member, OUT)
    (OUT / "QUELLE.json").write_text(json.dumps({
        "title": "Grundrissdaten vereinfacht (GeoPackage), Koeln",
        "provider": "Geobasis NRW / Bezirksregierung Koeln", "url": URL,
        "crs": "ETRS89 / UTM32N (EPSG:25832)",
        "licence": "Datenlizenz Deutschland Zero 2.0 (dl-de/zero-2-0)",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
