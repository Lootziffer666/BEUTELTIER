#!/usr/bin/env python3
"""Faehrt die gesamte Datenaufbereitung und berichtet, was dabei herauskam.

Reihenfolge zaehlt: das Gelaendemodell braucht die Schnappschuesse, der
Wegegraph das Gelaendemodell, das Register beides.

Aufruf:
    python3 tools/build_all.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = Path(__file__).resolve().parent

STEPS = ["build_site.py", "build_graph.py", "build_registry.py"]

# Untergrenzen, die nach jedem Lauf gelten muessen. Sie sind nicht willkuerlich,
# sondern der Stand, der einmal erreicht war -- faellt etwas darunter, ist bei
# einer Quelle etwas kaputtgegangen.
EXPECTATIONS = {
    "halls": 17,
    "stands": 1000,
    "placementsWithGeometry": 1340,
    "graphNodes": 14000,
    "portals": 19,
}


def main() -> int:
    for step in STEPS:
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
        "graphNodes": len(graph["nodes"]),
        "portals": sum(1 for n in graph["nodes"] if n["kind"] == "portal"),
    }

    print("\n=== Bericht " + "=" * 56)
    estimated = [h for h in site["halls"] if h["placement"]["source"] == "geschaetzt"]
    exact = [h for h in site["halls"] if h["placement"]["source"] == "procrustes"]
    print(f"Hallenebenen           {actual['halls']:6d}  "
          f"({len(exact)} eingemessen, {len(estimated)} geschaetzt)")
    print(f"Standflaechen          {actual['stands']:6d}")
    print(f"Belegungen mit Lage    {actual['placementsWithGeometry']:6d} von "
          f"{registry['coverage']['placements']}")
    print(f"Graphknoten            {actual['graphNodes']:6d}")
    print(f"Durchgaenge            {actual['portals']:6d}")

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
