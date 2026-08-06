#!/usr/bin/env python3
"""Erzeugt explizite, hallenweise Registrierungsdatensaetze.

Der aktuelle Bestand besitzt noch keine amtlich vermessenen Anker je Halle.
Deshalb wird die vorhandene globale Passung lediglich als *draft*-Startwert
ausgeschrieben. Entscheidend ist: Unsicherheit, Spiegelung und Herkunft sind
maschinenlesbar, statt die alte Passung weiter als raeumliche Wahrheit zu
verstecken. Spaetere Anker ersetzen einzelne Eintraege, nicht das Schema.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "data" / "build" / "site.json"
BUILDINGS = ROOT / "data" / "build" / "buildings.json"
WORLD_ORIGIN = ROOT / "data" / "build" / "world-origin.json"
OUTPUT = ROOT / "data" / "build" / "hall-registrations.json"


def inside(polygon: list[list[float]], point: tuple[float, float]) -> bool:
    x, y = point
    hit = False
    for index, (ax, ay) in enumerate(polygon):
        bx, by = polygon[index - 1]
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            hit = not hit
    return hit


def sample_polygon(polygon: list[list[float]], step: float = 10.0) -> list[tuple[float, float]]:
    """Regelmaessige Innenpunkte; unabhaengig von Stand- und Portalzahlen."""
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    samples = []
    x = min(xs) + step / 2
    while x < max(xs):
        y = min(ys) + step / 2
        while y < max(ys):
            if inside(polygon, (x, y)):
                samples.append((x, y))
            y += step
        x += step
    return samples or [tuple(polygon[0])]


def containment_fit(hall_polygon: list[list[float]], target_polygons: list[list[list[float]]],
                    radius: int = 30) -> dict | None:
    """Sucht hallenweise die kleinste Verschiebung mit maximaler Gebaeudeabdeckung."""
    if not target_polygons:
        return None
    samples = sample_polygon(hall_polygon)
    prepared = [(target, (min(p[0] for p in target), min(p[1] for p in target),
                          max(p[0] for p in target), max(p[1] for p in target)))
                for target in target_polygons]

    def coverage(dx: float, dy: float) -> float:
        inside_count = 0
        for x, y in samples:
            px, py = x + dx, y + dy
            if any(bounds[0] <= px <= bounds[2] and bounds[1] <= py <= bounds[3]
                   and inside(target, (px, py)) for target, bounds in prepared):
                inside_count += 1
        return 100.0 * inside_count / len(samples)

    before = coverage(0, 0)
    best = (before, 0.0, 0.0)
    # Erst grob, dann um den Sieger auf 25 cm verfeinern.
    for dx in range(-radius, radius + 1, 2):
        for dy in range(-radius, radius + 1, 2):
            score = coverage(dx, dy)
            if score > best[0] or (score == best[0] and math.hypot(dx, dy) < math.hypot(best[1], best[2])):
                best = (score, float(dx), float(dy))
    coarse = best
    for ix in range(-4, 5):
        for iy in range(-4, 5):
            dx, dy = coarse[1] + ix * 0.25, coarse[2] + iy * 0.25
            score = coverage(dx, dy)
            if score > best[0] or (score == best[0] and math.hypot(dx, dy) < math.hypot(best[1], best[2])):
                best = (score, dx, dy)
    return {"translation": [round(best[1], 3), round(best[2], 3)],
            "coverageBeforePct": round(before, 2), "coverageAfterPct": round(best[0], 2),
            "samples": len(samples), "searchRadiusM": radius,
            "shiftM": round(math.hypot(best[1], best[2]), 3)}


def shifted_transform(base: dict, shift: list[float]) -> dict:
    transform = {**base, "translation": list(base["translation"]),
                 "matrix2D": list(base["matrix2D"])}
    a, b, c, d = transform["matrix2D"]
    transform["translation"][0] = round(transform["translation"][0] + a * shift[0] + b * shift[1], 3)
    transform["translation"][1] = round(transform["translation"][1] + c * shift[0] + d * shift[1], 3)
    return transform


def draft_transform(fit: dict, origin: list[float]) -> dict:
    """Konvertiert die bisherige Plan->UTM-Passung in die lokale X/Z-Ebene."""
    angle = math.radians(fit["rotationDeg"])
    cos, sin = math.cos(angle), math.sin(angle)
    tx, ty = fit["translation"]
    ox, oy, _oz = origin
    # worldX = c*x - s*y + tx; sceneZ = -(worldY-originY).
    return {
        "rotationDeg": fit["rotationDeg"],
        "scale": 1.0,
        "translation": [round(tx - ox, 3), round(oy - ty, 3)],
        "mirroredSceneZ": True,
        "matrix2D": [
            round(cos, 10), round(-sin, 10),
            round(-sin, 10), round(-cos, 10),
        ],
    }


def transform_point(point: tuple[float, float], transform: dict) -> tuple[float, float]:
    a, b, c, d = transform["matrix2D"]
    tx, ty = transform["translation"]
    return a * point[0] + b * point[1] + tx, c * point[0] + d * point[1] + ty


def build_product(site: dict, buildings: dict, world_origin: dict) -> dict:
    origin = world_origin["origin"]
    transform = draft_transform(buildings["fit"], origin)
    targets = buildings.get("hallBuildings", {})
    building_by_id = {item["id"]: item for item in buildings.get("buildings", [])}
    ground_reference = buildings["source"]["groundReferenceM"]
    registrations = []
    for hall in sorted(site["halls"], key=lambda item: item["key"]):
        placement = hall["placement"]
        target = targets.get(hall["key"], {})
        target_ids = target.get("buildingIds", [])
        target_polygons = [building_by_id[feature_id]["footprint"] for feature_id in target_ids
                           if feature_id in building_by_id and building_by_id[feature_id].get("footprint")]
        constraint = containment_fit(hall["footprint"], target_polygons)
        hall_transform = shifted_transform(transform, constraint["translation"]) if constraint else dict(transform)
        floor_world = ground_reference + hall["baseY"]
        registrations.append({
            "hallKey": hall["key"],
            "targetFeatureIds": target_ids,
            "transform": hall_transform,
            "floorZ": round(floor_world - origin[2], 3),
            "floorWorldZ": round(floor_world, 3),
            "anchors": [],
            "residualM": placement.get("residualM"),
            "maxResidualM": placement.get("maxResidualM"),
            "status": "constrained" if constraint else "draft",
            "source": "official-footprint-containment" if constraint else "legacy-global-fit",
            "constraint": constraint,
            "notes": [
                ("Hallenweise gegen amtliche Zielfeature-Grundrisse verschoben."
                 if constraint else "Noch keine amtlichen Zielfeatures dieser Hallenebene."),
                "Containment ist eine geometrische Nebenbedingung, kein vermessener Anker.",
                "Portale wurden nicht als Registrierungsanker verwendet.",
            ],
        })
    return {
        "schema": "beuteltier.hall-registrations.v1",
        "coordinatePlane": "sceneX/sceneZ",
        "origin": origin,
        "registrations": registrations,
        "counts": {
            "total": len(registrations),
            "draft": sum(item["status"] == "draft" for item in registrations),
            "registered": 0,
            "constrained": sum(item["status"] == "constrained" for item in registrations),
            "withTargetFeatures": sum(bool(item["targetFeatureIds"])
                                      for item in registrations),
        },
    }


def main() -> int:
    inputs = (SITE, BUILDINGS, WORLD_ORIGIN)
    missing = [path.relative_to(ROOT) for path in inputs if not path.exists()]
    if missing:
        raise SystemExit(f"Fehlende Eingaben: {', '.join(map(str, missing))}")
    product = build_product(*(
        json.loads(path.read_text(encoding="utf-8")) for path in inputs
    ))
    OUTPUT.write_text(json.dumps(product, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    counts = product["counts"]
    print(f"{counts['total']} Hallenebenen, {counts['withTargetFeatures']} mit "
          f"Zielfeatures -> {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
