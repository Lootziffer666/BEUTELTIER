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
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
from math import floor, isfinite
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from beuteltier.gltf import write_glb, FLOAT, UNSIGNED_INT, ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, GLB_MAGIC, JSON_CHUNK, BIN_CHUNK, Part, _normal, _pad  # noqa: E402
from beuteltier import lod2  # noqa: E402
from beuteltier.world_extent import ACTIVE_LOD2_BOUNDS, WORLD_BOUNDS  # noqa: E402

ORIGIN = (358300.0, 5645800.0, 40.0)
EXTENT_C = WORLD_BOUNDS
STEP_M = 10.0
WCS_TILE_M = 1000.0
OUT_GLB = ROOT / "app" / "public" / "models" / "terrain.glb"
# Die aktive 7-x-3-km-Laufzeitwelt besitzt eigene Metadaten. Das bestehende
# hochaufgeloeste Kernartefakt data/build/terrain.json bleibt dadurch erhalten
# und wird nicht mehr bei jedem mobilen Weitbereichsbau ueberschrieben.
OUT_META = ROOT / "data" / "build" / "terrain-wide.json"
OUT_HEIGHTMAP = ROOT / "app" / "public" / "data" / "terrain_heightmap.bin"
OUT_HEIGHTMAP_META = ROOT / "app" / "public" / "data" / "terrain_heightmap.json"
LOD2_DIR = ROOT / "data" / "raw" / "lod2"
WCS_URL = ("https://www.wcs.nrw.de/geobasis/wcs_nw_dgm?"
           "VERSION=1.1.1&SERVICE=WCS&REQUEST=GetCoverage&IDENTIFIER=nw_dgm"
           "&FORMAT=image/tiff&CRS=EPSG:25832"
           "&BBOX={minx},{miny},{maxx},{maxy}&WIDTH={cols}&HEIGHT={rows}")


def parse_tiff(
    tiff_data: bytes,
    cols: int,
    rows: int,
    sample_stride: int = 1,
) -> list[list[float]]:
    """Parst ein GeoTIFF und gibt die Pixelwerte als Raster zurück.

    Pillow ist bereits die verbindliche Bildabhaengigkeit der Datenpipeline.
    Dessen TIFF-Decoder liest Strip-Grenzen, Predictor und LZW korrekt. Der
    fruehere handgeschriebene LZW-Pfad lieferte nach laengeren Codefolgen zwar
    plausible Float-Werte, ordnete sie aber falschen Pixeln zu. Dadurch stand
    die Piazza laut Laufzeitdaten bei 66 m NHN statt bei rund 46 m NHN.

    Der Dienst muss exakt die angeforderte Pixelzahl liefern. Die Laufzeitwelt
    nimmt anschliessend jeden zehnten nativen DGM1-Punkt; der WCS-Dienst darf
    das Gelaende nicht selbst auf zehn Meter resamplen, weil dessen Ergebnis
    von der Groesse der Anfrage abhaengt.
    """
    with Image.open(BytesIO(tiff_data)) as source:
        image = source.convert("F") if source.mode != "F" else source.copy()
    if image.size != (cols, rows):
        raise ValueError(
            f"DGM1-TIFF hat {image.width}×{image.height} statt {cols}×{rows} Pixeln"
        )
    if (
        sample_stride < 1 or
        (cols - 1) % sample_stride != 0 or
        (rows - 1) % sample_stride != 0
    ):
        raise ValueError(f"DGM1-Raster ist nicht durch Schritt {sample_stride} teilbar")

    pixels = image.load()
    raster = [
        [float(pixels[x, y]) for x in range(0, cols, sample_stride)]
        for y in range(0, rows, sample_stride)
    ]
    sampled = [value for row in raster for value in row]
    print(
        f"  DGM1 Quelle: {cols}×{rows}, Ausgabe: "
        f"{len(raster[0])}×{len(raster)} "
        f"(min={min(sampled):.1f}m, max={max(sampled):.1f}m)"
    )
    return raster


def extract_tiff(data: bytes, boundary: str | None) -> bytes:
    """Extrahiert das TIFF ohne Trennung an zufaelligen Nutzdaten-Bytes."""
    tiff_start = data.find(b"II*\x00")
    if tiff_start == -1:
        tiff_start = data.find(b"MM\x00*")
    if tiff_start == -1:
        raise ValueError("Kein TIFF in der WCS-Antwort gefunden")

    if boundary is None:
        return data[tiff_start:]
    closing_marker = b"\r\n--" + boundary.encode("ascii") + b"--"
    tiff_end = data.rfind(closing_marker)
    if tiff_end <= tiff_start:
        raise ValueError("Multipart-Ende der WCS-Antwort fehlt")
    return data[tiff_start:tiff_end]


def load_dgm1_tile(bounds: tuple[float, float, float, float]) -> list[list[float]]:
    """Laedt eine begrenzte DGM1-WCS-Kachel mit echten Gitterpunkten.

    Der NRW-Dienst liefert bei einer einzelnen 7-x-3-km-Anfrage nachweislich
    andere Werte als bei einer lokalen 1-m-Gegenprobe (Piazza: 66 statt
    46 m NHN). 1-km-Kacheln mit 10-m-Punkten stimmen an derselben Koordinate
    mit der 1-m-Abfrage ueberein. Deshalb wird der belegte Bereich gekachelt
    abgerufen und nicht serverseitig als Grossbild heruntergerechnet.
    """
    minx, miny, maxx, maxy = bounds
    width = maxx - minx
    height = maxy - miny
    source_cols = int(width) + 1
    source_rows = int(height) + 1
    sample_stride = round(STEP_M)
    if (
        abs(source_cols - 1 - width) > 1e-6 or
        abs(source_rows - 1 - height) > 1e-6 or
        abs(sample_stride - STEP_M) > 1e-6
    ):
        raise ValueError("DGM1-Kachel und Ausgabeschritt muessen auf ganze Meter passen")
    url = WCS_URL.format(minx=minx, miny=miny, maxx=maxx, maxy=maxy,
                         cols=source_cols, rows=source_rows)

    req = urllib.request.Request(url, headers={"User-Agent": "BEUTELTIER/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        boundary = resp.headers.get_boundary()
        data = resp.read()

    return south_to_north(parse_tiff(
        extract_tiff(data, boundary),
        source_cols,
        source_rows,
        sample_stride,
    ))


def load_dgm1_raster() -> list[list[float]]:
    """Laedt und vernäht den belegten DGM1-Bereich aus 1-km-Kacheln.

    Benachbarte WCS-Kacheln enthalten dieselbe Randzeile bzw. Randspalte.
    Diese Werte muessen auf fuenf Zentimeter uebereinstimmen; andernfalls
    wird abgebrochen. Ein stiller Versatz wuerde wieder ein plausibles, aber
    falsches Terrain erzeugen.
    """
    minx, miny, maxx, maxy = EXTENT_C
    width = maxx - minx
    height = maxy - miny
    tiles_x = round(width / WCS_TILE_M)
    tiles_y = round(height / WCS_TILE_M)
    if (
        tiles_x < 1 or tiles_y < 1 or
        abs(tiles_x * WCS_TILE_M - width) > 1e-6 or
        abs(tiles_y * WCS_TILE_M - height) > 1e-6
    ):
        raise ValueError(
            f"DGM-Ausdehnung {EXTENT_C} ist nicht auf {WCS_TILE_M:g}-m-Kacheln ausgerichtet"
        )

    specs = [
        (
            tile_x,
            tile_y,
            (
                minx + tile_x * WCS_TILE_M,
                miny + tile_y * WCS_TILE_M,
                minx + (tile_x + 1) * WCS_TILE_M,
                miny + (tile_y + 1) * WCS_TILE_M,
            ),
        )
        for tile_y in range(tiles_y)
        for tile_x in range(tiles_x)
    ]
    print(f"  DGM1-WCS: {len(specs)} Kacheln à {WCS_TILE_M:g} m")
    with ThreadPoolExecutor(max_workers=4) as pool:
        loaded = list(pool.map(lambda spec: load_dgm1_tile(spec[2]), specs))
    tiles = {
        (tile_x, tile_y): raster
        for (tile_x, tile_y, _bounds), raster in zip(specs, loaded)
    }

    stitched: list[list[float]] = []
    seam_tolerance_m = 0.05
    for tile_y in range(tiles_y):
        band: list[list[float]] = []
        for tile_x in range(tiles_x):
            tile = tiles[(tile_x, tile_y)]
            if not band:
                band = [row[:] for row in tile]
                continue
            if len(tile) != len(band):
                raise ValueError(f"DGM-Kachelreihe {tile_x}/{tile_y} besitzt eine andere Hoehe")
            for row_index, row in enumerate(tile):
                if abs(band[row_index][-1] - row[0]) > seam_tolerance_m:
                    raise ValueError(
                        f"DGM-Naht X {tile_x}/{tile_y} weicht um mehr als "
                        f"{seam_tolerance_m:.2f} m ab"
                    )
                band[row_index].extend(row[1:])

        if stitched:
            if len(stitched[-1]) != len(band[0]):
                raise ValueError(f"DGM-Kachelband {tile_y} besitzt eine andere Breite")
            if any(
                abs(south - north) > seam_tolerance_m
                for south, north in zip(stitched[-1], band[0])
            ):
                raise ValueError(
                    f"DGM-Naht Y {tile_y} weicht um mehr als {seam_tolerance_m:.2f} m ab"
                )
            stitched.extend(band[1:])
        else:
            stitched.extend(band)

    expected_cols = int(width / STEP_M) + 1
    expected_rows = int(height / STEP_M) + 1
    if len(stitched) != expected_rows or any(len(row) != expected_cols for row in stitched):
        raise ValueError(
            f"Vernähtes DGM hat {len(stitched)}×"
            f"{len(stitched[0]) if stitched else 0} statt {expected_rows}×{expected_cols} Punkten"
        )
    return stitched


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
