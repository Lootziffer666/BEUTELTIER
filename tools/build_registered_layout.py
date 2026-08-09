#!/usr/bin/env python3
"""Transformiert alle hallenabhaengigen Inhalte gemeinsam in die amtliche Szene.

Das Produkt ersetzt noch nicht den Legacy-Laufzeitgraphen. Es ist die
maschinenlesbare, messbare Uebergabeschicht fuer Staende, WalkGrid, Anlagen,
Labels und Portal-Endpunkte; kein Portal wird dabei als Registrierungsanker
verwendet.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_hall_registrations import ROOT, transform_point  # noqa: E402

SITE = ROOT / "data/build/site.json"
GRAPH = ROOT / "data/build/graph.json"
REGISTRATIONS = ROOT / "data/build/hall-registrations.json"
OUTPUT = ROOT / "data/build/registered-layout.json"
GRAPH_OUTPUT = ROOT / "data/build/registered-graph.json"
SITE_OUTPUT = ROOT / "data/build/registered-site.json"


def rounded(point) -> list[float]:
    return [round(point[0], 3), round(point[1], 3)]


STAND_SCHRUMPF = 0.97
"""Wie gross ein Stand gezeichnet wird, im Verhaeltnis zu seinem Planmass.

Drei Prozent, um die eigene Mitte. Eine bewusste Abweichung von den Daten und
deshalb hier benannt statt stillschweigend eingebaut.

Warum ueberhaupt: BEUTELTIER ist ein Orientierungswerkzeug. Aneinander
stossende Standflaechen lassen den Gang dazwischen verschwinden -- und der Gang
ist genau das, was man beim Laufen sucht. Drei Prozent oeffnen bei einem Stand
von 10 m eine Fuge von 15 cm je Seite, bei 30 m eine von 45 cm. Sichtbar genug,
um den Gang zu lesen, klein genug, um keine Strecke zu verfaelschen.

Was es **nicht** ist: ein Ersatz fuer eine Passung. Geschrumpft wird um die
eigene Mitte, jeder Stand bleibt an seinem Platz und keiner faellt weg. Eine
Halle, die nicht in ihr Gebaeude passt, passt danach immer noch nicht -- das
meldet der Befund in `hall-registrations.json`, und dort gehoert es hin.
"""


def geschrumpft(polygon: list[list[float]], faktor: float = STAND_SCHRUMPF) -> list[list[float]]:
    """Verkleinert ein Polygon um seine eigene Mitte.

    Um die eigene Mitte und nicht um einen gemeinsamen Punkt: sonst wandern
    die Staende zusaetzlich, und aus einer Darstellungsentscheidung wuerde
    eine Ortsveraenderung.
    """
    mx = sum(p[0] for p in polygon) / len(polygon)
    my = sum(p[1] for p in polygon) / len(polygon)
    return [[mx + (p[0] - mx) * faktor, my + (p[1] - my) * faktor] for p in polygon]


def build() -> dict:
    site = json.loads(SITE.read_text())
    graph = json.loads(GRAPH.read_text())
    registration_product = json.loads(REGISTRATIONS.read_text())
    registrations = {item["hallKey"]: item for item in registration_product["registrations"]}
    grids = {grid["key"]: grid for grid in graph["grids"]}

    halls = []
    for hall in site["halls"]:
        key = hall["key"]
        registration = registrations[key]
        transform = registration["transform"]
        hall_stands = [stand for stand in site["stands"] if stand["hallKey"] == key]
        facilities = [facility for facility in site["facilities"] if facility["hallKey"] == key]
        grid = grids.get(key)
        transformed_grid = None
        if grid:
            origin = transform_point(tuple(grid["origin"]), transform)
            x_step = transform_point((grid["origin"][0] + graph["gridM"], grid["origin"][1]), transform)
            y_step = transform_point((grid["origin"][0], grid["origin"][1] + graph["gridM"]), transform)
            transformed_grid = {
                "origin": rounded(origin),
                "cellBasisX": rounded((x_step[0] - origin[0], x_step[1] - origin[1])),
                "cellBasisY": rounded((y_step[0] - origin[0], y_step[1] - origin[1])),
                "cols": grid["cols"], "rows": grid["rows"],
                "walkable": grid["walkable"], "floorZ": registration["floorZ"],
            }
        halls.append({
            "hallKey": key,
            "status": registration["status"],
            "targetFeatureIds": registration["targetFeatureIds"],
            "floorZ": registration["floorZ"],
            "footprint": [rounded(transform_point(tuple(point), transform))
                          for point in hall["footprint"]],
            "label": rounded(transform_point((
                sum(p[0] for p in hall["footprint"]) / len(hall["footprint"]),
                sum(p[1] for p in hall["footprint"]) / len(hall["footprint"]),
            ), transform)),
            "stands": [{
                "id": stand["id"],
                "polygon": [rounded(transform_point(tuple(point), transform))
                            for point in geschrumpft(stand["polygon"])],
            } for stand in hall_stands],
            "walkGrid": transformed_grid,
            "facilities": [{
                "id": facility["id"], "kind": facility["kind"],
                "position": rounded(transform_point(tuple(facility["position"]), transform)),
            } for facility in facilities],
        })

    portal_ends = []
    for connector in graph["connectors"]:
        ends = []
        for end in connector["ends"]:
            hall_key = end["hallKey"]
            grid = grids[hall_key]
            ix, iy = end["cell"]
            point = (grid["origin"][0] + (ix + 0.5) * graph["gridM"],
                     grid["origin"][1] + (iy + 0.5) * graph["gridM"])
            ends.append({"hallKey": hall_key,
                         "position": rounded(transform_point(point, registrations[hall_key]["transform"])),
                         "floorZ": registrations[hall_key]["floorZ"]})
        portal_ends.append({"id": connector["id"], "kind": connector["kind"], "ends": ends,
                            "usedAsRegistrationAnchor": False})

    product = {
        "schema": "beuteltier.registered-layout.v1",
        "coordinatePlane": "sceneX/sceneZ",
        "origin": registration_product["origin"],
        # Benannte Abweichung von den Plandaten, damit sie niemand fuer eine
        # Messung haelt: die Staende sind gezeichnet, nicht vermessen.
        "standSchrumpf": {
            "faktor": STAND_SCHRUMPF,
            "bezug": "eigene Mitte je Stand",
            "grund": ("Fuge zwischen benachbarten Staenden, damit der Gang "
                      "dazwischen sichtbar bleibt"),
            "gemessen": False,
        },
        "halls": halls,
        "portalEnds": portal_ends,
        "counts": {
            "halls": len(halls), "stands": sum(len(hall["stands"]) for hall in halls),
            "walkGrids": sum(hall["walkGrid"] is not None for hall in halls),
            "facilities": sum(len(hall["facilities"]) for hall in halls),
            "portalEnds": sum(len(portal["ends"]) for portal in portal_ends),
        },
        "policy": {"portalsAreRegistrationAnchors": False,
                   "relativeHallContentScale": 1.0},
    }
    OUTPUT.write_text(json.dumps(product, indent=2) + "\n")
    registered_grids = []
    for hall in halls:
        source = grids[hall["hallKey"]]
        target = hall["walkGrid"]
        registered_grids.append({
            "key": hall["hallKey"], "origin": target["origin"],
            "cellBasisX": target["cellBasisX"], "cellBasisY": target["cellBasisY"],
            "z": target["floorZ"], "level": source["level"],
            "cols": target["cols"], "rows": target["rows"], "walkable": target["walkable"],
        })
    registered_connectors = []
    portal_by_id = {portal["id"]: portal for portal in portal_ends}
    for connector in graph["connectors"]:
        transformed = portal_by_id[connector["id"]]["ends"]
        registered_connectors.append({
            **connector,
            "x": round(sum(end["position"][0] for end in transformed) / len(transformed), 3),
            "y": round(sum(end["position"][1] for end in transformed) / len(transformed), 3),
            "z": round(sum(end["floorZ"] for end in transformed) / len(transformed), 3),
        })
    registered_graph = {
        **graph, "schema": "beuteltier.registered-graph.v1",
        "grids": registered_grids, "connectors": registered_connectors,
        "coordinatePlane": "sceneX/sceneZ", "origin": registration_product["origin"],
    }
    GRAPH_OUTPUT.write_text(json.dumps(registered_graph, indent=2) + "\n")
    hall_by_key = {hall["hallKey"]: hall for hall in halls}
    registered_site = {**site, "schema": "beuteltier.registered-site.v1"}
    registered_site["halls"] = [{
        **hall,
        "footprint": hall_by_key[hall["key"]]["footprint"],
        "blocks": [[rounded(transform_point(tuple(point), registrations[hall["key"]]["transform"]))
                    for point in block] for block in hall["blocks"]],
        "baseY": registrations[hall["key"]]["floorZ"],
    } for hall in site["halls"]]
    registered_site["stands"] = [{
        **stand,
        "polygon": next(item["polygon"] for item in hall_by_key[stand["hallKey"]]["stands"]
                        if item["id"] == stand["id"]),
        "baseY": registrations[stand["hallKey"]]["floorZ"],
    } for stand in site["stands"]]
    facility_positions = {item["id"]: item["position"] for hall in halls
                          for item in hall["facilities"]}
    registered_site["facilities"] = [{**facility, "position": facility_positions.get(facility["id"], facility["position"])}
                                     for facility in site["facilities"]]
    registered_site["connectors"] = []
    registered_site["registration"] = {
        "status": "constrained", "connectorsOmitted": len(site["connectors"]),
        "reason": "Verbindungsumrisse besitzen noch keine eindeutige Hallenzuordnung.",
    }
    SITE_OUTPUT.write_text(json.dumps(registered_site, indent=2) + "\n")
    return product


def main() -> int:
    product = build()
    print(f"{product['counts']} -> {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
