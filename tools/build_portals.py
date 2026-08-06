#!/usr/bin/env python3
"""Exportiert vorhandene Graphübergänge als ungeprüfte semantische Portale."""
from __future__ import annotations

import json
from pathlib import Path

from build_hall_registrations import transform_point

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / "data/build"
OUTPUT = BUILD / "portals.json"

KINDS = {
    "portal": "controlled-passage",
    "stairs": "stairs",
    "escalator": "escalator",
    "elevator": "elevator",
    "vertical": "vertical-unknown",
}


def build_product(graph: dict, registrations: dict) -> dict:
    by_hall = {item["hallKey"]: item for item in registrations["registrations"]}
    portals = []
    for connector in graph["connectors"]:
        connects = connector.get("meta", {}).get("connects", [])
        if len(connects) != 2 or connects[0] not in by_hall:
            continue
        registration = by_hall[connects[0]]
        x, z = transform_point((connector["x"], connector["y"]),
                               registration["transform"])
        uncertainty = connector.get("meta", {}).get("uncertaintyM")
        portals.append({
            "id": connector["id"],
            "fromSurface": f"surface:hall:{connects[0]}",
            "toSurface": f"surface:hall:{connects[1]}",
            "position": [round(x, 3),
                         round(registration["floorZ"] + connector["z"], 3),
                         round(z, 3)],
            "kind": KINDS.get(connector["kind"], "unknown"),
            "physical": None,
            "eventStatus": "unknown",
            "accessible": None,
            "status": "draft",
            "registrationAnchor": False,
            "uncertaintyM": uncertainty,
            "snapM": connector.get("meta", {}).get("snapM"),
            "source": "legacy-routing-graph",
        })
    return {
        "schema": "beuteltier.portals.v1",
        "portals": portals,
        "policy": {
            "physicalNullMeansUnverified": True,
            "eventStatusIndependentFromPhysical": True,
            "registrationAnchorsAllowed": False,
        },
        "counts": {
            "total": len(portals),
            "verifiedPhysical": sum(item["physical"] is True for item in portals),
            "draft": sum(item["status"] == "draft" for item in portals),
        },
    }


def main() -> int:
    graph = json.loads((BUILD / "graph.json").read_text(encoding="utf-8"))
    registrations = json.loads(
        (BUILD / "hall-registrations.json").read_text(encoding="utf-8")
    )
    product = build_product(graph, registrations)
    OUTPUT.write_text(json.dumps(product, ensure_ascii=False, indent=2) + "\n",
                      encoding="utf-8")
    print(f"{product['counts']['total']} ungeprüfte Portale -> {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
