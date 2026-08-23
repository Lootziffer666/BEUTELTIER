"""Sichert das amtliche DGM1-Terrain gegen stille Ersatzdaten und kaputte Indizes."""
from __future__ import annotations

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

    part = build_terrain.build_terrain_mesh(raster)

    assert len(part.positions) == 6 * 3
    assert len(part.uvs) == 6 * 2
    assert part.indices == [0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4]
    assert max(part.indices) < len(part.positions) // 3


def test_terrain_build_fails_instead_of_emitting_a_flat_fallback(monkeypatch, capsys):
    def unavailable():
        raise OSError("WCS nicht erreichbar")

    monkeypatch.setattr(build_terrain, "load_dgm1_raster", unavailable)

    assert build_terrain.main() == 1
    captured = capsys.readouterr()
    assert "kein simuliertes Flachraster" in captured.err
