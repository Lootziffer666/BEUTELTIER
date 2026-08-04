#!/usr/bin/env python3
"""Macht aus den Orthophotos eine Textur im BEUTELTIER-Koordinatensystem.

Die Luftbilder stehen in UTM32 und nordgerichtet, das Gelaendemodell steht um
31 Grad gedreht in eigenen Metern. Statt das zur Laufzeit auszugleichen -- und
damit jede Kamera und jedes Mesh mit der Drehung zu belasten -- wird das Bild
hier einmal entzerrt. Danach ist es achsparallel zum Gelaende, und die App
legt es ohne Rechnerei auf den Boden.

Ein Senkrechtluftbild zeigt Boden und Daecher. Waende zeigt es nicht; die
bleiben prozedural und sind in der App als solche gekennzeichnet.

Aufruf:
    python3 tools/build_ortho.py
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DOP_DIR = ROOT / "data" / "raw" / "dop"
BUILDINGS = ROOT / "data" / "build" / "buildings.json"
SITE = ROOT / "data" / "build" / "site.json"
OUT_IMAGE = ROOT / "app" / "public" / "models" / "gelaende.jpg"
OUT_META = ROOT / "data" / "build" / "ortho.json"

# Die Kacheln sind 1 km gross und mit 10 cm aufgeloest.
TILE_M = 1000.0
NATIVE_RES_M = 0.1
# Beim Dekodieren wird geviertelt: 40 cm je Bildpunkt reichen fuer eine
# Bodentextur und passen in den Speicher. Voll aufgeloest waeren die vier
# Kacheln zusammen 400 Megapixel.
DECODE_REDUCE = 2

# Kantenlaenge der Ausgabe. 4096 auf gut 1300 m sind rund 32 cm je Bildpunkt --
# sichtbar scharf beim Begehen, ohne die App mit einem Riesenbild zu belasten.
OUT_SIZE = 4096
MARGIN_M = 120.0
JPEG_QUALITY = 82

Image.MAX_IMAGE_PIXELS = None


def tile_origin(name: str) -> tuple[float, float]:
    """"dop10rgbi_32_358_5645_1_nw_2025.jp2" -> (358000, 5645000)."""
    parts = name.split("_")
    return (float(parts[2]) * 1000.0, float(parts[3]) * 1000.0)


def load_mosaic() -> tuple[Image.Image, tuple[float, float], float]:
    """Setzt die Kacheln zu einem Bild zusammen. Gibt Bild, Ursprung, Aufloesung."""
    tiles = sorted(DOP_DIR.glob("*.jp2"))
    if not tiles:
        raise FileNotFoundError("keine Orthophotos -- erst tools/fetch_orthophoto.py")

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
    if not BUILDINGS.exists() or not SITE.exists():
        print("buildings.json oder site.json fehlt -- erst tools/build_buildings.py",
              file=sys.stderr)
        return 1

    fit = json.loads(BUILDINGS.read_text(encoding="utf-8"))["fit"]
    site = json.loads(SITE.read_text(encoding="utf-8"))

    rotation = math.radians(fit["rotationDeg"])
    cos_r, sin_r = math.cos(rotation), math.sin(rotation)
    tx, ty = fit["translation"]
    mirror = fit["mirrored"]

    points = [point for hall in site["halls"] for point in hall["footprint"]]
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    x0, x1 = min(xs) - MARGIN_M, max(xs) + MARGIN_M
    y0, y1 = min(ys) - MARGIN_M, max(ys) + MARGIN_M
    span = max(x1 - x0, y1 - y0)
    # Quadratisch, damit die Textur nicht verzerrt und die UVs trivial bleiben.
    x1, y1 = x0 + span, y0 + span

    print("Orthophotos zusammensetzen ...")
    mosaic, (mosaic_x, mosaic_y), resolution = load_mosaic()

    # Ausgabepixel (u, v) -> Gelaende -> UTM -> Quellpixel. Die ganze Kette ist
    # affin, deshalb reicht eine einzige Transformation statt einer Schleife
    # ueber 16 Millionen Bildpunkte.
    step = span / OUT_SIZE

    def to_source(site_x: float, site_y: float) -> tuple[float, float]:
        sx = -site_x if mirror else site_x
        utm_x = cos_r * sx - sin_r * site_y + tx
        utm_y = sin_r * sx + cos_r * site_y + ty
        return ((utm_x - mosaic_x) / resolution, (mosaic_y - utm_y) / resolution)

    origin = to_source(x0, y1)
    along_u = to_source(x0 + step, y1)
    along_v = to_source(x0, y1 - step)
    matrix = (along_u[0] - origin[0], along_v[0] - origin[0], origin[0],
              along_u[1] - origin[1], along_v[1] - origin[1], origin[1])

    print(f"  entzerren auf {OUT_SIZE}x{OUT_SIZE} "
          f"({span:.0f} m, {100 * span / OUT_SIZE:.0f} cm je Bildpunkt) ...")
    warped = mosaic.transform((OUT_SIZE, OUT_SIZE), Image.AFFINE, matrix,
                              resample=Image.BICUBIC)

    OUT_IMAGE.parent.mkdir(parents=True, exist_ok=True)
    warped.save(OUT_IMAGE, "JPEG", quality=JPEG_QUALITY, optimize=True,
                progressive=True)

    meta = {
        "schema": "beuteltier.ortho.v1",
        "source": {
            "title": "Digitale Orthophotos, 10 cm",
            "provider": "Geobasis NRW",
            "licence": "Datenlizenz Deutschland Zero 2.0",
            "vintage": "2025",
        },
        "image": OUT_IMAGE.name,
        "extent": [round(x0, 2), round(y0, 2), round(x1, 2), round(y1, 2)],
        "sizePx": OUT_SIZE,
        "metresPerPixel": round(span / OUT_SIZE, 3),
        "note": ("Senkrechtluftbild in Gelaendekoordinaten. Zeigt Boden und "
                 "Daecher. Waende zeigt es nicht -- die sind prozedural."),
    }
    OUT_META.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n",
                        encoding="utf-8")

    size_mb = OUT_IMAGE.stat().st_size / 1e6
    print(f"\n{OUT_SIZE}x{OUT_SIZE}, {size_mb:.1f} MB -> {OUT_IMAGE}")
    print(f"Ausdehnung {x0:.0f}..{x1:.0f} x {y0:.0f}..{y1:.0f} -> {OUT_META}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
