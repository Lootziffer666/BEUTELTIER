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
    for eintrag in registrations["registrations"]:
        nummer = eintrag["hallKey"].split(".")[0]
        for feature_id in eintrag["targetFeatureIds"]:
            je_halle.setdefault(nummer, [])
            if feature_id not in je_halle[nummer]:
                je_halle[nummer].append(feature_id)

    # Der Bestand, nach Funktionsschluessel.
    bestand: dict[str, list[dict]] = {}
    for tile in sorted(bb.LOD2_DIR.glob("*.gml")):
        for feature in lod2.read_features(tile, bb.BOUNDS):
            poly = feature.footprint()
            if len(poly) < 3:
                continue
            lokal = [bb.ins_gelaende(x, y, origin) for x, y in poly]
            flaeche = abs(lod2.ring_area(lokal))
            if flaeche < MIN_FLAECHE_SQM:
                continue
            bestand.setdefault(feature.function or "ohne", []).append(
                {"featureId": feature.id, "flaecheSqm": round(flaeche)})

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
                "quelle": "hall-registrations (official-footprint-containment)",
            })
        else:
            offen.append({
                "object": halle["object"],
                "grund": "keine Registrierung im Repo -- die Halle ist im "
                         "Datensatz nicht auf ein amtliches Gebaeude gefuehrt",
            })

    # Sonderbauten und AUX: der Funktionsschluessel allein reicht nicht.
    for eintrag in inventar["sonderbauten"]:
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
