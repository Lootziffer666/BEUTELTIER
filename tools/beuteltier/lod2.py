"""Liest das amtliche 3D-Gebaeudemodell LoD2 der Geobasis NRW.

Das ist die erste Quelle im Projekt, die **Gebaeude** kennt. Alles andere
liefert Standflaechen, Belegungen und Plaene; hier stehen Grundrisse, Waende
und Daecher, amtlich gemessen, in ETRS89/UTM32 mit Hoehen ueber NHN.

Was das aendert:

* Die Hallenumrisse waren bisher die konvexe Huelle der *belegten* Flaeche --
  im Mittel 9 % daneben. Jetzt gibt es den Gebaeudeumriss selbst.
* Die Geschosshoehen waren aus lichter Hoehe plus angenommener Deckenstaerke
  gerechnet. Jetzt gibt es gemessene Trauf- und Firsthoehen.
* Und es gibt eine Flaeche, auf der man stehen kann: die Waende und Daecher
  lassen sich zu einem Netz zusammensetzen und als glTF ausgeben.

CityGML ist XML mit tief verschachtelten Namensraeumen. Gelesen wird mit
``iterparse``, weil die vier Kacheln zusammen ueber 40 MB haben und der Baum
sonst komplett im Speicher landet.
"""
from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

GML = "{http://www.opengis.net/gml}"
BLDG = "{http://www.opengis.net/citygml/building/1.0}"
GEN = "{http://www.opengis.net/citygml/generics/1.0}"
CORE = "{http://www.opengis.net/citygml/1.0}"

# Welche Flaechenarten uebernommen werden und wie sie im Netz heissen.
SURFACE_KINDS = {
    f"{BLDG}GroundSurface": "ground",
    f"{BLDG}WallSurface": "wall",
    f"{BLDG}RoofSurface": "roof",
    f"{BLDG}ClosureSurface": "closure",
}

Point3 = tuple[float, float, float]


@dataclass
class Surface:
    """Eine planare Begrenzungsflaeche eines Gebaeudes."""

    kind: str
    ring: list[Point3]
    holes: list[list[Point3]] = field(default_factory=list)


@dataclass
class Building:
    """Ein Gebaeude aus dem LoD2-Modell."""

    id: str
    surfaces: list[Surface] = field(default_factory=list)
    function: str | None = None
    roof_type: str | None = None
    measured_height: float | None = None
    ground_height: float | None = None
    feature_class: str = "Building"
    parent_id: str | None = None

    @property
    def ground(self) -> list[Surface]:
        return [s for s in self.surfaces if s.kind == "ground"]

    def footprint(self) -> list[tuple[float, float]]:
        """Der groesste Grundflaechenring, in 2D."""
        rings = [s.ring for s in self.ground]
        if not rings:
            return []
        return [(x, y) for x, y, _z in max(rings, key=lambda r: abs(ring_area(r)))]

    def bounds(self) -> tuple[float, float, float, float]:
        xs = [p[0] for s in self.surfaces for p in s.ring]
        ys = [p[1] for s in self.surfaces for p in s.ring]
        return (min(xs), min(ys), max(xs), max(ys)) if xs else (0.0, 0.0, 0.0, 0.0)

    def height_range(self) -> tuple[float, float]:
        zs = [p[2] for s in self.surfaces for p in s.ring]
        return (min(zs), max(zs)) if zs else (0.0, 0.0)


def ring_area(ring: list[Point3] | list[tuple[float, float]]) -> float:
    """Flaeche eines geschlossenen Rings in der xy-Ebene, mit Vorzeichen."""
    total = 0.0
    for index in range(len(ring)):
        x1, y1 = ring[index][0], ring[index][1]
        x2, y2 = ring[(index + 1) % len(ring)][0], ring[(index + 1) % len(ring)][1]
        total += x1 * y2 - x2 * y1
    return total / 2.0


def _poslist(element: ET.Element) -> list[Point3]:
    text = (element.text or "").split()
    values = [float(v) for v in text]
    points = [(values[i], values[i + 1], values[i + 2]) for i in range(0, len(values), 3)]
    # CityGML schliesst den Ring; fuer die Weiterverarbeitung stoert das.
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    return points


def _surfaces_of(node: ET.Element) -> list[Surface]:
    out: list[Surface] = []
    for bounded in node.iter(f"{BLDG}boundedBy"):
        for child in bounded:
            kind = SURFACE_KINDS.get(child.tag)
            if kind is None:
                continue
            for polygon in child.iter(f"{GML}Polygon"):
                exterior = polygon.find(f"{GML}exterior/{GML}LinearRing/{GML}posList")
                if exterior is None:
                    continue
                ring = _poslist(exterior)
                if len(ring) < 3:
                    continue
                holes = []
                for interior in polygon.findall(
                        f"{GML}interior/{GML}LinearRing/{GML}posList"):
                    hole = _poslist(interior)
                    if len(hole) >= 3:
                        holes.append(hole)
                out.append(Surface(kind=kind, ring=ring, holes=holes))
    return out


def read_buildings(path: str | Path,
                   bounds: tuple[float, float, float, float] | None = None
                   ) -> list[Building]:
    """Liest eine CityGML-Kachel und gibt die Gebaeude darin zurueck.

    ``bounds`` filtert in UTM32-Metern (minx, miny, maxx, maxy). Ohne Filter
    kommt die ganze Kachel -- das sind mehrere tausend Gebaeude.
    """
    buildings: list[Building] = []
    context = ET.iterparse(str(path), events=("start", "end"))
    _, root = next(context)
    for event, element in context:
        # Aufgeraeumt wird erst *nach* einem fertigen Gebaeude. Wer jedes
        # Element beim Schliessen leert, raeumt die Kinder des Gebaeudes weg,
        # bevor es selbst an der Reihe ist -- und findet dann nichts.
        if event != "end" or element.tag != f"{BLDG}Building":
            continue

        building = Building(id=element.get(f"{GML}id", ""))
        building.surfaces = _surfaces_of(element)
        # Gebaeudeteile tragen ihre Flaechen selbst; ``iter`` oben hat sie
        # bereits mitgenommen, weil sie unterhalb des Gebaeudes stehen.

        for attribute in element.iter(f"{GEN}stringAttribute"):
            name = attribute.get("name")
            value = attribute.findtext(f"{GEN}value")
            if name == "Dachform":
                building.roof_type = value
        function = element.findtext(f"{BLDG}function")
        if function:
            building.function = function
        measured = element.findtext(f"{BLDG}measuredHeight")
        if measured:
            try:
                building.measured_height = float(measured)
            except ValueError:
                pass

        element.clear()
        root.clear()  # sonst waechst der Baum ueber die ganze Kachel mit

        if not building.surfaces:
            continue
        if bounds is not None:
            minx, miny, maxx, maxy = building.bounds()
            if maxx < bounds[0] or minx > bounds[2] or maxy < bounds[1] or miny > bounds[3]:
                continue

        ground = building.ground
        if ground:
            building.ground_height = min(p[2] for s in ground for p in s.ring)
        buildings.append(building)
    return buildings


def read_features(path: str | Path,
                  bounds: tuple[float, float, float, float] | None = None
                  ) -> list[Building]:
    """Liest Buildings und BuildingParts als getrennte amtliche Features.

    Im Gegensatz zum historischen :func:`read_buildings` werden Flaechen
    eines BuildingPart nicht seinem Eltern-Building zugeschlagen. Damit
    bleiben Feature-ID, Klasse und auch Teile ohne GroundSurface fuer
    Diagnose und spaetere Paketierung erhalten.
    """
    feature_tags = {f"{BLDG}Building": "Building",
                    f"{BLDG}BuildingPart": "BuildingPart"}
    features: list[Building] = []
    open_ids: list[str] = []
    context = ET.iterparse(str(path), events=("start", "end"))
    _, root = next(context)

    for event, element in context:
        feature_class = feature_tags.get(element.tag)
        if event == "start" and feature_class:
            open_ids.append(element.get(f"{GML}id", ""))
            continue
        if event != "end" or not feature_class:
            continue

        feature = Building(
            id=element.get(f"{GML}id", ""),
            feature_class=feature_class,
            parent_id=open_ids[-2] if len(open_ids) > 1 else None,
        )
        feature.surfaces = _surfaces_of(element)
        feature.function = element.findtext(f"{BLDG}function")
        measured = element.findtext(f"{BLDG}measuredHeight")
        if measured:
            try:
                feature.measured_height = float(measured)
            except ValueError:
                pass
        for attribute in element.iter(f"{GEN}stringAttribute"):
            if attribute.get("name") == "Dachform":
                feature.roof_type = attribute.findtext(f"{GEN}value")

        open_ids.pop()
        # Parts werden sofort geloescht. Beim spaeteren Abschluss des Elterns
        # kann _surfaces_of deshalb nur dessen eigene Flaechen sehen.
        element.clear()
        if feature_class == "Building":
            root.clear()

        if not feature.surfaces:
            features.append(feature)
            continue
        if bounds is not None:
            minx, miny, maxx, maxy = feature.bounds()
            if maxx < bounds[0] or minx > bounds[2] or maxy < bounds[1] or miny > bounds[3]:
                continue
        if feature.ground:
            feature.ground_height = min(p[2] for surface in feature.ground
                                        for p in surface.ring)
        features.append(feature)
    return features


def triangulate(ring: list[Point3], holes: list[list[Point3]] | None = None
                ) -> list[tuple[int, int, int]]:
    """Nur die Dreiecke -- fuer Aufrufer, die die Punktliste selbst kennen."""
    return triangulate_with_points(ring, holes)[0]


def triangulate_with_points(ring: list[Point3],
                            holes: list[list[Point3]] | None = None
                            ) -> tuple[list[tuple[int, int, int]], list[Point3]]:
    """Zerlegt einen planaren 3D-Ring in Dreiecke.

    Projiziert auf die dominante Koordinatenebene und clippt Ohren. Loecher
    werden ueber eine Bruecke zum aeusseren Ring angebunden -- das ist das
    uebliche Verfahren und kommt ohne Fremdbibliothek aus.

    Zurueck kommen die Dreiecke **und** die Punktliste, auf die sich ihre
    Indizes beziehen. Beides zusammen, weil die Bruecken die Liste veraendern:
    wer nur die Dreiecke nimmt und den Ring behaelt, zeigt ins Leere.
    """
    points = list(ring)
    if holes:
        for hole in holes:
            points = _bridge_hole(points, list(hole))

    normal = _normal(points)
    axis = max(range(3), key=lambda i: abs(normal[i]))
    if axis == 0:
        flat = [(p[1], p[2]) for p in points]
    elif axis == 1:
        flat = [(p[2], p[0]) for p in points]
    else:
        flat = [(p[0], p[1]) for p in points]

    if ring_area(flat) < 0:
        flat = flat[::-1]
        order = list(range(len(points)))[::-1]
    else:
        order = list(range(len(points)))

    triangles: list[tuple[int, int, int]] = []
    indices = list(range(len(flat)))
    guard = 0
    while len(indices) > 3 and guard < len(flat) * len(flat) + 32:
        guard += 1
        for position in range(len(indices)):
            previous = indices[position - 1]
            current = indices[position]
            following = indices[(position + 1) % len(indices)]
            if _is_ear(flat, indices, previous, current, following):
                triangles.append((order[previous], order[current], order[following]))
                indices.pop(position)
                break
        else:
            break
    if len(indices) == 3:
        triangles.append((order[indices[0]], order[indices[1]], order[indices[2]]))
    return triangles, points


def _normal(points: list[Point3]) -> tuple[float, float, float]:
    """Newell-Normale -- robust auch bei leicht windschiefen Ringen."""
    nx = ny = nz = 0.0
    for index in range(len(points)):
        x1, y1, z1 = points[index]
        x2, y2, z2 = points[(index + 1) % len(points)]
        nx += (y1 - y2) * (z1 + z2)
        ny += (z1 - z2) * (x1 + x2)
        nz += (x1 - x2) * (y1 + y2)
    length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return (nx / length, ny / length, nz / length)


def _bridge_hole(outer: list[Point3], hole: list[Point3]) -> list[Point3]:
    """Verbindet einen Lochring mit dem Aussenring ueber eine Doppelkante."""
    hole_index = max(range(len(hole)), key=lambda i: hole[i][0])
    outer_index = min(range(len(outer)),
                      key=lambda i: math.dist(outer[i][:2], hole[hole_index][:2]))
    rotated = hole[hole_index:] + hole[:hole_index]
    return (outer[:outer_index + 1] + rotated + [rotated[0]]
            + outer[outer_index:])


def _is_ear(flat: list[tuple[float, float]], indices: list[int],
            a: int, b: int, c: int) -> bool:
    ax, ay = flat[a]
    bx, by = flat[b]
    cx, cy = flat[c]
    cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if cross <= 1e-12:
        return False
    for index in indices:
        if index in (a, b, c):
            continue
        if _inside(flat[index], (ax, ay), (bx, by), (cx, cy)):
            return False
    return True


def _inside(point: tuple[float, float], a: tuple[float, float],
            b: tuple[float, float], c: tuple[float, float]) -> bool:
    def side(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    d1, d2, d3 = side(point, a, b), side(point, b, c), side(point, c, a)
    has_negative = d1 < 0 or d2 < 0 or d3 < 0
    has_positive = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_negative and has_positive)
