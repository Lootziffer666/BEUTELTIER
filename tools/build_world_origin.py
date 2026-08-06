#!/usr/bin/env python3
"""Schreibt die verbindliche Abbildung von amtlichen in Szenenkoordinaten.

Der Ursprung ist ein reiner numerischer Offset nahe dem Messekern. Seine
Z-Komponente ist insbesondere **keine** angenommene Bodenhoehe. Ein fester,
gerundeter Ursprung verhindert, dass sich alle lokalen Koordinaten durch neu
hinzukommende LoD2-Kacheln verschieben.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data" / "build" / "world-origin.json"

ORIGIN = (358_300.0, 5_645_800.0, 40.0)


def world_to_scene(point: tuple[float, float, float]) -> tuple[float, float, float]:
    """ETRS89/UTM32 + NHN nach Three.js (X rechts, Y oben, Z nach Sueden)."""
    x, y, z = point
    ox, oy, oz = ORIGIN
    return x - ox, z - oz, -(y - oy)


def scene_to_world(point: tuple[float, float, float]) -> tuple[float, float, float]:
    """Inverse Abbildung fuer Diagnose, Picking und spaetere Registrierungen."""
    x, y, z = point
    ox, oy, oz = ORIGIN
    return x + ox, oy - z, y + oz


def build_product() -> dict:
    return {
        "schema": "beuteltier.world-origin.v1",
        "sourceCrs": "EPSG:25832 + DHHN2016 NH",
        "axisConvention": {
            "sceneX": "worldX - originX",
            "sceneY": "worldZ - originZ",
            "sceneZ": "-(worldY - originY)",
            "units": "metre",
            "handedness": "right",
        },
        "origin": list(ORIGIN),
        "selection": {
            "method": "fixed-rounded-point-near-koelnmesse-core",
            "note": ("Numerischer Offset, keine Bodenhoehe. Darf bei weiteren "
                     "Kacheln nicht automatisch neu zentriert werden."),
        },
    }


def main() -> int:
    product = build_product()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(product, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    diagonal = math.dist(ORIGIN, scene_to_world(world_to_scene(ORIGIN)))
    if diagonal > 1e-9:
        raise RuntimeError("Welttransformation ist nicht verlustfrei invertierbar")
    print(f"Weltursprung: {OUTPUT.relative_to(ROOT)} {list(ORIGIN)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
