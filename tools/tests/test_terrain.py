"""Sichert das amtliche DGM1-Terrain gegen stille Ersatzdaten und kaputte Indizes."""
from __future__ import annotations

import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import build_terrain  # noqa: E402


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
