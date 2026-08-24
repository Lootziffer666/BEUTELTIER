#!/usr/bin/env python3
"""Baut das Geländemodell für die Koelnmesse aus amtlichen DGM1-Daten.

Das Terrain ist das Fundament: alle Hallen, Stände und Wege stehen darauf.
Es kommt von der NRW DGM1-WCS-Schnittstelle, nicht vom LoD2-GroundSurface.
Die amtliche Ein-Meter-Quelle wird fuer die mobile Darstellung auf zehn Meter
abgegriffen; jeder ausgegebene Wert stammt weiterhin aus dem DGM.

Produktgrenze: Innenstadt/Rhein bis A3/Parkhaeuser, identisch zum Orthofoto.

Aufruf:
    python3 tools/build_terrain.py
"""
from __future__ import annotations

import json
import struct
import sys
import urllib.request
from array import array
from hashlib import sha256
from math import floor, isfinite
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from beuteltier.gltf import write_glb, FLOAT, UNSIGNED_INT, ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, GLB_MAGIC, JSON_CHUNK, BIN_CHUNK, Part, _normal, _pad  # noqa: E402
from beuteltier import lod2  # noqa: E402
from beuteltier.world_extent import ACTIVE_LOD2_BOUNDS, WORLD_BOUNDS  # noqa: E402

ORIGIN = (358300.0, 5645800.0, 40.0)
EXTENT_C = WORLD_BOUNDS
STEP_M = 10.0
OUT_GLB = ROOT / "app" / "public" / "models" / "terrain.glb"
OUT_META = ROOT / "data" / "build" / "terrain.json"
OUT_HEIGHTMAP = ROOT / "app" / "public" / "data" / "terrain_heightmap.bin"
OUT_HEIGHTMAP_META = ROOT / "app" / "public" / "data" / "terrain_heightmap.json"
LOD2_DIR = ROOT / "data" / "raw" / "lod2"
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

    # GeoTIFF ist TopLeft orientiert: Zeile 0 liegt am maximalen Nordwert.
    # Unser binaeres Laufzeitraster beginnt dagegen explizit bei minY und
    # zaehlt nach Norden. Ohne diese einmalige Umkehrung lagen die Hoehen
    # mehrere Kilometer gespiegelt unter Luftbild und Hallen.
    return south_to_north(parse_tiff(tiff_data, cols, rows))


def south_to_north(raster: list[list[float]]) -> list[list[float]]:
    """TopLeft-WCS-Zeilen -> Raster mit Ursprung an der suedwestlichen Ecke."""
    return list(reversed(raster))


def write_heightmap(raster: list[list[float]]) -> dict:
    """Schreibt das vom Browser gelesene, streng gepruefte DGM-Binaerraster."""
    rows = len(raster)
    cols = len(raster[0]) if rows else 0
    if rows < 2 or cols < 2 or any(len(row) != cols for row in raster):
        raise ValueError("DGM-Hoehenraster ist leer oder nicht rechteckig")
    flat = [value for row in raster for value in row]
    if any(not isinstance(value, (int, float)) or not isfinite(value) for value in flat):
        raise ValueError("DGM-Hoehenraster enthaelt ungueltige Werte")

    # 48-Byte-Header: Ursprung XYZ, Schritt, Spalten, Zeilen, reservierter
    # Alt-Offset. parseTerrainHeightmap liest die Hoehen ab Byte 48.
    header = struct.pack(
        "<4dIId",
        EXTENT_C[0], EXTENT_C[1], ORIGIN[2], STEP_M, cols, rows, 0.0,
    )
    values = array("f", flat)
    if sys.byteorder != "little":
        values.byteswap()
    payload = header + values.tobytes()
    OUT_HEIGHTMAP.parent.mkdir(parents=True, exist_ok=True)
    OUT_HEIGHTMAP.write_bytes(payload)
    return {
        "binary": OUT_HEIGHTMAP.name,
        "bytes": len(payload),
        "sha256": sha256(payload).hexdigest(),
        "origin": [EXTENT_C[0], EXTENT_C[1], ORIGIN[2]],
        "stepM": STEP_M,
        "cols": cols,
        "rows": rows,
        "samples": len(flat),
        "heightRangeM": [round(min(flat), 3), round(max(flat), 3)],
        "rowOrder": "south-to-north",
    }


GroundPolygon = tuple[
    list[tuple[float, float]],
    list[list[tuple[float, float]]],
]


def point_in_ring(point: tuple[float, float], ring: list[tuple[float, float]]) -> bool:
    """Ray-Casting fuer einen geschlossenen amtlichen Grundflaechenring."""
    x, y = point
    inside = False
    for index in range(len(ring)):
        ax, ay = ring[index]
        bx, by = ring[index - 1]
        if (ay > y) != (by > y):
            crossing = ax + (y - ay) * (bx - ax) / (by - ay)
            if x < crossing:
                inside = not inside
    return inside


def point_in_ground(point: tuple[float, float], polygon: GroundPolygon) -> bool:
    exterior, holes = polygon
    return point_in_ring(point, exterior) and not any(
        point_in_ring(point, hole) for hole in holes
    )


def ground_bounds(polygon: GroundPolygon) -> tuple[float, float, float, float]:
    exterior, _holes = polygon
    xs = [point[0] for point in exterior]
    ys = [point[1] for point in exterior]
    return min(xs), min(ys), max(xs), max(ys)


def segments_intersect(
    first_a: tuple[float, float],
    first_b: tuple[float, float],
    second_a: tuple[float, float],
    second_b: tuple[float, float],
) -> bool:
    def orientation(
        a: tuple[float, float], b: tuple[float, float], c: tuple[float, float],
    ) -> float:
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    one = orientation(first_a, first_b, second_a)
    two = orientation(first_a, first_b, second_b)
    three = orientation(second_a, second_b, first_a)
    four = orientation(second_a, second_b, first_b)
    return ((one <= 0 <= two) or (two <= 0 <= one)) and (
        (three <= 0 <= four) or (four <= 0 <= three)
    )


def cell_overlaps_ground(
    min_x: float,
    min_y: float,
    max_x: float,
    max_y: float,
    polygon: GroundPolygon,
    polygon_bounds: tuple[float, float, float, float] | None = None,
) -> bool:
    """Konservative 10-m-Zellmaske fuer eine reale LoD2-Grundflaeche.

    Maskiert wird nur, wenn die Zelle die amtliche Flaeche nachweislich
    beruehrt: Mittelpunkt/Ecken liegen darin oder ein Polygonpunkt liegt in
    der Zelle. Dadurch kann das DGM das Gebaeude nicht mehr durchschneiden;
    ausserhalb realer LoD2-Flaechen bleibt jeder DGM-Wert unveraendert.
    """
    exterior, _holes = polygon
    poly_min_x, poly_min_y, poly_max_x, poly_max_y = (
        polygon_bounds or ground_bounds(polygon)
    )
    if poly_max_x < min_x or poly_min_x > max_x or poly_max_y < min_y or poly_min_y > max_y:
        return False
    probes = [
        (min_x, min_y), (max_x, min_y),
        (min_x, max_y), (max_x, max_y),
        ((min_x + max_x) / 2, (min_y + max_y) / 2),
    ]
    if any(point_in_ground(point, polygon) for point in probes):
        return True
    if any(min_x <= x <= max_x and min_y <= y <= max_y for x, y in exterior):
        return True
    cell_edges = [
        ((min_x, min_y), (max_x, min_y)),
        ((max_x, min_y), (max_x, max_y)),
        ((max_x, max_y), (min_x, max_y)),
        ((min_x, max_y), (min_x, min_y)),
    ]
    return any(
        segments_intersect(exterior[index - 1], exterior[index], edge_a, edge_b)
        for index in range(len(exterior))
        for edge_a, edge_b in cell_edges
    )


def masked_terrain_cells(
    rows: int,
    cols: int,
    polygons: list[GroundPolygon],
) -> set[tuple[int, int]]:
    """Indexiert nur Zellen in den Polygon-Bounding-Boxes, einmal je Bau."""
    masked: set[tuple[int, int]] = set()
    world_min_x, world_min_y = EXTENT_C[0], EXTENT_C[1]
    for polygon in polygons:
        bounds = ground_bounds(polygon)
        min_x, min_y, max_x, max_y = bounds
        first_x = max(0, floor((min_x - world_min_x) / STEP_M))
        last_x = min(cols - 2, floor((max_x - world_min_x) / STEP_M))
        first_y = max(0, floor((min_y - world_min_y) / STEP_M))
        last_y = min(rows - 2, floor((max_y - world_min_y) / STEP_M))
        for gy in range(first_y, last_y + 1):
            for gx in range(first_x, last_x + 1):
                cell_min_x = world_min_x + gx * STEP_M
                cell_min_y = world_min_y + gy * STEP_M
                if cell_overlaps_ground(
                    cell_min_x,
                    cell_min_y,
                    cell_min_x + STEP_M,
                    cell_min_y + STEP_M,
                    polygon,
                    bounds,
                ):
                    masked.add((gx, gy))
    return masked


def active_lod2_ground_polygons() -> list[GroundPolygon]:
    """Liest exakt die amtlichen Grundflaechen des aktiven Messe-LoD2."""
    min_x, min_y, max_x, max_y = ACTIVE_LOD2_BOUNDS
    tiles = [
        LOD2_DIR / f"LoD2_32_{x}_{y}_1_NW.gml"
        for y in range(int(min_y // 1000), int((max_y - 1e-9) // 1000) + 1)
        for x in range(int(min_x // 1000), int((max_x - 1e-9) // 1000) + 1)
    ]
    missing = [tile.name for tile in tiles if not tile.exists() or tile.stat().st_size == 0]
    if missing:
        raise FileNotFoundError(
            "LoD2-Kacheln fuer die Terrain-Gebaeudemaske fehlen: "
            + ", ".join(missing)
        )
    polygons: list[GroundPolygon] = []
    for tile in tiles:
        for feature in lod2.read_features(tile, ACTIVE_LOD2_BOUNDS):
            for surface in feature.ground:
                exterior = [(x, y) for x, y, _z in surface.ring]
                holes = [[(x, y) for x, y, _z in ring] for ring in surface.holes]
                if len(exterior) >= 3:
                    polygons.append((exterior, holes))
    if not polygons:
        raise ValueError("keine amtlichen LoD2-Grundflaechen im aktiven Messeausschnitt")
    return polygons


def build_terrain_mesh(
    raster: list[list[float]],
    ground_polygons: list[GroundPolygon] | None = None,
) -> tuple[Part, int]:
    """Erzeugt ein Gitternetz; reale LoD2-Grundflaechen bleiben frei."""
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

    polygons = ground_polygons or []
    masked_cells = masked_terrain_cells(rows, cols, polygons)
    for gy in range(rows - 1):
        for gx in range(cols - 1):
            if (gx, gy) in masked_cells:
                continue
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
    
    return part, len(masked_cells)


def main() -> int:
    print("Terrain aus DGM1 bauen ...")

    try:
        raster = load_dgm1_raster()
    except Exception as e:
        print(f"  Fehler beim Laden: {e}", file=sys.stderr)
        print("  Abbruch: kein simuliertes Flachraster wird erzeugt.", file=sys.stderr)
        return 1
    
    print(f"  Raster: {len(raster)}×{len(raster[0])} Punkte")
    try:
        ground_polygons = active_lod2_ground_polygons()
    except Exception as e:
        print(f"  Fehler beim Laden der LoD2-Grundflaechen: {e}", file=sys.stderr)
        print("  Abbruch: Terrain wird nicht durch eine unbewiesene Maske ersetzt.", file=sys.stderr)
        return 1
    print(f"  LoD2-Maske: {len(ground_polygons)} amtliche Grundflaechen")
    part, masked_cells = build_terrain_mesh(raster, ground_polygons)
    
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
                "maskedCells": masked_cells,
                "maskFeatureCount": len(ground_polygons),
                "maskSource": "LoD2 GroundSurface (Geobasis NRW)",
                "licence": "Datenlizenz Deutschland Zero 2.0",
                **({"texture": texture_ref} if texture_ref else {})})
    
    triangles = part.triangle_count
    print(f"  {triangles} Dreiecke, {size / 1e6:.1f} MB -> {OUT_GLB}")
    
    heightmap = write_heightmap(raster)
    payload = {
        "schema": "beuteltier.terrain.v1",
        "source": {
            "title": "Digitales Gelaendemodell 1 (DGM1)",
            "provider": "Geobasis NRW",
            "licence": "Datenlizenz Deutschland Zero 2.0",
            "crs": "EPSG:25832",
            "sourceResolutionM": 1.0,
            "sampleStepM": STEP_M,
            "extent": list(EXTENT_C),
        },
        "model": "models/terrain.glb",
        "raster": f"{len(raster[0])}x{len(raster)}",
        "origin": list(ORIGIN),
        "stepM": STEP_M,
        "cols": len(raster[0]),
        "rows": len(raster),
        "buildingMask": {
            "source": "LoD2 GroundSurface (Geobasis NRW)",
            "bounds": list(ACTIVE_LOD2_BOUNDS),
            "featureCount": len(ground_polygons),
            "maskedCells": masked_cells,
            "method": "10-m cell overlap with official GroundSurface",
        },
        "heightmap": heightmap,
    }
    OUT_META.parent.mkdir(parents=True, exist_ok=True)
    OUT_META.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    OUT_HEIGHTMAP_META.write_text(json.dumps({
        "schema": "beuteltier.terrain-heightmap.v1",
        "source": payload["source"],
        **heightmap,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"  Metadata -> {OUT_META}")
    print(f"  Heightmap -> {OUT_HEIGHTMAP} ({heightmap['bytes'] / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
