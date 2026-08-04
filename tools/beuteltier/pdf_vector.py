"""Liest Geometrie und positionierten Text aus Vektor-PDFs.

Die Karten der Koelnmesse und der gamescom sind reine Vektorgrafiken: jede
Standflaeche, jede Halle und jeder Korridor ist ein Pfad mit Farbe. Wer nur den
Text extrahiert, verliert genau das, worauf es ankommt -- die Lage.

Dieses Modul fuehrt den PDF-Inhaltsstrom so weit aus, wie es dafuer noetig ist:
Grafikzustand (``q``/``Q``), Transformationen (``cm``), Fuell- und Strichfarbe
sowie Pfadaufbau. Zeichenoperatoren liefern fertige Polygone in Seitenkoordinaten.

Bewusst nicht umgesetzt: Clipping, Schattierungen, Muster und Transparenzgruppen.
Fuer Grundrisse aus Illustrator-Exporten wird davon nichts gebraucht.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader
from pypdf.generic import ContentStream

Matrix = list[float]
Point = tuple[float, float]

IDENTITY: Matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]

# Operatoren, die einen Pfad zeichnen und damit abschliessen.
FILL_OPS = {"f", "F", "f*", "B", "B*", "b", "b*"}
STROKE_ONLY_OPS = {"S", "s"}
PAINT_OPS = FILL_OPS | STROKE_ONLY_OPS


@dataclass(frozen=True)
class Path2D:
    """Ein gezeichneter Teilpfad in Seitenkoordinaten."""

    points: tuple[Point, ...]
    fill: tuple[float, float, float] | None
    stroke: tuple[float, float, float] | None
    operator: str
    line_width: float

    @property
    def filled(self) -> bool:
        return self.operator in FILL_OPS

    def bbox(self) -> tuple[float, float, float, float]:
        xs = [p[0] for p in self.points]
        ys = [p[1] for p in self.points]
        return min(xs), min(ys), max(xs), max(ys)

    def area(self) -> float:
        """Flaecheninhalt nach der Trapezformel, vorzeichenlos."""
        total = 0.0
        n = len(self.points)
        for i in range(n):
            x1, y1 = self.points[i]
            x2, y2 = self.points[(i + 1) % n]
            total += x1 * y2 - x2 * y1
        return abs(total) / 2.0

    def centroid(self) -> Point:
        x0, y0, x1, y1 = self.bbox()
        return ((x0 + x1) / 2.0, (y0 + y1) / 2.0)


@dataclass(frozen=True)
class TextRun:
    """Ein Textstueck mit seiner Position auf der Seite."""

    text: str
    x: float
    y: float
    size: float


@dataclass
class _State:
    ctm: Matrix = field(default_factory=lambda: list(IDENTITY))
    fill: tuple[float, float, float] | None = None
    stroke: tuple[float, float, float] | None = None
    line_width: float = 1.0

    def copy(self) -> "_State":
        return _State(list(self.ctm), self.fill, self.stroke, self.line_width)


def multiply(a: Matrix, b: Matrix) -> Matrix:
    """Verkettet zwei PDF-Matrizen (a wird auf b angewandt)."""
    return [
        a[0] * b[0] + a[1] * b[2],
        a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2],
        a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4],
        a[4] * b[1] + a[5] * b[3] + b[5],
    ]


def transform(m: Matrix, x: float, y: float) -> Point:
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def _number(value: object) -> float:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0


def _colour(operands: list[object]) -> tuple[float, float, float] | None:
    """Deutet Farboperanden als RGB.

    ``rg``/``RG`` liefern drei Werte, ``g``/``G`` einen Grauwert, ``scn`` je nach
    Farbraum ein bis vier. CMYK wird naeherungsweise umgerechnet -- fuer die
    Klassifikation nach Farbe reicht das.
    """
    values = [_number(v) for v in operands if isinstance(v, (int, float))]
    if len(values) == 1:
        grey = values[0]
        return (grey, grey, grey)
    if len(values) == 3:
        return (values[0], values[1], values[2])
    if len(values) == 4:
        c, m, y, k = values
        return (
            round((1 - c) * (1 - k), 6),
            round((1 - m) * (1 - k), 6),
            round((1 - y) * (1 - k), 6),
        )
    return None


def _flatten_bezier(start: Point, c1: Point, c2: Point, end: Point,
                    segments: int = 8) -> list[Point]:
    """Zerlegt eine kubische Bezierkurve in Geradenstuecke."""
    points: list[Point] = []
    for i in range(1, segments + 1):
        t = i / segments
        u = 1.0 - t
        points.append((
            u * u * u * start[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
            u * u * u * start[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
        ))
    return points


def read_paths(pdf_path: str | Path, page_index: int = 0,
               min_points: int = 3) -> list[Path2D]:
    """Liest alle gezeichneten Pfade einer Seite."""
    reader = PdfReader(str(pdf_path))
    page = reader.pages[page_index]
    content = ContentStream(page.get_contents(), reader)

    state = _State()
    stack: list[_State] = []
    current: list[Point] = []
    subpaths: list[list[Point]] = []
    start_point: Point | None = None
    out: list[Path2D] = []

    def flush(operator: str) -> None:
        nonlocal current, subpaths, start_point
        if current:
            subpaths.append(current)
            current = []
        for sub in subpaths:
            if len(sub) >= min_points:
                out.append(Path2D(
                    points=tuple(sub),
                    fill=state.fill,
                    stroke=state.stroke,
                    operator=operator,
                    line_width=state.line_width,
                ))
        subpaths = []
        start_point = None

    for operands, raw_op in content.operations:
        op = raw_op.decode() if isinstance(raw_op, bytes) else str(raw_op)

        if op == "q":
            stack.append(state.copy())
        elif op == "Q":
            if stack:
                state = stack.pop()
        elif op == "cm":
            state.ctm = multiply([_number(v) for v in operands], state.ctm)
        elif op == "w":
            state.line_width = _number(operands[0]) if operands else 1.0
        elif op in ("rg", "g", "k", "sc", "scn"):
            colour = _colour(operands)
            if colour is not None:
                state.fill = colour
        elif op in ("RG", "G", "K", "SC", "SCN"):
            colour = _colour(operands)
            if colour is not None:
                state.stroke = colour

        elif op == "m":
            if current:
                subpaths.append(current)
            start_point = transform(state.ctm, _number(operands[0]), _number(operands[1]))
            current = [start_point]
        elif op == "l":
            if current:
                current.append(transform(state.ctm, _number(operands[0]), _number(operands[1])))
        elif op in ("c", "v", "y"):
            if current:
                here = current[-1]
                nums = [_number(v) for v in operands]
                if op == "c" and len(nums) >= 6:
                    c1 = transform(state.ctm, nums[0], nums[1])
                    c2 = transform(state.ctm, nums[2], nums[3])
                    end = transform(state.ctm, nums[4], nums[5])
                elif op == "v" and len(nums) >= 4:
                    c1 = here
                    c2 = transform(state.ctm, nums[0], nums[1])
                    end = transform(state.ctm, nums[2], nums[3])
                elif op == "y" and len(nums) >= 4:
                    c1 = transform(state.ctm, nums[0], nums[1])
                    end = transform(state.ctm, nums[2], nums[3])
                    c2 = end
                else:
                    continue
                current.extend(_flatten_bezier(here, c1, c2, end))
        elif op == "re":
            nums = [_number(v) for v in operands]
            if len(nums) >= 4:
                x, y, w, h = nums[:4]
                if current:
                    subpaths.append(current)
                    current = []
                subpaths.append([
                    transform(state.ctm, x, y),
                    transform(state.ctm, x + w, y),
                    transform(state.ctm, x + w, y + h),
                    transform(state.ctm, x, y + h),
                ])
        elif op == "h":
            if current:
                if start_point is not None and current[-1] != start_point:
                    current.append(start_point)
                subpaths.append(current)
                current = []

        elif op in PAINT_OPS:
            flush(op)
        elif op == "n":
            current = []
            subpaths = []
            start_point = None

    return out


def read_text_runs(pdf_path: str | Path, page_index: int = 0) -> list[TextRun]:
    """Liest Textstuecke mit absoluter Position.

    pypdf reicht Textmatrix und aktuelle Transformation getrennt heraus; erst
    ihr Produkt ergibt die Lage auf der Seite.
    """
    reader = PdfReader(str(pdf_path))
    page = reader.pages[page_index]
    runs: list[TextRun] = []

    def visitor(text: str, cm: Matrix, tm: Matrix, font_dict: object, font_size: float) -> None:
        stripped = text.strip()
        if not stripped:
            return
        m = multiply(list(tm), list(cm))
        runs.append(TextRun(text=stripped, x=m[4], y=m[5], size=float(font_size or 0.0)))

    page.extract_text(visitor_text=visitor)
    return runs


def read_text_ops(pdf_path: str | Path, page_index: int = 0) -> list[TextRun]:
    """Liest Textstuecke einzeln, ohne sie zu Zeilen zusammenzufassen.

    ``read_text_runs`` geht ueber pypdfs Textextraktion und bekommt damit
    zusammengefasste Zeilen: die drei Hallenbeschriftungen "2.1", "3.1" und
    "11.1" des Barrierefrei-Plans stehen zwar weit auseinander, landen aber als
    ein Lauf "2.1 3.1 11.1" mit nur einer Position.

    Diese Funktion liest den Inhaltsstrom direkt und gibt jedem
    Textzeige-Operator seine eigene Position -- noetig ueberall dort, wo die
    Lage einzelner Beschriftungen gebraucht wird.
    """
    reader = PdfReader(str(pdf_path))
    page = reader.pages[page_index]
    content = ContentStream(page.get_contents(), reader)

    state = _State()
    stack: list[_State] = []
    text_matrix = list(IDENTITY)
    line_matrix = list(IDENTITY)
    font_size = 0.0
    leading = 0.0
    runs: list[TextRun] = []

    def emit(raw: object) -> None:
        text = raw.decode("latin-1", errors="replace") if isinstance(raw, bytes) else str(raw)
        if not text.strip():
            return
        m = multiply(text_matrix, state.ctm)
        runs.append(TextRun(text=text.strip(), x=m[4], y=m[5], size=font_size))

    for operands, raw_op in content.operations:
        op = raw_op.decode() if isinstance(raw_op, bytes) else str(raw_op)

        if op == "q":
            stack.append(state.copy())
        elif op == "Q":
            if stack:
                state = stack.pop()
        elif op == "cm":
            state.ctm = multiply([_number(v) for v in operands], state.ctm)
        elif op == "BT":
            text_matrix = list(IDENTITY)
            line_matrix = list(IDENTITY)
        elif op == "Tf":
            if len(operands) >= 2:
                font_size = _number(operands[1])
        elif op == "TL":
            leading = _number(operands[0]) if operands else 0.0
        elif op == "Tm":
            if len(operands) >= 6:
                text_matrix = [_number(v) for v in operands[:6]]
                line_matrix = list(text_matrix)
        elif op in ("Td", "TD"):
            if len(operands) >= 2:
                if op == "TD":
                    leading = -_number(operands[1])
                shift = [1.0, 0.0, 0.0, 1.0, _number(operands[0]), _number(operands[1])]
                line_matrix = multiply(shift, line_matrix)
                text_matrix = list(line_matrix)
        elif op == "T*":
            shift = [1.0, 0.0, 0.0, 1.0, 0.0, -leading]
            line_matrix = multiply(shift, line_matrix)
            text_matrix = list(line_matrix)
        elif op == "Tj":
            if operands:
                emit(operands[0])
        elif op == "'":
            shift = [1.0, 0.0, 0.0, 1.0, 0.0, -leading]
            line_matrix = multiply(shift, line_matrix)
            text_matrix = list(line_matrix)
            if operands:
                emit(operands[0])
        elif op == "TJ":
            if operands and isinstance(operands[0], list):
                joined = "".join(
                    part.decode("latin-1", errors="replace") if isinstance(part, bytes)
                    else (str(part) if not isinstance(part, (int, float)) else "")
                    for part in operands[0]
                )
                emit(joined)

    return runs


def point_in_bbox(point: Point, box: tuple[float, float, float, float],
                  tolerance: float = 0.0) -> bool:
    x, y = point
    x0, y0, x1, y1 = box
    return (x0 - tolerance) <= x <= (x1 + tolerance) and (y0 - tolerance) <= y <= (y1 + tolerance)
