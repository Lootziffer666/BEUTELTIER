#!/usr/bin/env python3
"""Baut den lokalen Einstiegspunkt fuer Weltpakete und Fallbacks."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "app" / "public"
OUTPUT = ROOT / "data" / "build" / "world-manifest.json"
MODEL_VERSION = "2026.08.1"


def local_asset(path: str, role: str, status: str = "legacy") -> dict:
    file_path = PUBLIC / path
    return {
        "id": Path(path).stem,
        "role": role,
        "status": status,
        "uri": path,
        "bytes": file_path.stat().st_size if file_path.exists() else None,
        "available": file_path.exists(),
    }


def diagnostic_asset() -> dict:
    report_path = ROOT / "data/build/official-world-diagnostic.json"
    report = json.loads(report_path.read_text()) if report_path.exists() else None
    return {
        "id": "official-world-diagnostic",
        "role": "diagnostic-world",
        "status": "development",
        "uri": "models/world/diagnostic/official-world-diagnostic.glb",
        "bytes": report.get("bytes") if report else None,
        # Das Entwicklungs-GLB wird absichtlich nicht ins PWA-Paket kopiert.
        "available": False,
        "reportAvailable": report is not None,
    }


def planned_world_packages() -> list[dict]:
    report_path = ROOT / "data/build/world-packages.json"
    if not report_path.exists():
        return []
    report = json.loads(report_path.read_text())
    return [{**package, "status": "development", "available": False}
            for package in report["packages"]]


def build_product(origin: dict, registrations: dict) -> dict:
    return {
        "schema": "beuteltier.world.v1",
        "modelVersion": MODEL_VERSION,
        "status": "migration",
        "origin": origin["origin"],
        "coordinateSystem": {
            "sourceCrs": origin["sourceCrs"],
            **origin["axisConvention"],
        },
        "packages": [
            local_asset("models/messe.glb", "render-world"),
            diagnostic_asset(),
            *planned_world_packages(),
        ],
        "data": {
            "hallRegistrations": "data/hall-registrations.json",
            "lod2Inventory": "data/lod2-inventory.json",
            "worldOrigin": "data/world-origin.json",
            "materialClasses": "data/material-classes.json",
            "walkableSurfaces": "data/walkable-surfaces.json",
            "portals": "data/portals.json",
            "officialWorldDiagnostic": "data/official-world-diagnostic.json",
            "worldPackages": "data/world-packages.json",
            "surfaceClassification": "data/surface-classification.json",
            "visibilityAnalysis": "data/visibility-analysis.json",
            "collisionSurfaces": "data/collision-surfaces.json",
        },
        "registrationSummary": registrations["counts"],
        "fallback": {
            "orthophoto": True,
            "uri": "models/gelaende.jpg",
            "walkable": False,
        },
        "runtimeDependencies": {
            "networkRequired": False,
            "realityMeshRequired": False,
        },
        "notes": [
            "Das bestehende Messe-GLB bleibt waehrend der Migration erhalten.",
            "status=legacy kennzeichnet es ausdruecklich als noch nicht paketierte amtliche Welt.",
            "Das Orthofoto ist niemals automatisch begehbar.",
        ],
    }


def main() -> int:
    origin = json.loads((ROOT / "data/build/world-origin.json").read_text())
    registrations = json.loads(
        (ROOT / "data/build/hall-registrations.json").read_text()
    )
    product = build_product(origin, registrations)
    OUTPUT.write_text(json.dumps(product, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    package = product["packages"][0]
    print(f"World-Manifest {MODEL_VERSION}: {package['uri']} "
          f"({'vorhanden' if package['available'] else 'fehlt'})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
