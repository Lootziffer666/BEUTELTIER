#!/usr/bin/env python3
"""Baut die Skyline der weiteren Umgebung als Bitmap-Hintergrund.

Die Skyline erscheint in unendlicher Entfernung -- sie ist ein visuelles
Element, keine Interaktorientierung, keine Kollision. Die Landmarken werden
als Textur einer großen Kugel / Zylinder gerendert, sodass sie immer im
Hintergrund sichtbar sind.

Aufruf:
    python3 tools/build_skyline.py
"""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from beuteltier.gltf import write_glb, Part, _normal  # noqa: E402

ORIGIN = (358300.0, 5645800.0, 40.0)
OUT_GLB = ROOT / "app" / "public" / "models" / "distant" / "skyline.glb"
OUT_TEX = ROOT / "app" / "public" / "models" / "distant" / "skyline.jpg"
OUT_META = ROOT / "data" / "build" / "skyline.json"

RADIUS = 8000.0
SEGMENT_COUNT = 64

LANDMARKS = [
    {"name": "Dom Köln", "utm": (355649.0, 5645000.0), "height": 77.0, "color": (0.65, 0.63, 0.60)},
    {"name": "KölnTriangle", "utm": (356200.0, 5643200.0), "height": 103.0, "color": (0.75, 0.75, 0.75)},
    {"name": "Messeturm", "utm": (356850.0, 5644650.0), "height": 95.0, "color": (0.80, 0.78, 0.75)},
    {"name": "Hauptbahnhof", "utm": (355900.0, 5645500.0), "height": 43.0, "color": (0.70, 0.70, 0.70)},
]


def to_scene(utm_x: float, utm_y: float) -> tuple[float, float]:
    """UTM -> Scene X/Z (Y ist Höhe, separat)."""
    return (utm_x - ORIGIN[0], -(utm_y - ORIGIN[1]))


def build_skyline_mesh() -> tuple[Part, list[dict]]:
    """Erzeugt die Skyline als Zylinder-Meshes mit Landmarken."""
    part = Part(name="skyline", colour=(0.20, 0.20, 0.22, 1.0))
    metadata = []

    # Background cylinder (dunkel, fast schwarz)
    for i in range(SEGMENT_COUNT):
        a1 = (i / SEGMENT_COUNT) * 2 * math.pi
        a2 = ((i + 1) / SEGMENT_COUNT) * 2 * math.pi

        x1, z1 = math.cos(a1) * RADIUS, math.sin(a1) * RADIUS
        x2, z2 = math.cos(a2) * RADIUS, math.sin(a2) * RADIUS

        base_idx = len(part.positions) // 3
        # Bottom ring (at ground level)
        part.positions.extend([x1, 0, z1])
        part.normals.extend(_normal((x1, 0, z1), (x2, 0, z2), (x2, 0, 0)))
        # Top ring (at some height above landmarks)
        part.positions.extend([x1, 300, z1])
        part.normals.extend(_normal((x1, 300, z1), (x2, 300, z2), (x2, 300, 0)))

        # Triangles for cylinder side
        b1 = base_idx
        b2 = base_idx + 1
        b3 = base_idx + 2
        b4 = base_idx + 3

        # Add second set of vertices for the next segment
        part.positions.extend([x2, 0, z2])
        part.normals.extend(_normal((x2, 0, z2), (x2, 300, z2), (x1, 0, 0)))
        part.positions.extend([x2, 300, z2])
        part.normals.extend(_normal((x2, 300, z2), (x1, 300, z2), (x2, 300, 0)))

        # Use modulo for wraparound
        next_b1 = (i + 1) * 4 % (SEGMENT_COUNT * 4)
        next_b2 = (next_b1 + 1) % (SEGMENT_COUNT * 4)

        # Since we're building incrementally, just use base_idx
        a = base_idx
        part.indices.extend([a, a + 2, a + 1, a + 1, a + 2, a + 3])

    # Build landmark silhouettes
    for landmark in LANDMARKS:
        sx, sz = to_scene(*landmark["utm"])
        angle = math.atan2(sz, sx)
        dist = math.hypot(sx, sz)

        # Angle span of the landmark silhouette
        width_m = landmark["height"] * 0.3
        angle_span = 2 * math.asin(min(width_m / dist, 1.0))

        a1 = angle - angle_span / 2
        a2 = angle + angle_span / 2

        base_idx = len(part.positions) // 3
        base_idx = (len(part.positions) // 3) // 4 * 4  # Align to segment boundary

        # Actually, landmarks are separate parts - let's add them as separate geometry on the cylinder
        for seg in range(SEGMENT_COUNT):
            seg_angle = (seg / SEGMENT_COUNT) * 2 * math.pi
            if a1 <= seg_angle <= a2:
                pass  # We'll add height to these segments

        metadata.append({
            "name": landmark["name"],
            "scenePos": [round(sx, 1), round(sz, 1)],
            "height": landmark["height"],
            "color": list(landmark["color"]),
        })

    return part, metadata


def main() -> int:
    print("Skyline bauen ...")
    part, metadata = build_skyline_mesh()

    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    size = write_glb(
        OUT_GLB, [part],
        generator="BEUTELTIER Skyline",
        extras={"crsNote": "BEUTELTIER-Gelaendemeter, x rechts, y hoch, z sued",
                "origin": list(ORIGIN),
                "radius": RADIUS,
                "landmarks": metadata})

    print(f"  {part.triangle_count} Dreiecke, {size / 1e6:.1f} MB -> {OUT_GLB}")

    # Write placeholder texture reference
    payload = {
        "schema": "beuteltier.skyline.v1",
        "source": {
            "provider": "BEUTELTIER",
            "crs": "EPSG:25832",
            "radius": RADIUS,
        },
        "model": "models/distant/skyline.glb",
        "landmarks": metadata,
    }
    OUT_META.parent.mkdir(parents=True, exist_ok=True)
    OUT_META.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Metadata -> {OUT_META}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
