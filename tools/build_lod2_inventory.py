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
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "raw" / "lod2"
OUTPUT = ROOT / "data" / "build" / "lod2-inventory.json"

GML = "http://www.opengis.net/gml"
SURFACE_TYPES = {
    "RoofSurface", "WallSurface", "GroundSurface", "ClosureSurface",
    "OuterCeilingSurface", "OuterFloorSurface",
}


@dataclass
class FeatureDiagnostic:
    feature_class: str
    feature_id: str | None
    function: str | None = None
    surfaces: Counter[str] = field(default_factory=Counter)
    polygons: int = 0
    triangles: int = 0
    z_min: float | None = None
    z_max: float | None = None
    degenerate_rings: int = 0

    def add_positions(self, text: str | None) -> None:
        values = (text or "").split()
        if len(values) < 3 or len(values) % 3:
            self.degenerate_rings += 1
            return
        try:
            coordinates = [float(value) for value in values]
        except ValueError:
            self.degenerate_rings += 1
            return
        zs = coordinates[2::3]
        self.z_min = min(zs) if self.z_min is None else min(self.z_min, *zs)
        self.z_max = max(zs) if self.z_max is None else max(self.z_max, *zs)
        points = list(zip(coordinates[0::3], coordinates[1::3], zs))
        if len(points) > 1 and points[0] == points[-1]:
            points.pop()
        unique = len(set(points))
        if unique < 3:
            self.degenerate_rings += 1
        else:
            # Obergrenze fuer einen einfachen Ring. Die eigentliche
            # Triangulierung bleibt Aufgabe des Geometrie-Builds.
            self.triangles += unique - 2

    def reasons(self) -> list[str]:
        reasons = []
        if not self.feature_id:
            reasons.append("missing-feature-id")
        if not self.surfaces:
            reasons.append("no-semantic-surfaces")
        if self.surfaces and not self.surfaces.get("GroundSurface"):
            reasons.append("no-ground-surface")
        if self.surfaces.get("ClosureSurface") and not self.surfaces.get("GroundSurface"):
            reasons.append("closure-without-ground")
        if self.degenerate_rings:
            reasons.append("degenerate-ring")
        return reasons

    def as_dict(self) -> dict:
        return {
            "featureId": self.feature_id,
            "featureClass": self.feature_class,
            "function": self.function,
            "zMin": self.z_min,
            "zMax": self.z_max,
            "surfaces": dict(sorted(self.surfaces.items())),
            "polygons": self.polygons,
            "triangleEstimate": self.triangles,
            "reasons": self.reasons(),
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
    feature_stack: list[FeatureDiagnostic] = []
    diagnostics: list[FeatureDiagnostic] = []

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
            if name in {"Building", "BuildingPart"}:
                feature_stack.append(FeatureDiagnostic(
                    feature_class=name,
                    feature_id=element.get(f"{{{GML}}}id"),
                ))
            # Semantische Begrenzungsflaechen liegen direkt unter boundedBy.
            if parent == "boundedBy" and name.endswith("Surface"):
                active_surfaces.append(name)
            stack.append(name)
            continue

        parent = stack[-2] if len(stack) > 1 else None
        current = feature_stack[-1] if feature_stack else None
        if name == "BuildingPart" and parent != "cityObjectMember":
            # BuildingPart liegt nicht direkt in cityObjectMember, ist aber
            # ein eigenstaendiges Feature mit eigener ID und Geometrie.
            features[name] += 1
            feature_id = element.get(f"{{{GML}}}id")
            if feature_id:
                feature_ids.add(feature_id)
        if parent == "boundedBy" and name.endswith("Surface"):
            surfaces[name] += 1
            if current is not None:
                current.surfaces[name] += 1
            active_surfaces.pop()
        if name == "Polygon" and active_surfaces:
            polygons_by_surface[active_surfaces[-1]] += 1
            if current is not None:
                current.polygons += 1
        if name == "posList" and current is not None:
            current.add_positions(element.text)
        if name == "function" and current is not None and element.text:
            current.function = element.text.strip()
        if name in {"Building", "BuildingPart"}:
            diagnostics.append(feature_stack.pop())
        stack.pop()
        element.clear()

    reason_counts: Counter[str] = Counter(
        reason for diagnostic in diagnostics for reason in diagnostic.reasons()
    )
    z_values = [value for item in diagnostics for value in (item.z_min, item.z_max)
                if value is not None]

    return {
        "file": path.name,
        "features": dict(sorted(features.items())),
        "featureIds": len(feature_ids),
        "surfaces": dict(sorted(surfaces.items())),
        "polygonsBySurface": dict(sorted(polygons_by_surface.items())),
        "trianglesEstimated": sum(item.triangles for item in diagnostics),
        "zRange": [min(z_values), max(z_values)] if z_values else None,
        "diagnosticReasons": dict(sorted(reason_counts.items())),
        "problemFeatures": [item.as_dict() for item in diagnostics if item.reasons()][:5],
    }


def build_inventory(paths: list[Path]) -> dict:
    files = [inventory_file(path) for path in paths]
    features: Counter[str] = Counter()
    surfaces: Counter[str] = Counter()
    polygons: Counter[str] = Counter()
    diagnostic_reasons: Counter[str] = Counter()
    for item in files:
        features.update(item["features"])
        surfaces.update(item["surfaces"])
        polygons.update(item["polygonsBySurface"])
        diagnostic_reasons.update(item["diagnosticReasons"])

    problem_features = []
    for item in files:
        for feature in item["problemFeatures"]:
            problem_features.append({"file": item["file"], **feature})
            if len(problem_features) == 5:
                break
        if len(problem_features) == 5:
            break
    # Einzeldateien behalten nur die aggregierten Diagnosezahlen. Die fuenf
    # konkreten Beispiele stehen einmal auf Produktebene statt viermal fast
    # identisch im JSON zu erscheinen.
    for item in files:
        item.pop("problemFeatures")

    return {
        "schema": "beuteltier.lod2-inventory.v1",
        "sourceCrs": "ETRS89/UTM32 + DHHN2016 NH",
        "files": files,
        "totals": {
            "features": dict(sorted(features.items())),
            "surfaces": dict(sorted(surfaces.items())),
            "polygonsBySurface": dict(sorted(polygons.items())),
            "trianglesEstimated": sum(item["trianglesEstimated"] for item in files),
            "diagnosticReasons": dict(sorted(diagnostic_reasons.items())),
        },
        "problemFeatures": problem_features,
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
