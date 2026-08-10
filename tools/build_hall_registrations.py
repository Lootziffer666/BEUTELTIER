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
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "data" / "build" / "site.json"
BUILDINGS = ROOT / "data" / "build" / "buildings.json"
WORLD_ORIGIN = ROOT / "data" / "build" / "world-origin.json"
OUTPUT = ROOT / "data" / "build" / "hall-registrations.json"

sys.path.insert(0, str(ROOT / "tools"))
from beuteltier import building  # noqa: E402


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


DREHUNG_BAND_GRAD = 1.0
"""Wie weit eine Halle vom erwarteten Winkel abweichen darf.

Der erwartete Winkel ist ein **starker Vorwert**, kein Zwang: er kommt aus
allen vierzehn Hallen zusammen und ist damit besser belegt als jede einzelne.
Eine Halle darf davon abweichen -- ein Grad ist reichlich fuer echte
Bauungenauigkeit --, aber nicht beliebig.

Ohne diese Schranke drifteten Halle 2 und 4 auf 0,96 Grad und Halle 10.2 auf
4,11 Grad. Nicht weil sie dort richtiger stuenden, sondern weil sich eine
knappe Passung durch Kippen rechnerisch verbessern laesst. Halle 4.1 brauchte
danach ueberhaupt keine Verkleinerung mehr -- die Drift hatte sie erst
noetig gemacht.
"""

DREHUNG_SCHWELLE_GRAD = 0.5
"""Ab wann eine Winkelabweichung als Befund gemeldet wird.

Die einzeln gemessenen Winkel der sauber geschnittenen Hallen streuen um
0,33 Grad. Ein halbes Grad liegt darueber und darunter bleibt Rauschen --
wer mehr abweicht, hat einen Grund, und der gehoert benannt.
"""

SKALA_GRENZE = 0.95
"""Wie weit die Passung am **Hallenumriss** verkleinern darf.

Fuenf Prozent. Was darueber hinaus noetig waere, ist kein Umrissproblem mehr,
sondern eines einzelner Flaechen -- und die werden einzeln behandelt, nicht
durch Zusammendruecken der ganzen Halle.

Ausdruecklich getrennt davon: die drei Prozent, um die **Staende** kleiner
gezeichnet werden. Das ist eine Darstellungsentscheidung fuer die Lesbarkeit
der Gaenge und passiert nach der Registrierung.
"""

SKALA_BODEN = 0.90
"""Wie klein ein **Gebaeude** insgesamt werden darf, alles zusammengerechnet.

Warum ueberhaupt geschrumpft wird: BEUTELTIER ist eine gamifizierte Messe-App.
Auf die Gesamtbreite einer Halle faellt ein Stand, der zehn Prozent kleiner
ist, nicht auf; ein Stand, der durch die Aussenwand ragt, faellt sofort auf.
Der Massstab ist deshalb ein zulaessiges Mittel und keine Notluege -- solange
er benannt, begrenzt und gemessen ist.

Warum nicht mehr als zehn Prozent: Halle 10 braeuchte 0,70, um allein durch
Verkleinern alles hereinzubekommen. Das waeren 56 m Luecke auf 187 m
Gebaeudelaenge -- die Halle stuende sichtbar nicht mehr in ihrem Haus, und
Raumwahrheit geht vor. Was nach dem Verkleinern noch heraussteht, wird
einzeln hereingezogen (`einzug`); dafuer braucht es keinen Extremmassstab.
"""

EINZUG_STRAFE = 40.0
"""Was ein Prozent Verkleinerung gegen einen hereingezogenen Stand wiegt.

Vierzig heisst: ein Prozent kleiner ist 0,4 Staende wert. Ohne diese Abwaegung
nimmt die Suche immer den kleinsten erlaubten Massstab, sobald er auch nur
einen Stand mehr hereinholt -- Halle 2 wurde so um 14 Prozent gestaucht, um
einen einzigen Stand zu retten, und stand danach mit 20 m Luecke in einem
Gebaeude, in das ihr Umriss vorher zu 100 Prozent gepasst hatte.

Gemessen an den drei Faellen, um die es geht:
- Halle 10: 9 Staende draussen bei vollem Mass, 5 bei 0,93 -- das lohnt.
- Halle 2: 15 bei vollem Mass, 5 bei 0,91 -- das lohnt.
- Halle 5: 4 bei vollem Mass und 5 bei 0,90 -- Verkleinern macht es schlechter,
  weil das Gebaeude aus zwei Teilen mit Hof dazwischen besteht und die Staende
  beim Schrumpfen in den Hof wandern. Halle 5 bleibt deshalb unveraendert.
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


def angewandt(punkte: list[list[float]], passung: dict) -> list[tuple[float, float]]:
    """Legt eine gefundene Passung auf Punkte -- Drehung und Massstab um den
    Drehpunkt der Passung, danach die Verschiebung."""
    bogen = math.radians(passung["rotationDeg"])
    cos = math.cos(bogen) * passung["scale"]
    sin = math.sin(bogen) * passung["scale"]
    cx, cy = passung["pivot"]
    dx, dy = passung["translation"]
    gedreht = []
    for x, y in punkte:
        rx, ry = x - cx, y - cy
        gedreht.append((cx + cos * rx - sin * ry + dx, cy + sin * rx + cos * ry + dy))
    return gedreht


AUSREISSER_M = 3.0
"""Ab wie vielen Metern Ueberstand ein Stand nicht mehr Rauschen ist.

Unterhalb davon liegt das uebliche Spiel zwischen Plan und amtlichem Umriss:
Wandstaerke, Rundung der Umringe, der Rest der Winkelkorrektur. Ueber alle
vierzehn Hallen mit Zielfeature reisst diese Schwelle genau ein Stand, der
nicht zu einer der beiden auffaelligen Gruppen gehoert -- sie trennt also
sauber und nicht knapp.
"""


def ausreisser(stands: list[dict], ringe: list[list[list[float]]],
               passung: dict | None = None) -> list[dict]:
    """Staende, die weit ueber ihr Gebaeude hinausragen.

    Gemessen wird der **groesste Ueberstand**: wie weit die am weitesten
    draussen liegende Ecke vom Gebaeuderand entfernt ist. Nicht "keine Ecke
    drin" -- ein Stand, der zur Haelfte durch die Wand geht, ist genauso
    falsch verortet wie einer, der ganz draussen liegt, und bei Halle 5.2
    liegen genau solche: D022, D024 und D026 stehen zu rund sechs Metern
    ueber die Suedwand hinaus und haetten die strengere Regel ueberlebt.

    Gemessen wird in der **registrierten** Lage, nicht in der rohen. Ungedreht
    steht der ganze Hallenplan um 2,21 Grad schief im Gelaende, und auf 200 m
    Hallenlaenge sind das an den Enden gut 4 m: dann meldet die Pruefung ganze
    Standreihen am Rand, die in Wahrheit sauber liegen. Deshalb erst passen,
    dann pruefen -- und mit dem Ergebnis noch einmal passen.

    Warum das zaehlt: der Hallenumriss ist die konvexe Huelle ueber seine
    Staende. Sechs falsch verortete Staende der Gruppe G zogen die Huelle von
    Halle 10.2 auf 26.503 m2 auf -- 13 Prozent ueber das ganze Gebaeude, das
    23.443 m2 hat. Die uebrigen 86 Staende lagen sauber drin.

    Ausgeschlossen werden sie nur aus dem **Umriss**. Der Stand selbst bleibt,
    wo der Plan ihn hat, und wird gemeldet: er ist Evidenz fuer ein
    Datenproblem und kein Muell.
    """
    draussen = []
    for stand in stands:
        ecken = (angewandt(stand["polygon"], passung) if passung
                 else [tuple(p) for p in stand["polygon"]])
        ueberstand = 0.0
        for punkt in ecken:
            if any(inside(ring, punkt) for ring in ringe):
                continue
            ueberstand = max(ueberstand,
                             min(abstand_zur_kante(punkt, ring) for ring in ringe))
        if ueberstand < AUSREISSER_M:
            continue
        draussen.append({"id": stand["id"], "code": stand.get("code"),
                         "abstandM": round(ueberstand, 2)})
    return sorted(draussen, key=lambda e: -e["abstandM"])


EINZUG_RAND_M = 0.4
"""Wie weit hinter die Innenkante ein nachgezogener Stand gesetzt wird.

Genau auf der Kante ist nicht drinnen: `inside()` ist auf dem Rand nicht
verlaesslich, und beim Laufen sieht man einen Stand, der die Wand kuesst, als
Fehler. Vierzig Zentimeter sind sichtbar drin und kosten keine Flaeche.
"""

EINZUG_SCHRUMPF = 0.98
"""Je Durchgang, wenn Verschieben allein den Stand nicht hereinbekommt."""


def naechster_randpunkt(punkt: tuple[float, float],
                        ring: list[list[float]]) -> tuple[float, float]:
    """Der Punkt auf dem Polygonrand, der `punkt` am naechsten liegt."""
    bester = (float("inf"), punkt)
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        vx, vy = b[0] - a[0], b[1] - a[1]
        l2 = vx * vx + vy * vy
        t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((punkt[0] - a[0]) * vx
                                                   + (punkt[1] - a[1]) * vy) / l2))
        q = (a[0] + t * vx, a[1] + t * vy)
        d = math.dist(punkt, q)
        if d < bester[0]:
            bester = (d, q)
    return bester[1]


def einzug(polygon: list[tuple[float, float]], ringe: list[list[list[float]]],
           schritte: int = 60) -> tuple[float, tuple[float, float]] | None:
    """Zieht einen Stand in sein Gebaeude -- verschieben, notfalls verkleinern.

    Rueckgabe ist die Korrektur als `(Faktor, Verschiebung)` in dem Raum, in
    dem `ringe` liegen; `None`, wenn der Stand schon drin ist.

    **Warum ueberhaupt:** BEUTELTIER ist ein Orientierungswerkzeug fuer eine
    Messe, kein Kataster. Ein Stand, der durch die Hallenwand ragt, ist beim
    Laufen ein Fehler -- und zwar ein groesserer als ein Stand, der ein paar
    Meter kleiner ist als in Wirklichkeit. Deshalb gilt hier: **kein Stand
    bleibt draussen.** Das ersetzt die frueher strengere Regel, nach der eine
    unpassende Geometrie unangetastet blieb; sie hat ihren Zweck erfuellt, denn
    sie hat die falsch verorteten Flaechen sichtbar gemacht.

    Gemeldet wird trotzdem jede Korrektur: nachgezogen ist nicht dasselbe wie
    richtig, und wer spaeter bessere Standdaten hat, sieht sofort, wo es
    geklemmt hat.

    Zuerst wird nur verschoben -- das erhaelt die Groesse. Erst wenn das nach
    einem Drittel der Durchgaenge nicht reicht, kommt Verkleinern dazu.
    """
    def aussen(punkte):
        return [p for p in punkte if not any(inside(ring, p) for ring in ringe)]

    if not aussen(polygon):
        return None

    mx = sum(p[0] for p in polygon) / len(polygon)
    my = sum(p[1] for p in polygon) / len(polygon)
    faktor, dx, dy = 1.0, 0.0, 0.0
    for schritt in range(schritte):
        aktuell = [(mx + (p[0] - mx) * faktor + dx, my + (p[1] - my) * faktor + dy)
                   for p in polygon]
        draussen = aussen(aktuell)
        if not draussen:
            return round(faktor, 4), (round(dx, 3), round(dy, 3))
        # Mittel der Wege nach drinnen. Der Mittelwert und nicht der groesste
        # Weg: bei einem Stand, der ueber zwei gegenueberliegende Waende ragt,
        # zoege der groesste Weg ihn hin und her, bis das Verkleinern greift.
        vx = vy = 0.0
        for p in draussen:
            q = min((naechster_randpunkt(p, ring) for ring in ringe),
                    key=lambda q: math.dist(p, q))
            vx += q[0] - p[0]
            vy += q[1] - p[1]
        laenge = math.hypot(vx, vy) / len(draussen)
        if laenge > 1e-9:
            zug = (laenge + EINZUG_RAND_M) / laenge
            dx += vx / len(draussen) * zug
            dy += vy / len(draussen) * zug
        if schritt >= schritte // 3:
            faktor *= EINZUG_SCHRUMPF
    return round(faktor, 4), (round(dx, 3), round(dy, 3))


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
    schritt_grad = 0.1
    schritte = int(DREHUNG_BAND_GRAD / schritt_grad) if drehsuche else 0
    for i in range(-schritte, schritte + 1):
        grad = vordrehung + i * schritt_grad
        for dx in range(-radius, radius + 1, 3):
            for dy in range(-radius, radius + 1, 3):
                kandidat = (coverage(dx, dy, grad), float(dx), float(dy), grad)
                if besser(kandidat, best):
                    best = kandidat
    # Dann um den Sieger herum auf 25 cm und 0,05 Grad verfeinern.
    coarse = best
    for ig in (range(-4, 5) if drehsuche else (0,)):
        grad = coarse[3] + ig * 0.025
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
    benoetigte_skala = 1.0
    if not frei and coverage(best[1], best[2], best[3]) < 100.0:
        # Erst herausfinden, welcher Massstab ueberhaupt reichen wuerde --
        # unabhaengig davon, ob er erlaubt ist. Die Zahl ist die eigentliche
        # Diagnose: "diese Halle muesste um X Prozent schrumpfen".
        SUCHBODEN = 0.70
        if coverage(best[1], best[2], best[3], SUCHBODEN) >= 100.0:
            # Gesucht ist der **groesste** Massstab, der noch passt -- also so
            # wenig verkleinern wie noetig. `passt` waechst monoton mit dem
            # Verkleinern, deshalb genuegt eine Halbierung.
            passt, zu_gross = SUCHBODEN, 1.0
            for _ in range(24):
                mitte_s = (passt + zu_gross) / 2
                if coverage(best[1], best[2], best[3], mitte_s) >= 100.0:
                    passt = mitte_s
                else:
                    zu_gross = mitte_s
            benoetigte_skala = round(passt, 4)
            # Angewandt wird sie nur, wenn sie klein bleibt. Darueber ist es
            # kein gelungener Fit, sondern ein Datenkonflikt -- und der gehoert
            # gemeldet, nicht weggerechnet.
            if benoetigte_skala >= SKALA_GRENZE:
                skala = benoetigte_skala
                best = (coverage(best[1], best[2], best[3], skala),
                        best[1], best[2], best[3])

    return {"translation": [round(best[1], 3), round(best[2], 3)],
            "rotationDeg": round(best[3], 3),
            "scale": skala,
            "pivot": [round(schwerpunkt[0], 3), round(schwerpunkt[1], 3)],
            "coverageBeforePct": round(before, 2), "coverageAfterPct": round(best[0], 2),
            "samples": len(samples), "searchRadiusM": radius,
            "erwarteteDrehungDeg": round(vordrehung, 3),
            "drehungAbweichungDeg": round(best[3] - vordrehung, 3),
            "drehungBandGrad": DREHUNG_BAND_GRAD if drehsuche else 0.0,
            "benoetigteSkala": benoetigte_skala,
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
                   constraint: dict | None, draussen_stehende: list[dict] | None = None) -> dict:
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

    c = constraint or {}
    noetig = c.get("benoetigteSkala", 1.0)
    abweichung = c.get("drehungAbweichungDeg", 0.0)
    befund = {
        "transformVersion": TRANSFORM_VERSION,
        "targetFeatureCount": len(ringe),
        "fitPercent": c.get("coverageAfterPct"),
        "outsideCornerCount": len(draussen),
        "maxOutsideDistanceM": round(max(draussen), 2) if draussen else 0.0,
        "expectedRotationDeg": c.get("erwarteteDrehungDeg"),
        "actualRotationDeg": c.get("rotationDeg"),
        "rotationDeviationDeg": abweichung,
        "appliedScale": c.get("scale", 1.0),
        "requiredScale": noetig,
        "outlierStandCount": len(draussen_stehende or []),
        "outlierMaxDistanceM": max((e["abstandM"] for e in draussen_stehende or []),
                                   default=0.0),
    }
    gruende = []
    if not ringe:
        gruende.append("kein amtliches Zielfeature zugeordnet")
    if abs(abweichung) > DREHUNG_SCHWELLE_GRAD:
        gruende.append(f"Winkel weicht um {abweichung:+.2f} Grad vom erwarteten ab "
                       "-- Bauungenauigkeit oder falsches Zielfeature")
    if noetig < SKALA_GRENZE:
        # Der wichtigste Befund: die Halle passt nicht, und zwar nicht knapp.
        gruende.append(
            f"muesste auf {noetig:.4f} verkleinert werden, erlaubt sind "
            f"{SKALA_GRENZE:.2f} -- Datenkonflikt: fehlendes Zielfeature, "
            "Auskragung oder ein anderer baulicher Zustand als im Plan")
    elif befund["fitPercent"] is not None and befund["fitPercent"] < 99.5:
        gruende.append("Planflaeche passt nicht vollstaendig in den verfuegbaren "
                       "Innenraum -- moeglicherweise fehlt ein Zielkoerper")
    if befund["maxOutsideDistanceM"] > MELDEGRENZE_M:
        gruende.append(f"Ecke liegt {befund['maxOutsideDistanceM']} m ausserhalb")
    if draussen_stehende:
        codes = ", ".join(e["code"] or e["id"] for e in draussen_stehende)
        gruende.append(
            f"{len(draussen_stehende)} Stand(e) liegen ganz ausserhalb des Gebaeudes "
            f"(bis {befund['outlierMaxDistanceM']} m): {codes} -- aus dem Umriss "
            "genommen, aber nicht geloescht: falsch verortete Standdaten")
    befund["geometryMismatch"] = bool(gruende)
    befund["reviewRequired"] = bool(gruende)
    befund["reviewReason"] = "; ".join(gruende) or None
    return befund


BEZIEHUNG_SCHWELLE_M = 2.0
"""Ab wann eine Nachbarbeziehung als Befund gemeldet wird."""


def abstand_polygone(a: list[list[float]], b: list[list[float]]) -> float:
    """Kleinster Abstand zweier Polygonraender."""
    return min(abstand_zur_kante(tuple(p), b[:-1] if b[0] == b[-1] else b) for p in a)


def beziehungen(vorher: dict[str, list], nachher: dict[str, list],
                naehe_m: float = 60.0) -> list[dict]:
    """Prueft, ob die Registrierung die Nachbarschaften erhalten hat.

    Verglichen wird der Abstand zweier Hallen **vor** und **nach** ihrer
    einzelnen Registrierung. Der Hallenplan ist in sich stimmig -- er stammt
    aus einer Quelle --, also darf die Registrierung diese Abstaende nicht
    nennenswert veraendern. Tut sie es doch, ist eine der beiden Hallen weit
    gewandert, und das gehoert gemeldet.

    Nicht verglichen wird gegen den Abstand der amtlichen Umrisse: die belegte
    Flaeche fuellt ihr Gebaeude nicht aus, deshalb ist der Abstand zweier
    belegter Flaechen naturgemaess groesser als der ihrer Gebaeude. Dieser
    Vergleich meldete 38 von 43 Beziehungen als auffaellig und war damit
    nutzlos.

    Und ausdruecklich **keine** Stellschraube: was hier herauskommt, aendert
    keine Registrierung. Wuerde man Halle 6 verschieben, bis der Hof wieder
    39 m breit ist, haenge sie wieder an Halle 7 -- eine neue globale
    Abhaengigkeit anstelle der alten.
    """
    out = []
    schluessel = sorted(k for k in vorher if k in nachher)
    for i, a in enumerate(schluessel):
        for b in schluessel[i + 1:]:
            davor = abstand_polygone(vorher[a], vorher[b])
            if davor > naehe_m:
                continue
            danach = abstand_polygone(nachher[a], nachher[b])
            unterschied = round(danach - davor, 2)
            out.append({
                "hallen": [a, b],
                "imPlanM": round(davor, 2),
                "registriertM": round(danach, 2),
                "unterschiedM": unterschied,
                "reviewRequired": abs(unterschied) > BEZIEHUNG_SCHWELLE_M,
                "hinweis": ("Geprueft, nicht erzwungen: die Hallen sind einzeln "
                            "registriert, dieser Abstand ist ihr Ergebnis."),
            })
    return sorted(out, key=lambda e: -abs(e["unterschiedM"]))


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

    # Umrisse ohne Ausreisser. Der Umriss einer Halle ist die konvexe Huelle
    # ueber ihre Staende -- ein einziger falsch verorteter Stand zieht sie auf,
    # und die Passung rechnet danach gegen eine Flaeche, die es nicht gibt.
    #
    # Zwei Durchgaenge, weil beides voneinander abhaengt: welche Staende
    # draussen liegen, sieht man erst in der registrierten Lage, und die
    # Registrierung soll gegen einen Umriss ohne Ausreisser rechnen. Also erst
    # roh passen, damit pruefen, dann mit dem bereinigten Umriss endgueltig
    # passen.
    stands_je_halle: dict[str, list] = {}
    for stand in site.get("stands", []):
        stands_je_halle.setdefault(stand["hallKey"], []).append(stand)
    bereinigt: dict[str, list] = {}
    verworfen: dict[str, list] = {}
    for hall in site["halls"]:
        ziel = targets.get(hall["key"], {}).get("buildingIds", [])
        rohringe = [building_by_id[f]["footprint"] for f in ziel
                    if f in building_by_id and building_by_id[f].get("footprint")]
        eigene = stands_je_halle.get(hall["key"], [])
        if not rohringe or not eigene:
            continue
        ringe = [r[:-1] if r[0] == r[-1] else r for r in rohringe]
        # Fuer die Pruefung genuegt die grobe Lage: gesucht sind Staende, die
        # drei Meter und mehr draussen stehen, und dafuer ist eine Zehntel-
        # drehung mehr oder weniger ohne Belang. Deshalb ohne Drehsuche -- das
        # spart den teuersten Teil der Passung, die es hier zweimal gaebe.
        vorpassung = containment_fit(hall["footprint"],
                                     [nach_innen(r) for r in rohringe],
                                     vordrehung=vordrehung, drehsuche=False)
        raus = ausreisser(eigene, ringe, vorpassung)
        if not raus:
            continue
        verworfen[hall["key"]] = raus
        ids = {e["id"] for e in raus}
        punkte = [tuple(p) for stand in eigene if stand["id"] not in ids
                  for p in stand["polygon"]]
        if len(punkte) >= 3:
            bereinigt[hall["key"]] = [list(p) for p in building.convex_hull(punkte)]
        liste = ", ".join("{} ({} m)".format(e["code"] or e["id"], e["abstandM"])
                          for e in raus)
        print(f"  {hall['key']}: {len(raus)} Stand(e) ausserhalb des Gebaeudes, "
              f"nicht im Umriss -- {liste}")
    alle_umrisse = [b["footprint"] for b in buildings.get("buildings", [])
                    if b.get("footprint")]
    print(f"  Winkelkorrektur des Hallenplans: {vordrehung:+.2f} Grad "
          f"(aus {len(paare)} Hallen)")

    # Ebenen eines Gebaeudes sind **ein** Modul. Halle 10.1 und 10.2 tragen
    # dasselbe Aussenmass (187,50 x 156,64 m) -- sie sind dasselbe Haus, einmal
    # unten und einmal oben. Registrierten sie sich einzeln, wanderten sie
    # gegeneinander: bei Halle 2 waren es 5,15 m, gemessen von der
    # Nachbarschaftspruefung.
    #
    # Deshalb bekommt jede Ebene die Registrierung ihres Gebaeudes, und die
    # kommt von der Ebene, die am besten passt. Bei Halle 10 ist das die 10.1
    # mit 100 Prozent gegen 78 Prozent der 10.2 -- deren Umriss ist mit
    # 26.605 m2 groesser als das ganze Gebaeude mit 23.443 m2 und damit
    # nachweislich falsch vermessen.
    je_gebaeude: dict[str, dict] = {}
    for hall in sorted(site["halls"], key=lambda item: item["key"]):
        ziel = targets.get(hall["key"], {}).get("buildingIds", [])
        ringe = [nach_innen(building_by_id[f]["footprint"]) for f in ziel
                 if f in building_by_id and building_by_id[f].get("footprint")]
        if not ringe:
            continue
        gefunden = containment_fit(bereinigt.get(hall["key"], hall["footprint"]), ringe,
                                   vordrehung=vordrehung, drehsuche=True)
        if gefunden is None:
            continue
        bisher = je_gebaeude.get(hall["hall"])
        if bisher is None or gefunden["coverageAfterPct"] > bisher["passung"]["coverageAfterPct"]:
            je_gebaeude[hall["hall"]] = {"passung": gefunden, "vonEbene": hall["key"]}

    # Und jetzt die Groesse des ganzen Gebaeudes, gemessen an den Staenden
    # aller seiner Ebenen. Bis hierher ist der Massstab am Hallenumriss
    # gesucht worden; der sagt aber nicht, ob jeder einzelne Stand drin ist.
    # Gesucht wird der **groesste** Massstab, bei dem am wenigsten Staende
    # herausragen -- also so wenig verkleinern wie noetig und nur dort, wo es
    # ueberhaupt etwas bringt.
    innen_je_haus: dict[str, list] = {}
    stands_je_haus: dict[str, list] = {}
    for hall in site["halls"]:
        ziel = targets.get(hall["key"], {}).get("buildingIds", [])
        ringe = [nach_innen(building_by_id[f]["footprint"]) for f in ziel
                 if f in building_by_id and building_by_id[f].get("footprint")]
        if not ringe:
            continue
        innen_je_haus[hall["hall"]] = ringe
        stands_je_haus.setdefault(hall["hall"], []).extend(stands_je_halle.get(hall["key"], []))

    for haus, eintrag in je_gebaeude.items():
        ringe = innen_je_haus.get(haus)
        eigene = stands_je_haus.get(haus)
        if not ringe or not eigene:
            continue
        passung = eintrag["passung"]
        stufe = 0.01
        beste = None
        for i in range(int(round((1.0 - SKALA_BODEN / passung["scale"]) / stufe)) + 1):
            faktor = round(1.0 - i * stufe, 4)
            gesamt = round(passung["scale"] * faktor, 4)
            if gesamt < SKALA_BODEN - 1e-9:
                break
            probe = {**passung, "scale": gesamt}
            heraus = sum(1 for stand in eigene
                         if any(not any(inside(ring, punkt) for ring in ringe)
                                for punkt in angewandt(stand["polygon"], probe)))
            # Abwaegung statt Minimierung: das letzte Prozent Verkleinerung ist
            # nicht gratis. Bei Gleichstand gewinnt der groessere Massstab --
            # die Schleife laeuft von oben, deshalb genuegt echt kleiner.
            preis = heraus + EINZUG_STRAFE * (1.0 - faktor)
            if beste is None or preis < beste[0] - 1e-9:
                beste = (preis, faktor, gesamt, heraus)
            if heraus == 0:
                break
        if beste and beste[1] < 1.0:
            passung["scale"] = beste[2]
            passung["skalaAusStaenden"] = beste[1]
            print(f"  Halle {haus}: auf {beste[2]:.4f} verkleinert -- danach ragen "
                  f"{beste[3]} von {len(eigene)} Staenden heraus")

    # Und was jetzt noch heraussteht, wird einzeln hereingezogen. Danach ist
    # kein Stand mehr ausserhalb seiner Halle -- das ist die Zusage, die die
    # App einloest, und sie geht vor Massgenauigkeit einzelner Flaechen.
    #
    # Die Korrektur wird im **Planbild** ausgeschrieben, also vor der
    # Registrierung: Verkleinern um die eigene Mitte, dann verschieben. Weil
    # die Registrierung eine Aehnlichkeitsabbildung ist, laesst sich die im
    # Zielbild gefundene Verschiebung d als d' = R^T d / s zuruecknehmen -- und
    # `build_registered_layout` braucht danach nur zwei einfache Schritte und
    # keine zweite Geometrieauswertung.
    korrekturen: dict[str, dict] = {}
    for hall in sorted(site["halls"], key=lambda item: item["key"]):
        gebaeude = je_gebaeude.get(hall["hall"])
        ringe = innen_je_haus.get(hall["hall"])
        if gebaeude is None or not ringe:
            continue
        passung = gebaeude["passung"]
        bogen = math.radians(passung["rotationDeg"])
        cos, sin = math.cos(bogen), math.sin(bogen)
        skala = passung["scale"]
        for stand in stands_je_halle.get(hall["key"], []):
            korrektur = einzug(angewandt(stand["polygon"], passung), ringe)
            if korrektur is None:
                continue
            faktor, (dx, dy) = korrektur
            # R^T * d / s -- dieselbe Verschiebung, im Planbild ausgedrueckt.
            korrekturen[stand["id"]] = {
                "hallKey": hall["key"],
                "code": stand.get("code"),
                "scale": faktor,
                "translation": [round((cos * dx + sin * dy) / skala, 3),
                                round((-sin * dx + cos * dy) / skala, 3)],
                "shiftM": round(math.hypot(dx, dy) / skala, 2),
            }
    if korrekturen:
        je_halle: dict[str, int] = {}
        for eintrag in korrekturen.values():
            je_halle[eintrag["hallKey"]] = je_halle.get(eintrag["hallKey"], 0) + 1
        for key in sorted(je_halle):
            print(f"  {key}: {je_halle[key]} Stand(e) in die Halle hereingezogen")

    registrations = []
    for hall in sorted(site["halls"], key=lambda item: item["key"]):
        placement = hall["placement"]
        target = targets.get(hall["key"], {})
        target_ids = target.get("buildingIds", [])
        # Der verfuegbare Innenraum ist der amtliche Umriss abzueglich der Wand.
        target_polygons = [nach_innen(building_by_id[feature_id]["footprint"])
                           for feature_id in target_ids
                           if feature_id in building_by_id and building_by_id[feature_id].get("footprint")]
        # Die Registrierung des Gebaeudes, nicht der einzelnen Ebene.
        gebaeude = je_gebaeude.get(hall["hall"])
        constraint = None
        if gebaeude is not None:
            constraint = dict(gebaeude["passung"])
            constraint["vonEbene"] = gebaeude["vonEbene"]
            if gebaeude["vonEbene"] != hall["key"]:
                constraint["note"] = (
                    f"Registrierung der Ebene {gebaeude['vonEbene']} uebernommen "
                    "-- Ebenen eines Gebaeudes sind ein Modul.")
                # Die Passung dieser Ebene mit **ihrem** Umriss nachrechnen,
                # sonst meldete der Befund die Zahlen der anderen Ebene.
                eigene = containment_fit(hall["footprint"], target_polygons,
                                         vordrehung=vordrehung, drehsuche=False)
                if eigene is not None:
                    # Beide Zahlen dieser Ebene, nicht der anderen: sonst stuende
                    # ein "vorher" der Nachbarebene neben einem "nachher" dieser,
                    # und der Vergleich waere sinnlos.
                    constraint["coverageBeforePct"] = eigene["coverageBeforePct"]
                    constraint["coverageAfterPct"] = eigene["coverageAfterPct"]
                    constraint["benoetigteSkala"] = eigene["benoetigteSkala"]
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
            "befund": passungsbefund(hall["footprint"], target_polygons, constraint,
                                     verworfen.get(hall["key"])),
            "notes": [
                ("Hallenweise gegen amtliche Zielfeature-Grundrisse gedreht und verschoben."
                 if target_polygons else
                 "Noch keine amtlichen Zielfeatures dieser Hallenebene -- "
                 "nur die globale Winkelkorrektur angewandt."),
                "Containment ist eine geometrische Nebenbedingung, kein vermessener Anker.",
                "Portale wurden nicht als Registrierungsanker verwendet.",
            ],
        })
    # Nachbarschaften: gemessen nach der Registrierung, nicht davor.
    registrierte = {}
    im_plan = {}
    for eintrag, hall in zip(registrations, sorted(site["halls"], key=lambda i: i["key"])):
        registrierte[hall["key"]] = [list(transform_point(tuple(p), eintrag["transform"]))
                                     for p in hall["footprint"]]
        # Derselbe Umriss ohne die hallenweise Registrierung -- nur die
        # gemeinsame Grundabbildung. So ist der Vergleich einer gegen einen.
        im_plan[hall["key"]] = [list(transform_point(tuple(p), transform))
                                for p in hall["footprint"]]

    return {
        "schema": "beuteltier.hall-registrations.v1",
        "coordinatePlane": "sceneX/sceneZ",
        "origin": origin,
        "registrations": registrations,
        "beziehungen": beziehungen(im_plan, registrierte),
        # Staende, die vollstaendig ausserhalb ihres Gebaeudes liegen und
        # deshalb nicht in den Umriss eingehen. Sie bleiben, wo der Plan
        # sie hat -- gemeldet, nicht geloescht.
        "ausreisser": verworfen,
        # Staende, die nach der Registrierung noch aus ihrer Halle ragten und
        # deshalb hereingezogen wurden. Anzuwenden **vor** dem Transform:
        # erst um die eigene Mitte auf `scale` verkleinern, dann um
        # `translation` verschieben. Jede Korrektur steht hier, damit
        # nachvollziehbar bleibt, welche Flaeche nicht ihrem Planmass folgt.
        "standKorrekturen": korrekturen,
        "counts": {
            "total": len(registrations),
            "draft": sum(item["status"] == "draft" for item in registrations),
            "registered": 0,
            "constrained": sum(item["status"] == "constrained" for item in registrations),
            "withTargetFeatures": sum(bool(item["targetFeatureIds"])
                                      for item in registrations),
            "standKorrekturen": len(korrekturen),
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
