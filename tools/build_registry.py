#!/usr/bin/env python3
"""Verheiratet Aussteller mit Standgeometrie.

Ein Aussteller ist kein Ort. Derselbe Aussteller kann mehrere Consumer- und
Business-Staende haben, und ein Gemeinschaftsstand traegt viele Aussteller --
das PRD haelt das unter 5.3 als Viele-zu-viele-Beziehung fest, und genau so
wird es hier abgebildet:

    Aussteller <- Belegung -> Standflaeche

Die Indie Arena Booth bekommt eine Sonderbehandlung. Sie ist raeumlich ein
Block in Halle 10.2, nicht hundert einzelne Routingziele (PRD 5.7). Alle dort
gezeigten Studios bleiben suchbar, fuehren aber zunaechst auf den Block.

Aufruf:
    python3 tools/build_registry.py
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier import exhibitors as ex  # noqa: E402
from beuteltier import hallplan  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "raw" / "gamescom-2026-aussteller.json"
SITE = ROOT / "data" / "build" / "site.json"
OUT = ROOT / "data" / "build" / "registry.json"

CURATED = ROOT / "data" / "curated" / "compounds.json"


def main() -> int:
    if not SITE.exists():
        print("data/build/site.json fehlt -- erst tools/build_site.py laufen lassen",
              file=sys.stderr)
        return 1

    site = json.loads(SITE.read_text(encoding="utf-8"))
    stand_by_id = {stand["id"]: stand for stand in site["stands"]}

    levels = hallplan.load_levels()
    index = hallplan.build_index(levels)
    key_by_hall_code: dict[tuple[str, str], str] = {}
    for level in levels:
        for stand in level.stands:
            for code in stand.codes:
                key_by_hall_code.setdefault((level.key, code), f"{level.key}:{stand.code}")

    people, meta = ex.load(SOURCE)

    exhibitors_out = []
    occupancy: dict[str, list[str]] = defaultdict(list)
    unmatched: list[dict] = []

    for exhibitor in people:
        placements = []
        for placement in exhibitor.placements:
            hall = placement.outdoor_key or placement.hall
            stand = hallplan.resolve(index, hall, placement.stand)

            stand_id = None
            if stand is not None:
                # resolve() findet den Stand; welcher Hallenschluessel dahinter
                # steckt, muss ueber den Index zurueckgeholt werden.
                for candidate in (hall, f"{hall}.1", f"{hall}.2", f"{hall}.3"):
                    key = key_by_hall_code.get((candidate, placement.stand))
                    if key and key in stand_by_id:
                        stand_id = key
                        break

            if stand_id is None:
                unmatched.append({"exhibitor": exhibitor.name, "hall": placement.hall,
                                  "stand": placement.stand, "raw": placement.raw})

            placements.append({
                "hall": placement.hall,
                "stand": placement.stand,
                "standId": stand_id,
                "outdoor": bool(placement.outdoor_key),
                **({"derivedFrom": placement.derived_from} if placement.derived_from else {}),
            })

        # Dieselbe Flaeche wird oft unter zwei Codes gefuehrt: die
        # Ausstellersuche nennt "D050 F051", der Hallenplan kennt beide als eine
        # Standflaeche. Ohne Zusammenfassen saehe jeder solche Aussteller aus,
        # als stuende er an zwei Orten -- und der Beutezug liefe ihn zweimal an.
        merged: list[dict] = []
        by_stand: dict[str, dict] = {}
        for placement in placements:
            stand_id = placement["standId"]
            if stand_id is None:
                merged.append(placement)
                continue
            existing = by_stand.get(stand_id)
            if existing is None:
                placement["codes"] = [placement["stand"]]
                by_stand[stand_id] = placement
                merged.append(placement)
            elif placement["stand"] not in existing["codes"]:
                existing["codes"].append(placement["stand"])
        placements = merged

        for placement in placements:
            if placement["standId"]:
                occupancy[placement["standId"]].append(exhibitor.id)

        exhibitors_out.append({
            "id": exhibitor.id,
            "name": exhibitor.name,
            "country": exhibitor.country,
            "url": exhibitor.detail_url,
            "placements": placements,
        })

    # --- Compound-Staende ----------------------------------------------------
    # Welche Flaechen zu einem Compound gehoeren, steht in keiner Quelle und wird
    # deshalb kuratiert gepflegt. Solange die Flaechen unbestaetigt sind, ist das
    # Ziel die Halle -- ein grobes, aber ehrliches Ziel.
    compounds = []
    if CURATED.exists():
        for entry in json.loads(CURATED.read_text(encoding="utf-8"))["compounds"]:
            stand_ids = [f"{entry['hallKey']}:{code}" for code in entry.get("standCodes", [])]
            stand_ids = [sid for sid in stand_ids if sid in stand_by_id]
            members = sorted({
                exhibitor["id"] for exhibitor in exhibitors_out
                for placement in exhibitor["placements"]
                if placement["standId"] in stand_ids
            })
            compounds.append({**entry, "standIds": stand_ids, "memberIds": members})

    with_geometry = sum(1 for e in exhibitors_out for p in e["placements"] if p["standId"])
    total = sum(len(e["placements"]) for e in exhibitors_out)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "schema": "beuteltier.registry.v1",
        "year": meta.get("year"),
        "collectedAt": meta.get("collectedAt"),
        "source": meta.get("source", {}),
        "coverage": {"placements": total, "withGeometry": with_geometry,
                     "withoutGeometry": len(unmatched)},
        "exhibitors": exhibitors_out,
        "occupancy": {stand_id: ids for stand_id, ids in sorted(occupancy.items())},
        "compounds": compounds,
        "unmatched": unmatched,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"{len(exhibitors_out)} Aussteller, {total} Belegungen, "
          f"{with_geometry} mit Geometrie ({100 * with_geometry / total:.2f} %)")
    print(f"{len(occupancy)} belegte Standflaechen")
    for compound in compounds:
        state = "bestaetigt" if compound.get("confirmed") else "unbestaetigt"
        print(f"Compound {compound['name']}: {len(compound['standIds'])} Flaechen, "
              f"{len(compound['memberIds'])} Aussteller ({state}, Ziel Halle "
              f"{compound['hallKey']})")
    for miss in unmatched:
        print(f"  ohne Geometrie: {miss['exhibitor']} -- Halle {miss['hall']} {miss['stand']}")
    print(f"-> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
