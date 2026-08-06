#!/usr/bin/env python3
"""Inventarisiert die lokalen LoD2-Kacheln, ohne Geometrie zu verwerfen.

Dieser bewusst kleine Bauschritt ist das Gate vor dem Umbau des Weltmodells:
Er zaehlt CityGML-Features, semantische Flaechen und Polygone direkt aus der
Quelle. Rendering-Entscheidungen gehoeren ausdruecklich nicht hierher.
"""
from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "raw" / "lod2"
OUTPUT = ROOT / "data" / "build" / "lod2-inventory.json"

GML = "http://www.opengis.net/gml"
SURFACE_TYPES = {
    "RoofSurface", "WallSurface", "GroundSurface", "ClosureSurface",
    "OuterCeilingSurface", "OuterFloorSurface",
}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def inventory_file(path: Path) -> dict:
    features: Counter[str] = Counter()
    surfaces: Counter[str] = Counter()
    polygons_by_surface: Counter[str] = Counter()
    feature_ids: set[str] = set()
    active_surfaces: list[str] = []
    stack: list[str] = []

    for event, element in ET.iterparse(path, events=("start", "end")):
        name = local_name(element.tag)
        if event == "start":
            parent = stack[-1] if stack else None
            # Features werden ueber ihre Position im CityModel erkannt, nicht
            # ueber eine Positivliste. Neue CityGML-Klassen bleiben so sichtbar.
            if parent == "cityObjectMember":
                features[name] += 1
                feature_id = element.get(f"{{{GML}}}id")
                if feature_id:
                    feature_ids.add(feature_id)
            # Semantische Begrenzungsflaechen liegen direkt unter boundedBy.
            if parent == "boundedBy" and name.endswith("Surface"):
                active_surfaces.append(name)
            stack.append(name)
            continue

        parent = stack[-2] if len(stack) > 1 else None
        if name == "BuildingPart" and parent != "cityObjectMember":
            # BuildingPart liegt nicht direkt in cityObjectMember, ist aber
            # ein eigenstaendiges Feature mit eigener ID und Geometrie.
            features[name] += 1
            feature_id = element.get(f"{{{GML}}}id")
            if feature_id:
                feature_ids.add(feature_id)
        if parent == "boundedBy" and name.endswith("Surface"):
            surfaces[name] += 1
            active_surfaces.pop()
        if name == "Polygon" and active_surfaces:
            polygons_by_surface[active_surfaces[-1]] += 1
        stack.pop()
        element.clear()

    return {
        "file": path.name,
        "features": dict(sorted(features.items())),
        "featureIds": len(feature_ids),
        "surfaces": dict(sorted(surfaces.items())),
        "polygonsBySurface": dict(sorted(polygons_by_surface.items())),
    }


def build_inventory(paths: list[Path]) -> dict:
    files = [inventory_file(path) for path in paths]
    features: Counter[str] = Counter()
    surfaces: Counter[str] = Counter()
    polygons: Counter[str] = Counter()
    for item in files:
        features.update(item["features"])
        surfaces.update(item["surfaces"])
        polygons.update(item["polygonsBySurface"])

    return {
        "schema": "beuteltier.lod2-inventory.v1",
        "sourceCrs": "ETRS89/UTM32 + DHHN2016 NH",
        "files": files,
        "totals": {
            "features": dict(sorted(features.items())),
            "surfaces": dict(sorted(surfaces.items())),
            "polygonsBySurface": dict(sorted(polygons.items())),
        },
        "renderCoverage": {
            "currentlyGroupedAsBuilding": ["Building", "BuildingPart"],
            "surfaceTypesRead": sorted(SURFACE_TYPES & {
                "RoofSurface", "WallSurface", "GroundSurface", "ClosureSurface"
            }),
            "notYetRendered": sorted((set(features) - {"Building", "BuildingPart"}) |
                                     (set(surfaces) - {"RoofSurface", "WallSurface",
                                                       "GroundSurface", "ClosureSurface"})),
        },
    }


def main() -> int:
    paths = sorted(SOURCE.glob("*.gml"))
    if not paths:
        raise SystemExit(f"Keine GML-Dateien in {SOURCE.relative_to(ROOT)}")
    result = build_inventory(paths)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    totals = result["totals"]
    print(f"{len(paths)} Kacheln: {sum(totals['features'].values())} Features, "
          f"{sum(totals['surfaces'].values())} Flaechen")
    print(f"Inventar: {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
