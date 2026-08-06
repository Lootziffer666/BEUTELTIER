#!/usr/bin/env python3
"""Klassifiziert amtliche Features fuer Sichtbarkeit, Material und Kollision.

Dies ist eine reproduzierbare erste Sichtanalyse ohne Reality-Mesh und ohne
verdeckungsberechnendes Raycasting. Sie arbeitet ausschliesslich in amtlichen
Koordinaten, weist ihre Grenzen maschinenlesbar aus und gibt weder GroundSurface
noch Orthofoto automatisch als begehbar frei.
"""
from __future__ import annotations

import json
import math
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier import lod2  # noqa: E402
from build_official_diagnostic import BOUNDS, LOD2, ORIGIN, ROOT, to_scene  # noqa: E402
from build_world_packages import REGISTRATIONS, material_class_for, surroundings_zone  # noqa: E402

VISIBILITY_OUT = ROOT / "data/build/visibility-analysis.json"
CLASSIFICATION_OUT = ROOT / "data/build/surface-classification.json"


def centroid(surface: lod2.Surface, origin) -> tuple[float, float, float]:
    points = [to_scene(point, origin) for point in surface.ring]
    return tuple(sum(point[axis] for point in points) / len(points) for axis in range(3))


def build() -> tuple[dict, dict]:
    origin = tuple(json.loads(ORIGIN.read_text())["origin"])
    registrations = json.loads(REGISTRATIONS.read_text())["registrations"]
    target_ids = {feature_id for item in registrations
                  for feature_id in item["targetFeatureIds"]}
    features = [feature for source in sorted(LOD2.glob("*.gml"))
                for feature in lod2.read_features(source, BOUNDS)]
    core_features = [feature for feature in features
                     if feature.id in target_ids or feature.parent_id in target_ids]

    # Amtliche Kernfeature-Zentren sind ehrliche vorlaeufige Sichtproben. Die
    # semantischen Piazza-/Boulevard-Proben bleiben bis zur Vermessung offen.
    samples = []
    for feature in core_features:
        points = [to_scene(point, origin) for surface in feature.surfaces for point in surface.ring]
        if points:
            samples.append((sum(p[0] for p in points) / len(points), 1.7,
                            sum(p[2] for p in points) / len(points)))
    samples.append((0.0, 250.0, 0.0))  # Uebersichtskamera ueber dem Ursprung

    visibility_entries = []
    classification_entries = []
    visibility_counts: Counter[str] = Counter()
    zone_counts: Counter[str] = Counter()
    material_counts: Counter[str] = Counter()
    for feature in features:
        core = feature.id in target_ids or feature.parent_id in target_ids
        zone = "A-core" if core else f"B-{surroundings_zone(feature, origin)}"
        distances = [math.dist(centroid(surface, origin), sample)
                     for surface in feature.surfaces for sample in samples]
        nearest = min(distances, default=None)
        if core or (nearest is not None and nearest <= 120):
            visibility = "critical"
        elif nearest is not None and nearest <= 350:
            visibility = "secondary"
        else:
            visibility = "hidden"
        surface_counts = Counter(surface.kind for surface in feature.surfaces)
        materials = {kind: material_class_for(kind, core, feature.function)
                     for kind in surface_counts}
        visibility_counts[visibility] += 1
        zone_counts[zone] += 1
        for kind, count in surface_counts.items():
            material_counts[materials[kind]] += count
        visibility_entries.append({
            "featureId": feature.id,
            "featureClass": feature.feature_class,
            "zone": zone,
            "visibility": visibility,
            "nearestSampleM": round(nearest, 2) if nearest is not None else None,
        })
        classification_entries.append({
            "featureId": feature.id,
            "featureClass": feature.feature_class,
            "function": feature.function,
            "zone": zone,
            "surfaceCounts": dict(sorted(surface_counts.items())),
            "materialBySurface": materials,
            "walkable": False,
            "collision": ("candidate" if core and
                          any(kind in surface_counts for kind in ("ground", "closure"))
                          else "none"),
            "status": "draft",
        })

    visibility_product = {
        "schema": "beuteltier.visibility-analysis.v1",
        "method": "official-feature-centroid-distance-v1",
        "occlusionTested": False,
        "samples": {"coreFeatureCentres": len(samples) - 1, "overview": 1},
        "missingSemanticSamples": ["piazza", "boulevard", "entrances", "outdoor-paths"],
        "thresholdsM": {"critical": 120, "secondary": 350},
        "counts": dict(visibility_counts),
        "features": visibility_entries,
        "status": "draft",
    }
    classification_product = {
        "schema": "beuteltier.surface-classification.v1",
        "granularity": "feature-with-semantic-surface-counts",
        "zoneCounts": dict(zone_counts),
        "materialAssignments": dict(material_counts),
        "policy": {
            "groundSurfaceWalkableByDefault": False,
            "orthophotoWalkable": False,
            "collisionCandidateIsWalkable": False,
        },
        "features": classification_entries,
        "status": "draft",
    }
    VISIBILITY_OUT.write_text(json.dumps(visibility_product, indent=2) + "\n")
    CLASSIFICATION_OUT.write_text(json.dumps(classification_product, indent=2) + "\n")
    return visibility_product, classification_product


def main() -> int:
    visibility, classification = build()
    print(f"Sichtbarkeit: {visibility['counts']}")
    print(f"Zonen: {classification['zoneCounts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
