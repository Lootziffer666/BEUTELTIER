#!/usr/bin/env python3
"""Deterministically stylize app/public/models/gelaende.jpg.

Geometry invariant: this script never crops, resizes, rotates, warps, or regenerates
pixels. Output width/height must exactly equal the source width/height.
"""
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps, ImageChops

SRC = Path("app/public/models/gelaende.jpg")
OUT = Path("app/public/models/gelaende-borderlands.jpg")
EXPECTED = (8192, 3511)

img = Image.open(SRC).convert("RGB")
if img.size != EXPECTED:
    raise SystemExit(f"Unexpected source dimensions {img.size}; expected {EXPECTED}")

# Color: richer and brighter without moving any pixel.
color = ImageEnhance.Color(img).enhance(1.55)
color = ImageEnhance.Contrast(color).enhance(1.18)
color = ImageEnhance.Brightness(color).enhance(1.035)

# Cel-shading / posterization while retaining enough aerial detail.
cel = ImageOps.posterize(color, bits=5)
cel = ImageEnhance.Color(cel).enhance(1.08)

# Ink map derived from the original image. All edges remain at their source pixels.
gray = ImageOps.grayscale(img)
# Light denoise prevents every bit of aerial texture becoming black ink.
gray = gray.filter(ImageFilter.GaussianBlur(radius=0.65))
edges = gray.filter(ImageFilter.FIND_EDGES)
edges = ImageOps.autocontrast(edges, cutoff=1)
# Only stronger structural edges survive; expand them slightly for comic linework.
edges = edges.point(lambda p: 255 if p >= 42 else 0)
edges = edges.filter(ImageFilter.MaxFilter(3))
# Convert white-edge mask to dark overlay. Blur a hair to avoid jagged digital lines.
edges = edges.filter(ImageFilter.GaussianBlur(radius=0.35))
ink = ImageOps.invert(edges)
ink_rgb = Image.merge("RGB", (ink, ink, ink))

# Multiply at partial strength: strong black contours, but not a black spaghetti map.
full_ink = ImageChops.multiply(cel, ink_rgb)
styled = Image.blend(cel, full_ink, 0.47)

# Final punch, still pixel-local only.
styled = ImageEnhance.Contrast(styled).enhance(1.06)
styled = ImageEnhance.Color(styled).enhance(1.05)

if styled.size != img.size:
    raise SystemExit(f"Geometry invariant broken: {styled.size} != {img.size}")

OUT.parent.mkdir(parents=True, exist_ok=True)
styled.save(OUT, "JPEG", quality=95, subsampling=0, optimize=True)

check = Image.open(OUT)
if check.size != EXPECTED:
    raise SystemExit(f"Output dimensions {check.size}; expected {EXPECTED}")

print(f"Wrote {OUT} at {check.size[0]}x{check.size[1]} px")
