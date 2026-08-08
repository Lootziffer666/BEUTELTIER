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
# Kuerzere Abschnitte als dieser Wert sind Digitalisierungsrauschen.
MIN_ABSCHNITT_M = 2.0
# Wie weit eine Halle seitlich vom Gang stehen darf und trotzdem noch als
# sein Ziel gilt -- fuer die Beschriftung der Wegweiser.
ENDE_ABSTAND_M = 40.0

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

    # Welche Gebaeude begrenzen den Gang?
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
        kandidaten[seite].append((max(0.0, von), min(LAENGE_M, bis), abstand, bau))

    seiten = {}
    for seite, liste in kandidaten.items():
        seiten[seite] = abschnitte(liste, 0.0, LAENGE_M)

    sued = suedteil(gebaeude, ziel, station, laengs, quer, achse_q, registrations)

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
        "piazza": {
            "hoeheM": round(20 * 0.1656, 2),
            "stufen": 20,
            "herkunft": "gezaehlt (Halle 11 -> Piazza), Halle 11 ebenerdig wie 10.1",
        },
        "seiten": seiten,
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
             laengs, quer, achse_q: float, registrations: dict) -> dict | None:
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
        kandidaten[seite].append((max(von, a), min(bis, b), abstand, bau))

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
            seite: abschnitte(liste, von, bis) for seite, liste in kandidaten.items()
        },
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


def abschnitte(liste: list, von_m: float, bis_m: float) -> list[dict]:
    """Tastet die Achse ab und fasst gleiche Nachbarn zusammen.

    Abgetastet statt sortiert, weil sich Gebaeude ueberlappen: am Gang zaehlt,
    welches am dichtesten an der Fassadenlinie steht, und das laesst sich
    Schritt fuer Schritt entscheiden, ohne Sonderfaelle fuer jede Art von
    Ueberschneidung.
    """
    schritte = int((bis_m - von_m) / SCHRITT_M)
    belegung: list[Gebaeude | None] = []
    for index in range(schritte):
        s = von_m + (index + 0.5) * SCHRITT_M
        treffer = [(abstand, bau) for von, bis, abstand, bau in liste if von <= s <= bis]
        treffer.sort(key=lambda t: t[0])
        belegung.append(treffer[0][1] if treffer else None)

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
