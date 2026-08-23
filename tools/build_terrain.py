#!/usr/bin/env python3
"""Baut das Geländemodell für die Koelnmesse aus amtlichen DGM1-Daten.

Das Terrain ist das Fundament: alle Hallen, Stände und Wege stehen darauf.
Es kommt von der NRW DGM1-WCS-Schnittstelle, nicht vom LoD2-GroundSurface --
das ist eine grobe Konstruktion, und das DGM1 ist ein fünf Meter Raster mit
echter Höhenmessung.

Extent C: x=357300–359300, y=5642800–5646900 (2×2 km, 5 m Gitter).

Aufruf:
    python3 tools/build_terrain.py
"""
from __future__ import annotations

import json
import struct
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from beuteltier.gltf import write_glb, FLOAT, UNSIGNED_INT, ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, GLB_MAGIC, JSON_CHUNK, BIN_CHUNK, Part, _normal, _pad  # noqa: E402

ORIGIN = (358300.0, 5645800.0, 40.0)
EXTENT_C = (357300.0, 5642800.0, 359300.0, 5646900.0)
STEP_M = 5.0
OUT_GLB = ROOT / "app" / "public" / "models" / "terrain.glb"
OUT_META = ROOT / "data" / "build" / "terrain.json"
WCS_URL = ("https://www.wcs.nrw.de/geobasis/wcs_nw_dgm?"
           "VERSION=1.1.1&SERVICE=WCS&REQUEST=GetCoverage&IDENTIFIER=nw_dgm"
           "&FORMAT=image/tiff&CRS=EPSG:25832"
           "&BBOX={minx},{miny},{maxx},{maxy}&WIDTH={cols}&HEIGHT={rows}")


def lzw_decompress_tiff(data: bytes) -> bytes:
    """LZW-Dekompression für TIFF (MSB-first, EarlyChange aktiviert)."""
    bit_pos = 0
    code_width = 9

    def get_bits(n: int) -> int:
        nonlocal bit_pos
        result = 0
        for _ in range(n):
            byte_idx = bit_pos // 8
            bit_idx = 7 - (bit_pos % 8)
            bit = (data[byte_idx] >> bit_idx) & 1 if byte_idx < len(data) else 0
            result = (result << 1) | bit
            bit_pos += 1
        return result

    clear_code = 256
    eod_code = 257
    dict_size = 258
    dictionary: dict[int, bytes] = {}

    result = bytearray()
    prev_code = None

    while True:
        code = get_bits(code_width)
        if code == eod_code:
            break
        if code == clear_code:
            code_width = 9
            dict_size = 258
            prev_code = None
            continue

        if code < dict_size and code not in dictionary:
            dictionary[code] = bytes([code])

        if code in dictionary:
            entry = dictionary[code]
        elif prev_code is not None and prev_code in dictionary:
            entry = dictionary[prev_code] + dictionary[prev_code][:1]
        else:
            entry = bytes([code])

        result.extend(entry)

        if prev_code is not None and prev_code in dictionary:
            new_code = dict_size
            dictionary[new_code] = dictionary[prev_code] + entry[:1]
            dict_size += 1
            if dict_size == (1 << code_width) - 1 and code_width < 12:
                code_width += 1

        prev_code = code

    return bytes(result)


def parse_tiff(tiff_data: bytes, cols: int, rows: int) -> list[list[float]]:
    """Parst ein GeoTIFF und gibt die Pixelwerte als Raster zurück.

    Unterstützt TIFF mit LZW-Kompression und IEEE 32-Bit Float SampleFormat.
    Das Bild wird auf das Zielraster (cols × rows) zurückgestellt, wenn
    die Quellauflösung nicht exakt passt.
    """
    little = tiff_data[:2] == b"II"
    endian = "<" if little else ">"

    def u16(offset: int) -> int:
        return struct.unpack_from(f"{endian}H", tiff_data, offset)[0]

    def u32(offset: int) -> int:
        return struct.unpack_from(f"{endian}I", tiff_data, offset)[0]

    def f32(offset: int) -> float:
        return struct.unpack_from(f"{endian}f", tiff_data, offset)[0]

    # TIFF-IFD am Offset 8 (standard)
    ifd_offset = u32(4)
    num_entries = u16(ifd_offset)

    width, height, bits, sample_type, compression, strip_offsets, strip_counts = 0, 0, 0, 0, 1, [], []
    type_sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8}
    for i in range(num_entries):
        entry_offset = ifd_offset + 2 + i * 12
        tag, typ, count, value_or_offset = struct.unpack_from(f"{endian}HHII", tiff_data, entry_offset)
        entry_size = count * type_sizes.get(typ, 1)

        if tag == 256:  # ImageWidth
            width = value_or_offset
        elif tag == 257:  # ImageLength
            height = value_or_offset
        elif tag == 258:  # BitsPerSample
            bits = value_or_offset
        elif tag == 259:  # Compression: 1=None, 5=LZW, 32773=PackBits
            compression = value_or_offset
        elif tag == 339:  # SampleFormat: 3 = IEEE float
            sample_type = value_or_offset
        elif tag == 273:  # StripOffsets
            if entry_size <= 4:
                strip_offsets.append(value_or_offset)
            else:
                strip_offsets.extend(u32(value_or_offset + i * 4) for i in range(count))
        elif tag == 279:  # StripByteCounts
            if entry_size <= 4:
                strip_counts.append(value_or_offset)
            else:
                strip_counts.extend(u32(value_or_offset + i * 4) for i in range(count))

    # Read pixel data - each strip decompressed separately
    pixels = []
    for soff, scount in zip(strip_offsets, strip_counts):
        raw = tiff_data[soff:soff + scount]
        if compression == 5:
            raw = lzw_decompress_tiff(raw)
        val_size = bits // 8
        for i in range(len(raw) // val_size):
            if sample_type == 3 and bits == 32:
                val = struct.unpack_from(f"{endian}f", raw, i * val_size)[0]
            elif bits == 16:
                val = float(struct.unpack_from(f"{endian}H", raw, i * val_size)[0])
            elif bits == 8:
                val = float(struct.unpack_from(f"{endian}B", raw, i * val_size)[0])
            else:
                val = float(struct.unpack_from(f"{endian}I", raw, i * val_size)[0])
            pixels.append(val)

    # Reshape to rows x cols
    raster = []
    for r in range(height):
        row = pixels[r * width:(r + 1) * width]
        if len(row) != cols:
            row = row[:cols] or [row[0] if row else 0.0] * cols
        raster.append(row)

    # Resize if needed
    if height != rows or width != cols:
        step_x = width / cols
        step_y = height / rows
        resized = []
        for r in range(rows):
            row = []
            for c in range(cols):
                src_x = min(int(c * step_x), width - 1)
                src_y = min(int(r * step_y), height - 1)
                row.append(pixels[src_y * width + src_x])
            resized.append(row)
        raster = resized

    flat = [v for row in raster for v in row]
    print(f"  DGM1 Raster: {cols}×{rows} (min={min(flat):.1f}m, max={max(flat):.1f}m)")
    return raster


def load_dgm1_raster() -> list[list[float]]:
    """Lädt den DGM1-Raster für Extent C als Gitterpunkte.

    Der WCS gibt ein MIME-Multipart zurück, das XML, Geodaten und das
    eigentliche GeoTIFF als Anhang enthält. Wir extrahieren das TIFF.
    """
    minx, miny, maxx, maxy = EXTENT_C
    cols = int((maxx - minx) / STEP_M) + 1
    rows = int((maxy - miny) / STEP_M) + 1
    url = WCS_URL.format(minx=minx, miny=miny, maxx=maxx, maxy=maxy,
                         cols=cols, rows=rows)

    req = urllib.request.Request(url, headers={"User-Agent": "BEUTELTIER/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()

    # Extract TIFF from MIME multipart
    tiff_start = data.find(b"II*\x00")
    if tiff_start == -1:
        tiff_start = data.find(b"MM\x00*")
    if tiff_start == -1:
        raise ValueError("Kein TIFF in der WCS-Antwort gefunden")

    tiff_data = data[tiff_start:]
    # TIFF ends where the MIME boundary starts again or at end
    boundary_end = tiff_data.find(b"\n--")
    if boundary_end > 0:
        tiff_data = tiff_data[:boundary_end]

    return parse_tiff(tiff_data, cols, rows)


def build_terrain_mesh(raster: list[list[float]]) -> Part:
    """Erzeugt ein Gitternetz aus dem Raster."""
    rows = len(raster)
    cols = len(raster[0]) if rows else 0
    part = Part(name="terrain", colour=(0.72, 0.73, 0.75, 1.0))
    
    ox0, oy0 = EXTENT_C[0] - ORIGIN[0], EXTENT_C[1] - ORIGIN[1]
    
    def scene_xy(grid_x: int, grid_y: int) -> tuple[float, float]:
        return (ox0 + grid_x * STEP_M, -oy0 - grid_y * STEP_M)
    
    for gy in range(rows):
        for gx in range(cols):
            sx, sz = scene_xy(gx, gy)
            h = raster[gy][gx]
            sy = h - ORIGIN[2]
            part.positions.extend([sx, sy, sz])
            part.uvs.extend((gx / (cols - 1), gy / (rows - 1)))

    for gy in range(rows - 1):
        for gx in range(cols - 1):
            a = gx + gy * cols
            b = a + 1
            c = a + cols
            d = c + 1
            # sceneZ nimmt zeilenweise ab. Diese Reihenfolge zeigt nach +Y
            # und referenziert ausschliesslich vorhandene Rasterpunkte.
            part.indices.extend([a, b, c, b, d, c])
    
    count = len(part.positions) // 3
    for i in range(count):
        p = part.positions[i * 3:i * 3 + 3]
        part.normals.extend([0.0, 1.0, 0.0])
    
    return part


def main() -> int:
    print("Terrain aus DGM1 bauen ...")

    try:
        raster = load_dgm1_raster()
    except Exception as e:
        print(f"  Fehler beim Laden: {e}", file=sys.stderr)
        print("  Abbruch: kein simuliertes Flachraster wird erzeugt.", file=sys.stderr)
        return 1
    
    print(f"  Raster: {len(raster)}×{len(raster[0])} Punkte")
    part = build_terrain_mesh(raster)
    
    # DGM1-Textur
    tex_path = ROOT / "data" / "raw" / "dop"
    texture_ref = None
    if tex_path.exists():
        jpgs = list(tex_path.glob("*.jpg"))
        if jpgs:
            texture_ref = jpgs[0].name
    
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    size = write_glb(
        OUT_GLB, [part],
        generator="BEUTELTIER aus DGM1 (Geobasis NRW)",
        extras={"crsNote": "ETRS89/UTM32N - DHHN2016 NH",
                "extent": list(EXTENT_C),
                "stepM": STEP_M,
                "origin": list(ORIGIN),
                "licence": "Datenlizenz Deutschland Zero 2.0",
                **({"texture": texture_ref} if texture_ref else {})})
    
    triangles = part.triangle_count
    print(f"  {triangles} Dreiecke, {size / 1e6:.1f} MB -> {OUT_GLB}")
    
    # Heightmap: flaches Float-Array für O(1)-Interpolation in der App
    flat_heights = [h for row in raster for h in row]
    payload = {
        "schema": "beuteltier.terrain.v1",
        "source": {
            "title": "Digitales Gelaendemodell 1 (DGM1)",
            "provider": "Geobasis NRW",
            "licence": "Datenlizenz Deutschland Zero 2.0",
            "crs": "EPSG:25832",
            "resolutionM": STEP_M,
            "extent": list(EXTENT_C),
        },
        "model": "models/terrain.glb",
        "raster": f"{len(raster[0])}x{len(raster)}",
        "origin": list(ORIGIN),
        "stepM": STEP_M,
        "heightmap": flat_heights,
        "cols": len(raster[0]),
        "rows": len(raster),
    }
    OUT_META.parent.mkdir(parents=True, exist_ok=True)
    OUT_META.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Metadata -> {OUT_META}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
