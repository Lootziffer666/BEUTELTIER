"""Belegt den Mittwochskorridor gegen seine eingecheckten Quellen."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BUILD = ROOT / "data" / "build"


def load(name: str) -> dict:
    return json.loads((BUILD / name).read_text(encoding="utf-8"))


def test_corridor_keeps_exact_osm_anchors_and_distance():
    corridor = load("demo-corridor.json")
    assert corridor["start"]["osmNodeId"] == 2019682768
    assert corridor["osm"]["nodeIds"][-1] == 3063838345
    assert corridor["osm"]["distanceM"] == 479.3
    assert len(corridor["osm"]["nodeIds"]) == 33


def test_corridor_is_present_in_registered_graph_with_unknown_elevation():
    graph = load("registered-graph.json")
    connectors = {
        item["id"]: item for item in graph["connectors"]
        if item["id"].startswith("demo:")
    }
    assert len(connectors) == 34
    assert "demo:osm:2019682768" in connectors
    assert "demo:osm:3063838345" in connectors
    assert all(
        item["meta"].get("elevation") == "unknown-render-plane"
        for item in connectors.values()
        if item["id"].startswith("demo:osm:")
    )


def test_unmeasured_venue_connection_stays_unconfirmed():
    corridor = load("demo-corridor.json")
    graph = load("registered-graph.json")
    piazza = next(item for item in graph["connectors"] if item["id"] == "demo:piazza")
    assert corridor["uncertainties"]
    assert {item["state"] for item in corridor["uncertainties"]} == {"unbestaetigt"}
    assert piazza["state"] == "unbestaetigt"
    assert corridor["representation"] == "ROUTE_GRAPH_POLYLINE"
    assert "SIMULAT" not in json.dumps(corridor).upper()
