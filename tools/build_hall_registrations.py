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


MAX_DREHUNG_GRAD = 5.0
"""Wie weit die Suche drehen darf.

Der bekannte Fehler ist rund 2,2 Grad und stammt aus `buildings.json`: der
Hallenplan wurde mit dem Drehwinkel des alten Modellfits (-31,0126 Grad) ins
Gelaende gelegt statt mit der Ausrichtung der Gebaeude, die bei 28,78 Grad
liegt. Fuenf Grad lassen dafuer Luft, ohne dass eine Halle in die Nachbarhalle
kippen kann -- ab etwa acht Grad findet die Suche bei laenglichen Hallen
Scheinloesungen quer zur eigentlichen Achse.
"""


def laengste_kante(polygon: list[list[float]]) -> float:
    """Richtung der laengsten Kante in Grad, modulo 90.

    Bei Hallen ist das die Hauptfassade. Modulo 90, weil ein Rechteck seine
    Ausrichtung viermal wiederholt -- ohne das waere jede zweite Halle um
    90 Grad daneben.
    """
    ecken = polygon[:-1] if polygon[0] == polygon[-1] else polygon
    beste = (0.0, 0.0)
    for i in range(len(ecken)):
        a, b = ecken[i], ecken[(i + 1) % len(ecken)]
        d = math.dist(a, b)
        if d > beste[0]:
            beste = (d, math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 90)
    return beste[1]


def winkelkorrektur(paare: list[tuple[list, list]]) -> float:
    """Wie schief der ganze Hallenplan gegen die amtlichen Gebaeude steht.

    Der Winkelfehler ist global und nicht hallenweise: er stammt aus der
    Drehung in `buildings.json`, mit der der Plan ins Gelaende gelegt wurde.
    Deshalb wird er einmal ueber alle Hallen bestimmt und nicht je Halle
    geraten -- eine einzelne Halle koennte auch aus anderen Gruenden schief
    liegen, alle zusammen nicht.

    Genommen wird der **Median**: L-foermige Grundrisse wie Halle 2 liefern
    eine laengste Kante, die nicht die Hauptachse ist, und ein Mittelwert
    liesse sich davon ziehen.
    """
    unterschiede = []
    for hall_polygon, target_polygon in paare:
        d = (laengste_kante(target_polygon) - laengste_kante(hall_polygon) + 45) % 90 - 45
        unterschiede.append(d)
    if not unterschiede:
        return 0.0
    unterschiede.sort()
    return unterschiede[len(unterschiede) // 2]


def containment_fit(hall_polygon: list[list[float]], target_polygons: list[list[list[float]]],
                    radius: int = 30, vordrehung: float = 0.0) -> dict | None:
    """Sucht hallenweise Drehung und Verschiebung mit maximaler Abdeckung.

    Frueher wurde nur verschoben. Damit liess sich der Winkelfehler nicht
    einholen: eine verdrehte Halle deckt ihr Gebaeude in der Mitte, steht aber
    an beiden Enden heraus, und jede Verschiebung macht das eine Ende besser
    und das andere schlechter. Auf 220 m Hallenlaenge sind 2,2 Grad an den
    Enden gut 4 m -- genug, um in den Boulevard zu ragen.

    Gedreht wird um den **eigenen Schwerpunkt**: die Halle soll sich an Ort
    und Stelle geraderuecken und nicht um einen fremden Punkt wandern.
    """
    if not target_polygons:
        return None
    samples = sample_polygon(hall_polygon)
    schwerpunkt = (sum(p[0] for p in samples) / len(samples),
                   sum(p[1] for p in samples) / len(samples))
    prepared = [(target, (min(p[0] for p in target), min(p[1] for p in target),
                          max(p[0] for p in target), max(p[1] for p in target)))
                for target in target_polygons]

    def coverage(dx: float, dy: float, grad: float = 0.0) -> float:
        bogen = math.radians(grad)
        cos, sin = math.cos(bogen), math.sin(bogen)
        cx, cy = schwerpunkt
        inside_count = 0
        for x, y in samples:
            rx, ry = x - cx, y - cy
            px = cx + cos * rx - sin * ry + dx
            py = cy + sin * rx + cos * ry + dy
            if any(bounds[0] <= px <= bounds[2] and bounds[1] <= py <= bounds[3]
                   and inside(target, (px, py)) for target, bounds in prepared):
                inside_count += 1
        return 100.0 * inside_count / len(samples)

    def besser(kandidat, bisher) -> bool:
        """Mehr Abdeckung gewinnt; bei Gleichstand die kleinere Bewegung.

        Ohne die zweite Bedingung waehlt die Suche bei mehreren gleich guten
        Loesungen die zuerst gefundene -- also eine, die zufaellig am Rand des
        Suchfensters liegt.
        """
        if kandidat[0] != bisher[0]:
            return kandidat[0] > bisher[0]
        return (math.hypot(kandidat[1], kandidat[2]) + abs(kandidat[3] - vordrehung) * 10
                < math.hypot(bisher[1], bisher[2]) + abs(bisher[3] - vordrehung) * 10)

    before = coverage(0, 0)
    # Gestartet wird auf der globalen Winkelkorrektur, nicht bei null: die
    # Abdeckung saettigt bei 100 Prozent, sobald die Halle ganz im Gebaeude
    # liegt, und kann die Drehung deshalb nicht selbst finden. Gesucht wird
    # nur noch, was darueber hinaus noetig ist.
    best = (coverage(0.0, 0.0, vordrehung), 0.0, 0.0, vordrehung)
    # Grob ueber Drehung und Verschiebung zugleich -- getrennt zu suchen fuehrt
    # in ein falsches Optimum, weil die beste Verschiebung ohne Drehung eine
    # andere ist als die mit.
    schritt_grad = 0.5
    schritte = int(MAX_DREHUNG_GRAD / schritt_grad)
    for i in range(-schritte, schritte + 1):
        grad = vordrehung + i * schritt_grad
        for dx in range(-radius, radius + 1, 3):
            for dy in range(-radius, radius + 1, 3):
                kandidat = (coverage(dx, dy, grad), float(dx), float(dy), grad)
                if besser(kandidat, best):
                    best = kandidat
    # Dann um den Sieger herum auf 25 cm und 0,05 Grad verfeinern.
    coarse = best
    for ig in range(-5, 6):
        grad = coarse[3] + ig * 0.05
        for ix in range(-6, 7):
            for iy in range(-6, 7):
                dx, dy = coarse[1] + ix * 0.25, coarse[2] + iy * 0.25
                kandidat = (coverage(dx, dy, grad), dx, dy, grad)
                if besser(kandidat, best):
                    best = kandidat
    return {"translation": [round(best[1], 3), round(best[2], 3)],
            "rotationDeg": round(best[3], 3),
            "pivot": [round(schwerpunkt[0], 3), round(schwerpunkt[1], 3)],
            "coverageBeforePct": round(before, 2), "coverageAfterPct": round(best[0], 2),
            "samples": len(samples), "searchRadiusM": radius,
            "maxRotationDeg": MAX_DREHUNG_GRAD,
            "vordrehungDeg": round(vordrehung, 3),
            "shiftM": round(math.hypot(best[1], best[2]), 3)}


TRANSFORM_VERSION = 3
"""Fassung der Verortung. Erhoehen, wenn sich das Ergebnis aendert.

1 -- globale Passung, hallenweise nur verschoben.
2 -- Drehung mitgesucht (brachte nichts, siehe `containment_fit`).
3 -- globale Winkelkorrektur aus `winkelkorrektur()`, +2,21 Grad.
"""

# Wie weit eine Ecke draussen liegen darf, bevor die Halle zur Nachpruefung
# gemeldet wird. Zwei Meter decken die Wandstaerke und das uebliche Spiel
# zwischen Plan und amtlichem Umriss ab.
MELDEGRENZE_M = 2.0


def abstand_zur_kante(punkt: tuple[float, float], ring: list[list[float]]) -> float:
    """Kuerzester Abstand eines Punktes zum Rand eines Polygons."""
    best = float("inf")
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        vx, vy = b[0] - a[0], b[1] - a[1]
        l2 = vx * vx + vy * vy
        t = 0.0 if l2 == 0 else max(0.0, min(1.0,
            ((punkt[0] - a[0]) * vx + (punkt[1] - a[1]) * vy) / l2))
        best = min(best, math.dist(punkt, (a[0] + t * vx, a[1] + t * vy)))
    return best


def passungsbefund(hall_polygon: list[list[float]], target_polygons: list[list[list[float]]],
                   constraint: dict | None) -> dict:
    """Wie gut die Halle in ihre Zielgebaeude passt -- als Zahl, nicht als Urteil.

    **Regel: aus einer schlechten Passung wird nichts abgeschnitten.** Eine
    Halle, die nicht in ihren amtlichen Umriss passt, ist ein Hinweis auf ein
    Daten- oder Transformproblem und kein Muell. Wer sie zurechtstutzt,
    vernichtet genau die Staende, die den Hinweis gegeben haetten -- bei
    Halle 10.2 waeren das 10 Prozent der Halle mitsamt ihrer Belegung.

    Deshalb steht das Ergebnis hier als Befund in den Daten. Sichtbar,
    nachrechenbar, und beim naechsten Blick vergleichbar.

    Die Ecken werden getrennt von der Abdeckung gezaehlt, weil beide
    verschiedene Fragen beantworten: die Abdeckung tastet Innenpunkte im
    10-m-Raster ab und erreicht 100 Prozent, auch wenn Ecken herausstehen --
    das Raster trifft sie nicht. Genau diese Luecke hat den Befund lange
    verdeckt.
    """
    ringe = [t[:-1] if t[0] == t[-1] else t for t in target_polygons]
    grad = (constraint or {}).get("rotationDeg", 0.0)
    dx, dy = (constraint or {}).get("translation", [0.0, 0.0])
    cx, cy = (constraint or {}).get("pivot", [0.0, 0.0])
    bogen = math.radians(grad)
    cos, sin = math.cos(bogen), math.sin(bogen)

    draussen = []
    for x, y in hall_polygon:
        rx, ry = x - cx, y - cy
        p = (cx + cos * rx - sin * ry + dx, cy + sin * rx + cos * ry + dy)
        if not ringe or any(inside(ring, p) for ring in ringe):
            continue
        draussen.append(min(abstand_zur_kante(p, ring) for ring in ringe))

    befund = {
        "transformVersion": TRANSFORM_VERSION,
        "targetFeatureCount": len(ringe),
        "fitPercent": (constraint or {}).get("coverageAfterPct"),
        "outsideCornerCount": len(draussen),
        "maxOutsideDistanceM": round(max(draussen), 2) if draussen else 0.0,
    }
    gruende = []
    if not ringe:
        gruende.append("kein amtliches Zielfeature zugeordnet")
    if befund["fitPercent"] is not None and befund["fitPercent"] < 99.5:
        gruende.append("Planflaeche passt nicht vollstaendig in den amtlichen Umriss "
                       "-- moeglicherweise fehlt ein Zielkoerper")
    if befund["maxOutsideDistanceM"] > MELDEGRENZE_M:
        gruende.append(f"Ecke liegt {befund['maxOutsideDistanceM']} m ausserhalb; "
                       "Planumriss ist einfacher geschnitten als das Gebaeude")
    befund["geometryMismatch"] = bool(gruende)
    befund["reviewReason"] = "; ".join(gruende) or None
    return befund


def shifted_transform(base: dict, constraint: dict) -> dict:
    """Haengt Drehung und Verschiebung einer Halle an die globale Passung.

    Die Halle wird zuerst im Planbild um ihren Schwerpunkt gedreht und
    verschoben, danach greift die globale Abbildung. Als eine Matrix:

        q = M * (R * (p - c) + c + s) + t
          = (M * R) * p  +  M * (c - R * c + s) + t

    Ausgerechnet wird beides hier, damit `transform_point` weiterhin eine
    einzige Matrix und eine einzige Verschiebung anwendet -- der Rest der
    Pipeline muss von der Drehung nichts wissen.
    """
    transform = {**base, "translation": list(base["translation"]),
                 "matrix2D": list(base["matrix2D"])}
    shift = constraint["translation"]
    grad = constraint.get("rotationDeg", 0.0)
    cx, cy = constraint.get("pivot", [0.0, 0.0])
    bogen = math.radians(grad)
    cos, sin = math.cos(bogen), math.sin(bogen)
    a, b, c, d = transform["matrix2D"]

    # M * R
    transform["matrix2D"] = [
        round(a * cos + b * sin, 10), round(-a * sin + b * cos, 10),
        round(c * cos + d * sin, 10), round(-c * sin + d * cos, 10),
    ]
    # c - R*c + s, noch im Planbild
    ox = cx - (cos * cx - sin * cy) + shift[0]
    oy = cy - (sin * cx + cos * cy) + shift[1]
    transform["translation"][0] = round(transform["translation"][0] + a * ox + b * oy, 3)
    transform["translation"][1] = round(transform["translation"][1] + c * ox + d * oy, 3)
    transform["rotationDeg"] = round(base["rotationDeg"] + grad, 4)
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
    # Erst die globale Schieflage bestimmen, dann jede Halle darauf setzen.
    paare = []
    for hall in site["halls"]:
        ziel = targets.get(hall["key"], {}).get("buildingIds", [])
        umrisse = [building_by_id[f]["footprint"] for f in ziel
                   if f in building_by_id and building_by_id[f].get("footprint")]
        if umrisse:
            paare.append((hall["footprint"], max(umrisse, key=len)))
    vordrehung = winkelkorrektur(paare)
    print(f"  Winkelkorrektur des Hallenplans: {vordrehung:+.2f} Grad "
          f"(aus {len(paare)} Hallen)")

    registrations = []
    for hall in sorted(site["halls"], key=lambda item: item["key"]):
        placement = hall["placement"]
        target = targets.get(hall["key"], {})
        target_ids = target.get("buildingIds", [])
        target_polygons = [building_by_id[feature_id]["footprint"] for feature_id in target_ids
                           if feature_id in building_by_id and building_by_id[feature_id].get("footprint")]
        constraint = containment_fit(hall["footprint"], target_polygons,
                                     vordrehung=vordrehung)
        hall_transform = shifted_transform(transform, constraint) if constraint else dict(transform)
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
            "befund": passungsbefund(hall["footprint"], target_polygons, constraint),
            "notes": [
                ("Hallenweise gegen amtliche Zielfeature-Grundrisse gedreht und verschoben."
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
