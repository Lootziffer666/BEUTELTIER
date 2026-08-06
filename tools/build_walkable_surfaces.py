#!/usr/bin/env python3
"""Schreibt die bekannten Hallen-/Eventflächen, ohne Außenraum zu erfinden."""
from __future__ import annotations

import json
from pathlib import Path

from build_hall_registrations import transform_point

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "data/build"
OUTPUT = BUILD / "walkable-surfaces.json"


def build_product(site: dict, registrations: dict) -> dict:
    by_hall = {item["hallKey"]: item for item in registrations["registrations"]}
    surfaces = []
    for hall in sorted(site["halls"], key=lambda item: item["key"]):
        registration = by_hall[hall["key"]]
        boundary = [transform_point(tuple(point), registration["transform"])
                    for point in hall["footprint"]]
        surfaces.append({
            "id": f"surface:hall:{hall['key']}",
            "hallKey": hall["key"],
            "kind": "event-outdoor" if hall["outdoor"] else "hall-level",
            "boundary": [[round(x, 3), round(z, 3)] for x, z in boundary],
            "floorZ": registration["floorZ"],
            "walkability": "walkgrid-controlled",
            "defaultBlocked": True,
            "collision": "walkgrid",
            "status": "draft" if hall["outdoor"] else registration["status"],
            "source": "event-layout" if hall["outdoor"] else registration["source"],
        })
    return {
        "schema": "beuteltier.walkable-surfaces.v1",
        "coordinatePlane": "sceneX/sceneZ",
        "surfaces": surfaces,
        "outsidePolicy": {
            "unknownBlocked": True,
            "orthophotoWalkable": False,
            "terrainWalkableByDefault": False,
            "legacyFallbackStillActive": True,
        },
        "gaps": [
            "piazza-not-surveyed",
            "boulevard-not-surveyed",
            "outdoor-transitions-not-surveyed",
        ],
    }


def main() -> int:
    site = json.loads((BUILD / "site.json").read_text(encoding="utf-8"))
    registrations = json.loads(
        (BUILD / "hall-registrations.json").read_text(encoding="utf-8")
    )
    product = build_product(site, registrations)
    OUTPUT.write_text(json.dumps(product, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    print(f"{len(product['surfaces'])} kontrollierte Flächen -> {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
