#!/usr/bin/env python3
"""Faehrt die gesamte Datenaufbereitung und berichtet, was dabei herauskam.

Reihenfolge zaehlt: das Gelaendemodell braucht die Schnappschuesse, der
Wegegraph das Gelaendemodell, das Register beides.

Aufruf:
    python3 tools/build_all.py
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = Path(__file__).resolve().parent

STEPS = ["build_site.py", "build_graph.py", "build_registry.py",
         "build_buildings.py", "build_accuracy_report.py"]

# Schritte, die eine Quelle brauchen, die nicht im Repository liegt. Fehlt sie,
# wird der Schritt uebersprungen statt den ganzen Bau abzubrechen -- die
# LoD2-Kacheln sind 43 MB und werden mit tools/fetch_lod2.py geholt.
OPTIONAL = {"build_buildings.py": ROOT / "data" / "raw" / "lod2"}

# Untergrenzen, die nach jedem Lauf gelten muessen. Sie sind nicht willkuerlich,
# sondern der Stand, der einmal erreicht war -- faellt etwas darunter, ist bei
# einer Quelle etwas kaputtgegangen.
EXPECTATIONS = {
    "halls": 17,
    "stands": 1000,
    "placementsWithGeometry": 900,
    "standsLinked": 1027,
    "portals": 19,
}

# Die reine Knotenzahl taugt nicht als Untergrenze: als die Hallenumrisse von
# der Bounding-Box auf die Huelle der Inhalte umgestellt wurden, fiel sie von
# 14.843 auf 12.139 -- weil begehbare Zellen ausserhalb der Gebaeude
# verschwanden. Das ist eine Verbesserung. Gezaehlt wird deshalb, was zaehlt:
# ob jeder Stand angebunden bleibt.


def main() -> int:
    for step in STEPS:
        needed = OPTIONAL.get(step)
        if needed is not None and not any(needed.glob("*.gml")):
            print(f"\n=== {step} " + "=" * (60 - len(step)))
            print(f"uebersprungen: {needed.relative_to(ROOT)} ist leer "
                  f"(tools/fetch_lod2.py holt die Kacheln)")
            continue
        print(f"\n=== {step} " + "=" * (60 - len(step)))
        result = subprocess.run([sys.executable, str(TOOLS / step)], cwd=ROOT)
        if result.returncode != 0:
            print(f"{step} fehlgeschlagen", file=sys.stderr)
            return result.returncode

    site = json.loads((ROOT / "data/build/site.json").read_text(encoding="utf-8"))
    graph = json.loads((ROOT / "data/build/graph.json").read_text(encoding="utf-8"))
    registry = json.loads((ROOT / "data/build/registry.json").read_text(encoding="utf-8"))

    actual = {
        "halls": len(site["halls"]),
        "stands": len(site["stands"]),
        "placementsWithGeometry": registry["coverage"]["withGeometry"],
        "standsLinked": len(graph["standLinks"]),
        "portals": sum(1 for c in graph["connectors"] if c["kind"] == "portal"),
    }

    # Die App liest ihre eigene Kopie unter public/. Sie hier mitzuschreiben
    # verhindert genau den Fehler, bei dem die Oberflaeche noch auf einem
    # aelteren Datenstand laeuft als die Aufbereitung.
    app_data = ROOT / "app" / "public" / "data"
    if app_data.parent.exists():
        app_data.mkdir(parents=True, exist_ok=True)
        for name in ("site.json", "graph.json", "registry.json"):
            shutil.copyfile(ROOT / "data" / "build" / name, app_data / name)
        print(f"\nDatenstand nach {app_data} kopiert")

    print("\n=== Bericht " + "=" * 56)
    estimated = [h for h in site["halls"] if h["placement"]["source"] == "geschaetzt"]
    exact = [h for h in site["halls"] if h["placement"]["source"] == "procrustes"]
    print(f"Hallenebenen           {actual['halls']:6d}  "
          f"({len(exact)} eingemessen, {len(estimated)} geschaetzt)")
    print(f"Standflaechen          {actual['stands']:6d}")
    print(f"Belegungen mit Lage    {actual['placementsWithGeometry']:6d} von "
          f"{registry['coverage']['placements']}")
    print(f"Graphknoten            {graph['counts']['nodes']:6d}")
    print(f"Staende am Netz        {actual['standsLinked']:6d}")
    print(f"Durchgaenge            {actual['portals']:6d}")

    deviations = [abs(h["area"]["deviationPct"]) for h in site["halls"]
                  if h["area"].get("deviationPct") is not None]
    if deviations:
        print(f"Flaechenabweichung     {sum(deviations) / len(deviations):6.1f} %  "
              f"(Mittel gegen die offiziellen Hallenflaechen)")
    derived = [h for h in site["halls"] if h["height"]["heightSource"] == "derived"]
    print(f"Bodenhoehen gerechnet  {len(derived):6d}  "
          f"(aus lichter Hoehe plus Deckenstaerke)")

    failed = {k: (v, actual[k]) for k, v in EXPECTATIONS.items() if actual[k] < v}
    if failed:
        print("\nUnter der Erwartung:", file=sys.stderr)
        for key, (want, got) in failed.items():
            print(f"  {key}: erwartet mindestens {want}, bekommen {got}", file=sys.stderr)
        return 1

    print("\nAlle Erwartungen erfuellt.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
