"""Minimaler GeoPackage/WKB-Leser fuer ALKIS-Polygone, ohne GIS-Abhaengigkeit."""
from __future__ import annotations

import struct


def envelope(blob: bytes) -> tuple[float, float, float, float] | None:
    """Liest die optionale XY-Envelope ohne die WKB-Geometrie zu dekodieren."""
    if blob[:2] != b"GP" or ((blob[3] >> 1) & 7) == 0:
        return None
    endian = "<" if blob[3] & 1 else ">"
    minx, maxx, miny, maxy = struct.unpack_from(endian + "dddd", blob, 8)
    return minx, miny, maxx, maxy


def polygons(blob: bytes) -> list[list[tuple[float, float]]]:
    """Liest Polygon/MultiPolygon aus einem GeoPackage-Geometrieblob."""
    if blob[:2] != b"GP":
        raise ValueError("kein GeoPackage-Geometrieblob")
    flags = blob[3]
    envelope = (flags >> 1) & 7
    dimensions = {0: 0, 1: 4, 2: 6, 3: 6, 4: 8}.get(envelope)
    if dimensions is None:
        raise ValueError(f"unbekannter Envelope-Typ {envelope}")
    offset = 8 + dimensions * 8

    def read_geometry(at: int):
        endian = "<" if blob[at] == 1 else ">"
        kind = struct.unpack_from(endian + "I", blob, at + 1)[0] & 0xFF
        at += 5
        if kind == 3:
            count = struct.unpack_from(endian + "I", blob, at)[0]
            at += 4
            rings = []
            for _ in range(count):
                size = struct.unpack_from(endian + "I", blob, at)[0]
                at += 4
                ring = [struct.unpack_from(endian + "dd", blob, at + i * 16)
                        for i in range(size)]
                at += size * 16
                rings.append(ring)
            return rings[:1], at  # Innenloecher sind keine Grundrisse.
        if kind == 6:
            count = struct.unpack_from(endian + "I", blob, at)[0]
            at += 4
            out = []
            for _ in range(count):
                found, at = read_geometry(at)
                out.extend(found)
            return out, at
        raise ValueError(f"nicht unterstuetzter WKB-Typ {kind}")

    return read_geometry(offset)[0]
