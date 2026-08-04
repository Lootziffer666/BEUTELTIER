"""Laedt die Hallenplan-Schnappschuesse und macht sie durchsuchbar.

Ein Schnappschuss enthaelt je Hallenebene die Standflaechen als Polygone in
Metern, dazu ``bloecke`` -- Hallenkerne, Waende, Treppenhaeuser -- und die
Bounding-Box der Ebene.

Der Standcode ist mehrdeutiger als er aussieht. Ein Stand kann unter mehreren
Codes gefuehrt werden (``standnr2``: ``"D-020g E-021g"``), und die
Ausstellerliste nennt teils den einen, teils den anderen. Dieses Modul baut
deshalb einen Index ueber alle bekannten Schreibweisen.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

SNAPSHOT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "raw" / "hallplan"

# Ein gueltiger Standcode: Spurbuchstabe, zwei bis drei Ziffern, optionaler
# Zusatz. Die Schnittstelle liefert in Halle 1.2 auch Pseudo-Codes, in denen
# Koordinaten stehen ("---11.3045.005..."); die filtert dieses Muster aus.
STAND_CODE = re.compile(r"^([A-G])(\d{2,3})([a-z]?)$")
STAND_CODE_LOOSE = re.compile(r"([A-G])-?(\d{2,3}[a-z]?)")

# Freiflaechen-Schluessel der Schnittstelle und ihre Klartextnamen. Die Kuerzel
# stehen im gamescom-Hallenplan den Standcodes voran.
OUTDOOR_NAMES = {
    "FB": "Freiflaeche Halle 5 Nord",
    "F2": "Freiflaeche Halle 6 Nord",
    "F7": "Freiflaeche Halle 7 West",
    "F8": "Freiflaeche Halle 8 Nord",
    "B3": "Piazza",
}


@dataclass(frozen=True)
class Stand:
    """Eine Standflaeche mit Polygon in Metern, lokal zur Hallenebene."""

    hall: str           # "10.2", "F8"
    level: int
    code: str           # "D020g"
    codes: tuple[str, ...]
    polygon: tuple[tuple[float, float], ...]
    area_sqm: float
    raw_number: str     # standnr2, z.B. "D-020g E-021g"

    @property
    def is_outdoor(self) -> bool:
        return self.hall in OUTDOOR_NAMES

    def centroid(self) -> tuple[float, float]:
        n = len(self.polygon)
        return (sum(p[0] for p in self.polygon) / n, sum(p[1] for p in self.polygon) / n)

    def bbox(self) -> tuple[float, float, float, float]:
        xs = [p[0] for p in self.polygon]
        ys = [p[1] for p in self.polygon]
        return min(xs), min(ys), max(xs), max(ys)


@dataclass(frozen=True)
class HallLevel:
    """Eine Hallenebene mit ihren Staenden und Strukturbloecken."""

    hall: str
    level: int
    width_m: float
    height_m: float
    origin: tuple[float, float]
    stands: tuple[Stand, ...]
    blocks: tuple[tuple[tuple[float, float], ...], ...]

    @property
    def key(self) -> str:
        return self.hall if self.hall in OUTDOOR_NAMES else f"{self.hall}.{self.level}"


def _polygon(raw: object) -> tuple[tuple[float, float], ...]:
    if not isinstance(raw, list):
        return ()
    points: list[tuple[float, float]] = []
    for item in raw:
        if isinstance(item, list) and len(item) >= 2:
            try:
                points.append((float(item[0]), float(item[1])))
            except (TypeError, ValueError):
                continue
    return tuple(points)


def _codes_for(stand_number: str, alt: str) -> tuple[str, ...]:
    """Sammelt alle Schreibweisen, unter denen ein Stand gefuehrt wird."""
    codes: list[str] = []
    if STAND_CODE.match(stand_number or ""):
        codes.append(stand_number)
    for letter, rest in STAND_CODE_LOOSE.findall(alt or ""):
        candidate = f"{letter}{rest}"
        if STAND_CODE.match(candidate) and candidate not in codes:
            codes.append(candidate)
    return tuple(codes)


def load_levels(snapshot_dir: Path | None = None) -> list[HallLevel]:
    """Liest alle Schnappschuesse aus dem Verzeichnis."""
    directory = snapshot_dir or SNAPSHOT_DIR
    levels: list[HallLevel] = []

    for path in sorted(directory.glob("*_*.json")):
        hall, _, level_text = path.stem.rpartition("_")
        try:
            level = int(level_text)
        except ValueError:
            continue

        payload = json.loads(path.read_text(encoding="utf-8"))
        box = payload.get("minmax") or {}

        stands: list[Stand] = []
        for raw in payload.get("staende", []):
            polygon = _polygon(raw.get("pl"))
            if len(polygon) < 3:
                continue
            codes = _codes_for(raw.get("standnr") or "", raw.get("standnr2") or "")
            if not codes:
                continue  # Pseudo-Codes ohne echte Standnummer
            stands.append(Stand(
                hall=hall,
                level=level,
                code=codes[0],
                codes=codes,
                polygon=polygon,
                area_sqm=float(raw.get("area") or 0.0),
                raw_number=raw.get("standnr2") or raw.get("standnr") or "",
            ))

        blocks = tuple(
            poly for poly in (_polygon(b.get("pl")) for b in payload.get("bloecke", []))
            if len(poly) >= 3
        )

        levels.append(HallLevel(
            hall=hall,
            level=level,
            width_m=float(box.get("w") or 0.0),
            height_m=float(box.get("h") or 0.0),
            origin=(float(box.get("minx") or 0.0), float(box.get("miny") or 0.0)),
            stands=tuple(stands),
            blocks=blocks,
        ))

    return levels


def build_index(levels: list[HallLevel]) -> dict[tuple[str, str], Stand]:
    """Baut den Nachschlage-Index (Hallenschluessel, Standcode) -> Stand.

    Der erste Code eines Standes gewinnt gegen spaeter eingetragene Aliase, damit
    ein echter Treffer nie von einem Zweitnamen ueberschrieben wird.
    """
    index: dict[tuple[str, str], Stand] = {}
    for level in levels:
        for stand in level.stands:
            primary = (level.key, stand.code)
            index[primary] = stand
            for code in stand.codes[1:]:
                index.setdefault((level.key, code), stand)
    return index


def resolve(index: dict[tuple[str, str], Stand], hall: str, code: str) -> Stand | None:
    """Findet einen Stand, auch wenn die Hallenangabe unvollstaendig ist.

    Die Ausstellerliste nennt teils "10.2", teils nur "8" -- letzteres, weil der
    Sammler "Freiflaeche Halle 8 Nord A020" auf die Halle verkuerzt hat. Diese
    Faelle werden hier der Reihe nach aufgeloest.
    """
    if not code:
        return None

    candidates: list[str] = []
    if hall in OUTDOOR_NAMES:
        candidates.append(hall)
    elif "." in hall:
        candidates.append(hall)
    else:
        candidates.extend([f"{hall}.1", f"{hall}.2", f"{hall}.3"])
        # Freiflaechen tragen den Hallennamen, liegen aber unter eigenem Schluessel.
        for key, name in OUTDOOR_NAMES.items():
            if f"Halle {hall} " in name:
                candidates.append(key)

    for candidate in candidates:
        stand = index.get((candidate, code))
        if stand is not None:
            return stand
    return None
