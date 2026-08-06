#!/usr/bin/env python3
"""Baut ein pruefbares LoD2-Modell direkt im amtlichen Master-Koordinatensystem.

Anders als ``build_buildings.py`` benutzt dieser Diagnosebau keinerlei globale
Hallenplan-Passung. Jedes Primitive behaelt Feature-ID, Featureklasse und
Surface-Typ im Namen. Das GLB ist ein Entwicklungsprodukt und wird wegen seiner
Groesse nicht eingecheckt; der Builder bleibt reproduzierbar im Repository.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier import gltf, lod2  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LOD2 = ROOT / "data/raw/lod2"
ORIGIN = ROOT / "data/build/world-origin.json"
DEFAULT_OUT = ROOT / "data/build/official-world-diagnostic.glb"
DEFAULT_REPORT = ROOT / "data/build/official-world-diagnostic.json"
BOUNDS = (357700.0, 5645200.0, 358900.0, 5646500.0)
COLOURS = {
    "ground": (0.25, 0.72, 0.42, 1.0),
    "wall": (0.58, 0.66, 0.76, 1.0),
    "roof": (0.82, 0.52, 0.24, 1.0),
    "closure": (0.78, 0.34, 0.62, 1.0),
}


def to_scene(point: lod2.Point3, origin: tuple[float, float, float]):
    """Verbindliche UTM/NHN-Transformation nach Three.js."""
    x, y, z = point
    return (x - origin[0], z - origin[2], -(y - origin[1]))


def build(output: Path, bounds=BOUNDS, report: Path | None = None) -> dict:
    origin_data = json.loads(ORIGIN.read_text(encoding="utf-8"))
    origin = tuple(origin_data["origin"])
    features = []
    for source in sorted(LOD2.glob("*.gml")):
        features.extend(lod2.read_features(source, bounds))

    parts: list[gltf.Part] = []
    skipped = 0
    by_class: dict[str, int] = {}
    by_surface: dict[str, int] = {}
    for feature in features:
        by_class[feature.feature_class] = by_class.get(feature.feature_class, 0) + 1
        for number, surface in enumerate(feature.surfaces):
            triangles, points = lod2.triangulate_with_points(surface.ring, surface.holes)
            if not triangles:
                skipped += 1
                continue
            part = gltf.Part(
                name=f"{feature.id}|{feature.feature_class}|{surface.kind}|{number}",
                colour=COLOURS[surface.kind],
            )
            scene = [to_scene(point, origin) for point in points]
            for a, b, c in triangles:
                part.add_triangle(scene[a], scene[b], scene[c])
            parts.append(part)
            by_surface[surface.kind] = by_surface.get(surface.kind, 0) + 1

    if not parts:
        raise RuntimeError("Keine triangulierbaren LoD2-Flaechen im Ausschnitt")
    output.parent.mkdir(parents=True, exist_ok=True)
    summary = {
        "schema": "beuteltier.official-diagnostic.v1",
        "origin": list(origin),
        "boundsWorld": list(bounds),
        "features": by_class,
        "surfaces": by_surface,
        "primitives": len(parts),
        "triangles": sum(part.triangle_count for part in parts),
        "skippedSurfaces": skipped,
        "registrationTransformApplied": False,
    }
    summary["bytes"] = gltf.write_glb(
        output,
        parts,
        generator="BEUTELTIER amtliches LoD2-Diagnosemodell",
        extras=summary,
    )
    if report is not None:
        report.parent.mkdir(parents=True, exist_ok=True)
        report.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    summary = build(args.output, report=args.report)
    print(json.dumps(summary, indent=2))
    print(f"-> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
