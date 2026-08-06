#!/usr/bin/env python3
"""Schneidet ALKIS-Grundrisse aus und gleicht sie gegen LoD2 ab."""
from __future__ import annotations

import glob
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from beuteltier.gpkg import envelope, polygons  # noqa: E402
from build_buildings import BOUNDS, Fit, inside, lod2  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/build/footprints.json"


def main() -> int:
    paths = glob.glob(str(ROOT / "data/raw/alkis/*.gpkg"))
    if not paths:
        print("ALKIS-GPKG fehlt -- erst tools/fetch_alkis.py", file=sys.stderr)
        return 1
    buildings = json.loads((ROOT / "data/build/buildings.json").read_text())
    f = buildings["fit"]
    angle = __import__("math").radians(f["rotationDeg"])
    fit = Fit(__import__("math").cos(angle), __import__("math").sin(angle),
              *f["translation"], f["mirrored"])
    lod_rings = [record["footprint"] for record in buildings["buildings"]]
    minx, miny, maxx, maxy = BOUNDS
    db = sqlite3.connect(paths[0])
    # Die amtliche Datei fuehrt keinen RTree. Die GeoPackage-Envelope erlaubt
    # trotzdem einen billigen BBox-Test, bevor WKB dekodiert wird.
    query = 'SELECT oid, aktualit, gebnutzbez, funktion, name, geometrie FROM GebauedeBauwerk'
    records = []
    for oid, date, designation, function, name, geometry in db.execute(query):
        box = envelope(geometry)
        if box and (box[2] < minx or box[0] > maxx or box[3] < miny or box[1] > maxy):
            continue
        for ring in polygons(geometry):
            area = abs(lod2.ring_area(ring))
            if area < 2:
                continue
            local = [fit.inverse(x, y) for x, y in ring[:-1] if minx <= x <= maxx and miny <= y <= maxy]
            if len(local) < 3:
                continue
            centre = (sum(x for x, _ in local) / len(local), sum(y for _, y in local) / len(local))
            covered = any(inside(other, centre) for other in lod_rings)
            records.append({"id": oid, "updated": date, "designation": designation,
                            "function": function, "name": name, "areaSqm": round(area, 1),
                            "lod2Covered": covered,
                            "footprint": [[round(x, 2), round(y, 2)] for x, y in local]})
    payload = {"schema": "beuteltier.footprints.v1", "source": "ALKIS Grundrissdaten vereinfacht",
               "licence": "Datenlizenz Deutschland Zero 2.0", "count": len(records),
               "gapsWithoutLod2": sum(not r["lod2Covered"] for r in records), "footprints": records}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(records)} ALKIS-Grundrisse, {payload['gapsWithoutLod2']} LoD2-Luecken -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
