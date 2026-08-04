"""Baut das Wegenetz, ueber das BEUTELTIER routet.

Die Gaenge einer Halle sind nirgends verzeichnet -- aber sie sind der
Negativraum zwischen den Staenden, und der ist metrisch bekannt. Statt Wege zu
schaetzen, wird der freie Raum ausgemessen: ueber die Halle laeuft ein Raster,
jede Zelle, die keine Standflaeche und keinen Strukturblock trifft, ist begehbar,
und benachbarte freie Zellen werden verbunden.

Das ist grob im Vergleich zu einer echten Vermessung, aber es ist *gemessen* und
nicht erfunden -- und es faellt automatisch richtig aus, wenn sich die
Standbelegung aendert.

Kantenzustaende folgen dem PRD 5.5. Eine Kante ist nicht nur offen oder zu; sie
kann Einbahn sein, nur Eingang, nur Ausgang, ueberfuellt oder schlicht
unbestaetigt. Genau diese Zustaende aendern sich waehrend der Messe stuendlich,
weshalb sie Daten sind und keine Annahme.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Iterable

# Rasterweite in Metern. Feiner als die schmalsten Gaenge (rund 3 m) waere
# Genauigkeit, die die Quelldaten nicht hergeben; groeber liesse Gaenge
# zuwachsen.
GRID_M = 3.0

# Sicherheitsabstand um Staende und Bloecke. Eine Zelle, die eine Standkante nur
# streift, ist praktisch nicht begehbar.
CLEARANCE_M = 0.6


@dataclass
class Node:
    id: str
    x: float
    y: float
    z: float
    kind: str                  # aisle | portal | stand | vertical | entrance | outdoor
    hall_key: str = ""
    level: int = 1
    label: str = ""
    meta: dict = field(default_factory=dict)


@dataclass
class Edge:
    id: str
    source: str
    target: str
    kind: str                  # aisle | portal | stand_access | elevator | escalator | stairs
    length_m: float
    state: str = "offen"       # PRD 5.5
    directed: bool = False
    crowd: float = 1.0         # Gedraengefaktor, multipliziert die Laenge
    access: str = ""           # leer = alle; sonst consumer | business | presse
    confirmed: bool = True
    label: str = ""


class Graph:
    def __init__(self) -> None:
        self.nodes: dict[str, Node] = {}
        self.edges: list[Edge] = []

    def add_node(self, node: Node) -> Node:
        self.nodes[node.id] = node
        return node

    def add_edge(self, edge: Edge) -> Edge:
        self.edges.append(edge)
        return edge

    def connect(self, a: str, b: str, kind: str, **kwargs) -> Edge | None:
        if a == b or a not in self.nodes or b not in self.nodes:
            return None
        first, second = self.nodes[a], self.nodes[b]
        length = math.dist((first.x, first.y, first.z), (second.x, second.y, second.z))
        return self.add_edge(Edge(
            id=f"e{len(self.edges)}", source=a, target=b, kind=kind,
            length_m=round(length, 2), **kwargs))

    def neighbours(self, node_id: str) -> list[tuple[str, Edge]]:
        out = []
        for edge in self.edges:
            if edge.source == node_id:
                out.append((edge.target, edge))
            elif edge.target == node_id and not edge.directed:
                out.append((edge.source, edge))
        return out


def _point_in_polygon(x: float, y: float, polygon: Iterable[tuple[float, float]]) -> bool:
    points = list(polygon)
    inside = False
    n = len(points)
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            crossing = x1 + (y - y1) / (y2 - y1) * (x2 - x1)
            if crossing > x:
                inside = not inside
    return inside


def _expanded_bbox(polygon: list[list[float]], margin: float) -> tuple[float, float, float, float]:
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    return (min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin)


def walkable_cells(hall: dict, stands: list[dict],
                   grid_m: float = GRID_M) -> list[tuple[float, float]]:
    """Bestimmt die begehbaren Rasterpunkte einer Hallenebene.

    Blockiert wird durch Standflaechen und Strukturbloecke -- letztere sind
    Hallenkerne, Waende und Treppenhaeuser und damit ebenso undurchdringlich wie
    ein Stand.
    """
    footprint = hall["footprint"]
    xs = [p[0] for p in footprint]
    ys = [p[1] for p in footprint]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    obstacles = [(_expanded_bbox(s["polygon"], CLEARANCE_M), s["polygon"]) for s in stands]
    obstacles += [(_expanded_bbox(b, CLEARANCE_M), b) for b in hall.get("blocks", [])]

    cells: list[tuple[float, float]] = []
    steps_x = max(1, int((max_x - min_x) / grid_m))
    steps_y = max(1, int((max_y - min_y) / grid_m))

    for ix in range(steps_x + 1):
        for iy in range(steps_y + 1):
            x = min_x + ix * grid_m
            y = min_y + iy * grid_m
            if not _point_in_polygon(x, y, footprint):
                continue
            blocked = False
            for (bx0, by0, bx1, by1), polygon in obstacles:
                if bx0 <= x <= bx1 and by0 <= y <= by1 and _point_in_polygon(x, y, polygon):
                    blocked = True
                    break
            if not blocked:
                cells.append((x, y))
    return cells


def build_hall_aisles(graph: Graph, hall: dict, stands: list[dict],
                      grid_m: float = GRID_M) -> dict[tuple[int, int], str]:
    """Legt das Gangnetz einer Hallenebene an und gibt die Zellenzuordnung zurueck."""
    footprint = hall["footprint"]
    min_x = min(p[0] for p in footprint)
    min_y = min(p[1] for p in footprint)
    key = hall["key"]
    base_y = hall["baseY"]

    index: dict[tuple[int, int], str] = {}
    for x, y in walkable_cells(hall, stands, grid_m):
        ix = round((x - min_x) / grid_m)
        iy = round((y - min_y) / grid_m)
        node_id = f"a:{key}:{ix}:{iy}"
        index[(ix, iy)] = node_id
        graph.add_node(Node(id=node_id, x=x, y=y, z=base_y, kind="aisle",
                            hall_key=key, level=hall["level"]))

    # Vier-Nachbarschaft: Diagonalen wuerden durch Standecken schneiden.
    for (ix, iy), node_id in index.items():
        for dx, dy in ((1, 0), (0, 1)):
            other = index.get((ix + dx, iy + dy))
            if other:
                graph.connect(node_id, other, "aisle")
    return index


def attach_stands(graph: Graph, hall: dict, stands: list[dict],
                  index: dict[tuple[int, int], str], grid_m: float = GRID_M) -> int:
    """Haengt jeden Stand an den naechstgelegenen erreichbaren Gang.

    Das PRD haelt das unter 5.5 ausdruecklich fest: ein Stand haengt nicht am
    Hallen-Node, sondern an seinem Zugang.
    """
    footprint = hall["footprint"]
    min_x = min(p[0] for p in footprint)
    min_y = min(p[1] for p in footprint)
    attached = 0

    for stand in stands:
        polygon = stand["polygon"]
        cx = sum(p[0] for p in polygon) / len(polygon)
        cy = sum(p[1] for p in polygon) / len(polygon)

        node_id = f"s:{stand['id']}"
        graph.add_node(Node(id=node_id, x=cx, y=cy, z=hall["baseY"], kind="stand",
                            hall_key=hall["key"], level=hall["level"],
                            label=stand["code"], meta={"standId": stand["id"]}))

        # Ringfoermig nach aussen suchen, bis ein Gang gefunden ist.
        ix = round((cx - min_x) / grid_m)
        iy = round((cy - min_y) / grid_m)
        found = None
        for radius in range(1, 12):
            best: tuple[float, str] | None = None
            for dx in range(-radius, radius + 1):
                for dy in range(-radius, radius + 1):
                    if max(abs(dx), abs(dy)) != radius:
                        continue
                    candidate = index.get((ix + dx, iy + dy))
                    if not candidate:
                        continue
                    node = graph.nodes[candidate]
                    distance = math.dist((cx, cy), (node.x, node.y))
                    if best is None or distance < best[0]:
                        best = (distance, candidate)
            if best:
                found = best[1]
                break

        if found:
            graph.connect(node_id, found, "stand_access")
            attached += 1
    return attached
