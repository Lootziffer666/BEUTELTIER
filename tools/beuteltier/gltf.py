"""Schreibt ein GLB -- glTF 2.0 im Binaerformat.

Absichtlich von Hand und ohne Fremdbibliothek: das Format ist ueberschaubar,
und so bleibt unter Kontrolle, was in der Datei landet. Die App laedt sie mit
``useGLTF``; jedes Primitiv bekommt ein eigenes Material, damit sich Waende,
Daecher und Boden getrennt einfaerben und ausblenden lassen.

Achsen: three.js rechnet mit Y nach oben. Uebergeben werden Punkte bereits in
Szenenkoordinaten (x, hoehe, -y) -- die Umrechnung passiert dort, wo auch der
Rest der App sie macht, und nicht versteckt hier drin.
"""
from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field
from pathlib import Path

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942

FLOAT = 5126
UNSIGNED_INT = 5125
ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963


@dataclass
class Part:
    """Ein Teilnetz mit eigenem Material."""

    name: str
    colour: tuple[float, float, float, float]
    positions: list[float] = field(default_factory=list)
    normals: list[float] = field(default_factory=list)
    uvs: list[float] = field(default_factory=list)
    indices: list[int] = field(default_factory=list)
    metallic: float = 0.0
    roughness: float = 0.9
    texture: str | None = None

    def add_triangle(self, a, b, c, uv=None) -> None:
        """``uv`` bekommt einen Szenenpunkt und liefert (u, v) im Bild."""
        base = len(self.positions) // 3
        normal = _normal(a, b, c)
        for point in (a, b, c):
            self.positions.extend(point)
            self.normals.extend(normal)
            if uv is not None:
                self.uvs.extend(uv(point))
        self.indices.extend((base, base + 1, base + 2))

    @property
    def triangle_count(self) -> int:
        return len(self.indices) // 3


def _normal(a, b, c) -> tuple[float, float, float]:
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    length = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
    return (nx / length, ny / length, nz / length)


def _pad(data: bytearray, alignment: int = 4, filler: int = 0) -> None:
    while len(data) % alignment:
        data.append(filler)


def write_glb(path: str | Path, parts: list[Part], *,
              generator: str = "BEUTELTIER", extras: dict | None = None,
              images: list[str] | None = None) -> int:
    """Schreibt die Teilnetze als GLB und gibt die Dateigroesse zurueck."""
    parts = [part for part in parts if part.triangle_count]
    if not parts:
        raise ValueError("nichts zu schreiben")

    buffer = bytearray()
    accessors: list[dict] = []
    buffer_views: list[dict] = []
    materials: list[dict] = []
    primitives: list[dict] = []

    def add_view(payload: bytes, target: int) -> int:
        _pad(buffer)
        offset = len(buffer)
        buffer.extend(payload)
        buffer_views.append({"buffer": 0, "byteOffset": offset,
                             "byteLength": len(payload), "target": target})
        return len(buffer_views) - 1

    for part in parts:
        has_uv = len(part.uvs) * 3 == len(part.positions) * 2
        position_bytes = struct.pack(f"<{len(part.positions)}f", *part.positions)
        normal_bytes = struct.pack(f"<{len(part.normals)}f", *part.normals)
        index_bytes = struct.pack(f"<{len(part.indices)}I", *part.indices)

        count = len(part.positions) // 3
        xs = part.positions[0::3]
        ys = part.positions[1::3]
        zs = part.positions[2::3]

        position_view = add_view(position_bytes, ARRAY_BUFFER)
        accessors.append({"bufferView": position_view, "componentType": FLOAT,
                          "count": count, "type": "VEC3",
                          "min": [min(xs), min(ys), min(zs)],
                          "max": [max(xs), max(ys), max(zs)]})
        position_accessor = len(accessors) - 1

        normal_view = add_view(normal_bytes, ARRAY_BUFFER)
        accessors.append({"bufferView": normal_view, "componentType": FLOAT,
                          "count": count, "type": "VEC3"})
        normal_accessor = len(accessors) - 1

        uv_accessor = None
        if has_uv:
            uv_bytes = struct.pack(f"<{len(part.uvs)}f", *part.uvs)
            uv_view = add_view(uv_bytes, ARRAY_BUFFER)
            accessors.append({"bufferView": uv_view, "componentType": FLOAT,
                              "count": count, "type": "VEC2"})
            uv_accessor = len(accessors) - 1

        index_view = add_view(index_bytes, ELEMENT_ARRAY_BUFFER)
        accessors.append({"bufferView": index_view, "componentType": UNSIGNED_INT,
                          "count": len(part.indices), "type": "SCALAR"})
        index_accessor = len(accessors) - 1

        pbr = {
            "baseColorFactor": list(part.colour),
            "metallicFactor": part.metallic,
            "roughnessFactor": part.roughness,
        }
        # Die Textur wird nicht eingebettet: das Luftbild ist 3,6 MB und wird
        # ohnehin als eigene Datei ausgeliefert. Der Name steht in den Extras,
        # die App haengt es dort an -- so bleibt das GLB klein und die Textur
        # einzeln austauschbar.
        materials.append({
            "name": part.name,
            "pbrMetallicRoughness": pbr,
            "doubleSided": True,
            "extras": ({"texture": part.texture} if part.texture else {}),
        })
        attributes = {"POSITION": position_accessor, "NORMAL": normal_accessor}
        if uv_accessor is not None:
            attributes["TEXCOORD_0"] = uv_accessor
        primitives.append({
            "attributes": attributes,
            "indices": index_accessor,
            "material": len(materials) - 1,
            "extras": {"name": part.name,
                       **({"texture": part.texture} if part.texture else {})},
        })

    document = {
        "asset": {"version": "2.0", "generator": generator},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "messegelaende"}],
        "meshes": [{"name": "messegelaende", "primitives": primitives}],
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(buffer)}],
    }
    if extras:
        document["extras"] = extras

    json_bytes = bytearray(json.dumps(document, separators=(",", ":")).encode("utf-8"))
    _pad(json_bytes, filler=0x20)
    _pad(buffer)

    total = 12 + 8 + len(json_bytes) + 8 + len(buffer)
    with open(path, "wb") as handle:
        handle.write(struct.pack("<III", GLB_MAGIC, 2, total))
        handle.write(struct.pack("<II", len(json_bytes), JSON_CHUNK))
        handle.write(json_bytes)
        handle.write(struct.pack("<II", len(buffer), BIN_CHUNK))
        handle.write(buffer)
    return total
