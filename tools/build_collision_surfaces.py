#!/usr/bin/env python3
"""Exportiert amtliche Kernflaechen fuer blockierte Hoehenabfragen.

Das Produkt liefert reale, auch geneigte Dreiecke im lokalen Szenensystem.
Es ist absichtlich *kein* Walkmesh: alle Flaechen bleiben gesperrt, bis eine
kontrollierte Außen- oder Uebergangsflaeche sie explizit freigibt.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier import lod2  # noqa: E402
from build_official_diagnostic import BOUNDS, LOD2, ORIGIN, ROOT, to_scene  # noqa: E402
from build_world_packages import REGISTRATIONS  # noqa: E402

OUTPUT = ROOT / "data/build/collision-surfaces.json"


def build() -> dict:
    origin = tuple(json.loads(ORIGIN.read_text())["origin"])
    registrations = json.loads(REGISTRATIONS.read_text())["registrations"]
    core_ids = {feature_id for item in registrations for feature_id in item["targetFeatureIds"]}
    surfaces = []
    z_values = []
    for source in sorted(LOD2.glob("*.gml")):
        for feature in lod2.read_features(source, BOUNDS):
            if feature.id not in core_ids and feature.parent_id not in core_ids:
                continue
            for surface_number, surface in enumerate(feature.surfaces):
                if surface.kind not in {"ground", "closure"}:
                    continue
                triangles, points = lod2.triangulate_with_points(surface.ring, surface.holes)
                scene = [to_scene(point, origin) for point in points]
                for triangle_number, (a, b, c) in enumerate(triangles):
                    # TypeScript-Provider erwartet [sceneX, sceneZ, sceneY/Hoehe].
                    vertices = [[scene[index][0], scene[index][2], scene[index][1]]
                                for index in (a, b, c)]
                    z_values.extend(point[2] for point in vertices)
                    surfaces.append({
                        "id": f"official:{feature.id}:{surface.kind}:{surface_number}:{triangle_number}",
                        "featureId": feature.id,
                        "featureClass": feature.feature_class,
                        "surfaceType": surface.kind,
                        "triangle": vertices,
                        "blocked": True,
                        "approval": "height-only",
                    })
    product = {
        "schema": "beuteltier.collision-surfaces.v1",
        "coordinatePlane": "sceneX/sceneZ with sceneY height",
        "origin": list(origin),
        "counts": {"triangles": len(surfaces), "approvedWalkable": 0},
        "heightRange": [round(min(z_values), 3), round(max(z_values), 3)] if z_values else None,
        "policy": {
            "unknownBlocked": True,
            "rawLod2Walkable": False,
            "heightQueryAllowed": True,
        },
        "surfaces": surfaces,
    }
    OUTPUT.write_text(json.dumps(product, indent=2) + "\n")
    return product


def main() -> int:
    product = build()
    print(f"{product['counts']['triangles']} blockierte Hoehendreiecke, "
          f"Z={product['heightRange']} -> {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
