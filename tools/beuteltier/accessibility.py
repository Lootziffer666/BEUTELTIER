"""Liest den Barrierefrei-Plan der Koelnmesse aus.

Der Plan zeigt beide Ebenen des Gelaendes als getrennte Uebersichten und traegt
dabei ein, was in keiner anderen Quelle steht: Aufzuege, behindertengerechte
Toiletten, Sanitaetsstationen, Messewachen, die Eingaenge und die barrierefreien
Wege zwischen den Hallen.

Er ist **schematisch**: die Hallen sind gleichfoermige Bloecke, nicht
massstaeblich. Fuer die Lage einzelner Hallen ist er deshalb nur so genau wie
gemessen -- rund 25 Meter. Fuer die Frage, *welche* Halle einen Aufzug hat und
wo ungefaehr, reicht das.

Die beiden Ebenen liegen als zwei Diagramme untereinander auf derselben Seite
und muessen getrennt behandelt werden.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .pdf_vector import Path2D, TextRun

# Trennlinie zwischen den beiden Uebersichten auf der Seite. Ebene 1 liegt oben.
LEVEL_SPLIT_Y = 380.0
# Die Ueberschriften "Ebene 1 / Level 1" stehen ueber dem oberen Diagramm und
# enthalten selbst Ziffern -- sie duerfen nicht als Hallenbeschriftung zaehlen.
HEADING_Y = 660.0

HALL_LABEL = re.compile(r"^(\d{1,2})(?:\.(\d))?$")

# Die begehbaren Verbindungen sind in zwei Gruentoenen angelegt (Deck- und
# Seitenflaeche der leicht perspektivischen Darstellung).
WALKWAY_COLOURS = [(0.562, 0.777, 0.518), (0.759, 0.866, 0.687)]
COLOUR_TOLERANCE = 0.06

# Nur Hallen mit zwei Geschossen; die uebrigen sind eingeschossig und tragen im
# Plan keine Ebenenziffer.
MULTI_LEVEL_HALLS = {"1", "2", "3", "4", "5", "10", "11"}


@dataclass(frozen=True)
class HallMark:
    """Eine Hallenbeschriftung im Uebersichtsplan."""

    hall: str
    level: int
    x: float
    y: float

    @property
    def key(self) -> str:
        return f"{self.hall}.{self.level}"


@dataclass(frozen=True)
class Landmark:
    """Ein Eingang, eine Messewache oder ein sonstiger benannter Punkt."""

    kind: str
    label: str
    level: int
    x: float
    y: float


def _close(a: tuple[float, float, float], b: tuple[float, float, float]) -> bool:
    return all(abs(x - y) <= COLOUR_TOLERANCE for x, y in zip(a, b))


def level_of(y: float) -> int:
    return 1 if y >= LEVEL_SPLIT_Y else 2


def hall_marks(runs: list[TextRun]) -> list[HallMark]:
    """Zieht die Hallenbeschriftungen beider Uebersichten heraus.

    Die Textlaeufe muessen einzeln gelesen sein (``read_text_ops``): in der
    zusammengefassten Variante verschmelzen "2.1", "3.1" und "11.1" zu einem
    Lauf mit nur einer Position.
    """
    marks: list[HallMark] = []
    for run in runs:
        if run.y > HEADING_Y:
            continue
        match = HALL_LABEL.match(run.text)
        if not match:
            continue

        diagram_level = level_of(run.y)
        hall = match.group(1)
        explicit = match.group(2)

        if explicit is not None:
            level = int(explicit)
        elif hall in MULTI_LEVEL_HALLS:
            # Sollte beschriftet sein; ohne Ziffer bleibt nur die Diagrammebene.
            level = diagram_level
        else:
            # Eingeschossige Halle -- steht in beiden Uebersichten, ist aber
            # immer dieselbe Ebene 1.
            level = 1

        marks.append(HallMark(hall=hall, level=level, x=run.x, y=run.y))
    return marks


def reference_points(runs: list[TextRun], level: int = 1) -> dict[str, tuple[float, float]]:
    """Hallenschluessel -> Position im Planraum, fuer eine der beiden Uebersichten."""
    points: dict[str, tuple[float, float]] = {}
    for mark in hall_marks(runs):
        if level_of(mark.y) != level:
            continue
        points.setdefault(mark.key, (mark.x, mark.y))
    return points


def walkways(paths: list[Path2D]) -> list[Path2D]:
    """Filtert die begehbaren Verbindungen anhand ihrer Einfaerbung."""
    found = []
    for path in paths:
        if not path.filled or path.fill is None:
            continue
        if any(_close(path.fill, colour) for colour in WALKWAY_COLOURS):
            found.append(path)
    return found


def landmarks(runs: list[TextRun]) -> list[Landmark]:
    """Sammelt Eingaenge, Messewachen und Congress-Centren.

    Nur die deutschen Beschriftungen; die englischen stehen jeweils direkt
    darunter und beschreiben denselben Punkt.
    """
    patterns = [
        ("eingang", re.compile(r"^Eingang\s+(.+)$")),
        ("messewache", re.compile(r"^Messewache\s+(.+)$")),
        ("congress", re.compile(r"^CC\s+(.+)$")),
        ("piazza", re.compile(r"^(Piazza)$")),
        ("boulevard", re.compile(r"^(Boulevard)$")),
        ("confex", re.compile(r"^(Confex)$")),
    ]

    found: list[Landmark] = []
    for run in runs:
        for kind, pattern in patterns:
            match = pattern.match(run.text)
            if not match:
                continue
            found.append(Landmark(
                kind=kind,
                label=run.text,
                level=level_of(run.y),
                x=run.x,
                y=run.y,
            ))
            break
    return found
