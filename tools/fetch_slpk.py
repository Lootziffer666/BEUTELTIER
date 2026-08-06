#!/usr/bin/env python3
"""Laedt und inspiziert das reale LoD2-SLPK fuer den Koelnmesse-Bereich.

Das Paket Teil 16 wurde anhand der amtlichen Produktionsblock-Uebersicht und
seiner Extent (E 353266..361105) bestimmt. Der Abruf ist ein Spike: Neben dem
lokal ignorierten Paket werden ein reproduzierbarer Inspektionsbericht und die
Lizenzangabe geschrieben. Ein I3S-Parser wird bewusst erst gerechtfertigt,
wenn das Paket Bildtexturen enthaelt.
"""
from __future__ import annotations

import collections
import gzip
import json
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "raw" / "slpk"
NAME = "LOD2_NRW_Teil16.slpk"
BASE = "https://www.opengeodata.nrw.de/produkte/geobasis/3dg/lod2_slpk/lod2_slpk/"
URL = BASE + NAME
USER_AGENT = "BEUTELTIER/1.0 (gamescom-Begleitapp; Datenaufbereitung)"


def read_json(archive: zipfile.ZipFile, name: str) -> dict:
    payload = archive.read(name)
    if name.endswith(".gz"):
        payload = gzip.decompress(payload)
    return json.loads(payload)


def inspect(path: Path) -> dict:
    """Zaehlt I3S-Bestandteile und prueft alle Materialdefinitionen."""
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        layer = read_json(archive, "3dSceneLayer.json.gz")
        shared = [n for n in names if n.endswith("sharedResource.json.gz")]
        image_refs = 0
        textured_materials = 0
        for name in shared:
            resource = read_json(archive, name)
            for texture in resource.get("textureDefinitions", {}).values():
                images = texture.get("images", [])
                image_refs += len(images)
                textured_materials += bool(images)

        suffixes = collections.Counter(
            name.rsplit(".", 1)[-1].lower()
            if "." in name.rsplit("/", 1)[-1] else "(none)"
            for name in names
        )
        extent = layer["fullExtent"]
        has_images = any(
            name.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".ktx"))
            for name in names
        )
        return {
            "schema": "beuteltier.slpk-spike.v1",
            "file": path.name,
            "fileBytes": path.stat().st_size,
            "layerName": layer.get("name"),
            "i3sVersion": layer.get("store", {}).get("version"),
            "crs": extent["spatialReference"].get("latestWkid", extent["spatialReference"].get("wkid")),
            "extent": {key: extent[key] for key in ("xmin", "ymin", "xmax", "ymax", "zmin", "zmax")},
            "archiveEntries": len(names),
            "entrySuffixes": dict(sorted(suffixes.items())),
            "sharedResources": len(shared),
            "textureImageReferences": image_refs,
            "texturedMaterials": textured_materials,
            "imageFiles": has_images,
            "decision": "reject-as-material-source" if not image_refs and not has_images else "parser-spike-justified",
            "finding": ("Das SLPK enthaelt I3S-Geometrie, Attribute und Vertexfarben, "
                        "aber keine Bilddateien oder Bildreferenzen in Materialien. "
                        "Gegenueber CityGML plus Orthofoto entsteht daher keine zusaetzliche Fototextur."),
        }


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / NAME
    if not target.exists() or target.stat().st_size == 0:
        print(f"SLPK laden: {URL}")
        request = urllib.request.Request(URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=600) as response, target.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
    else:
        print(f"{NAME}: schon da ({target.stat().st_size / 1e6:.1f} MB)")

    report = inspect(target)
    (OUT_DIR / "inspection.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (OUT_DIR / "QUELLE.json").write_text(json.dumps({
        "title": "3D-Gebaeudemodell LoD2, Scene Layer Package Teil 16",
        "provider": "Geobasis NRW / Bezirksregierung Koeln",
        "url": URL,
        "crs": "ETRS89 / UTM32N (EPSG:25832)",
        "licence": "Datenlizenz Deutschland Zero 2.0 (dl-de/zero-2-0)",
        "usage": "Inspektions-Spike; wegen fehlender Bildtexturen nicht als Materialquelle uebernommen",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
