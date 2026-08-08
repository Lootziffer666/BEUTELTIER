#!/usr/bin/env python3
"""Ordnet die dz.nrw-Inventur dem vorhandenen LoD2-Bestand zu.

Der Nutzer hat aus dz.nrw eine Feature-Inventur geliefert: welche Baukoerper
es am Messegelaende gibt, mit Funktionsschluessel und der ausdruecklichen
Regel, gleich klassifizierte Objekte **nicht** zusammenzulegen.

Hier wird nur zugeordnet, nicht gemessen und nicht recherchiert. Zwei
Schluessel gibt es dafuer im Repo:

* `hall-registrations.json` -- welches amtliche Gebaeude welche Halle ist,
  ueber die Lage der Messestaende belegt.
* der Funktionsschluessel im CityGML selbst (`bldg:function`), derselbe Code,
  den dz.nrw als `Fktkurz` anzeigt.

Was sich damit nicht aufloesen laesst, wird als `unresolved` ausgewiesen und
nicht geraten -- so steht es im Auftrag.

Aufruf:
    python3 tools/build_feature_zuordnung.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier import lod2  # noqa: E402
import build_boulevard as bb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INVENTAR = ROOT / "data" / "raw" / "dznrw" / "feature-inventar.json"
OUT = ROOT / "data" / "build" / "feature-zuordnung.json"

# Kleinstes Feature, das ueberhaupt betrachtet wird.
MIN_FLAECHE_SQM = 100.0


def main() -> int:
    inventar = json.loads(INVENTAR.read_text(encoding="utf-8"))
    registrations = json.loads(bb.REGISTRATIONS.read_text(encoding="utf-8"))
    origin = (registrations["origin"][0], registrations["origin"][1])

    # Halle -> amtliche Gebaeude. Eine Halle kann aus mehreren bestehen.
    je_halle: dict[str, list[str]] = {}
    # Welche Ebenen auf einem Gebaeude liegen. Halle 5 teilt sich in zwei
    # Baukoerper, und **beide** tragen beide Ebenen -- die Teilung verlaeuft
    # senkrecht durch das Haus, nicht waagerecht zwischen den Geschossen.
    ebenen: dict[str, list[str]] = {}
    for eintrag in registrations["registrations"]:
        nummer = eintrag["hallKey"].split(".")[0]
        for feature_id in eintrag["targetFeatureIds"]:
            je_halle.setdefault(nummer, [])
            if feature_id not in je_halle[nummer]:
                je_halle[nummer].append(feature_id)
            ebenen.setdefault(feature_id, [])
            if eintrag["hallKey"] not in ebenen[feature_id]:
                ebenen[feature_id].append(eintrag["hallKey"])

    # Der Bestand, nach Funktionsschluessel.
    #
    # Der Schluessel steht am **Building**, nicht am BuildingPart. Wer nur die
    # Parts zaehlt, findet das Parkhaus nicht: es ist ein Teil eines groesseren
    # Hauses und traegt selbst keine Funktion. Also erst die Funktionen der
    # Eltern sammeln, dann vererben.
    funktion: dict[str, str] = {}
    teile: list[tuple] = []
    for tile in sorted(bb.LOD2_DIR.glob("*.gml")):
        for feature in lod2.read_features(tile, bb.BOUNDS):
            if feature.function:
                funktion[feature.id] = feature.function
            poly = feature.footprint()
            if len(poly) < 3:
                continue
            lokal = [bb.ins_gelaende(x, y, origin) for x, y in poly]
            flaeche = abs(lod2.ring_area(lokal))
            if flaeche < MIN_FLAECHE_SQM:
                continue
            teile.append((feature.id, feature.function, feature.parent_id, flaeche))

    bestand: dict[str, list[dict]] = {}
    for feature_id, eigene, eltern, flaeche in teile:
        code = eigene or funktion.get(eltern or "", None) or "ohne"
        bestand.setdefault(code, []).append(
            {"featureId": feature_id, "flaecheSqm": round(flaeche),
             "geerbtVon": None if eigene else eltern})

    zuordnung: list[dict] = []
    offen: list[dict] = []

    # Hallen: ueber die Registrierungen belegt.
    for halle in inventar["hallen"]:
        name = halle.get("name")
        treffer = je_halle.get(name or "", [])
        # Halle 5 steht mit zwei Features in der Inventur und mit zwei im
        # Bestand -- A bekommt das erste, B das zweite, getrennt gefuehrt.
        if halle["object"].endswith("_A"):
            treffer = treffer[:1]
        elif halle["object"].endswith("_B"):
            treffer = treffer[1:2]
        if treffer:
            zuordnung.append({
                "object": halle["object"],
                "featureIds": treffer,
                "ebenen": sorted({e for fid in treffer for e in ebenen.get(fid, [])}),
                "quelle": "hall-registrations (official-footprint-containment)",
            })
        else:
            # Registriert wird ueber die Lage der Messestaende. Wo keine
            # stehen, gibt es nichts zu registrieren -- bei Halle 1 und
            # Halle 11 ist das der Fall und damit erwartet, kein Datenfehler.
            offen.append({
                "object": halle["object"],
                "grund": "keine Standregistrierung im Repo",
                "erwartet": bool(halle.get("nutzung")),
                "nutzung": halle.get("nutzung"),
            })

    # Was der Nutzer selbst gezeigt hat: drei Baukoerper oestlich des
    # Boulevards, in dz.nrw als A, B und C markiert. Die Zuordnung kommt damit
    # aus der Anschauung und nicht aus der Funktionsklasse -- deshalb steht sie
    # hier namentlich und nicht als Regel.
    GEZEIGT = {
        "Ost_A": ("UUID_e3204ca6-6d8e-4d46-a631-80808442a1de",
                  "schmaler Riegel an der Ostwand, Station 100-149"),
        "Parkhaus_A": ("UUID_50088905-9994-4e77-89ea-02a587cee29a",
                       "Parkhaus oestlich dahinter, Station 103-145"),
        "Ost_C": ("DENW37AL1000668A",
                  "breiter Koerper suedlich Halle 8, Station 12-71"),
    }

    # Sonderbauten und AUX: der Funktionsschluessel allein reicht nicht.
    for eintrag in inventar["sonderbauten"]:
        gezeigt = GEZEIGT.get(eintrag["object"])
        if gezeigt:
            feature_id, lage = gezeigt
            zuordnung.append({
                "object": eintrag["object"],
                "featureIds": [feature_id],
                "lage": lage,
                "quelle": "Nutzerangabe (dz.nrw Feature Info)",
            })
            continue
        code = inventar["klassen"][eintrag["klasse"]]["fktkurz"]
        kandidaten = bestand.get(code, [])
        offen.append({
            "object": eintrag["object"],
            "grund": f"{len(kandidaten)} Features mit {code} im Bestand; "
                     "die Inventur nennt keinen Schluessel, der eines davon "
                     "eindeutig benennt",
            "kandidaten": len(kandidaten),
        })

    for eintrag in inventar["aux"]:
        offen.append({
            "object": eintrag["id"],
            "grund": "source_ref ist eine dz.nrw-Objektnummer; das LoD2 fuehrt "
                     "GML-IDs. Kein gemeinsamer Schluessel im Repo.",
            "sourceRef": eintrag.get("source_ref"),
        })

    ergebnis = {
        "schema": "beuteltier.feature-zuordnung.v1",
        "inventar": str(INVENTAR.relative_to(ROOT)),
        "regeln": inventar["regeln"],
        "zugeordnet": zuordnung,
        "unresolved": offen,
        "bestandNachFunktion": {
            code: len(liste) for code, liste in sorted(bestand.items())
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(ergebnis, ensure_ascii=False, indent=1) + "\n",
                   encoding="utf-8")

    print(f"zugeordnet: {len(zuordnung)}    unresolved: {len(offen)}")
    for eintrag in zuordnung:
        print(f"  {eintrag['object']:14s} {eintrag['featureIds']}")
    print("  --")
    for eintrag in offen:
        print(f"  {eintrag['object']:14s} {eintrag['grund'][:70]}")
    print(f"-> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
