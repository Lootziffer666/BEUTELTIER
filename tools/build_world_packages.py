#!/usr/bin/env python3
"""Teilt die amtliche LoD2-Geometrie in lokale Render-/Kollisionspakete.

Der Messekern wird ausschließlich über die bereits zugeordneten amtlichen
Feature-IDs bestimmt. Nicht zugeordnete Objekte werden relativ zum amtlichen
Szenenursprung in vier Umgebungspakete sortiert. Es werden keine Hallen oder
Portale erfunden und keine Hallenplan-Transformationen angewendet.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier import gltf, lod2  # noqa: E402
from build_official_diagnostic import BOUNDS, COLOURS, LOD2, ORIGIN, ROOT, to_scene  # noqa: E402

REGISTRATIONS = ROOT / "data/build/hall-registrations.json"
DEFAULT_OUTPUT = ROOT / "data/build/world-packages"
DEFAULT_REPORT = ROOT / "data/build/world-packages.json"


def surroundings_zone(feature: lod2.Building, origin: tuple[float, float, float]) -> str:
    points = [point for surface in feature.surfaces for point in surface.ring]
    if not points:
        return "unclassified"
    x = sum(point[0] for point in points) / len(points) - origin[0]
    z = -(sum(point[1] for point in points) / len(points) - origin[1])
    if abs(x) >= abs(z):
        return "east" if x >= 0 else "west"
    return "south" if z >= 0 else "north"


def surface_part(feature: lod2.Building, surface: lod2.Surface, number: int,
                 origin: tuple[float, float, float]) -> gltf.Part | None:
    triangles, points = lod2.triangulate_with_points(surface.ring, surface.holes)
    if not triangles:
        return None
    part = gltf.Part(
        name=f"{feature.id}|{feature.feature_class}|{surface.kind}|{number}",
        colour=COLOURS[surface.kind],
    )
    scene = [to_scene(point, origin) for point in points]
    for a, b, c in triangles:
        part.add_triangle(scene[a], scene[b], scene[c])
    return part


def build(output: Path, report_path: Path, bounds=BOUNDS) -> dict:
    origin = tuple(json.loads(ORIGIN.read_text())["origin"])
    registrations = json.loads(REGISTRATIONS.read_text())["registrations"]
    core_ids = {feature_id for item in registrations
                for feature_id in item["targetFeatureIds"]}
    packages: dict[str, list[gltf.Part]] = defaultdict(list)
    feature_ids: dict[str, set[str]] = defaultdict(set)
    skipped = 0

    for source in sorted(LOD2.glob("*.gml")):
        for feature in lod2.read_features(source, bounds):
            core = feature.id in core_ids or feature.parent_id in core_ids
            render_package = "core/messe" if core else f"surroundings/{surroundings_zone(feature, origin)}"
            for number, surface in enumerate(feature.surfaces):
                part = surface_part(feature, surface, number, origin)
                if part is None:
                    skipped += 1
                    continue
                packages[render_package].append(part)
                feature_ids[render_package].add(feature.id)
                if core and surface.kind in {"ground", "closure"}:
                    packages["collision/core"].append(part)
                    feature_ids["collision/core"].add(feature.id)

    output.mkdir(parents=True, exist_ok=True)
    package_report = []
    for package_id, parts in sorted(packages.items()):
        target = output / f"{package_id}.glb"
        target.parent.mkdir(parents=True, exist_ok=True)
        byte_count = gltf.write_glb(
            target, parts,
            generator="BEUTELTIER amtliche paketierte LoD2-Welt",
            extras={"packageId": package_id, "origin": list(origin),
                    "registrationTransformApplied": False},
        )
        package_report.append({
            "id": package_id,
            "uri": f"models/world/{package_id}.glb",
            "role": "collision" if package_id.startswith("collision/") else "render",
            "features": len(feature_ids[package_id]),
            "primitives": len(parts),
            "triangles": sum(part.triangle_count for part in parts),
            "bytes": byte_count,
        })

    report = {
        "schema": "beuteltier.world-packages.v1",
        "origin": list(origin),
        "packages": package_report,
        "coreTargetFeatureIds": sorted(core_ids),
        "skippedSurfaces": skipped,
        "distantStatus": "data-gap",
        "notes": [
            "Keine Hallenplan-Transformation auf Render- oder Kollisionsgeometrie.",
            "Collision/core enthaelt nur amtliche Ground- und ClosureSurface-Geometrie.",
            "Eine Fernkulisse wird erst mit einem groesseren amtlichen Ausschnitt erzeugt.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    report = build(args.output, args.report)
    for package in report["packages"]:
        print(f"{package['id']}: {package['features']} Features, "
              f"{package['triangles']} Dreiecke, {package['bytes'] / 1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
