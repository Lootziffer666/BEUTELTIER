"""Liest die Technischen Richtlinien der Koelnmesse aus.

Das Dokument ist ueberwiegend Recht und Logistik, enthaelt aber drei Tabellen
mit belastbaren Bauangaben -- und, entscheidend, **Uebersichtsplaene mit
verorteten Marken**:

* lichte Hoehen je Hallenebene, samt Fussnoten zu oertlichen Einschraenkungen
* Aufzuege mit Tragfaehigkeit, Abmessungen und Kennbuchstaben, dazu ein Plan,
  auf dem jeder Aufzug als Marke ``5.1F`` eingezeichnet ist
* Tore mit Breite, Hoehe und Kennbuchstaben, ebenfalls mit Plan

Die Marken sind der eigentliche Gewinn. Der Uebersichtsplan der Aufzugsseite
laesst sich auf 12 m genau ins Gelaende einpassen -- mehr als doppelt so genau
wie der Barrierefrei-Plan. Damit stehen Aufzuege nicht mehr rechnerisch in der
Hallenmitte, sondern dort, wo die Koelnmesse sie eintraegt.

Die Abmessungen aus denselben Tabellen sind der zweite Gewinn: sie trennen
Haupttor von Nebentuer. Ein Tor mit 6,00 x 6,00 m ist ein Hallenportal, ein
Durchlass mit 3,10 x 3,40 m eine Betriebstuer. Fuer die Karte ist das der
Unterschied zwischen einem Weg und einer Wand mit Klinke.

Die lichten Hoehen widersprechen an einer Stelle der Flaechentabelle: fuer
Halle 10 nennt diese 5,70 m, die Richtlinien 5,80 bzw. 5,85 m. Beide sind
offiziell; der Widerspruch wird ausgewiesen, nicht aufgeloest.

Und eine Verwechslung, die naheliegt und trotzdem falsch ist: die 4,50 m der
Fussnote sind **keine** lichte Hoehe einer Halle. Sie sind eine oertliche
Beschraenkung unter dem Verteilerkanal, in sechs Hallenebenen. Halle 4.1 hat
5,85 m lichte Hoehe *und* diese 4,50-m-Stelle. Wer das zusammenzieht, verliert
1,35 m Bauhoehe im ganzen Rest der Halle.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

from .pdf_vector import TextRun, read_text_ops

# Seiten des Dokuments (Stand Juni 2022). Werden beim Lesen verifiziert.
ELEVATOR_PAGE = 7
GATE_PAGE = 8

# Marken wie "5.1F", "10.2Q", "11.1A" -- Hallenebene plus Kennbuchstabe. Der
# Satz ist uneinheitlich: mal "5.1F", mal "4.1 E", mal stehen Hallenebene und
# Buchstabe als zwei getrennte Textobjekte nebeneinander im Plan.
MARK = re.compile(r"^(\d{1,2}\.\d)\s*([A-Z])$")
# Hallenbeschriftung auf dem Uebersichtsplan: eine oder zwei Ziffern.
HALL_MARK = re.compile(r"^(\d{1,2})$")
# Getrennt gesetzte Marken: Hallenebene und Kennbuchstabe als eigene Laeufe.
HALL_LEVEL_MARK = re.compile(r"^(\d{1,2}\.\d)$")
LONE_LETTER = re.compile(r"^([A-Z])$")
# Wie nah die beiden Haelften stehen muessen. Gemessen liegen sie 8 bis 10
# Punkte auseinander; die naechste fremde Beschriftung ist dreimal so weit
# weg. Wer den Radius weiter zieht, klebt Buchstaben an falsche Hallen.
PAIR_RADIUS = 12.0

# Der Kartenbereich der Seite. Ausserhalb liegen die Tabellenspalten, deren
# Zeilenbeschriftungen sonst als Kartenmarken durchgingen.
MAP_BOUNDS = (150.0, 200.0, 520.0, 700.0)

# Lichte Hoehen aus dem Hallenhoehen-Plan, Abschnitt 3.1.b.
CLEAR_HEIGHTS_M = {
    "2.1": 6.00, "2.2": 6.00,
    "3.1": 4.75, "3.2": 6.45,
    "4.1": 5.85, "4.2": 5.85,
    "5.1": 5.85, "5.2": 5.85,
    "10.1": 5.80, "10.2": 5.85,
    "11.1": 5.00, "11.2": 5.00, "11.3": 6.00,
    "1.1": 11.00, "6": 11.00, "7": 11.00, "9": 11.00, "8": 15.00,
}

# Fussnote * des Hoehenplans: "Height 4.5 m under header duct". Sie steht an
# 4.1, 4.2, 5.1, 5.2, 10.1 und 10.2 -- also nicht nur an Halle 10.2, wie oft
# verkuerzt wiedergegeben.
DUCT_RESTRICTION_M = 4.50
DUCT_RESTRICTED = {"4.1", "4.2", "5.1", "5.2", "10.1", "10.2"}

# Fussnote ** an Halle 1.1: "Height 10,80 m under the duct partition wall".
PARTITION_RESTRICTION_M = 10.80
PARTITION_RESTRICTED = {"1.1"}


# Spaltenkoepfe der beiden Tabellen. Die Anker werden aus dem Dokument selbst
# gelesen, nicht gesetzt -- verschiebt sich das Layout, faellt es auf, statt
# still falsche Spalten zu liefern.
ELEVATOR_COLUMNS = (("hallKey", "Hall"), ("designators", "Elevator"),
                    ("loadKn", "Load carrying"), ("widthM", "Width"),
                    ("depthM", "Depth"), ("heightM", "Height"))
DOOR_COLUMNS = (("hallKey", "Hall"), ("designators", "Service Door"),
                ("widthM", "Width"), ("heightM", "Height"))

# Zellinhalte.
HALL_CELL = re.compile(r"^\d{1,2}(?:\.\d)?$")
METRES_CELL = re.compile(r"^(\d+[.,]\d+)\s*m$")
LOAD_CELL = re.compile(r"^(\d+(?:[.,]\d+)?)\s*kN$")
DESIGNATOR_CELL = re.compile(r"^[A-Z](?:\s*,\s*[A-Z])*$")

# Wie weit eine Zelle von ihrem Spaltenanker abweichen darf. Der Spaltenabstand
# betraegt rund 35 Punkte; 25 traegt Zentrierung, trennt aber Nachbarspalten.
COLUMN_TOLERANCE = 25.0
ROW_TOLERANCE = 3.0


@dataclass(frozen=True)
class Opening:
    """Ein Aufzug oder ein Tor mit seinen offiziellen Abmessungen.

    ``designators`` ist eine Liste, weil die Richtlinien baugleiche Anlagen in
    einer Zeile zusammenfassen (``B, D, F, H``). Leer ist sie dort, wo das
    Dokument die Zelle nicht fuellt -- Halle 3.1 hat so ein Tor.
    """

    kind: str
    hall_key: str
    designators: tuple[str, ...]
    width_m: float
    height_m: float
    depth_m: float | None = None
    load_kn: float | None = None

    def spec(self) -> dict:
        """Die Abmessungen als Ausgabesatz, ohne leere Felder."""
        out: dict = {"widthM": self.width_m, "heightM": self.height_m,
                     "source": "official"}
        if self.depth_m is not None:
            out["depthM"] = self.depth_m
        if self.load_kn is not None:
            # Die Spalte heisst "Load carrying capacity" und nennt Tonnen in
            # kN. Das ist ein Lastenaufzug fuer den Standbau, kein
            # Besucheraufzug -- die Karte darf niemanden dorthin schicken.
            out["loadKn"] = self.load_kn
            out["usage"] = "lastenaufzug"
        if len(self.designators) > 1:
            out["sharedWith"] = list(self.designators)
        return out


@dataclass(frozen=True)
class Mark:
    """Eine verortete Marke auf einem Uebersichtsplan der Richtlinien."""

    hall_key: str
    designator: str
    x: float
    y: float

    @property
    def id(self) -> str:
        return f"{self.hall_key}{self.designator}"


def _in_map(run: TextRun) -> bool:
    left, bottom, right, top = MAP_BOUNDS
    return left <= run.x <= right and bottom <= run.y <= top


def _paired_marks(runs: list[TextRun]) -> list[Mark]:
    """Fuegt getrennt gesetzte Marken wieder zusammen.

    Im Torplan stehen Hallenebene und Kennbuchstabe als zwei Textobjekte
    nebeneinander -- ``4.1`` und daneben ``H``. Zusammengefuegt wird nur, was
    dicht beieinander liegt, und jede Haelfte genau einmal. Bleibt eine
    Hallenebene ohne Buchstaben uebrig, bleibt sie ohne: Halle 3.1 hat so ein
    Tor, und die Tabelle laesst die Zelle ebenfalls leer.
    """
    levels = [r for r in runs if HALL_LEVEL_MARK.match(r.text) and _in_map(r)]
    letters = [r for r in runs if LONE_LETTER.match(r.text) and _in_map(r)]
    if not levels or not letters:
        return []

    pairs = sorted(
        ((math.dist((level.x, level.y), (letter.x, letter.y)), index, level, letter)
         for index, (level, letter) in enumerate(
             (l, t) for l in levels for t in letters))
        , key=lambda item: (item[0], item[1]))

    used_levels: set[int] = set()
    used_letters: set[int] = set()
    marks: list[Mark] = []
    for distance, _index, level, letter in pairs:
        if distance > PAIR_RADIUS:
            break
        if id(level) in used_levels or id(letter) in used_letters:
            continue
        used_levels.add(id(level))
        used_letters.add(id(letter))
        marks.append(Mark(hall_key=level.text, designator=letter.text,
                          x=level.x, y=level.y))
    return marks


def read_marks(pdf_path: str | Path, page_index: int) -> tuple[list[Mark], dict[str, tuple[float, float]]]:
    """Liest die Marken einer Planseite und die Hallenbeschriftungen zum Einpassen."""
    runs = read_text_ops(pdf_path, page_index=page_index)

    marks: list[Mark] = []
    for run in runs:
        match = MARK.match(run.text)
        if match:
            marks.append(Mark(hall_key=match.group(1), designator=match.group(2),
                              x=run.x, y=run.y))

    marks.extend(_paired_marks(runs))

    halls: dict[str, tuple[float, float]] = {}
    for run in runs:
        if not HALL_MARK.match(run.text) or not _in_map(run):
            continue
        halls.setdefault(run.text, (run.x, run.y))

    return marks, halls


def _column_groups(runs: list[TextRun],
                   columns: tuple[tuple[str, str], ...]) -> tuple[list[dict[str, float]], float]:
    """Liest die Kopfzeile und gibt je Spaltengruppe die Anker-x zurueck.

    Beide Tabellen sind zweispaltig gesetzt: dieselben Koepfe stehen zweimal
    nebeneinander. Die n-te Fundstelle jedes Kopfes gehoert zur n-ten Gruppe,
    weil die Gruppen von links nach rechts stehen.
    """
    found: dict[str, list[TextRun]] = {}
    for _field, label in columns:
        hits = sorted((r for r in runs if r.text.strip() == label), key=lambda r: r.x)
        if not hits:
            raise ValueError(f"Spaltenkopf '{label}' nicht gefunden")
        found[label] = hits

    count = len(found[columns[0][1]])
    for _field, label in columns:
        if len(found[label]) != count:
            raise ValueError(
                f"Spaltenkopf '{label}' {len(found[label])}x, erwartet {count}x")

    groups = [{field: found[label][index].x for field, label in columns}
              for index in range(count)]
    header_y = min(run.y for hits in found.values() for run in hits)
    return groups, header_y


def _rows(runs: list[TextRun], anchors: dict[str, float],
          header_y: float) -> list[dict[str, str]]:
    """Ordnet die Laufzeilen unterhalb der Kopfzeile in Tabellenzeilen ein."""
    left = min(anchors.values()) - COLUMN_TOLERANCE
    right = max(anchors.values()) + COLUMN_TOLERANCE

    cells: list[tuple[float, str, str]] = []
    for run in runs:
        text = run.text.strip()
        if not text or run.y >= header_y - ROW_TOLERANCE:
            continue
        if not left <= run.x <= right:
            continue
        field, distance = min(((f, abs(run.x - x)) for f, x in anchors.items()),
                              key=lambda pair: pair[1])
        if distance > COLUMN_TOLERANCE:
            continue
        cells.append((run.y, field, text))

    rows: list[dict[str, str]] = []
    for y, field, text in sorted(cells, key=lambda cell: (-cell[0], cell[1])):
        if rows and abs(rows[-1]["_y"] - y) <= ROW_TOLERANCE:  # type: ignore[operator]
            rows[-1].setdefault(field, text)
        else:
            rows.append({"_y": y, field: text})  # type: ignore[dict-item]
    return rows


def _metres(cell: str | None) -> float | None:
    match = METRES_CELL.match(cell or "")
    return float(match.group(1).replace(",", ".")) if match else None


def _designators(cell: str | None) -> tuple[str, ...]:
    if not cell or not DESIGNATOR_CELL.match(cell):
        return ()
    return tuple(part.strip() for part in cell.split(","))


def read_openings(pdf_path: str | Path, page_index: int, kind: str) -> list[Opening]:
    """Liest die Abmessungstabelle einer Planseite.

    ``kind`` ist ``"elevator"`` oder ``"gate"``; davon haengt ab, welche
    Spalten erwartet werden. Aufzuege fuehren zusaetzlich Tiefe und
    Tragfaehigkeit, Tore nur Breite und Hoehe.
    """
    columns = ELEVATOR_COLUMNS if kind == "elevator" else DOOR_COLUMNS
    runs = read_text_ops(pdf_path, page_index=page_index)
    groups, header_y = _column_groups(runs, columns)

    openings: list[Opening] = []
    for anchors in groups:
        for row in _rows(runs, anchors, header_y):
            hall = (row.get("hallKey") or "").strip()
            width = _metres(row.get("widthM"))
            height = _metres(row.get("heightM"))
            if not HALL_CELL.match(hall) or width is None or height is None:
                continue
            load = LOAD_CELL.match((row.get("loadKn") or "").replace("  ", " "))
            openings.append(Opening(
                kind=kind,
                hall_key=hall,
                designators=_designators(row.get("designators")),
                width_m=width,
                height_m=height,
                depth_m=_metres(row.get("depthM")),
                load_kn=float(load.group(1).replace(",", ".")) if load else None,
            ))
    return openings


def dimension_index(openings: list[Opening]) -> dict[tuple[str, str], dict]:
    """Schluesselt die Abmessungen nach Hallenebene und Kennbuchstabe auf.

    Eine Zeile mit ``B, D, F, H`` liefert vier Eintraege -- die Anlagen sind
    baugleich, deshalb fuehrt sie das Dokument gemeinsam.
    """
    index: dict[tuple[str, str], dict] = {}
    for opening in openings:
        for designator in opening.designators:
            index[(opening.hall_key, designator)] = opening.spec()
    return index


def clearance_restrictions(hall_key: str) -> list[dict]:
    """Oertliche Hoehenbeschraenkungen einer Hallenebene.

    Die lichte Hoehe ist keine ueberall gleiche Decke. Unter Verteilerkanaelen
    bleiben in mehreren Hallen nur 4,50 m -- wer mit der nominellen Hoehe
    plant, verplant sich dort um mehr als einen Meter.
    """
    found = []
    if hall_key in DUCT_RESTRICTED:
        found.append({
            "clearHeightM": DUCT_RESTRICTION_M,
            "reason": "unter Verteilerkanal",
            "source": "official",
            "extent": "unbekannt",
            "note": ("Wo genau der Kanal verlaeuft, steht nicht im Dokument. "
                     "Die Einschraenkung gilt punktuell, nicht flaechig."),
        })
    if hall_key in PARTITION_RESTRICTED:
        found.append({
            "clearHeightM": PARTITION_RESTRICTION_M,
            "reason": "unter der Kanaltrennwand",
            "source": "official",
            "extent": "unbekannt",
            "note": "Punktuelle Einschraenkung, Lage nicht dokumentiert.",
        })
    return found


def clear_height(hall_key: str) -> float | None:
    """Lichte Hoehe nach den Technischen Richtlinien."""
    if hall_key in CLEAR_HEIGHTS_M:
        return CLEAR_HEIGHTS_M[hall_key]
    base = hall_key.split(".")[0]
    return CLEAR_HEIGHTS_M.get(base)
