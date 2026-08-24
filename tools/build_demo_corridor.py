#!/usr/bin/env python3
"""Baut den einen Gamescom-Demokorridor in den bestehenden RouteGraph.

Der Aussenabschnitt wird nicht gezeichnet, sondern per Dijkstra aus dem
eingecheckten OSM-Snapshot gelesen. Innerhalb des Gelaendes wird nur an die
bereits vorhandene Piazza-Achse und die vorhandene, unbestaetigte Passage
5-10 angeschlossen. Fehlt eine Quelle oder ein Ziel, bricht der Bau ab.
"""
from __future__ import annotations

import heapq
import json
import math
import shutil
from pathlib import Path

from build_surroundings import utm32

ROOT = Path(__file__).resolve().parent.parent
RECIPE = ROOT / "data/curated/wednesday-corridor.json"
REGISTERED_GRAPH = ROOT / "data/build/registered-graph.json"
REGISTERED_SITE = ROOT / "data/build/registered-site.json"
OUTPUT = ROOT / "data/build/demo-corridor.json"
PUBLIC_DATA = ROOT / "app/public/data"


def distance(a: dict, b: dict) -> float:
    mean_lat = math.radians((a["lat"] + b["lat"]) / 2)
    dx = (a["lon"] - b["lon"]) * 111_320 * math.cos(mean_lat)
    dy = (a["lat"] - b["lat"]) * 111_320
    return math.hypot(dx, dy)


def merged_nodes(elements: list[dict]) -> dict[int, dict]:
    """Overpass darf denselben Knoten als Tag-Treffer und Wayskelett liefern."""
    nodes: dict[int, dict] = {}
    for element in elements:
        if element.get("type") != "node" or "lat" not in element:
            continue
        current = nodes.setdefault(element["id"], dict(element))
        if element.get("tags"):
            current.setdefault("tags", {}).update(element["tags"])
    return nodes


def osm_path(raw: dict, recipe: dict) -> tuple[list[int], list[dict], float]:
    nodes = merged_nodes(raw["elements"])
    start = recipe["startNodeId"]
    goal = recipe["southEntranceNodeId"]
    if start not in nodes or goal not in nodes:
        raise ValueError(f"OSM-Anker fehlt: start={start in nodes}, goal={goal in nodes}")

    start_tags = nodes[start].get("tags", {})
    goal_tags = nodes[goal].get("tags", {})
    if start_tags.get("railway") != "train_station_entrance" or start_tags.get("ref") != "Ottoplatz":
        raise ValueError("Startknoten ist nicht der belegte Bahnhofsausgang Ottoplatz")
    if goal_tags.get("name") != "Eingang Süd":
        raise ValueError("Zielknoten ist nicht der benannte Eingang Süd")

    allowed = set(recipe["walkableHighways"])
    adjacency: dict[int, list[tuple[int, float, dict]]] = {}
    for element in raw["elements"]:
        if element.get("type") != "way":
            continue
        tags = element.get("tags", {})
        highway = tags.get("highway")
        if highway not in allowed or tags.get("foot") == "no" or tags.get("access") == "private":
            continue
        sequence = [node_id for node_id in element.get("nodes", []) if node_id in nodes]
        for first, second in zip(sequence, sequence[1:]):
            weight = distance(nodes[first], nodes[second])
            adjacency.setdefault(first, []).append((second, weight, element))
            adjacency.setdefault(second, []).append((first, weight, element))

    queue = [(0.0, start)]
    best = {start: 0.0}
    previous: dict[int, tuple[int, dict]] = {}
    while queue:
        cost, current = heapq.heappop(queue)
        if cost != best[current]:
            continue
        if current == goal:
            break
        for other, weight, way in adjacency.get(current, []):
            candidate = cost + weight
            if candidate < best.get(other, math.inf):
                best[other] = candidate
                previous[other] = (current, way)
                heapq.heappush(queue, (candidate, other))

    if goal not in best:
        raise ValueError("Kein Fussweg im OSM-Snapshot zwischen Bahnhof und Eingang Sued")

    path = [goal]
    ways = []
    cursor = goal
    while cursor != start:
        before, way = previous[cursor]
        ways.append(way)
        path.append(before)
        cursor = before
    path.reverse()
    ways.reverse()
    return path, ways, best[goal]


def scene_point(node: dict, origin: list[float]) -> tuple[float, float]:
    world_x, world_y = utm32(node["lat"], node["lon"])
    return world_x - origin[0], -(world_y - origin[1])


def connector(node_id: str, label: str, x: float, y: float, end: str,
              state: str, meta: dict, z: float = 0.0) -> dict:
    return {
        "id": node_id,
        "kind": "outdoor",
        "label": label,
        "x": round(x, 3),
        "y": round(y, 3),
        "z": round(z, 3),
        "level": 1,
        "meta": meta,
        "ends": [{"nodeId": end}],
        "state": state,
    }


def build() -> dict:
    recipe = json.loads(RECIPE.read_text(encoding="utf-8"))
    graph = json.loads(REGISTERED_GRAPH.read_text(encoding="utf-8"))
    site = json.loads(REGISTERED_SITE.read_text(encoding="utf-8"))
    raw_path = ROOT / recipe["osm"]["snapshot"]
    source_path = ROOT / recipe["osm"]["sourceMetadata"]
    boulevard_path = ROOT / recipe["venue"]["boulevard"]
    for path in (raw_path, source_path, boulevard_path):
        if not path.exists():
            raise FileNotFoundError(path)

    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    source = json.loads(source_path.read_text(encoding="utf-8"))
    boulevard = json.loads(boulevard_path.read_text(encoding="utf-8"))
    osm_nodes = merged_nodes(raw["elements"])
    path, ways, outdoor_m = osm_path(raw, recipe["osm"])

    # Der Laufzeitgraph wird bei jedem Bau frisch angereichert. So ist ein
    # zweiter Lauf idempotent und bewahrt keine alte Route.
    previous_demo = [
        item for item in graph["connectors"] if item["id"].startswith("demo:")
    ]
    graph["connectors"] = [
        item for item in graph["connectors"] if not item["id"].startswith("demo:")
    ]
    connector_ids = {item["id"] for item in graph["connectors"]}
    target_connector = recipe["venue"]["targetConnectorId"]
    if target_connector not in connector_ids:
        raise ValueError(f"Zielpassage fehlt im registrierten Graph: {target_connector}")

    target = next(item for item in graph["connectors"] if item["id"] == target_connector)
    hall_key = recipe["venue"]["targetHallKey"]
    hall_end = next((end for end in target["ends"] if end.get("hallKey") == hall_key), None)
    if not hall_end:
        raise ValueError(f"Zielpassage hat keinen Anschluss an {hall_key}")
    goal_node_id = f"a:{hall_key}:{hall_end['cell'][0]}:{hall_end['cell'][1]}"

    axis = boulevard["achse"]
    piazza_station = boulevard["knoten"]["piazzaVonM"]
    piazza_x = axis["x0"] + axis["laengs"][0] * piazza_station
    piazza_y = axis["y0"] + axis["laengs"][1] * piazza_station
    piazza_z = boulevard["knoten"]["piazzaHoeheM"]
    piazza_id = "demo:piazza"

    added = []
    for index, osm_node_id in enumerate(path):
        current = osm_nodes[osm_node_id]
        x, y = scene_point(current, graph["origin"])
        current_id = f"demo:osm:{osm_node_id}"
        next_id = (f"demo:osm:{path[index + 1]}" if index + 1 < len(path) else piazza_id)
        is_start = index == 0
        is_south = index == len(path) - 1
        label = (recipe["osm"]["startLabel"] if is_start else
                 recipe["osm"]["southEntranceLabel"] if is_south else
                 "OSM-Fussweg zum Eingang Sued")
        added.append(connector(
            current_id, label, x, y, next_id,
            "unbestaetigt" if is_south else "offen",
            {
                "demoCorridor": recipe["id"],
                "stage": "station" if is_start else "south-entrance" if is_south else "outside",
                "source": "OpenStreetMap snapshot",
                "sourceFile": recipe["osm"]["snapshot"],
                "sourceRetrieval": source["retrieval"],
                "osmNodeId": osm_node_id,
                "elevation": "unknown-render-plane",
                **({"uncertainty": recipe["venue"]["reason"]} if is_south else {}),
            },
        ))

    added.append(connector(
        piazza_id,
        recipe["venue"]["piazzaLabel"],
        piazza_x,
        piazza_y,
        target_connector,
        recipe["venue"]["state"],
        {
            "demoCorridor": recipe["id"],
            "stage": "piazza",
            "source": recipe["venue"]["boulevard"],
            "stationM": piazza_station,
            "evidence": recipe["venue"]["evidence"],
            "uncertainty": recipe["venue"]["reason"],
        },
        z=piazza_z,
    ))
    graph["connectors"].extend(added)
    previous_nodes = len(previous_demo)
    previous_edges = sum(len(item.get("ends", [])) for item in previous_demo)
    graph["counts"] = {
        **graph.get("counts", {}),
        "nodes": graph.get("counts", {}).get("nodes", 0) - previous_nodes + len(added),
        "edges": graph.get("counts", {}).get("edges", 0) - previous_edges
        + sum(len(item.get("ends", [])) for item in added),
    }
    REGISTERED_GRAPH.write_text(json.dumps(graph, ensure_ascii=False, indent=2) + "\n",
                                encoding="utf-8")

    distinct_ways = []
    for way in ways:
        item = {
            "id": way["id"],
            "highway": way.get("tags", {}).get("highway"),
            "name": way.get("tags", {}).get("name"),
        }
        if item not in distinct_ways:
            distinct_ways.append(item)

    result = {
        "schema": "beuteltier.demo-corridor.v1",
        "id": recipe["id"],
        "title": recipe["title"],
        "startNodeId": f"demo:osm:{path[0]}",
        "goalNodeId": goal_node_id,
        "start": {"label": recipe["osm"]["startLabel"], "osmNodeId": path[0]},
        "target": {
            "label": recipe["venue"]["targetLabel"],
            "hallKey": hall_key,
            "registered": True,
            "viaConnector": target_connector,
        },
        "stages": [
            {"id": "station", "label": recipe["osm"]["startLabel"], "status": "source-recorded"},
            {"id": "outside", "label": "OSM-Fussweg", "status": "source-derived"},
            {"id": "south-entrance", "label": recipe["osm"]["southEntranceLabel"], "status": "source-recorded"},
            {"id": "piazza", "label": recipe["venue"]["piazzaLabel"], "status": "observed-unconfirmed"},
            {"id": "hall-10-1", "label": recipe["venue"]["targetLabel"], "status": "registered-unconfirmed-access"},
        ],
        "osm": {
            "source": source,
            "distanceM": round(outdoor_m, 1),
            "nodeIds": path,
            "ways": distinct_ways,
        },
        "uncertainties": [{
            "from": recipe["osm"]["southEntranceLabel"],
            "to": recipe["venue"]["targetLabel"],
            "state": recipe["venue"]["state"],
            "reason": recipe["venue"]["reason"],
        }],
        "representation": "ROUTE_GRAPH_POLYLINE",
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    shutil.copy2(REGISTERED_GRAPH, PUBLIC_DATA / REGISTERED_GRAPH.name)
    shutil.copy2(OUTPUT, PUBLIC_DATA / OUTPUT.name)
    return result


def main() -> int:
    result = build()
    print(f"{len(result['osm']['nodeIds'])} OSM-Knoten, "
          f"{result['osm']['distanceM']:.1f} m Aussenweg -> {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
