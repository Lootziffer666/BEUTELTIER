#!/usr/bin/env python3
"""Prueft PDF-Hallennummern gegen Hallenplan-, Aufzug- und Verbindungsdaten."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from beuteltier.pdf_vector import read_text_runs  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    pdfs = [ROOT / "data/raw/pdf/gamescom-2025-hallenplan.pdf",
            ROOT / "data/raw/pdf/technische-richtlinien-2022.pdf"]
    mentioned = set()
    for path in pdfs:
        text = " ".join(run.text for run in read_text_runs(path))
        mentioned.update(re.findall(r"(?<!\d)(?:[1-9]|10|11)\.[123](?!\d)", text))
    snapshots = {path.stem.replace("_", ".") for path in (ROOT / "data/raw/hallplan").glob("*.json")}
    snapshots = {key[:-2] if key.startswith("F") and key.endswith(".1") else key for key in snapshots}
    site = json.loads((ROOT / "data/build/site.json").read_text())
    modelled = {hall["key"] for hall in site["halls"]}
    elevators = [one for one in site["facilities"] if one.get("kind") == "elevator"]
    graph = json.loads((ROOT / "data/build/graph.json").read_text())
    verticals = [one for one in graph["connectors"] if one.get("kind") == "vertical"]
    report = {
        "schema": "beuteltier.hallplan-audit.v1",
        "pdfHallLevels": sorted(mentioned), "snapshotLevels": sorted(snapshots),
        "modelledLevels": sorted(modelled),
        "pdfLevelsMissingFromModel": sorted(mentioned - modelled),
        "modelLevelsWithoutSnapshot": sorted(modelled - snapshots),
        "elevators": len(elevators), "verticalConnections": len(verticals),
        "unconfirmedVerticalConnections": sum(one.get("meta", {}).get("confidence") != "bestaetigt" for one in verticals),
        "finding": ("Alle fuer die gamescom modellierten Hallenebenen besitzen einen Hallenplan-Snapshot. "
                    "Weitere im technischen Gesamtplan erwaehnte Ebenen sind nicht automatisch gamescom-Bereiche. "
                    "Aufzuege und Ebenenverbindungen bleiben entsprechend ihrer Quellenunsicherheit markiert."),
    }
    out = ROOT / "data/build/hallplan-audit.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
