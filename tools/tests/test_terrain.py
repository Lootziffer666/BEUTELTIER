"""Sichert das amtliche DGM1-Terrain gegen stille Ersatzdaten und kaputte Indizes."""
from __future__ import annotations

import struct
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import build_terrain  # noqa: E402
import build_all  # noqa: E402


def test_wide_runtime_terrain_cannot_overwrite_preserved_core_artifact():
    assert build_terrain.OUT_META.name == "terrain-wide.json"
    assert "terrain.json" not in build_all.APP_DATA_PRODUCTS
    assert build_all.APP_DATA_ALIASES == {"terrain-wide.json": "terrain.json"}


def test_terrain_grid_indices_stay_inside_measured_vertices():
    raster = [
        [40.0, 41.0, 42.0],
        [43.0, 44.0, 45.0],
    ]

    part, masked = build_terrain.build_terrain_mesh(raster)

    assert len(part.positions) == 6 * 3
    assert len(part.uvs) == 6 * 2
    assert part.indices == [0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4]
    assert max(part.indices) < len(part.positions) // 3
    assert masked == 0


def test_terrain_cells_below_official_ground_surfaces_are_not_rendered(monkeypatch):
    monkeypatch.setattr(build_terrain, "EXTENT_C", (0.0, 0.0, 20.0, 10.0))
    monkeypatch.setattr(build_terrain, "ORIGIN", (0.0, 0.0, 0.0))
    raster = [[40.0, 40.0, 40.0], [40.0, 40.0, 40.0]]
    official_ground = [(
        [(0.5, 0.5), (9.5, 0.5), (9.5, 9.5), (0.5, 9.5)],
        [],
    )]

    part, masked = build_terrain.build_terrain_mesh(raster, official_ground)

    assert masked == 1
    assert part.indices == [1, 2, 4, 2, 5, 4]


def test_wcs_rows_are_reordered_from_north_to_south_once():
    north_first = [[50.0, 51.0], [40.0, 41.0], [30.0, 31.0]]
    assert build_terrain.south_to_north(north_first) == [
        [30.0, 31.0], [40.0, 41.0], [50.0, 51.0],
    ]


def test_lzw_float_tiff_is_decoded_by_pixel_instead_of_returning_plausible_garbage():
    source = Image.new("F", (3, 2))
    source.putdata([45.91, 45.92, 45.93, 46.01, 46.02, 46.03])
    payload = BytesIO()
    source.save(payload, format="TIFF", compression="tiff_lzw")

    assert build_terrain.parse_tiff(payload.getvalue(), 3, 2) == [
        [45.90999984741211, 45.91999816894531, 45.93000030517578],
        [46.0099983215332, 46.02000045776367, 46.029998779296875],
    ]


def test_native_dgm_is_decimated_locally_without_wcs_resampling():
    source = Image.new("F", (21, 11))
    source.putdata([float(y * 100 + x) for y in range(11) for x in range(21)])
    payload = BytesIO()
    source.save(payload, format="TIFF", compression="tiff_lzw")

    assert build_terrain.parse_tiff(payload.getvalue(), 21, 11, 10) == [
        [0.0, 10.0, 20.0],
        [1000.0, 1010.0, 1020.0],
    ]


def test_multipart_parser_uses_declared_closing_boundary_not_payload_dashes():
    tiff = b"II*\x00prefix\n--bytes-inside-compressed-image"
    payload = b"headers\r\n" + tiff + b"\r\n--wcs--\r\n"

    assert build_terrain.extract_tiff(payload, "wcs") == tiff


def test_tiled_wcs_is_stitched_once_and_shared_edges_must_agree(monkeypatch):
    monkeypatch.setattr(build_terrain, "EXTENT_C", (0.0, 0.0, 20.0, 20.0))
    monkeypatch.setattr(build_terrain, "WCS_TILE_M", 10.0)
    monkeypatch.setattr(build_terrain, "STEP_M", 5.0)

    def tile(bounds):
        min_x, min_y, _max_x, _max_y = bounds
        return [
            [min_x + x + (min_y + y) * 10 for x in (0.0, 5.0, 10.0)]
            for y in (0.0, 5.0, 10.0)
        ]

    monkeypatch.setattr(build_terrain, "load_dgm1_tile", tile)

    assert build_terrain.load_dgm1_raster() == [
        [0.0, 5.0, 10.0, 15.0, 20.0],
        [50.0, 55.0, 60.0, 65.0, 70.0],
        [100.0, 105.0, 110.0, 115.0, 120.0],
        [150.0, 155.0, 160.0, 165.0, 170.0],
        [200.0, 205.0, 210.0, 215.0, 220.0],
    ]


def test_binary_heightmap_uses_southwest_origin(tmp_path, monkeypatch):
    target = tmp_path / "terrain_heightmap.bin"
    monkeypatch.setattr(build_terrain, "OUT_HEIGHTMAP", target)
    meta = build_terrain.write_heightmap([[40.0, 41.0], [42.0, 43.0]])
    payload = target.read_bytes()
    assert struct.unpack_from("<4dII", payload, 0) == (
        build_terrain.EXTENT_C[0], build_terrain.EXTENT_C[1],
        build_terrain.ORIGIN[2], build_terrain.STEP_M, 2, 2,
    )
    assert struct.unpack_from("<4f", payload, 48) == (40.0, 41.0, 42.0, 43.0)
    assert meta["rowOrder"] == "south-to-north"


def test_terrain_build_fails_instead_of_emitting_a_flat_fallback(monkeypatch, capsys):
    def unavailable():
        raise OSError("WCS nicht erreichbar")

    monkeypatch.setattr(build_terrain, "load_dgm1_raster", unavailable)

    assert build_terrain.main() == 1
    captured = capsys.readouterr()
    assert "kein simuliertes Flachraster" in captured.err
