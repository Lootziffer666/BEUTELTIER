#!/usr/bin/env python3
"""Rechnet den Nordboulevard aus den amtlichen Gebaeudeumrissen.

Bisher wurde der Gang aus `registered-site.json` abgeleitet -- und der fuehrt
nicht die Gebaeude, sondern die **belegte** Hallenflaeche ("Belegter Bereich,
nicht der Gebaeudeumriss", sagt die Datei selbst). Daraus stand Halle 9 mit
67 m am Gang statt mit ihren wirklichen 75 m, und die beiden Gebaeude
zwischen Halle 9 und Halle 8 fehlten ganz, weil in ihnen keine Messestaende
liegen. Der Gang sah entsprechend falsch aus.

Gerechnet wird deshalb aus der Quelle, die Gebaeude kennt: dem LoD2-Modell der
Geobasis NRW (ETRS89/UTM32, amtlich gemessen). Welches Gebaeude welche Halle
ist, steht bereits in `hall-registrations.json` -- dort ist jede Hallenebene
ueber die Lage ihrer Staende einem amtlichen Gebaeude zugeordnet, mit
Restfehlern von 0 bis 1 m.

Rechenweg:

1. Die Laengsachse von Halle 9 gibt die Richtung vor; der Gang laeuft quer
   dazu, denn die Hallen docken mit ihrer kurzen Seite an.
2. Die Gangbreite ist die gemessene Luecke zwischen den Fassaden von Halle 9
   und Halle 6.
3. Station 0 liegt an der Stirnseite von Halle 8, der Gang laeuft auf Halle 9
   zu.
4. Jedes Gebaeude im Umfeld wird auf die Achse projiziert. Wo eines an den
   Gang heranreicht, steht eine Wand; wo keines steht, ist verglast -- dort
   sieht man ins Freie.

Aufruf:
    python3 tools/build_boulevard.py
"""
from __future__ import annotations

import json
import math
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier import lod2  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LOD2_DIR = ROOT / "data" / "raw" / "lod2"
OSM_BUILDINGS = ROOT / "data" / "raw" / "osm" / "gebaeude.json"
OSM_FLAECHEN = ROOT / "data" / "raw" / "osm" / "flaechen.json"
REGISTRATIONS = ROOT / "app" / "public" / "data" / "hall-registrations.json"
OUT = ROOT / "data" / "build" / "boulevard.json"
OUT_APP = ROOT / "app" / "public" / "data" / "boulevard.json"

# Ausschnitt in UTM32, gross genug fuer das Messegelaende.
BOUNDS = (357700.0, 5645200.0, 358900.0, 5646500.0)

LEITHALLE = "9.1"      # gibt die Richtung vor
GEGENUEBER = "6.1"     # die Zeile auf der anderen Seite
ABSCHLUSS = "8.1"      # steht quer am Nordende, Station 0
# Der Suedteil: dort weitet sich der Gang zwischen diesen beiden Hallen und
# wechselt die Ebene.
SUED_WEST = "5.2"
SUED_OST = "10.2"

# Vorgabe, keine Messung: die lichte Hoehe und wie weit der Gang gebaut wird.
# Suedlich davon geht er weiter, dort docken Halle 5 und Halle 10 an -- das
# ist die Fortsetzung, die noch nicht gebaut ist.
HOEHE_M = 11.0
LAENGE_M = 285.0

# Ab welcher Grundflaeche ein Gebaeude ueberhaupt zaehlt.
MIN_FLAECHE_SQM = 400.0
# Wie weit ein Gebaeude hinter der Fassadenlinie zurueckstehen darf und
# trotzdem noch die Wand des Gangs bildet.
FRONT_M = 12.0
# Schrittweite, mit der die Achse abgetastet wird.
SCHRITT_M = 0.25
# Schrittweite quer dazu, beim Tasten nach dem Gebaeude hinter der Wandlinie.
TAST_SCHRITT_M = 0.5
# Kuerzere Abschnitte als dieser Wert sind Digitalisierungsrauschen.
MIN_ABSCHNITT_M = 2.0
# Wie weit eine Halle seitlich vom Gang stehen darf und trotzdem noch als
# sein Ziel gilt -- fuer die Beschriftung der Wegweiser.
ENDE_ABSTAND_M = 40.0

# Aussengelaende: wie tief die Hoefe zwischen den Hallen abgetastet werden und
# in welchen Schritten. Schmaler als MIN_HOF_M ist keine Hoffnung auf einen
# Hof, sondern eine Fuge zwischen zwei Bauteilen.
HOF_SCHRITT_M = 1.0
MIN_HOF_M = 6.0
# Ein Meter Luft zu beiden Nachbarn: die amtlichen Umrisse sind auf etwa einen
# Meter genau, und ein Hof, der in die Wand hineinreicht, waere schlechter als
# einer, der einen Meter zu klein ist.
HOF_RAND_M = 1.0
# Durchgaenge von den Hallen in den Gang.
#
# OSM kennt sie nicht: im vollstaendigen Datensatz (28.228 Knoten) liegt kein
# einziger Eingangs- oder Torknoten am Nordgang. Die amtlichen Daten fuehren
# Gebaeudeumrisse, keine Tueren. Ohne Durchgang waere der Gang aber ein
# geschlossener Schlauch, den man nur mit abgeschalteter Kollision betritt.
#
# Abgeleitet wird deshalb aus dem, was gemessen ist: jeder Wandabschnitt, hinter
# dem eine Halle steht, ist eine Hallenfassade, und eine Hallenfassade am
# Hauptgang hat Zugaenge. Ihre **Lage** folgt der gemessenen Abschnittslaenge,
# ihre **Anzahl** und **Groesse** sind Vorgabe. Beides steht getrennt in der
# Datei, damit niemand die Vorgabe fuer eine Messung haelt.
DURCHGANG_BREITE_M = 6.0
DURCHGANG_HOEHE_M = 4.0
# Ein Zugang je angefangene 45 m Fassade -- so liegen sie etwa so dicht wie auf
# den Referenzfotos, ohne dass die Wand zum Kamm wird.
DURCHGANG_ABSTAND_M = 45.0
# Wieviel Wand neben einem Durchgang mindestens stehen bleibt.
DURCHGANG_RAND_M = 3.0

# Der Knick am Nordende.
#
# Am Ende der 285 m hoert der Gang nicht auf, er biegt ab: bei Station 0 dreht
# der Baukoerper um 90 Grad nach Osten, laeuft neunzig Meter nach Norden und
# oeffnet sich ueber eine gerundete Fassade zum Messeplatz. Dort liegt Eingang
# Nord, und dorthin fuehrt auch der Weg zum Congress-Centrum Nord.
#
# In LoD2 ist das ein eigenes Feature mit 4826 m2 Grundflaeche und 19,4 m
# Hoehe -- dasselbe, das am Gang als "Zwischenbereich, verglast" gefuehrt wird.
# Der Umriss ist amtlich; dass man dort **ebenerdig und stufenlos** durchgeht,
# ist eine Beobachtung am Referenzfoto und keine Messung. Sie steht deshalb
# hier und wird in der Ergebnisdatei als solche ausgewiesen.
NORD_KNICK = "DENW37AL100063v9"

# Das Aussengelaende zwischen Halle 9 und Halle 10.
#
# Vor Ort gemessen (dz.nrw, Strecke messen) und bewusst stark vereinfacht: zwei
# ebene Vierecke und eine Rampe dazwischen, kein Terrain. Von Sueden nach
# Norden: Ebene 1 -> Schraege -> Ebene 0. Die Nordkante der oberen ist die
# Suedkante der unteren; an dieser Grenze ersetzt die Rampe den Hoehensprung.
#
# Die Kantenlaengen sind gemessen, die **Lage** war es nicht -- vier Laengen
# legen ein Viereck nicht fest. Verortet wurde deshalb ueber die amtlichen
# Hallenkanten, und die Gegenprobe stimmt auf ein bis zwei Meter an jeder
# Kante: Ebene 0 beginnt dort, wo Halle 9 beginnt (180 gegen 181,0), die Grenze
# liegt am Nordrand von Halle 10.2 (300 gegen 297,9), Ebene 1 endet an deren
# Suedrand (488 gegen 488,7), und im Westen stossen beide an den Suedboulevard
# (-36,8). Dass sich dabei alle acht gemessenen Laengen wiederfinden, ist die
# eigentliche Bestaetigung.
AUSSEN_GRENZE_M = 300.0        # Nordkante Ebene 1 = Suedkante Ebene 0
# Die Westkanten liegen am Boulevard -- aber der Boulevard ist auf beiden
# Hoehen ein anderer. Bei den Stationen der Ebene 1 ist es der Suedteil
# (Ostkante q -36,8), bei denen der Ebene 0 der Nordgang (Ostwand q -7,46).
# Zwischen beiden springt er um 29,34 m nach Osten -- und genau das ist der
# vor Ort gemessene Versatz von 29,95 m. Die beiden Zahlen kommen aus
# voellig getrennten Quellen und treffen sich auf 61 Zentimeter.
# Ebene 1: zwischen Boulevard und Halle 10.2 liegen 20 m Aussenflaeche --
# Angabe vor Ort. Meine Rechnung hatte Halle 10.2 selbst fuer die Ostwand des
# Suedteils gehalten (q -36,46), weil sie das naechste Gebaeude ist; der Gang
# ist also um diese 20 m schmaler als bisher gefuehrt.
AUSSEN_STREIFEN_E1_M = 20.0
AUSSEN_WEST_E1_Q = -36.46 + AUSSEN_STREIFEN_E1_M
# Ebene 0: Halle 9 bildet die Ostwand des Nordgangs selbst -- das U ist dort
# nach Westen offen, ein Streifen dazwischen existiert nicht.
AUSSEN_WEST_E0_Q = -7.456
AUSSEN_E1 = {"suedM": 488.1, "breiteQ": 178.1}   # 188,10 x 178,93 gemessen
AUSSEN_E0 = {"nordM": 179.8, "breiteQ": 213.0}   # 120,18 x 213,00 gemessen
# In den ersten rund 30 m ab Sueden gibt es die obere Ebene noch nicht.
AUSSEN_VERSATZ_M = 29.95
# Die Rampe: gemessen 85,00 m direkt, 84,59 m im Grundriss, 8,33 m Hoehe.
# Gebaut wird sie mit dem Grundriss und den **Hallenhoehen** -- siehe unten.
AUSSEN_RAMPE_M = 84.59
AUSSEN_RAMPE_GEMESSEN_M = 8.33
# Wie weit die Platten unter die Hallenboeden geschoben werden, damit draussen
# keine Fuge steht und drinnen nichts hervorschaut.
AUSSEN_UEBERLAPP_M = 2.0

# Was auf einer Flaeche waehrend der Messe stattfindet.
#
# Nicht aus den Daten ableitbar, sondern Angabe vor Ort. OSM kennt P8 als
# Parkplatz, und das ist er den groessten Teil des Jahres auch. Waehrend der
# gamescom liegt darin der Aussenbereich hinter Halle 8.
#
# Dessen Zuschnitt wird hier ausdruecklich **nicht** gerechnet: er steht laengst
# gemessen in `registered-site.json` als Freiflaeche `F8` -- ein Keil mit zehn
# Ecken und einundzwanzig Staenden, aus dem amtlichen Ausstellerplan. Hier stand
# eine Zeitlang ein frei gewaehltes Rechteck von 120 m Tiefe daneben; es hat der
# vorhandenen Messung widersprochen und ist deshalb entfallen.
NUTZUNG = {
    "P8": ("Parkplatz; waehrend der Messe liegt darin die Freiflaeche "
           "Halle 8 Nord -- Zuschnitt siehe hallKey F8 in registered-site.json"),
}

# Gebaeude, die den Gang zwar begrenzen, dort aber verglast sind.
# Beobachtung vor Ort, nicht aus der Geometrie ableitbar: ein Grundriss sagt,
# **dass** dort etwas steht, nicht **woraus** die Wand ist.
GLASFASSADE = {
    "DENW37AL100063v9": "Zwischenbereich, verglast",
}


@dataclass
class Gebaeude:
    id: str
    poly: list[tuple[float, float]]
    flaeche: float
    hall_key: str | None
    name: str | None


@dataclass
class Rahmen:
    """Der Bezugsrahmen des Gangs.

    Die Achse, ihr Nullpunkt und die beiden Wandlinien -- alles, was man
    braucht, um zwischen Geländemetern und dem Paar (Station, Quermass) hin
    und her zu rechnen. Steht als eigener Typ da, weil die Aussenflaechen
    dieselbe Umrechnung brauchen wie die Wandabschnitte und zwei Kopien davon
    frueher oder spaeter auseinanderlaufen.
    """
    laengs: tuple[float, float]
    quer: tuple[float, float]
    null: float
    richtung: float
    achse_q: float
    wand_ost: float
    wand_west: float

    def station(self, wert: float) -> float:
        return (wert - self.null) * self.richtung

    def ort(self, station: float, q_rel: float) -> tuple[float, float]:
        """(Station, Quermass ab Achse) -> Geländemeter."""
        s = self.null + station * self.richtung
        q = self.achse_q + q_rel
        return (s * self.laengs[0] + q * self.quer[0],
                s * self.laengs[1] + q * self.quer[1])

    def wandlinie(self, seite: str) -> float:
        """Das Quermass der Wandlinie einer Seite, relativ zur Achse."""
        return (self.wand_west if seite == "west" else self.wand_ost) - self.achse_q


def viereck_aus_kanten(a: tuple[float, float], b: tuple[float, float],
                       bc: float, cd: float, da: float,
                       links: bool = True) -> list[tuple[float, float]]:
    """Ein Viereck aus einer liegenden Grundkante und drei Laengen.

    Vier Kantenlaengen allein legen kein Viereck fest -- es laesst sich in der
    Ebene verbiegen wie ein Gelenkviereck. Erst eine **liegende** Kante macht
    es eindeutig: A und B sind gegeben, D ergibt sich aus `da` senkrecht dazu,
    und C ist der Schnitt zweier Kreise -- um B mit `bc`, um D mit `cd`.

    Zwei Schnittpunkte gibt es immer; `links` waehlt den auf der Seite, auf der
    auch D liegt. Waere es der andere, klappte das Viereck ueber die Grundkante
    zurueck und schnitte sich selbst.

    Gebraucht fuer das Aussengelaende zwischen Halle 9 und Halle 10: dort sind
    die Aussenmasse vor Ort gemessen, die Lage aber nur als Kante bekannt.
    """
    ax, ay = a
    bx, by = b
    basis = math.hypot(bx - ax, by - ay)
    if basis < 1e-9:
        raise ValueError("Grundkante hat keine Laenge")
    ex, ey = (bx - ax) / basis, (by - ay) / basis
    # Einheitsnormale, per `links` auf die gewuenschte Seite gedreht.
    nx, ny = (-ey, ex) if links else (ey, -ex)

    dx, dy = ax + nx * da, ay + ny * da
    # Schnitt der Kreise um B (Radius bc) und um D (Radius cd).
    mx, my = dx - bx, dy - by
    abstand = math.hypot(mx, my)
    if abstand > bc + cd or abstand < abs(bc - cd) or abstand < 1e-9:
        raise ValueError(
            f"Kanten passen nicht zusammen: |BD|={abstand:.2f}, bc={bc}, cd={cd}")
    lot = (abstand * abstand + bc * bc - cd * cd) / (2 * abstand)
    hoehe = math.sqrt(max(0.0, bc * bc - lot * lot))
    ux, uy = mx / abstand, my / abstand
    px, py = bx + ux * lot, by + uy * lot
    # Der Schnittpunkt auf derselben Seite wie D -- also in Normalenrichtung.
    for zeichen in (1.0, -1.0):
        cx, cy = px - uy * hoehe * zeichen, py + ux * hoehe * zeichen
        if (cx - ax) * nx + (cy - ay) * ny > 0:
            return [(ax, ay), (bx, by), (cx, cy), (dx, dy)]
    raise ValueError("kein Schnittpunkt auf der gewuenschten Seite")


def ring_richtung(poly: list[tuple[float, float]]) -> float:
    """Richtung der laengsten Kante -- die Laengsachse des Baukoerpers."""
    best, winkel = 0.0, 0.0
    for index in range(len(poly)):
        a = poly[index]
        b = poly[(index + 1) % len(poly)]
        laenge = math.hypot(b[0] - a[0], b[1] - a[1])
        if laenge > best:
            best, winkel = laenge, math.atan2(b[1] - a[1], b[0] - a[0])
    return winkel


def lade_gebaeude(origin: tuple[float, float]) -> dict[str, Gebaeude]:
    registrations = json.loads(REGISTRATIONS.read_text(encoding="utf-8"))
    gehoert: dict[str, str] = {}
    for eintrag in registrations["registrations"]:
        for feature_id in eintrag["targetFeatureIds"]:
            gehoert[feature_id] = eintrag["hallKey"]

    namen = osm_namen(origin)

    out: dict[str, Gebaeude] = {}
    for tile in sorted(LOD2_DIR.glob("*.gml")):
        for building in lod2.read_buildings(tile, BOUNDS):
            poly = building.footprint()
            if len(poly) < 3:
                continue
            lokal = [ins_gelaende(x, y, origin) for x, y in poly]
            flaeche = abs(lod2.ring_area(lokal))
            if flaeche < MIN_FLAECHE_SQM:
                continue
            out[building.id] = Gebaeude(
                id=building.id,
                poly=lokal,
                flaeche=flaeche,
                hall_key=gehoert.get(building.id),
                name=nachster_name(lokal, namen),
            )
    return out


def ins_gelaende(x: float, y: float,
                 origin: tuple[float, float]) -> tuple[float, float]:
    """UTM32 -> Geländemeter, so wie der Rest des Projekts sie fuehrt.

    Die zweite Achse ist **gespiegelt**: `hall-registrations.json` fuehrt die
    Hallen in der Ebene sceneX/sceneZ mit `mirroredSceneZ`, und
    `registered-site.json` steht in derselben Ebene. Wer hier die Northing
    unveraendert uebernimmt, legt den Gang spiegelverkehrt neben die Hallen --
    er sieht fuer sich richtig aus und steht am falschen Ort.
    """
    return (x - origin[0], -(y - origin[1]))


def osm_namen(origin: tuple[float, float]) -> list[tuple[tuple[float, float], str]]:
    """Benannte OSM-Gebaeude, in Geländemetern.

    Nur fuer die Beschriftung: welches Gebaeude welche Halle ist, steht schon
    in den Registrierungen und wird nicht aus OSM uebernommen. Fehlt die
    Datei, bleiben die Gebaeude namenlos -- die Geometrie stimmt trotzdem.
    """
    if not OSM_BUILDINGS.exists():
        return []
    payload = json.loads(OSM_BUILDINGS.read_text(encoding="utf-8"))
    out: list[tuple[tuple[float, float], str]] = []
    for element in payload.get("elements", []):
        tags = element.get("tags", {})
        name = tags.get("name") or tags.get("ref")
        centre = element.get("center") or {}
        if not name or "lat" not in centre:
            continue
        out.append((utm32(centre["lat"], centre["lon"], origin), name))
    return out


def utm32(lat: float, lon: float, origin: tuple[float, float]) -> tuple[float, float]:
    """WGS84 -> ETRS89/UTM32N, dann in Geländemeter. Nur fuer Namen gebraucht."""
    a, f = 6378137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    n = f / (2 - f)
    k0, e0, n0 = 0.9996, 500000.0, 0.0
    lat_r = math.radians(lat)
    lon_r = math.radians(lon)
    lon0 = math.radians(9.0)
    a_bar = a / (1 + n) * (1 + n**2 / 4 + n**4 / 64)
    t = math.sinh(math.atanh(math.sin(lat_r))
                  - 2 * math.sqrt(n) / (1 + n) * math.atanh(2 * math.sqrt(n) / (1 + n)
                                                            * math.sin(lat_r)))
    xi = math.atan(t / math.cos(lon_r - lon0))
    eta = math.atanh(math.sin(lon_r - lon0) / math.sqrt(1 + t * t))
    alpha = [n / 2 - 2 * n**2 / 3 + 5 * n**3 / 16,
             13 * n**2 / 48 - 3 * n**3 / 5,
             61 * n**3 / 240]
    east = e0 + k0 * a_bar * (eta + sum(
        alpha[j] * math.cos(2 * (j + 1) * xi) * math.sinh(2 * (j + 1) * eta)
        for j in range(3)))
    north = n0 + k0 * a_bar * (xi + sum(
        alpha[j] * math.sin(2 * (j + 1) * xi) * math.cosh(2 * (j + 1) * eta)
        for j in range(3)))
    _ = e2
    return ins_gelaende(east, north, origin)


def nachster_name(poly: list[tuple[float, float]],
                  namen: list[tuple[tuple[float, float], str]]) -> str | None:
    """Der OSM-Name, dessen Mittelpunkt im Grundriss liegt."""
    for punkt, name in namen:
        if punkt_in_polygon(punkt, poly):
            return name
    return None


def punkt_in_polygon(punkt: tuple[float, float],
                     poly: list[tuple[float, float]]) -> bool:
    x, y = punkt
    drin = False
    for index in range(len(poly)):
        x1, y1 = poly[index]
        x2, y2 = poly[(index + 1) % len(poly)]
        if (y1 > y) != (y2 > y):
            schnitt = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < schnitt:
                drin = not drin
    return drin


def strecke(poly: list[tuple[float, float]], laengs: tuple[float, float],
            quer: tuple[float, float]) -> tuple[tuple[float, float], tuple[float, float]]:
    s = [x * laengs[0] + y * laengs[1] for x, y in poly]
    q = [x * quer[0] + y * quer[1] for x, y in poly]
    return (min(s), max(s)), (min(q), max(q))


def main() -> int:
    registrations = json.loads(REGISTRATIONS.read_text(encoding="utf-8"))
    origin = (registrations["origin"][0], registrations["origin"][1])
    ziel = {r["hallKey"]: r["targetFeatureIds"] for r in registrations["registrations"]}

    gebaeude = lade_gebaeude(origin)
    fehlt = [k for k in (LEITHALLE, GEGENUEBER, ABSCHLUSS)
             if not ziel.get(k) or ziel[k][0] not in gebaeude]
    if fehlt:
        print(f"Keine amtlichen Umrisse fuer {', '.join(fehlt)}", file=sys.stderr)
        return 1

    halle9 = gebaeude[ziel[LEITHALLE][0]]
    halle6 = gebaeude[ziel[GEGENUEBER][0]]
    halle8 = gebaeude[ziel[ABSCHLUSS][0]]

    # Die Hallen docken mit der kurzen Seite an: der Gang laeuft quer zu ihrer
    # Laengsachse.
    winkel_halle = ring_richtung(halle9.poly)
    winkel = winkel_halle + math.pi / 2
    laengs = (math.cos(winkel), math.sin(winkel))
    quer = (math.cos(winkel_halle), math.sin(winkel_halle))

    (s9, q9) = strecke(halle9.poly, laengs, quer)
    (s6, q6) = strecke(halle6.poly, laengs, quer)
    (s8, q8) = strecke(halle8.poly, laengs, quer)

    # Die Luecke zwischen den beiden Zeilen ist der Gang.
    if (q9[0] + q9[1]) / 2 < (q6[0] + q6[1]) / 2:
        wand_ost, wand_west = q9[1], q6[0]
    else:
        wand_ost, wand_west = q6[1], q9[0]
    breite = wand_west - wand_ost
    achse_q = (wand_ost + wand_west) / 2

    # Station 0 an der Stirnseite von Halle 8, Richtung auf Halle 9 zu.
    null = s8[0] if abs(s8[0] - s9[1]) < abs(s8[1] - s9[0]) else s8[1]
    richtung = 1.0 if (s9[0] + s9[1]) / 2 > null else -1.0

    def station(wert: float) -> float:
        return (wert - null) * richtung

    # Der Ursprung der Mittelachse in Geländemetern.
    x0 = null * laengs[0] + achse_q * quer[0]
    y0 = null * laengs[1] + achse_q * quer[1]
    laengs_gerichtet = (laengs[0] * richtung, laengs[1] * richtung)

    # Welche Gebaeude kommen als Wand des Gangs ueberhaupt in Frage? Der
    # Huellquader taugt als Vorauswahl -- was ihn nicht schneidet, kann auch
    # den Umriss nicht an die Wand bringen. Wo das Gebaeude dann wirklich
    # steht, entscheidet danach der Umriss selbst.
    kandidaten: dict[str, list] = {"ost": [], "west": []}
    for bau in gebaeude.values():
        (s_span, q_span) = strecke(bau.poly, laengs, quer)
        if q_span[1] <= achse_q:
            seite, abstand = "ost", wand_ost - q_span[1]
        elif q_span[0] >= achse_q:
            seite, abstand = "west", q_span[0] - wand_west
        else:
            continue
        if abstand > FRONT_M or abstand < -FRONT_M:
            continue
        von, bis = sorted((station(s_span[0]), station(s_span[1])))
        if bis <= 0 or von >= LAENGE_M:
            continue
        kandidaten[seite].append(bau)

    rahmen = Rahmen(laengs=laengs, quer=quer, null=null, richtung=richtung,
                    achse_q=achse_q, wand_ost=wand_ost, wand_west=wand_west)
    seiten = {}
    for seite, liste in kandidaten.items():
        belegung = belegung_messen(liste, rahmen, rahmen.wandlinie(seite),
                                   1.0 if seite == "west" else -1.0, 0.0, LAENGE_M)
        seiten[seite] = abschnitte(belegung, 0.0, LAENGE_M)

    sued = suedteil(gebaeude, ziel, station, laengs, quer, achse_q, registrations,
                    rahmen)

    # Das Aussengelaende. Die Ostseite ist bewusst noch nicht dabei: dort
    # liegen Parkhaus, Eingang Ost und der Messeplatz ineinander, und das ist
    # ein eigener Schritt.
    _osm_bauten, osm_roh = osm_flaechen(origin)
    knick = nordknoten(gebaeude, rahmen)
    aussen = hoefe(seiten["west"], gebaeude, rahmen, "west")

    plan = {
        "schema": "beuteltier.boulevard.v1",
        "quelle": {
            "geometrie": "LoD2 Geobasis NRW (CityGML, EPSG:25832), dl-de/zero-2-0",
            "zuordnung": "hall-registrations.json (official-footprint-containment)",
            "namen": "OpenStreetMap (ODbL), nur Beschriftung" if OSM_BUILDINGS.exists()
                     else None,
            "kacheln": sorted(p.name for p in LOD2_DIR.glob("*.gml")),
        },
        "origin": [origin[0], origin[1]],
        "achse": {
            "x0": round(x0, 3),
            "y0": round(y0, 3),
            "laengs": [round(laengs_gerichtet[0], 9), round(laengs_gerichtet[1], 9)],
            "quer": [round(quer[0], 9), round(quer[1], 9)],
            "winkelDeg": round(math.degrees(math.atan2(laengs_gerichtet[1],
                                                       laengs_gerichtet[0])), 4),
        },
        "laengeM": LAENGE_M,
        "breiteM": round(breite, 2),
        "hoeheM": HOEHE_M,
        # Wo die beiden Wandlinien liegen, quer zur Achse gemessen. Steht hier,
        # damit niemand raten muss, welche Seite die Ostseite ist.
        "seitenQ": {
            "ost": round(wand_ost - achse_q, 3),
            "west": round(wand_west - achse_q, 3),
        },
        # Wie weit der Gang geometrisch reicht: bis dorthin, wo die naechsten
        # Hallen andocken. Die gebaute Laenge ist Vorgabe und kann kuerzer sein.
        "geometrieLaengeM": round(naechste_hallen(gebaeude, station, laengs, quer), 1),
        # Was an den beiden Enden liegt -- das steht auf den Wegweisern.
        "enden": enden(gebaeude, station, laengs, quer, achse_q),
        # Die Piazza am Suedende, aus gezaehlten Stufen:
        # Halle 11 liegt ebenerdig wie Halle 10.1 (0,00 m), und von dort
        # fuehren zweimal zehn Stufen hinauf. Mit demselben Steigungsmass wie
        # ueberall auf dem Gelaende sind das 20 x 16,56 cm.
        # Der Suedknoten, aus gezaehlten Stufen und amtlichen Geschosshoehen.
        # Der Querriegel liegt zwischen dem Suedteil (7,60 m) und Halle 10.1
        # (0,00 m): zwanzig Stufen hinunter, sechsundzwanzig weiter hinunter.
        # 46 Stufen auf 7,60 m sind 16,52 cm -- dasselbe Mass wie am
        # Nordboulevard, wo 45 Stufen 7,45 m ueberwinden.
        "knoten": {
            "riegel": {"vonM": 377.4, "bisM": 400.3,
                       "hoeheM": round(26 * 7.60 / 46, 2)},
            "treppeM": round(20 * 0.30, 2),
            # Das Treppenhaus zu Halle 10: es sitzt am Ostrand des Riegels
            # und faellt quer zur Achse auf Hallenniveau ab.
            "qOstM": -12.1,
            "stufenOst": 26,
            "piazzaVonM": 485.0,
            "piazzaHoeheM": round(20 * 0.1656, 2),
        } if sued else None,
        "piazza": {
            "hoeheM": round(20 * 0.1656, 2),
            "stufen": 20,
            "herkunft": "gezaehlt (Halle 11 -> Piazza), Halle 11 ebenerdig wie 10.1",
        },
        "seiten": seiten,
        # Das Aussengelaende: die Hoefe zwischen den Hallen und das freie
        # Gelaende hinter Halle 8. Dort, wo der Gang "Aussenflaeche" meldet,
        # sieht man durch das Glas auf eine dieser Flaechen.
        "aussen": aussen,
        # Benannte Plaetze aus OSM. Sie stehen bewusst getrennt von "aussen":
        # dort sind Rechtecke aus amtlichen Umrissen gerechnet, hier sind
        # Polygone aus einer anderen Quelle uebernommen.
        "plaetze": plaetze(osm_roh, rahmen),
        # Das Aussengelaende zwischen Halle 9 und Halle 10: zwei Ebenen und
        # eine Rampe, zusammen eine begehbare Oberflaeche.
        "aussen9_10": aussen_neun_zehn(rahmen, hallenhoehen()),
        # Der Knick am Nordende -- dort geht es zum Eingang Nord weiter.
        "nordknoten": knick,
        # Die Zugaenge von den Hallen in den Gang. Abgeleitet, nicht gemessen
        # -- siehe durchgaenge().
        "durchgaenge": durchgaenge(seiten, knick),
        "sued": sued,
        # Die Treppe liegt zwischen beiden Teilen: sie beginnt am Ende der
        # gebauten Laenge und endet dort, wo Halle 5 und Halle 10 anfangen.
        # Dass diese Strecke 18,8 m lang ist und die Anlage aus 3x15 Stufen
        # mit 16,56 cm genau 18 m Lauf und 7,45 m Hoehe hat, ist die
        # Gegenprobe: beide Zahlen kommen aus verschiedenen Quellen.
        "treppe": {
            "vonM": LAENGE_M,
            "bisM": round(naechste_hallen(gebaeude, station, laengs, quer), 1),
            "untenM": 0.0,
            "obenM": (sued or {}).get("obenM"),
        } if sued else None,
        "hallen": {
            LEITHALLE: masse(halle9, station, s9, q9, wand_ost, wand_west),
            GEGENUEBER: masse(halle6, station, s6, q6, wand_ost, wand_west),
            ABSCHLUSS: masse(halle8, station, s8, q8, wand_ost, wand_west),
        },
        "hinweis": (
            "Stationen in Metern ab der Stirnseite von Halle 8 (Norden), "
            "Richtung Sueden. Laenge und Hoehe sind Vorgabe, alles andere "
            "gemessen."
        ),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(plan, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    OUT_APP.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUT, OUT_APP)

    print(f"Gang: {LAENGE_M:.0f} m lang, {breite:.1f} m breit, "
          f"Richtung {plan['achse']['winkelDeg']:.2f}°")
    for seite in ("ost", "west"):
        print(f"\n{seite.upper()}:")
        for teil in seiten[seite]:
            print(f"  {teil['von']:7.1f} .. {teil['bis']:7.1f} "
                  f"({teil['bis'] - teil['von']:6.1f} m)  {teil['art']:5s}  {teil['was']}")
    print("\nDURCHGAENGE:")
    for tor in plan["durchgaenge"]:
        ziel = f"Halle {tor['hallKey']}" if tor["hallKey"] else "Nordknoten"
        print(f"  {tor['stationM']:7.1f}  {tor['seite']:4s}  {ziel:12s} "
              f"{tor['breiteM']:5.1f} m breit  "
              f"{'gemessen' if tor['gemessen'] else 'abgeleitet'}  {tor['id']}")
    if knick:
        print(f"\nNORDKNOTEN: Station {knick['vonM']}..{knick['bisM']}, "
              f"q {knick['qVonM']}..{knick['qBisM']}, {knick['flaecheSqm']} m2, "
              f"{len(knick['polygon'])} Ecken")
        print(f"  Anschluss an den Gang bei Station {knick['anschlussM']}")
    a910 = plan["aussen9_10"]
    if a910:
        print("\nAUSSENGELAENDE 9/10:")
        for schluessel in ("ebene1", "schraege", "ebene0"):
            t = a910[schluessel]
            hoehe = (f"{t['hoeheM']:.2f} m" if "hoeheM" in t
                     else f"{t['obenM']:.2f} -> {t['untenM']:.2f} m"
                       f"  ({t['steigungProzent']:.2f} %)")
            print(f"  {schluessel:9s} Station {t['vonM']:7.1f}..{t['bisM']:7.1f}"
                  f"  q {t['qVonM']:7.1f}..{t['qBisM']:7.1f}   {hoehe}")
    print("\nPLAETZE (OSM):")
    for platz in plan["plaetze"]:
        print(f"  {platz['vonM']:7.1f} .. {platz['bisM']:7.1f}  "
              f"q {platz['qVonM']:7.1f} .. {platz['qBisM']:7.1f}  "
              f"{len(platz['polygon']):3d} Ecken  {platz['art']:10s} {platz['name']}"
              f"{'  -- ' + platz['nutzung'] if platz['nutzung'] else ''}")
    print("\nAUSSENGELAENDE:")
    for flaeche in aussen:
        print(f"  {flaeche['vonM']:7.1f} .. {flaeche['bisM']:7.1f}  "
              f"q {flaeche['qVonM']:7.1f} .. {flaeche['qBisM']:7.1f}  "
              f"tief {flaeche['tiefeM']:6.1f} m  {flaeche['id']}")
    print(f"\n-> {OUT} und {OUT_APP}")
    return 0


def enden(gebaeude: dict[str, Gebaeude], station, laengs, quer,
          achse_q: float) -> dict[str, list[str]]:
    """Welche Hallen an den beiden Enden des Gangs liegen.

    Im Norden steht Halle 8 quer davor, im Sueden docken die naechsten Hallen
    an. Beides wird gemessen und nicht eingetragen: wer den Wegweiser von Hand
    beschriftet, schreibt frueher oder spaeter etwas hin, das der Geometrie
    widerspricht.
    """
    grenze = naechste_hallen(gebaeude, station, laengs, quer)
    nord: set[str] = set()
    sued: set[str] = set()
    for bau in gebaeude.values():
        if not bau.hall_key:
            continue
        (s_span, q_span) = strecke(bau.poly, laengs, quer)
        # Nur was seitlich am Gang liegt. Die Hallen 1 bis 4 stehen weit
        # abseits und haetten sonst allein durch ihre Projektion auf die
        # Achse auf dem Schild gestanden.
        seitlich = max(0.0, max(q_span[0] - achse_q, achse_q - q_span[1]))
        if seitlich > ENDE_ABSTAND_M:
            continue
        von = min(station(s_span[0]), station(s_span[1]))
        bis = max(station(s_span[0]), station(s_span[1]))
        halle = bau.hall_key.split(".")[0]
        if bis <= 1.0:
            nord.add(halle)
        elif grenze - 10.0 <= von <= grenze + ENDE_ABSTAND_M:
            # Nur die Hallen, die dort **anfangen**. Was weiter suedlich liegt,
            # ist eine Fortsetzung und kein Ziel dieses Gangs.
            sued.add(halle)
    return {"nord": sorted(nord, key=int), "sued": sorted(sued, key=int)}


def naechste_hallen(gebaeude: dict[str, Gebaeude], station, laengs, quer) -> float:
    """Wo suedlich die naechsten Hallen anfangen -- das Ende des Gangs.

    Halle 5 und Halle 10 docken dort an; weiter reicht der Gang nicht, ohne
    dass man sie mitbauen muesste.
    """
    anfaenge = []
    for bau in gebaeude.values():
        if not bau.hall_key or bau.hall_key in (LEITHALLE, GEGENUEBER, ABSCHLUSS):
            continue
        (s_span, _) = strecke(bau.poly, laengs, quer)
        von = min(station(s_span[0]), station(s_span[1]))
        if von > LAENGE_M * 0.5:
            anfaenge.append(von)
    return min(anfaenge) if anfaenge else LAENGE_M


def suedteil(gebaeude: dict[str, Gebaeude], ziel: dict[str, list[str]], station,
             laengs, quer, achse_q: float, registrations: dict,
             rahmen: Rahmen) -> dict | None:
    """Der Suedteil: wo sich der Gang weitet und die Ebene wechselt.

    Suedlich von Halle 6 und Halle 9 hoert die enge Gasse auf. Halle 5 steht
    dort dicht an der Achse, Halle 10 dagegen weit zurueck -- aus 15 m Gang
    werden ueber 40 m Halle. Und es geht eine Ebene hinunter: Halle 5.2 und
    Halle 10.2 liegen auf rund 7,5 m, Halle 5.1 und Halle 10.1 auf null.

    Wo genau es hinuntergeht, sagt das Wegenetz: `portals.json` fuehrt an
    dieser Stelle drei senkrechte Verbindungen 10.1 <-> 10.2 nebeneinander --
    die breite Treppe mit den Rolltreppen beidseitig. Die Portale sind Entwurf
    und auf 20 m genau, ihre **Lage zueinander** ist trotzdem eindeutig.
    """
    # Eine Halle kann aus mehreren amtlichen Gebaeuden bestehen -- Halle 5 aus
    # zweien. Am Gang steht das, welches der Achse am naechsten kommt.
    def naechstes(key: str, zur_achse: str) -> tuple | None:
        teile = [gebaeude[fid] for fid in ziel.get(key, []) if fid in gebaeude]
        if not teile:
            return None
        gemessen = [(strecke(t.poly, laengs, quer), t) for t in teile]
        if zur_achse == "west":
            return min(gemessen, key=lambda g: g[0][1][0])
        return max(gemessen, key=lambda g: g[0][1][1])

    treffer_west = naechstes(SUED_WEST, "west")
    treffer_ost = naechstes(SUED_OST, "ost")
    if not treffer_west or not treffer_ost:
        return None
    ((s_west, q_west), west) = treffer_west
    ((s_ost, q_ost), ost) = treffer_ost
    wand_west = q_west[0] - achse_q
    wand_ost = q_ost[1] - achse_q
    von = max(min(station(s_west[0]), station(s_west[1])),
              min(station(s_ost[0]), station(s_ost[1])))
    # Bis zur naechsten Querung: dort geht der Gang in die Passage ueber.
    bis = min(max(station(s_west[0]), station(s_west[1])),
              max(station(s_ost[0]), station(s_ost[1])))

    hoehen = hallenhoehen()
    oben = hoehen.get(SUED_WEST)
    unten = hoehen.get(SUED_OST.split(".")[0] + ".1", 0.0)

    kante = treppenstation(station, laengs, quer)

    kandidaten: dict[str, list] = {"ost": [], "west": []}
    for bau in gebaeude.values():
        (s_span, q_span) = strecke(bau.poly, laengs, quer)
        qo = q_span[1] - achse_q
        qw = q_span[0] - achse_q
        if qo <= (wand_ost + wand_west) / 2:
            seite, abstand = "ost", wand_ost - qo
        else:
            seite, abstand = "west", qw - wand_west
        if abs(abstand) > FRONT_M:
            continue
        a, b = sorted((station(s_span[0]), station(s_span[1])))
        if b <= von or a >= bis:
            continue
        kandidaten[seite].append(bau)

    return {
        "vonM": round(von, 2),
        "bisM": round(bis, 2),
        "seitenQ": {"ost": round(wand_ost, 3), "west": round(wand_west, 3)},
        "breiteM": round(wand_west - wand_ost, 2),
        # Fussboden oben und unten, aus den amtlichen Hallenhoehen.
        "obenM": round(oben, 2) if oben is not None else None,
        "untenM": round(unten, 2),
        # Wo die Treppe liegt -- Mittel der senkrechten Portale.
        "kanteM": round(kante, 1) if kante is not None else None,
        "seiten": {
            # Wie am Hauptgang: der Huellquader war nur die Vorauswahl, wo das
            # Gebaeude wirklich steht, sagt sein Umriss.
            seite: abschnitte(
                belegung_messen(liste, rahmen,
                                wand_west if seite == "west" else wand_ost,
                                1.0 if seite == "west" else -1.0, von, bis),
                von, bis)
            for seite, liste in kandidaten.items()
        },
    }


def osm_flaechen(origin: tuple[float, float]) -> tuple[list, list]:
    """Gebaeude und Plaetze aus dem OSM-Flaechenabruf, in Geländemetern.

    Beides fuehrt LoD2 nicht: einen Platz kann ein Gebaeudemodell nicht kennen,
    und die Verbindungsbauten zwischen den Hallen fehlen im amtlichen Umriss.
    Alles, was von hier kommt, wird in der Ergebnisdatei als OSM ausgewiesen.
    """
    if not OSM_FLAECHEN.exists():
        return [], []
    payload = json.loads(OSM_FLAECHEN.read_text(encoding="utf-8"))
    punkte = {e["id"]: (e["lat"], e["lon"])
              for e in payload.get("elements", []) if e["type"] == "node"}

    bauten: list = []
    plaetze: list = []
    for element in payload.get("elements", []):
        if element["type"] != "way":
            continue
        tags = element.get("tags", {})
        ring = [utm32(*punkte[ref], origin)
                for ref in element.get("nodes", []) if ref in punkte]
        if len(ring) < 4:
            continue
        if tags.get("building"):
            bauten.append((tags.get("name") or f"OSM {element['id']}", ring))
        elif tags.get("name") and (tags.get("area") == "yes"
                                   or tags.get("highway") == "pedestrian"
                                   or tags.get("amenity") == "parking"):
            plaetze.append((tags["name"], ring, tags, element["id"]))
    return bauten, plaetze


def frei(gebaeude: dict[str, Gebaeude], rahmen: Rahmen,
         von: float, bis: float, q_rel: float) -> bool:
    """Steht auf dieser Querlinie zwischen zwei Stationen kein Gebaeude?

    Abgetastet und nicht gerechnet -- aus demselben Grund wie bei den
    Wandabschnitten: die amtlichen Umrisse sind keine Rechtecke, und ihre
    Huellquader ueberlappen sich auch dort, wo die Gebaeude es nicht tun. Wer
    mit Huellquadern rechnet, bekommt Hoefe, die in Hallen hineinragen.
    """
    schritte = max(1, int((bis - von) / HOF_SCHRITT_M))
    for index in range(schritte + 1):
        s = von + (bis - von) * index / schritte
        punkt = rahmen.ort(s, q_rel)
        for bau in gebaeude.values():
            if punkt_in_polygon(punkt, bau.poly):
                return False
    return True


def tiefe_messen(gebaeude: dict[str, Gebaeude], rahmen: Rahmen, seite: str,
                 von: float, bis: float, grenze: float) -> tuple[float, str]:
    """Wie weit ein Hof von der Wandlinie nach aussen reicht.

    Schrittweise nach draussen, bis entweder ein Gebaeude im Weg steht oder
    die Grenze erreicht ist. Die Grenze ist der flachere der beiden Nachbarn:
    weiter draussen ist der Hof nach einer Seite offen und damit kein Hof mehr,
    sondern freies Gelaende.

    Zurueck kommt auch, **warum** es aufgehoert hat. Beides sind Messungen,
    aber verschiedene: einmal steht dort ein Gebaeude, einmal endet der
    Nachbar. Wer das nicht unterscheidet, haelt spaeter das eine fuer das
    andere.
    """
    vorzeichen = 1.0 if seite == "west" else -1.0
    wand = rahmen.wandlinie(seite)
    tiefe = 0.0
    while tiefe + HOF_SCHRITT_M <= grenze:
        probe = wand + vorzeichen * (tiefe + HOF_SCHRITT_M)
        if not frei(gebaeude, rahmen, von, bis, probe):
            return tiefe, "Gebaeude"
        tiefe += HOF_SCHRITT_M
    return tiefe, "Nachbar endet"


def hoefe(teile: list[dict], gebaeude: dict[str, Gebaeude], rahmen: Rahmen,
          seite: str) -> list[dict]:
    """Die rechteckigen Zwischenraeume zwischen den Hallen einer Seite.

    Gelesen werden die bereits gemessenen Wandabschnitte: wo der Gang
    "Aussenflaeche" meldet, steht kein Gebaeude, und genau das ist ein Hof.
    Damit kann die Hofbreite nicht mehr von der Wand abweichen -- beide sind
    dieselbe Zahl. Gerechnet wird hier nur noch die Tiefe.
    """
    def reichweite(bau: Gebaeude) -> float:
        (_s, q_span) = strecke(bau.poly, rahmen.laengs, rahmen.quer)
        return (q_span[1] - rahmen.wand_west if seite == "west"
                else rahmen.wand_ost - q_span[0])

    nach_hallkey = {bau.hall_key: bau for bau in gebaeude.values() if bau.hall_key}
    out: list[dict] = []
    for index, teil in enumerate(teile):
        # Ein Hof ist ein Stueck Gang, an dem nichts steht -- kein Gebaeude,
        # auch kein verglastes.
        if teil["art"] != "glas" or teil["featureId"] is not None:
            continue
        links = next((t for t in reversed(teile[:index]) if t["hallKey"]), None)
        rechts = next((t for t in teile[index + 1:] if t["hallKey"]), None)
        # Am Nordende steht Halle 8 quer davor; sie taucht in den Abschnitten
        # dieser Seite nicht auf, begrenzt den ersten Hof aber trotzdem.
        links_key = links["hallKey"] if links else (
            ABSCHLUSS if teil["von"] <= SCHRITT_M else None)
        rechts_key = rechts["hallKey"] if rechts else None
        if not links_key or not rechts_key:
            continue
        links_bau = nach_hallkey.get(links_key)
        rechts_bau = nach_hallkey.get(rechts_key)
        if not links_bau or not rechts_bau:
            continue
        if teil["bis"] - teil["von"] < MIN_HOF_M:
            continue

        von = teil["von"] + HOF_RAND_M
        bis = teil["bis"] - HOF_RAND_M
        grenze = min(reichweite(links_bau), reichweite(rechts_bau))
        tiefe, grund = tiefe_messen(gebaeude, rahmen, seite, von, bis, grenze)
        if tiefe < MIN_HOF_M:
            continue
        wand = rahmen.wandlinie(seite)
        aussen = wand + (tiefe if seite == "west" else -tiefe)
        out.append({
            "id": f"hof-{links_key}-{rechts_key}".replace(".", "_"),
            "seite": seite,
            "vonM": round(teil["von"], 2),
            "bisM": round(teil["bis"], 2),
            "qVonM": round(min(wand, aussen), 3),
            "qBisM": round(max(wand, aussen), 3),
            "breiteM": round(teil["bis"] - teil["von"], 2),
            "tiefeM": round(tiefe, 2),
            "zwischen": [links_key, rechts_key],
            "endetAn": grund,
            "gekappt": False,
            "quelle": "LoD2",
            "herkunft": "offener Wandabschnitt, Tiefe abgetastet",
        })
    return out


def durchgaenge(seiten: dict[str, list[dict]], knick: dict | None = None) -> list[dict]:
    """Die Zugaenge von den Hallen in den Gang.

    Kein Datensatz nennt sie: OSM hat am Nordgang keinen einzigen Eingangs-
    knoten, und LoD2 kennt Gebaeude, keine Tueren. Statt sie zu erfinden,
    werden sie aus der einzigen Messung abgeleitet, die es dazu gibt -- der
    Laenge der Fassade, mit der eine Halle am Gang steht. Wo 75 m Halle 9
    stehen, sind zwei Zugaenge; wo 126 m Halle 6 stehen, sind drei.

    Was gemessen ist und was Vorgabe ist, steht bei jedem Eintrag einzeln.
    """
    out: list[dict] = []
    for seite, abschnitte_der_seite in seiten.items():
        for teil in abschnitte_der_seite:
            if teil["art"] != "wand" or not teil["hallKey"]:
                continue
            laenge = teil["bis"] - teil["von"]
            nutzbar = laenge - 2 * DURCHGANG_RAND_M
            if nutzbar < DURCHGANG_BREITE_M:
                continue
            anzahl = max(1, round(laenge / DURCHGANG_ABSTAND_M))
            # So viele, wie nebeneinander passen -- nicht mehr.
            anzahl = min(anzahl, int(nutzbar // DURCHGANG_BREITE_M))
            for index in range(anzahl):
                mitte = teil["von"] + DURCHGANG_RAND_M + nutzbar * (index + 0.5) / anzahl
                out.append({
                    "id": f"tor-{seite}-{teil['hallKey']}-{index + 1}".replace(".", "_"),
                    "seite": seite,
                    "hallKey": teil["hallKey"],
                    "featureId": teil["featureId"],
                    # Gemessen: wo die Fassade anfaengt und aufhoert.
                    "abschnittVonM": teil["von"],
                    "abschnittBisM": teil["bis"],
                    # Abgeleitet: die Mitte des ihm zustehenden Fassadenstuecks.
                    "stationM": round(mitte, 2),
                    "breiteM": DURCHGANG_BREITE_M,
                    "hoeheM": DURCHGANG_HOEHE_M,
                    "gemessen": False,
                    "herkunft": ("abgeleitet aus der gemessenen Fassadenlaenge; "
                                 "Anzahl und Groesse sind Vorgabe"),
                })

    # Der Uebergang in den Knick am Nordende ist der einzige, der nicht
    # abgeleitet ist: wie breit er ist, steht im amtlichen Umriss -- es ist die
    # Fuge, an der der Baukoerper die Ostwand des Gangs beruehrt. Dass man dort
    # stufenlos hinuebergeht, zeigt das Referenzfoto des Knicks.
    if knick and knick.get("anschlussM"):
        von, bis = knick["anschlussM"]
        out.append({
            "id": "tor-ost-nordknoten",
            "seite": "ost",
            "hallKey": None,
            "featureId": knick["featureId"],
            "abschnittVonM": von,
            "abschnittBisM": bis,
            "stationM": round((von + bis) / 2, 2),
            "breiteM": round(bis - von, 2),
            "hoeheM": DURCHGANG_HOEHE_M,
            "gemessen": True,
            "herkunft": ("Anschlussfuge am amtlichen Umriss gemessen; "
                         "die lichte Hoehe ist Vorgabe"),
        })
    return out



def dreiecke_der_rampe(rahmen: Rahmen, von: float, bis: float, west_q: float,
                       breite: float, oben: float, unten: float,
                       u: float) -> list[list[list[float]]]:
    """Die Rampe als zwei Dreiecke, mit Hoehe an jeder Ecke.

    Die Neigung steckt damit in den Eckhoehen und nirgends sonst -- wer sie
    spaeter aendert, aendert sie an einer Stelle.
    """
    west = west_q + u
    ost_q = west_q - breite
    ecken = [(von, west, unten), (bis, west, oben),
             (bis, ost_q, oben), (von, ost_q, unten)]
    punkte = []
    for s, q, h in ecken:
        x, y = rahmen.ort(s, q)
        punkte.append([round(x, 2), round(y, 2), round(h, 3)])
    return [[punkte[0], punkte[1], punkte[2]], [punkte[0], punkte[2], punkte[3]]]


def aussen_neun_zehn(rahmen: Rahmen, hoehen: dict[str, float]) -> dict | None:
    """Das Aussengelaende zwischen Halle 9 und Halle 10.

    Drei Flaechen und keine einzige mehr: die obere Ebene um Halle 10, die
    Rampe, die untere Ebene um Halle 9. Zusammen sind sie **eine** begehbare
    Oberflaeche -- getrennt gefuehrt nur, weil die mittlere geneigt ist.

    Die Hoehen kommen aus den Hallenboeden und nicht aus dem Bandmass. Die
    Vorgabe war ausdruecklich, dass die Platten ohne sichtbare Fuge an die
    Hallenboeden anschliessen -- dann muessen sie auch auf deren Hoehe liegen.
    Gemessen wurden 8,33 m Unterschied, die amtlichen Boeden geben 7,45 m her.
    Beide Zahlen stehen in der Ausgabe; die Rampe faehrt die amtliche.
    """
    oben = hoehen.get("10.2")
    unten = hoehen.get("9.1", 0.0)
    if oben is None:
        return None
    u = AUSSEN_UEBERLAPP_M

    def flaeche(von: float, bis: float, west_q: float,
                breite: float) -> list[list[float]]:
        """Ein Viereck in Station/Quermass, als Geländemeter-Ring."""
        ost_q = west_q - breite
        ecken = [(von, west_q + u), (bis, west_q + u), (bis, ost_q), (von, ost_q)]
        return [[round(x, 2), round(y, 2)]
                for x, y in (rahmen.ort(s, q) for s, q in ecken)]

    grenze = AUSSEN_GRENZE_M
    rampe_bis = grenze - AUSSEN_RAMPE_M
    return {
        "id": "aussen-9-10",
        "was": "Aussengelaende zwischen Halle 9 und Halle 10",
        "quelle": "vor Ort gemessen (dz.nrw); verortet ueber die amtlichen Hallenkanten",
        "grenzeM": grenze,
        "versatzM": AUSSEN_VERSATZ_M,
        "versatzHerkunft": ("An der Ostseite sind von Sueden aus 29,95 m von "
                            "Halle 10 nicht mit Ebene 1 ueberbaut. Der Wert "
                            "steht als Zahl und ist nicht aus der Platte "
                            "herausgeschnitten -- die Platte bleibt bewusst ein "
                            "Viereck, auf dem die Halle steht."),
        # Beide Flaechen sind als Vierecke gefuehrt, auf denen die Halle steht
        # -- so war es vorgegeben, und so bleibt die Bodenplatte robust. Was
        # draussen davon uebrig bleibt, ist ein U; wohin es offen ist, steht
        # hier, damit spaeter niemand die Platte fuer die begehbare Flaeche
        # haelt.
        "form": {
            "ebene1": {"traegt": "10.2", "offenNach": "sued",
                       "streifenZumBoulevardM": AUSSEN_STREIFEN_E1_M},
            "ebene0": {"traegt": "9.1", "offenNach": "west",
                       "streifenZumBoulevardM": 0.0},
        },
        "ueberlappM": u,
        "ebene1": {
            "id": "aussen-9-10:ebene1",
            "vonM": grenze, "bisM": AUSSEN_E1["suedM"],
            "qVonM": round(AUSSEN_WEST_E1_Q - AUSSEN_E1["breiteQ"], 2),
            "qBisM": AUSSEN_WEST_E1_Q,
            "hoeheM": round(oben, 2),
            # Nach Norden **ohne** Ueberlapp: dort stoesst Ebene 0 an, und
            # zwei Fussboeden uebereinander waeren ein Absatz von 7,45 m --
            # die Kollision nimmt bei gleicher Lage den tieferen.
            "polygon": flaeche(grenze, AUSSEN_E1["suedM"] + u,
                               AUSSEN_WEST_E1_Q, AUSSEN_E1["breiteQ"]),
            "herkunft": "188,10 x 178,93 m gemessen; Hoehe = Fussboden Halle 10.2",
        },
        "schraege": {
            "id": "aussen-9-10:schraege",
            "vonM": round(rampe_bis, 2), "bisM": grenze,
            "qVonM": round(AUSSEN_WEST_E1_Q - AUSSEN_E1["breiteQ"], 2),
            "qBisM": AUSSEN_WEST_E1_Q,
            "obenM": round(oben, 2), "untenM": round(unten, 2),
            "laufM": AUSSEN_RAMPE_M,
            "hoeheGemessenM": AUSSEN_RAMPE_GEMESSEN_M,
            "steigungProzent": round(100 * (oben - unten) / AUSSEN_RAMPE_M, 2),
            "polygon": flaeche(rampe_bis, grenze,
                               AUSSEN_WEST_E1_Q, AUSSEN_E1["breiteQ"]),
            # Zwei Dreiecke mit Hoehe je Ecke -- die Kollision interpoliert
            # darin, statt die Neigung ein zweites Mal zu rechnen.
            "dreiecke": dreiecke_der_rampe(rahmen, rampe_bis, grenze,
                                           AUSSEN_WEST_E1_Q,
                                           AUSSEN_E1["breiteQ"], oben, unten, u),
            "herkunft": ("Grundriss 84,59 m gemessen; Hoehe aus den Hallenboeden. "
                         "Vor Ort wurden 8,33 m gemessen -- die amtlichen Boeden "
                         "geben 7,45 m, und die Fuge am Hallenboden waere sonst "
                         "sichtbar."),
        },
        "ebene0": {
            "id": "aussen-9-10:ebene0",
            "vonM": AUSSEN_E0["nordM"], "bisM": grenze,
            "qVonM": round(AUSSEN_WEST_E0_Q - AUSSEN_E0["breiteQ"], 2),
            "qBisM": AUSSEN_WEST_E0_Q,
            "hoeheM": round(unten, 2),
            "polygon": flaeche(AUSSEN_E0["nordM"] - u, grenze,
                               AUSSEN_WEST_E0_Q, AUSSEN_E0["breiteQ"]),
            "herkunft": "213,00 x 120,18 m gemessen; Hoehe = Fussboden Halle 9.1",
        },
    }


def plaetze(osm_plaetze: list, rahmen: Rahmen) -> list[dict]:
    """Die benannten Plaetze am Gelaende, als Polygone in Geländemetern.

    Der Messeplatz ist in OSM `area=yes, highway=footway, surface=paving_stones`
    -- eine Verkehrsflaeche mit 39 Ecken. LoD2 kann ihn nicht fuehren: ein
    Gebaeudemodell kennt Gebaeude. Hier ist OSM also nicht die zweite Meinung,
    sondern die einzige.

    Anders als bei den Hoefen wird nichts gerechnet, sondern der Umriss
    uebernommen. Deshalb bleibt er ein Polygon und wird nicht in ein Rechteck
    gepresst -- ein Platz mit 39 Ecken ist kein Rechteck, und ein Huellquader
    um ihn herum wuerde Flaeche behaupten, die es nicht gibt.
    """
    out: list[dict] = []
    for name, ring, tags, way_id in osm_plaetze:
        stationen = [rahmen.station(x * rahmen.laengs[0] + y * rahmen.laengs[1])
                     for x, y in ring]
        quer = [x * rahmen.quer[0] + y * rahmen.quer[1] - rahmen.achse_q
                for x, y in ring]
        mitte_s = sum(stationen) / len(stationen)
        mitte_q = sum(quer) / len(quer)
        # Nur was am Gelaende liegt; die Abfrage reicht weiter als der Gang.
        if not (-320.0 < mitte_s < 760.0 and abs(mitte_q) < 320.0):
            continue
        out.append({
            "id": f"platz-{way_id}",
            "name": name,
            "quelle": "OpenStreetMap (ODbL)",
            "osmWayId": way_id,
            "vonM": round(min(stationen), 2),
            "bisM": round(max(stationen), 2),
            "qVonM": round(min(quer), 2),
            "qBisM": round(max(quer), 2),
            "hoeheM": 0.0,
            "art": ("parkplatz" if tags.get("amenity") == "parking" else "platz"),
            "nutzung": NUTZUNG.get(name),
            "belag": tags.get("surface"),
            "beleuchtet": tags.get("lit") == "yes",
            # Der volle Umriss in Geländemetern -- die Kollision liest ihn
            # unveraendert, damit der Platz seine Form behaelt.
            "polygon": [[round(x, 2), round(y, 2)] for x, y in ring],
        })
    return sorted(out, key=lambda p: p["vonM"])


def nordknoten(gebaeude: dict[str, Gebaeude], rahmen: Rahmen) -> dict | None:
    """Der Knick am Nordende, ueber den es zum Eingang Nord geht.

    Anders als beim Suedknoten wird hier nichts konstruiert: der Baukoerper
    liegt als amtlicher Umriss vor, und der Umriss **enthaelt** den Knick
    bereits. Uebernommen wird er deshalb wie er ist, mit allen 67 Ecken --
    auch der gerundeten Fassade zum Messeplatz. Ein Rechteck darum herum waere
    hier besonders falsch, denn gerade die Rundung ist die Seite, an der man
    hinaus auf den Platz kommt.

    Gerechnet wird nur, wo er den Gang beruehrt: das ist die Stelle, an der
    der Besucher aus den 285 m herauskommt.
    """
    bau = gebaeude.get(NORD_KNICK)
    if not bau:
        return None
    stationen = [rahmen.station(x * rahmen.laengs[0] + y * rahmen.laengs[1])
                 for x, y in bau.poly]
    quer = [x * rahmen.quer[0] + y * rahmen.quer[1] - rahmen.achse_q
            for x, y in bau.poly]

    # Die Anschlussfuge: alle Ecken, die auf der Ostwand des Gangs liegen.
    wand = rahmen.wandlinie("ost")
    auf_der_wand = [s for s, q in zip(stationen, quer) if abs(q - wand) < 0.5]
    return {
        "id": "nordknoten",
        "featureId": NORD_KNICK,
        "was": "Knick am Nordende -- Uebergang zu Congress-Centrum Nord und Eingang Nord",
        "vonM": round(min(stationen), 2),
        "bisM": round(max(stationen), 2),
        "qVonM": round(min(quer), 2),
        "qBisM": round(max(quer), 2),
        "flaecheSqm": round(bau.flaeche),
        # Fussboden und Decke. Der Boden ist beobachtet (ebenerdig, stufenlos),
        # die Decke ist dieselbe Vorgabe wie im Gang -- der Baukoerper ist
        # aussen 19,4 m hoch, das ist aber die Dachkante und nicht die lichte
        # Hoehe darunter.
        "bodenM": 0.0,
        "deckeM": HOEHE_M,
        "bodenHerkunft": "ebenerdig und stufenlos, beobachtet am Referenzfoto des Knicks",
        "deckeHerkunft": "Vorgabe wie im Gang; 19,4 m ist die amtliche Dachkante",
        "anschlussM": ([round(min(auf_der_wand), 2), round(max(auf_der_wand), 2)]
                       if auf_der_wand else None),
        "quelle": "LoD2 Geobasis NRW (Umriss), Referenzfoto (Ebene)",
        "polygon": [[round(x, 2), round(y, 2)] for x, y in bau.poly],
    }


def hallenhoehen() -> dict[str, float]:
    """Fussbodenhoehen der Hallenebenen, aus der Standortdatei."""
    pfad = ROOT / "app" / "public" / "data" / "registered-site.json"
    site = json.loads(pfad.read_text(encoding="utf-8"))
    return {h["key"]: h["height"]["floorElevationRenderM"] for h in site["halls"]}


def treppenstation(station, laengs, quer) -> float | None:
    """Wo die senkrechten Verbindungen 10.1 <-> 10.2 liegen."""
    pfad = ROOT / "app" / "public" / "data" / "portals.json"
    if not pfad.exists():
        return None
    portale = json.loads(pfad.read_text(encoding="utf-8"))["portals"]
    stationen = []
    for portal in portale:
        a = portal["fromSurface"].split(":")[-1]
        b = portal["toSurface"].split(":")[-1]
        if {a, b} != {"10.1", "10.2"} or portal["kind"] != "vertical-unknown":
            continue
        x, _h, y = portal["position"]
        stationen.append(station(x * laengs[0] + y * laengs[1]))
    if not stationen:
        return None
    # Der dichteste Haufen ist die Anlage; einzelne Ausreisser liegen tief in
    # der Halle und gehoeren nicht zum Gang.
    stationen.sort()
    beste = min(
        ((stationen[i + 2] - stationen[i], i) for i in range(len(stationen) - 2)),
        default=(0.0, 0),
    )
    if len(stationen) < 3:
        return sum(stationen) / len(stationen)
    haufen = stationen[beste[1]:beste[1] + 3]
    return sum(haufen) / len(haufen)


def masse(bau: Gebaeude, station, s_span, q_span, wand_ost: float,
          wand_west: float) -> dict:
    von, bis = sorted((station(s_span[0]), station(s_span[1])))
    abstand = min(abs(wand_ost - q_span[1]), abs(q_span[0] - wand_west))
    return {
        "featureId": bau.id,
        "vonM": round(von, 2),
        "bisM": round(bis, 2),
        "amGangM": round(bis - von, 2),
        "tiefeM": round(q_span[1] - q_span[0], 2),
        "abstandM": round(abstand, 2),
        "flaecheSqm": round(bau.flaeche),
    }


def belegung_messen(liste: list, rahmen: Rahmen, wand_q: float, nach_aussen: float,
                    von_m: float, bis_m: float) -> list[Gebaeude | None]:
    """Welches Gebaeude steht an welcher Station wirklich an der Wand?

    Frueher wurde das aus den **Huellquadern** der Gebaeude beantwortet: jedes
    galt ueber seine ganze projizierte Stationsspanne als anwesend. In der
    Gangebene ist aber kein einziges dieser Gebaeude ein Rechteck -- der Gang
    laeuft schraeg zu ihren Kanten. Halle 7 reicht mit ihrem Huellquader bis
    Station 136, ihr Umriss an der Wand endet aber bei 120; Halle 6 endet bei
    250 statt bei 285. Einundfuenfzig Meter Wand standen so dort, wo nichts
    steht, und der Hof zwischen beiden kam 23 m breit heraus statt 39 m.

    Gefragt wird deshalb den Umriss selbst: an jeder Station wird von der
    Wandlinie nach aussen getastet, und es gilt das Gebaeude, das zuerst
    getroffen wird. Das ist dieselbe Absicht wie vorher -- am Gang zaehlt, was
    am dichtesten an der Fassadenlinie steht --, nur ohne den Umweg ueber eine
    Naeherung, die hier nicht traegt.
    """
    schritte = int((bis_m - von_m) / SCHRITT_M)
    tiefen = [t * TAST_SCHRITT_M for t in range(int(FRONT_M / TAST_SCHRITT_M) + 1)]
    out: list[Gebaeude | None] = []
    for index in range(schritte):
        s = von_m + (index + 0.5) * SCHRITT_M
        gefunden: Gebaeude | None = None
        for tiefe in tiefen:
            punkt = rahmen.ort(s, wand_q + nach_aussen * tiefe)
            for bau in liste:
                if punkt_in_polygon(punkt, bau.poly):
                    gefunden = bau
                    break
            if gefunden:
                break
        out.append(gefunden)
    return out


def abschnitte(belegung: list, von_m: float, bis_m: float) -> list[dict]:
    """Fasst gleiche Nachbarn der abgetasteten Belegung zusammen."""
    roh: list[dict] = []
    for index, bau in enumerate(belegung):
        von = von_m + index * SCHRITT_M
        bis = von + SCHRITT_M
        letzter = roh[-1] if roh else None
        kennung = bau.id if bau else None
        if letzter and letzter["_id"] == kennung:
            letzter["bis"] = bis
            continue
        roh.append({"_id": kennung, "_bau": bau, "von": von, "bis": bis})

    # Rauschen einsammeln: sehr kurze Abschnitte gehen im Nachbarn auf.
    gefiltert: list[dict] = []
    for teil in roh:
        if gefiltert and teil["bis"] - teil["von"] < MIN_ABSCHNITT_M:
            gefiltert[-1]["bis"] = teil["bis"]
            continue
        if gefiltert and gefiltert[-1]["_id"] == teil["_id"]:
            gefiltert[-1]["bis"] = teil["bis"]
            continue
        gefiltert.append(teil)

    out: list[dict] = []
    for teil in gefiltert:
        bau: Gebaeude | None = teil["_bau"]
        glas = bau is None or bau.id in GLASFASSADE
        out.append({
            "von": round(teil["von"], 2),
            "bis": round(teil["bis"], 2),
            "art": "glas" if glas else "wand",
            "was": bezeichnung(bau),
            "featureId": bau.id if bau else None,
            "hallKey": bau.hall_key if bau else None,
        })
    return out


def bezeichnung(bau: Gebaeude | None) -> str:
    if bau is None:
        return "Aussenflaeche"
    if bau.id in GLASFASSADE:
        return GLASFASSADE[bau.id]
    if bau.hall_key:
        return f"Halle {bau.hall_key}"
    return bau.name or f"Gebaeude {bau.id[-6:]}"


if __name__ == "__main__":
    raise SystemExit(main())
