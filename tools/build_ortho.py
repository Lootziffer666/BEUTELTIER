#!/usr/bin/env python3
"""Macht aus den Orthophotos eine registrierte Textur der Aussenwelt.

Die Luftbilder stehen bereits im amtlichen UTM32-System. Der aktive
BEUTELTIER-Weltraum benutzt dasselbe System relativ zu ``world-origin.json``.
Darum wird das Bild nicht mehr in den gedrehten historischen Hallenplan
zurueckgerechnet: Es bleibt nordgerichtet und bekommt vier belegte Szenenecken.

Ein Senkrechtluftbild zeigt Boden und Daecher. Waende zeigt es nicht; die
bleiben prozedural und sind in der App als solche gekennzeichnet.

Aufruf:
    python3 tools/build_ortho.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from beuteltier.world_extent import (  # noqa: E402
    DOP_VINTAGE,
    WORLD_BOUNDS,
    kilometre_tiles,
)

DOP_DIR = ROOT / "data" / "raw" / "dop"
WORLD_ORIGIN = ROOT / "data" / "build" / "world-origin.json"
OUT_IMAGE = ROOT / "app" / "public" / "models" / "gelaende.jpg"
OUT_META = ROOT / "data" / "build" / "ortho.json"

# Die Kacheln sind 1 km gross und mit 10 cm aufgeloest.
TILE_M = 1000.0
NATIVE_RES_M = 0.1
# Beim Dekodieren wird geviertelt: 40 cm je Bildpunkt reichen fuer eine
# Bodentextur und passen in den Speicher. Voll aufgeloest waeren die 21
# Kacheln zusammen 2,1 Gigapixel.
DECODE_REDUCE = 2

# 8192 Pixel sind auf gaengigen mobilen GPUs noch eine einzelne Textur. Das
# Seitenverhaeltnis bleibt metrisch: 7 km × 3 km werden nicht quadratisch
# gestreckt. Die resultierenden rund 85 cm/Pixel sind fuer den weiten Kontext
# ehrlich benannt; die 10-cm-Quelle wird nicht als 10-cm-Webtextur ausgegeben.
OUT_WIDTH = 8192
JPEG_QUALITY = 82

Image.MAX_IMAGE_PIXELS = None


def tile_origin(name: str) -> tuple[float, float]:
    """"dop10rgbi_32_358_5645_1_nw_2025.jp2" -> (358000, 5645000)."""
    parts = name.split("_")
    return (float(parts[2]) * 1000.0, float(parts[3]) * 1000.0)


def load_mosaic() -> tuple[Image.Image, tuple[float, float], float]:
    """Setzt die Kacheln zu einem Bild zusammen. Gibt Bild, Ursprung, Aufloesung."""
    names = tuple(
        f"dop10rgbi_32_{x}_{y}_1_nw_{DOP_VINTAGE}.jp2"
        for x, y in kilometre_tiles()
    )
    tiles = [DOP_DIR / name for name in names]
    missing = [path.name for path in tiles if not path.exists() or path.stat().st_size == 0]
    if missing:
        raise FileNotFoundError(
            f"{len(missing)} Orthofoto-Kacheln fehlen: {', '.join(missing[:4])}"
        )

    origins = [tile_origin(path.name) for path in tiles]
    min_x = min(origin[0] for origin in origins)
    min_y = min(origin[1] for origin in origins)
    max_x = max(origin[0] for origin in origins) + TILE_M
    max_y = max(origin[1] for origin in origins) + TILE_M

    resolution = NATIVE_RES_M * (2 ** DECODE_REDUCE)
    width = int(round((max_x - min_x) / resolution))
    height = int(round((max_y - min_y) / resolution))
    mosaic = Image.new("RGB", (width, height), (18, 20, 26))

    for path, (ox, oy) in zip(tiles, origins):
        image = Image.open(path)
        image.reduce = DECODE_REDUCE  # JPEG2000 dekodiert direkt kleiner
        image.load()
        # Die Kacheln sind RGBI -- der vierte Kanal ist Infrarot, nicht Alpha.
        patch = image.convert("RGB")
        left = int(round((ox - min_x) / resolution))
        top = int(round((max_y - (oy + TILE_M)) / resolution))
        mosaic.paste(patch, (left, top))
        print(f"  {path.name}: {patch.size[0]}x{patch.size[1]} eingesetzt")

    return mosaic, (min_x, max_y), resolution


def main() -> int:
    if not WORLD_ORIGIN.exists():
        print("world-origin.json fehlt -- erst tools/build_world_origin.py",
              file=sys.stderr)
        return 1

    print("Orthophotos zusammensetzen ...")
    mosaic, (mosaic_x, mosaic_y), resolution = load_mosaic()
    min_x, min_y, max_x, max_y = WORLD_BOUNDS
    source_bounds = (
        mosaic_x,
        mosaic_y - mosaic.height * resolution,
        mosaic_x + mosaic.width * resolution,
        mosaic_y,
    )
    if any(abs(one - two) > resolution for one, two in zip(source_bounds, WORLD_BOUNDS)):
        raise ValueError(
            f"Orthofoto-Mosaik {source_bounds} deckt Weltausschnitt {WORLD_BOUNDS} nicht exakt"
        )

    width_m = max_x - min_x
    height_m = max_y - min_y
    out_height = round(OUT_WIDTH * height_m / width_m)
    print(f"  verkleinern auf {OUT_WIDTH}x{out_height} "
          f"({width_m:.0f}x{height_m:.0f} m, "
          f"{100 * width_m / OUT_WIDTH:.0f} cm je Bildpunkt) ...")
    warped = mosaic.resize((OUT_WIDTH, out_height), Image.Resampling.LANCZOS)

    OUT_IMAGE.parent.mkdir(parents=True, exist_ok=True)
    warped.save(OUT_IMAGE, "JPEG", quality=JPEG_QUALITY, optimize=True,
                progressive=True)

    world_origin = json.loads(WORLD_ORIGIN.read_text(encoding="utf-8"))["origin"]
    west = min_x - world_origin[0]
    east = max_x - world_origin[0]
    south = -(min_y - world_origin[1])
    north = -(max_y - world_origin[1])
    corners = [[west, south], [east, south], [west, north], [east, north]]
    meta = {
        "schema": "beuteltier.ortho.v1",
        "source": {
            "title": "Digitale Orthophotos, 10 cm",
            "provider": "Geobasis NRW",
            "licence": "Datenlizenz Deutschland Zero 2.0",
            "vintage": DOP_VINTAGE,
            "extent": list(WORLD_BOUNDS),
            "tiles": len(kilometre_tiles()),
        },
        "image": OUT_IMAGE.name,
        "coordinatePlane": "sceneX/sceneZ",
        "extent": [round(west, 2), round(north, 2), round(east, 2), round(south, 2)],
        "corners": corners,
        "sizePx": [OUT_WIDTH, out_height],
        "metresPerPixel": round(max(width_m / OUT_WIDTH, height_m / out_height), 3),
        "note": ("Nordgerichtetes Senkrechtluftbild auf belegten amtlichen "
                 "Szenenecken. Zeigt Boden und Daecher, keine Waende."),
    }
    OUT_META.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")

    size_mb = OUT_IMAGE.stat().st_size / 1e6
    print(f"\n{OUT_WIDTH}x{out_height}, {size_mb:.1f} MB -> {OUT_IMAGE}")
    print(f"UTM-Ausdehnung {WORLD_BOUNDS} -> {OUT_META}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
