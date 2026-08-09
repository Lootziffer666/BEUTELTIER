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
    """Innenpunkte **und** der Rand; unabhaengig von Stand- und Portalzahlen.

    Der Rand muss mit hinein, sonst kann die Passung ihn nicht sehen. Ein
    reines Innenraster von 10 m saettigt bei 100 Prozent, sobald die Halle
    grob im Gebaeude liegt -- und meldet dann Erfolg, waehrend Ecken bis zu
    8,8 m draussen stehen. Das Raster trifft sie schlicht nicht.

    Danach gibt es keine Sattigung mehr: unter vielen gleich guten Lagen
    gewinnt die, bei der auch die Ecken drin sind. Und weil die Planflaeche
    meist kleiner ist als das Gebaeude (76 bis 96 Prozent), gibt es eine
    solche Lage in aller Regel.
    """
    ecken = polygon[:-1] if polygon[0] == polygon[-1] else polygon
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

    # Die Ecken selbst, und der Rand dazwischen in denselben Schritten -- eine
    # lange Kante darf nicht schlechter vertreten sein als eine kurze.
    rand: list[tuple[float, float]] = []
    for i in range(len(ecken)):
        a, b = ecken[i], ecken[(i + 1) % len(ecken)]
        rand.append((a[0], a[1]))
        laenge = math.dist(a, b)
        for k in range(1, int(laenge / step)):
            t = k * step / laenge
            rand.append((a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])))
    return (samples + rand) or [tuple(polygon[0])]


MAX_DREHUNG_GRAD = 5.0
"""Wie weit die Suche drehen darf.

Der bekannte Fehler ist rund 2,2 Grad und stammt aus `buildings.json`: der
Hallenplan wurde mit dem Drehwinkel des alten Modellfits (-31,0126 Grad) ins
Gelaende gelegt statt mit der Ausrichtung der Gebaeude, die bei 28,78 Grad
liegt. Fuenf Grad lassen dafuer Luft, ohne dass eine Halle in die Nachbarhalle
kippen kann -- ab etwa acht Grad findet die Suche bei laenglichen Hallen
Scheinloesungen quer zur eigentlichen Achse.
"""


WANDSTAERKE_M = 0.5
"""Wie weit der begehbare Innenraum hinter der Gebaeudekante zurueckliegt.

Wand, Stuetzenvorlage und Technikstreifen. Eine Setzung, keine Messung -- die
Konstruktion der Koelnmesse ist hier nicht erhoben; siehe den Vermerk in
`hall-registrations.json`.

Sie sitzt am **Gebaeude** und nicht am Planumriss: gesucht ist der Raum, der
tatsaechlich zur Verfuegung steht, und das ist der amtliche Umriss abzueglich
der Wand. Was hineinpasst, entscheidet sich daran.
"""


def nach_innen(polygon: list[list[float]], meter: float = WANDSTAERKE_M) -> list[list[float]]:
    """Versetzt jede Kante eines Umrisses um `meter` nach innen.

    Ein echter Versatz und kein Schrumpf um die Mitte: eine Wand ist ueberall
    gleich dick, waehrend ein Schrumpf die langen Seiten viel weiter
    hereinzoege als die kurzen. Jede Kante wird deshalb einzeln parallel
    verschoben und mit ihren Nachbarn neu geschnitten.

    Faellt der Umriss dabei in sich zusammen, bleibt er unveraendert -- lieber
    ein Gebaeude ohne Wandstaerke als ein verdrehtes.
    """
    ecken = polygon[:-1] if polygon[0] == polygon[-1] else list(polygon)
    if len(ecken) < 3:
        return [list(p) for p in polygon]
    flaeche2 = sum(ecken[i][0] * ecken[(i + 1) % len(ecken)][1]
                   - ecken[(i + 1) % len(ecken)][0] * ecken[i][1]
                   for i in range(len(ecken)))
    vorzeichen = 1.0 if flaeche2 > 0 else -1.0
    geraden = []
    for i in range(len(ecken)):
        a, b = ecken[i], ecken[(i + 1) % len(ecken)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        laenge = math.hypot(dx, dy)
        if laenge < 1e-9:
            return [list(p) for p in polygon]
        nx, ny = -dy / laenge * vorzeichen, dx / laenge * vorzeichen
        geraden.append(((a[0] + nx * meter, a[1] + ny * meter), (dx / laenge, dy / laenge)))
    neu = []
    for i in range(len(geraden)):
        (p1, r1), (p2, r2) = geraden[i - 1], geraden[i]
        nenner = r1[0] * r2[1] - r1[1] * r2[0]
        if abs(nenner) < 1e-9:
            neu.append([p2[0], p2[1]])
            continue
        t = ((p2[0] - p1[0]) * r2[1] - (p2[1] - p1[1]) * r2[0]) / nenner
        neu.append([p1[0] + r1[0] * t, p1[1] + r1[1] * t])
    def flaeche(ring):
        return abs(sum(ring[i][0] * ring[(i + 1) % len(ring)][1]
                       - ring[(i + 1) % len(ring)][0] * ring[i][1]
                       for i in range(len(ring)))) / 2
    aussen, innen = flaeche(ecken), flaeche(neu)
    if not (0.5 * aussen < innen < aussen):
        return [list(p) for p in polygon]
    return neu


def polygon_mitte(polygon: list[list[float]]) -> tuple[float, float]:
    """Schwerpunkt der Ecken -- derselbe Drehpunkt wie in `containment_fit`."""
    ecken = polygon[:-1] if polygon[0] == polygon[-1] else polygon
    return (sum(p[0] for p in ecken) / len(ecken),
            sum(p[1] for p in ecken) / len(ecken))


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
                    radius: int = 30, vordrehung: float = 0.0,
                    frei: bool = False, drehsuche: bool = True) -> dict | None:
    """Sucht hallenweise Drehung und Verschiebung mit maximaler Abdeckung.

    Mit `frei=True` kehrt sich das Ziel um: gesucht wird die Lage, in der
    moeglichst wenig der Flaeche in einem Gebaeude liegt. Das ist der Fall der
    Freiflaechen -- sie gehoeren zwischen die Hallen, nicht in sie. Ohne das
    bekamen sie gar keine Passung und ragten zu vierzehn Prozent in die
    Nachbarhalle.

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

    def coverage(dx: float, dy: float, grad: float = 0.0, skala: float = 1.0) -> float:
        bogen = math.radians(grad)
        cos, sin = math.cos(bogen) * skala, math.sin(bogen) * skala
        cx, cy = schwerpunkt
        inside_count = 0
        for x, y in samples:
            rx, ry = x - cx, y - cy
            px = cx + cos * rx - sin * ry + dx
            py = cy + sin * rx + cos * ry + dy
            getroffen = any(bounds[0] <= px <= bounds[2] and bounds[1] <= py <= bounds[3]
                            and inside(target, (px, py)) for target, bounds in prepared)
            # Eine Freiflaeche will das Gegenteil: sie gehoert **zwischen** die
            # Gebaeude und nicht hinein. Dieselbe Suche, umgedrehtes Ziel.
            if getroffen != frei:
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
    schritte = int(MAX_DREHUNG_GRAD / schritt_grad) if drehsuche else 0
    for i in range(-schritte, schritte + 1):
        grad = vordrehung + i * schritt_grad
        for dx in range(-radius, radius + 1, 3):
            for dy in range(-radius, radius + 1, 3):
                kandidat = (coverage(dx, dy, grad), float(dx), float(dy), grad)
                if besser(kandidat, best):
                    best = kandidat
    # Dann um den Sieger herum auf 25 cm und 0,05 Grad verfeinern.
    coarse = best
    for ig in (range(-5, 6) if drehsuche else (0,)):
        grad = coarse[3] + ig * 0.05
        for ix in range(-6, 7):
            for iy in range(-6, 7):
                dx, dy = coarse[1] + ix * 0.25, coarse[2] + iy * 0.25
                kandidat = (coverage(dx, dy, grad), dx, dy, grad)
                if besser(kandidat, best):
                    best = kandidat
    # Zum Schluss die Groesse: was jetzt noch herausragt, passt schlicht nicht
    # hinein. Statt es stehen zu lassen oder abzuschneiden wird die ganze Halle
    # samt Staenden so weit verkleinert, bis sie in den verfuegbaren Innenraum
    # geht -- die Lage der Staende zueinander bleibt dabei unveraendert, es
    # aendert sich nur der Massstab.
    skala = 1.0
    if not frei and coverage(best[1], best[2], best[3]) < 100.0:
        # Wie weit verkleinert werden darf. Zehn Prozent sind die Grenze
        # zwischen Orientierungshilfe und Massstabsaenderung: darunter waere
        # eine Halle sichtbar zu klein, und der Fehler gehoert dann gemeldet
        # statt weggerechnet.
        UNTERGRENZE = 0.90
        # Erst pruefen, ob Verkleinern ueberhaupt hilft. Tut es das nicht, ist
        # die Flaeche schlicht groesser als der Raum -- dann bleibt der
        # Massstab bei 1,0 und der Befund meldet den Rest. Ohne diese Pruefung
        # liefe die Halbierung ins Leere und gaebe eine Zahl zurueck, die nichts
        # erreicht: Halle 5.2 kam so auf 0,8511 bei 99,4 Prozent.
        if coverage(best[1], best[2], best[3], UNTERGRENZE) >= 100.0:
            # Gesucht ist der **groesste** Massstab, der noch passt -- also so
            # wenig verkleinern wie noetig. `passt` waechst monoton mit dem
            # Verkleinern, deshalb genuegt eine Halbierung.
            passt, zu_gross = UNTERGRENZE, 1.0
            for _ in range(24):
                mitte_s = (passt + zu_gross) / 2
                if coverage(best[1], best[2], best[3], mitte_s) >= 100.0:
                    passt = mitte_s
                else:
                    zu_gross = mitte_s
            skala = round(passt, 4)
            best = (coverage(best[1], best[2], best[3], skala), best[1], best[2], best[3])

    return {"translation": [round(best[1], 3), round(best[2], 3)],
            "rotationDeg": round(best[3], 3),
            "scale": skala,
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
    skala = (constraint or {}).get("scale", 1.0)
    dx, dy = (constraint or {}).get("translation", [0.0, 0.0])
    cx, cy = (constraint or {}).get("pivot", [0.0, 0.0])
    bogen = math.radians(grad)
    cos, sin = math.cos(bogen) * skala, math.sin(bogen) * skala

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
    skala = constraint.get("scale", 1.0)
    cx, cy = constraint.get("pivot", [0.0, 0.0])
    bogen = math.radians(grad)
    cos, sin = math.cos(bogen) * skala, math.sin(bogen) * skala
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
    alle_umrisse = [b["footprint"] for b in buildings.get("buildings", [])
                    if b.get("footprint")]
    print(f"  Winkelkorrektur des Hallenplans: {vordrehung:+.2f} Grad "
          f"(aus {len(paare)} Hallen)")

    registrations = []
    for hall in sorted(site["halls"], key=lambda item: item["key"]):
        placement = hall["placement"]
        target = targets.get(hall["key"], {})
        target_ids = target.get("buildingIds", [])
        # Der verfuegbare Innenraum ist der amtliche Umriss abzueglich der Wand.
        target_polygons = [nach_innen(building_by_id[feature_id]["footprint"])
                           for feature_id in target_ids
                           if feature_id in building_by_id and building_by_id[feature_id].get("footprint")]
        # Ohne eigene Drehsuche: der Winkel ist eine Eigenschaft des ganzen
        # Hallenplans, nicht der einzelnen Halle. Mit freier Suche drifteten
        # Halle 2 und 4 auf 0,96 Grad und Halle 10.2 auf 4,11 Grad, weil sich
        # eine knappe Passung durch Kippen "verbessern" laesst -- ohne dass die
        # Halle richtiger stuende. Eine Halle, die einen eigenen Winkel
        # braeuchte, ist ein Befund und keine Passung.
        constraint = containment_fit(hall["footprint"], target_polygons,
                                     vordrehung=vordrehung, drehsuche=False)
        if constraint is None and alle_umrisse:
            # Freiflaeche: gegen *alle* Gebaeude einpassen, mit umgedrehtem
            # Ziel -- sie soll moeglichst wenig davon treffen.
            # Ohne eigene Drehsuche: eine Freiflaeche hat keinen Grund, anders
            # zu stehen als der Plan, aus dem sie stammt. Mit freier Suche fand
            # FB 5,46 Grad -- die Umkehrung des Ziels laesst sich mit Drehung
            # leichter "verbessern", ohne dass die Lage richtiger wuerde.
            constraint = containment_fit(hall["footprint"], alle_umrisse,
                                         radius=20, vordrehung=vordrehung,
                                         frei=True, drehsuche=False)
            if constraint is not None:
                constraint["note"] = ("Freiflaeche: zwischen die Gebaeude gelegt, "
                                      "nicht in eines hinein.")
                constraint["frei"] = True
        if constraint is None:
            # Ohne Zielfeature gibt es nichts einzupassen -- die Winkelkorrektur
            # gilt trotzdem. Sie ist eine Eigenschaft des ganzen Hallenplans und
            # nicht eine der einzelnen Halle. Bliebe sie hier aus, staenden die
            # Freiflaechen als einzige um 2,21 Grad schief zwischen lauter
            # geraden Hallen -- und genau dort, zwischen den Hallen, faellt es
            # am meisten auf: Halle 7 ragte in die Freiflaeche Halle 6, Halle 6
            # in die Freiflaeche Halle 5.
            mitte = polygon_mitte(hall["footprint"])
            constraint = {"translation": [0.0, 0.0], "rotationDeg": round(vordrehung, 3),
                          "pivot": [round(mitte[0], 3), round(mitte[1], 3)],
                          "coverageBeforePct": None, "coverageAfterPct": None,
                          "samples": 0, "searchRadiusM": 0,
                          "maxRotationDeg": MAX_DREHUNG_GRAD,
                          "vordrehungDeg": round(vordrehung, 3),
                          "shiftM": 0.0,
                          "note": ("Kein Zielfeature -- nur die globale "
                                   "Winkelkorrektur, keine Einpassung.")}
            hall_transform = shifted_transform(transform, constraint)
        else:
            hall_transform = shifted_transform(transform, constraint)
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
            "status": "constrained" if target_polygons else "draft",
            "source": ("official-footprint-containment" if target_polygons
                       else "legacy-global-fit-plus-angle"),
            "constraint": constraint,
            "befund": passungsbefund(hall["footprint"], target_polygons, constraint),
            "notes": [
                ("Hallenweise gegen amtliche Zielfeature-Grundrisse gedreht und verschoben."
                 if target_polygons else
                 "Noch keine amtlichen Zielfeatures dieser Hallenebene -- "
                 "nur die globale Winkelkorrektur angewandt."),
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
