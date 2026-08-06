#!/usr/bin/env python3
"""Schreibt mobile, metrisch parametrisierte Umgebungsmaterialien."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "data/build/material-classes.json"

MATERIALS = [
    ("glass-facade", "#638696", 0.18, 0.05, 1.5, 3.2, 0.82),
    ("hall-metal-light", "#b8bab8", 0.72, 0.18, 1.25, 3.0, 0.12),
    ("hall-metal-dark", "#555b60", 0.66, 0.24, 1.2, 3.0, 0.10),
    ("hall-raster-vertical", "#aeb1b0", 0.74, 0.16, 1.0, 4.0, 0.18),
    ("hall-raster-horizontal", "#9fa4a6", 0.70, 0.14, 4.0, 1.1, 0.20),
    ("concrete", "#aaa7a0", 0.92, 0.02, 3.0, 2.5, 0.04),
    ("brick", "#8f6758", 0.88, 0.01, 0.24, 0.075, 0.16),
    ("technical-roof", "#777d7b", 0.82, 0.12, 2.0, 2.0, 0.02),
    ("asphalt", "#454747", 0.94, 0.0, 4.0, 4.0, 0.0),
    ("paving", "#99958c", 0.90, 0.0, 0.4, 0.4, 0.0),
    ("green-space", "#65775a", 1.0, 0.0, 1.5, 1.5, 0.0),
]


def build_product() -> dict:
    return {
        "schema": "beuteltier.material-classes.v1",
        "units": "metre",
        "mobileProfile": {
            "maxTextureSize": 1024,
            "normalMaps": "critical-only",
            "roughnessMaps": "atlas",
            "shaderVariation": "vertex-or-baked",
        },
        "classes": [{
            "class": name,
            "baseColor": colour,
            "roughness": roughness,
            "metalness": metalness,
            "panelWidthM": width,
            "panelHeightM": height,
            "windowRatio": windows,
            "textureScale": "metric",
        } for name, colour, roughness, metalness, width, height, windows in MATERIALS],
    }


def main() -> int:
    OUTPUT.write_text(json.dumps(build_product(), ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    print(f"{len(MATERIALS)} Materialklassen -> {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
