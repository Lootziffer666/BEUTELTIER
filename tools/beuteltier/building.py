"""Gebaeudedaten: offizielle Flaechen, lichte Hoehen und was daraus folgt.

Die lichte Hoehe ist eine amtliche Angabe, die Aussenhoehe eines Gebaeudes
nicht. Dieses Modul haelt beides auseinander und macht an jedem Wert sichtbar,
woher er kommt:

* ``official``  -- veroeffentlichte Hallendaten.
* ``derived``   -- aus offiziellen Werten und einer benannten Annahme gerechnet.
* ``estimated`` -- konstruktive Schaetzung, nicht vermessen.

Der wichtigste abgeleitete Wert ist die **Bodenhoehe der zweiten Ebene**. Sie
ist die lichte Hoehe der unteren Ebene plus die Geschossdecke -- und ergibt sich
damit aus einer offiziellen Zahl und genau einer Annahme, statt aus einer
Tabelle geschaetzter Werte, die niemand nachrechnen kann.

Der bisherige Bau setzte jede zweite Ebene pauschal auf 11 m. Das ist bei Halle
3.2 (lichte Hoehe unten 4,75 m) um mehr als vier Meter daneben und laesst
Ebenenwechsel laenger erscheinen, als sie sind.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

METADATA = Path(__file__).resolve().parent.parent.parent / "data" / "curated" / "hall-metadata.json"

# Fallback fuer Hallen ohne offizielle lichte Hoehe. Bewusst grosszuegig
# unsicher -- er soll auffallen, nicht unauffaellig durchgehen.
FALLBACK_CLEAR_HEIGHT_M = 6.0
FALLBACK_UNCERTAINTY_M = 3.0


@dataclass(frozen=True)
class HeightModel:
    """Das vertikale Modell einer Hallenebene, mit Herkunft je Wert."""

    floor_min_m: float
    floor_max_m: float
    floor_render_m: float
    clear_height_m: float
    roof_structure_m: float | None
    envelope_min_m: float | None
    envelope_max_m: float | None
    source: str            # official | derived | estimated
    confidence: str        # high | medium | low
    uncertainty_m: float

    def as_dict(self) -> dict:
        payload = {
            "floorElevationMinM": round(self.floor_min_m, 2),
            "floorElevationMaxM": round(self.floor_max_m, 2),
            "floorElevationRenderM": round(self.floor_render_m, 2),
            "clearHeightM": round(self.clear_height_m, 2),
            "heightSource": self.source,
            "heightConfidence": self.confidence,
            "heightUncertaintyM": round(self.uncertainty_m, 2),
        }
        if self.roof_structure_m is not None:
            payload["roofStructureEstimateM"] = round(self.roof_structure_m, 2)
        if self.envelope_min_m is not None:
            payload["exteriorEnvelopeMinM"] = round(self.envelope_min_m, 2)
            payload["exteriorEnvelopeMaxM"] = round(self.envelope_max_m or 0.0, 2)
        return payload


class Buildings:
    """Zugriff auf die kuratierten Gebaeudedaten."""

    def __init__(self, path: Path | None = None) -> None:
        raw = json.loads((path or METADATA).read_text(encoding="utf-8"))
        self.halls: dict[str, dict] = raw["halls"]
        self.slab_min: float = raw["slabAssumption"]["minM"]
        self.slab_max: float = raw["slabAssumption"]["maxM"]
        self.single_storey: set[str] = set(raw["hallNumbering"]["singleStorey"])

    def entry(self, hall_key: str) -> dict | None:
        """Findet die Gebaeudedaten zu einem Hallenschluessel.

        Die Quelle fuehrt eingeschossige Hallen ohne Ebenenziffer ("6"), der
        Hallenplan mit ("6.1"). Beide meinen dasselbe Bauwerk.
        """
        if hall_key in self.halls:
            return self.halls[hall_key]
        base = hall_key.split(".")[0]
        if base in self.single_storey and base in self.halls:
            return self.halls[base]
        return None

    def is_routable(self, hall_key: str) -> bool:
        entry = self.entry(hall_key)
        return bool(entry.get("routable", True)) if entry else True

    def official_area(self, hall_key: str) -> float | None:
        entry = self.entry(hall_key)
        return entry.get("officialAreaSqm") if entry else None

    def clear_height(self, hall_key: str) -> tuple[float, bool]:
        """Lichte Hoehe und ob sie amtlich ist."""
        entry = self.entry(hall_key)
        if entry and entry.get("clearHeightM"):
            return float(entry["clearHeightM"]), True
        return FALLBACK_CLEAR_HEIGHT_M, False

    def height_model(self, hall_key: str, level: int, lower_key: str | None) -> HeightModel:
        """Baut das vertikale Modell einer Hallenebene.

        ``lower_key`` ist die Ebene darunter, sofern es sie gibt -- ihre lichte
        Hoehe bestimmt, wie hoch der Boden dieser Ebene liegt.
        """
        clear, official_clear = self.clear_height(hall_key)
        entry = self.entry(hall_key) or {}
        roof = entry.get("roofStructureEstimateM")

        if level <= 1 or lower_key is None:
            floor_min = floor_max = floor_render = 0.0
            source = "official" if official_clear else "estimated"
            confidence = "high" if official_clear else "low"
            uncertainty = 0.0 if official_clear else FALLBACK_UNCERTAINTY_M
        else:
            lower_clear, lower_official = self.clear_height(lower_key)
            floor_min = lower_clear + self.slab_min
            floor_max = lower_clear + self.slab_max
            floor_render = (floor_min + floor_max) / 2.0
            # Der Boden ist gerechnet, nie gemessen -- auch wenn die lichte
            # Hoehe darunter amtlich ist, bleibt die Deckenstaerke Annahme.
            source = "derived"
            confidence = "medium" if (lower_official and official_clear) else "low"
            uncertainty = (floor_max - floor_min) / 2.0
            if not lower_official:
                uncertainty += FALLBACK_UNCERTAINTY_M

        envelope_min = envelope_max = None
        if roof is not None:
            # Aussenhuelle: Boden der obersten Ebene + lichte Hoehe + Dachzone.
            envelope_min = floor_min + clear + roof
            envelope_max = floor_max + clear + roof

        return HeightModel(
            floor_min_m=floor_min,
            floor_max_m=floor_max,
            floor_render_m=floor_render,
            clear_height_m=clear,
            roof_structure_m=roof,
            envelope_min_m=envelope_min,
            envelope_max_m=envelope_max,
            source=source,
            confidence=confidence,
            uncertainty_m=uncertainty,
        )


def polygon_area(points) -> float:
    """Flaecheninhalt eines beliebigen einfachen Polygons in Quadratmetern."""
    total = 0.0
    count = len(points)
    for index in range(count):
        x1, y1 = points[index]
        x2, y2 = points[(index + 1) % count]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2.0


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Konvexe Huelle nach Andrews Monotone Chain.

    Gebraucht, weil die Bounding-Box einer Hallenebene bei L-foermigen Hallen
    weit ueber das Gebaeude hinausgreift: bei Halle 10 um 31 Prozent, bei Halle
    2 um 30. Die Huelle der tatsaechlich gezeichneten Flaechen trifft dieselben
    Hallen auf ein bis vier Prozent.
    """
    unique = sorted(set((round(x, 3), round(y, 3)) for x, y in points))
    if len(unique) < 3:
        return unique

    def cross(o, a, b) -> float:
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def build(sequence) -> list[tuple[float, float]]:
        chain: list[tuple[float, float]] = []
        for point in sequence:
            while len(chain) >= 2 and cross(chain[-2], chain[-1], point) <= 0:
                chain.pop()
            chain.append(point)
        return chain

    return build(unique)[:-1] + build(reversed(unique))[:-1]


# Faellt die Huelle gegenueber der Bounding-Box zu klein aus, steckt meist zu
# wenig Inhalt dahinter -- dann ist die Box die ehrlichere Naeherung.
MIN_HULL_COVERAGE = 0.45


def hall_outline(content: list[tuple[float, float]],
                 bbox_corners: list[tuple[float, float]]) -> tuple[list[tuple[float, float]], str]:
    """Waehlt die Umgrenzung einer Hallenebene und sagt, woher sie stammt."""
    hull = convex_hull(content)
    if len(hull) < 3:
        return bbox_corners, "boundingbox"

    box_area = polygon_area(bbox_corners)
    if box_area > 0 and polygon_area(hull) / box_area < MIN_HULL_COVERAGE:
        return bbox_corners, "boundingbox"
    return hull, "inhaltshuelle"
