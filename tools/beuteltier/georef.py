"""Bringt die einzelnen Hallenplaene ins gemeinsame Geländekoordinatensystem.

Die Hallenplan-Schnittstelle liefert jede Ebene in **eigenen** lokalen Metern:
Halle 10 beginnt bei (0,0) und Halle 6 ebenfalls. Wo die Hallen zueinander
liegen, steht dort nicht. Der gamescom-Hallenplan 2025 zeigt genau das -- alle
Hallen der Ebene 1 in einem Bild.

Die Bruecke sind die Standcodes. Ein Stand, der in beiden Quellen vorkommt,
liefert ein Punktpaar. Aus genuegend Paaren laesst sich je Halle eine
Aehnlichkeitstransformation (Drehung, gleichmaessiger Massstab, Verschiebung)
im Sinne kleinster Quadrate loesen -- das ist das Orthogonale-Procrustes-Problem
mit Skalierung, geschlossen loesbar, ohne Iteration.

Wichtig: Das Ergebnis wird nicht geglaubt, sondern gemessen. Jede Halle bekommt
einen Restfehler in Metern. Wer den nicht ausweist, behauptet eine Genauigkeit,
die er nicht hat.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass

from .hallplan import HallLevel, Stand
from .pdf_vector import Path2D, TextRun

# "Hall 10.1 A052", "Hall 2.1 C014/E013"
LABEL = re.compile(r"^Hall\s+([\d.]+)\s+(.+)$")
CODE = re.compile(r"^[A-G]\d{2,3}[a-z]?$")

# Fuellfarben der Standflaechen im gamescom-Hallenplan (Legende: Event Area,
# Business Area, Catering, Meeting Area).
BOOTH_COLOURS = {
    (0.0, 0.725, 1.0): "event",
    (0.6, 0.89, 1.0): "business",
    (1.0, 1.0, 0.0): "catering",
    (0.831, 0.678, 1.0): "meeting",
}


@dataclass(frozen=True)
class Transform:
    """Aehnlichkeitstransformation lokale Hallenmeter -> Geländemeter."""

    scale: float
    rotation_rad: float
    tx: float
    ty: float
    sample_count: int
    residual_m: float          # mittlerer Restfehler
    max_residual_m: float
    source: str                # "procrustes" | "abgeleitet" | "fallback"

    def apply(self, x: float, y: float) -> tuple[float, float]:
        cos_r = math.cos(self.rotation_rad) * self.scale
        sin_r = math.sin(self.rotation_rad) * self.scale
        return (cos_r * x - sin_r * y + self.tx, sin_r * x + cos_r * y + self.ty)

    @property
    def rotation_deg(self) -> float:
        return math.degrees(self.rotation_rad)


def booth_labels(runs: list[TextRun],
                 polygons: list[Path2D] | None = None) -> dict[tuple[str, str], tuple[float, float]]:
    """Zieht (Halle, Standcode) -> Position aus dem 2025er Plan.

    Der Textanker liegt am Zeilenanfang, nicht in der Standmitte -- wer ihn
    direkt nimmt, handelt sich mehrere Meter systematischen Versatz ein. Sind
    die Standflaechen mitgegeben, wird das Label deshalb auf die Mitte der
    Flaeche gezogen, in der es liegt.
    """
    boxes = [(p.bbox(), p.centroid()) for p in (polygons or [])]

    found: dict[tuple[str, str], tuple[float, float]] = {}
    for run in runs:
        match = LABEL.match(run.text)
        if not match:
            continue

        position = (run.x, run.y)
        if boxes:
            best: tuple[float, tuple[float, float]] | None = None
            for box, centre in boxes:
                x0, y0, x1, y1 = box
                if x0 - 1.0 <= run.x <= x1 + 1.0 and y0 - 1.0 <= run.y <= y1 + 1.0:
                    area = (x1 - x0) * (y1 - y0)
                    # Bei verschachtelten Flaechen gewinnt die kleinste --
                    # sie ist der eigentliche Stand, nicht der Hallenblock.
                    if best is None or area < best[0]:
                        best = (area, centre)
            if best is not None:
                position = best[1]

        hall = match.group(1)
        for code in re.split(r"[/\s]+", match.group(2)):
            if CODE.match(code):
                found.setdefault((hall, code), position)
    return found


def booth_polygons(paths: list[Path2D]) -> list[Path2D]:
    """Filtert die eingefaerbten Standflaechen aus allen Pfaden."""
    return [p for p in paths
            if p.filled and p.fill is not None
            and tuple(round(c, 3) for c in p.fill) in BOOTH_COLOURS]


def solve_similarity(source: list[tuple[float, float]],
                     target: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    """Loest target ~ s*R*source + t nach kleinsten Quadraten.

    Geschlossene Loesung: beide Punktwolken zentrieren, den Drehwinkel aus der
    Summe der Kreuz- und Skalarprodukte bestimmen, den Massstab aus dem
    Verhaeltnis der Streuungen.
    """
    n = len(source)
    if n == 0:
        raise ValueError("keine Punktpaare")

    sx = sum(p[0] for p in source) / n
    sy = sum(p[1] for p in source) / n
    tx_mean = sum(p[0] for p in target) / n
    ty_mean = sum(p[1] for p in target) / n

    num = den = norm = 0.0
    for (ax, ay), (bx, by) in zip(source, target):
        ax, ay = ax - sx, ay - sy
        bx, by = bx - tx_mean, by - ty_mean
        num += ax * by - ay * bx      # Kreuzprodukt -> Sinusanteil
        den += ax * bx + ay * by      # Skalarprodukt -> Kosinusanteil
        norm += ax * ax + ay * ay

    if norm == 0.0:
        raise ValueError("Quellpunkte fallen zusammen")

    rotation = math.atan2(num, den)
    scale = math.hypot(num, den) / norm
    cos_r, sin_r = math.cos(rotation) * scale, math.sin(rotation) * scale
    return (scale, rotation,
            tx_mean - (cos_r * sx - sin_r * sy),
            ty_mean - (sin_r * sx + cos_r * sy))


MIN_PAIRS = 4
TRIM_FRACTION = 0.25
TRIM_ROUNDS = 4


def _residuals(transform: Transform,
               pairs: list[tuple[tuple[float, float], tuple[float, float]]]) -> list[float]:
    errors = []
    for (sx, sy), (gx, gy) in pairs:
        px, py = transform.apply(sx, sy)
        errors.append(math.hypot(px - gx, py - gy))
    return errors


def fit_hall(level: HallLevel,
             labels: dict[tuple[str, str], tuple[float, float]],
             hall_key_in_pdf: str) -> Transform | None:
    """Fittet eine Hallenebene gegen die Standlabels des 2025er Plans.

    Der Fit laeuft robust: Staende werden zwischen den Jahren umgeschnitten,
    zusammengelegt und neu nummeriert. Ein Code, der 2025 und 2026 an
    verschiedenen Stellen liegt, ist kein Messfehler, sondern eine echte
    Aenderung -- er darf die Halle aber nicht verziehen. Deshalb wird mehrfach
    gefittet und dabei jeweils das schlechteste Viertel verworfen.
    """
    pairs: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for stand in level.stands:
        for code in stand.codes:
            position = labels.get((hall_key_in_pdf, code))
            if position is not None:
                pairs.append((stand.centroid(), position))
                break

    if len(pairs) < MIN_PAIRS:
        return None

    active = pairs
    transform: Transform | None = None

    for _ in range(TRIM_ROUNDS):
        scale, rotation, tx, ty = solve_similarity([p[0] for p in active],
                                                   [p[1] for p in active])
        transform = Transform(scale, rotation, tx, ty, len(active), 0.0, 0.0, "procrustes")

        errors = _residuals(transform, active)
        keep = max(MIN_PAIRS, int(len(active) * (1.0 - TRIM_FRACTION)))
        if keep >= len(active):
            break
        ranked = sorted(zip(errors, active), key=lambda item: item[0])
        active = [pair for _, pair in ranked[:keep]]

    assert transform is not None
    errors = _residuals(transform, active)
    scale = transform.scale or 1.0
    # Restfehler in Geländeeinheiten -> ueber den Massstab zurueck in Meter.
    return Transform(
        transform.scale, transform.rotation_rad, transform.tx, transform.ty,
        len(active),
        (sum(errors) / len(errors)) / scale,
        max(errors) / scale,
        "procrustes",
    )


def place_at(level: HallLevel, site_centre: tuple[float, float],
             rotation_deg: float, uncertainty_m: float) -> Transform:
    """Setzt eine Halle bekannter Groesse an eine geschaetzte Stelle.

    Fuer Hallen ohne Staende im 2025er Plan -- Halle 3 und 11 waren dort nicht
    belegt, Halle 1 nur teilweise. Ihre Groesse ist metrisch exakt bekannt, nur
    ihre Lage auf dem Gelaende nicht.

    ``uncertainty_m`` ist der kreuzvalidierte Fehler der Quelle, aus der die
    Stelle stammt. Er wandert bis in die Oberflaeche durch: eine Halle, deren
    Lage auf 25 Meter genau ist, darf nicht aussehen wie eine, die auf 30
    Zentimeter sitzt.
    """
    rotation = math.radians(rotation_deg)
    local_cx = level.origin[0] + level.width_m / 2.0
    local_cy = level.origin[1] + level.height_m / 2.0
    cos_r, sin_r = math.cos(rotation), math.sin(rotation)

    return Transform(
        scale=1.0,
        rotation_rad=rotation,
        tx=site_centre[0] - (cos_r * local_cx - sin_r * local_cy),
        ty=site_centre[1] - (sin_r * local_cx + cos_r * local_cy),
        sample_count=0,
        residual_m=uncertainty_m,
        max_residual_m=uncertainty_m,
        source="geschaetzt",
    )


def fit_reference_plan(reference: dict[str, tuple[float, float]],
                       site_centres: dict[str, tuple[float, float]]) -> tuple[
                           tuple[float, float, float, float], float, float, int]:
    """Bringt einen schematischen Uebersichtsplan aufs Gelaende.

    Gestuetzt auf die Hallen, deren Lage ueber den 2025er Plan schon exakt
    bekannt ist. Gibt Transformation, Fit-Restfehler, kreuzvalidierten Fehler
    und Stuetzenzahl zurueck.

    Der kreuzvalidierte Wert zaehlt: der Fit-Restfehler beschreibt, wie gut die
    Stuetzen selbst getroffen werden, aber gebraucht wird der Plan fuer Hallen,
    die *nicht* unter den Stuetzen sind. Leave-one-out beantwortet genau das.
    """
    keys = sorted(set(reference) & set(site_centres))
    if len(keys) < MIN_PAIRS:
        raise ValueError("zu wenige gemeinsame Hallen fuer den Referenzfit")

    def fit(subset: list[str]) -> tuple[float, float, float, float]:
        return solve_similarity([reference[k] for k in subset],
                                [site_centres[k] for k in subset])

    def project(params: tuple[float, float, float, float],
                point: tuple[float, float]) -> tuple[float, float]:
        scale, rotation, tx, ty = params
        cos_r, sin_r = math.cos(rotation) * scale, math.sin(rotation) * scale
        return (cos_r * point[0] - sin_r * point[1] + tx,
                sin_r * point[0] + cos_r * point[1] + ty)

    params = fit(keys)
    residuals = [math.hypot(*(a - b for a, b in zip(project(params, reference[k]),
                                                    site_centres[k]))) for k in keys]

    cross = []
    for held_out in keys:
        rest = [k for k in keys if k != held_out]
        if len(rest) < MIN_PAIRS:
            continue
        projected = project(fit(rest), reference[held_out])
        cross.append(math.hypot(projected[0] - site_centres[held_out][0],
                                projected[1] - site_centres[held_out][1]))

    return (params,
            sum(residuals) / len(residuals),
            sum(cross) / len(cross) if cross else float("nan"),
            len(keys))


def derive_stacked(base: Transform) -> Transform:
    """Ebene 2 uebernimmt die Lage ihrer Ebene 1.

    Halle 10.2 liegt baulich unmittelbar ueber 10.1, ebenso 5.2 ueber 5.1 und so
    weiter. Beide Ebenen teilen denselben Grundriss und dieselben lokalen
    Koordinaten, also auch dieselbe Transformation.
    """
    return Transform(base.scale, base.rotation_rad, base.tx, base.ty,
                     base.sample_count, base.residual_m, base.max_residual_m,
                     "abgeleitet")
