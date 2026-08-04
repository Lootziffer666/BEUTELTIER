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

Die lichten Hoehen widersprechen an einer Stelle der Flaechentabelle: fuer
Halle 10 nennt diese 5,70 m, die Richtlinien 5,80 bzw. 5,85 m. Beide sind
offiziell; der Widerspruch wird ausgewiesen, nicht aufgeloest.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .pdf_vector import TextRun, read_text_ops

# Seiten des Dokuments (Stand Juni 2022). Werden beim Lesen verifiziert.
ELEVATOR_PAGE = 7
GATE_PAGE = 8

# Marken wie "5.1F", "10.2Q", "11.1A" -- Hallenebene plus Kennbuchstabe.
MARK = re.compile(r"^(\d{1,2}\.\d)([A-Z])$")
# Hallenbeschriftung auf dem Uebersichtsplan: eine oder zwei Ziffern.
HALL_MARK = re.compile(r"^(\d{1,2})$")

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


def read_marks(pdf_path: str | Path, page_index: int) -> tuple[list[Mark], dict[str, tuple[float, float]]]:
    """Liest die Marken einer Planseite und die Hallenbeschriftungen zum Einpassen."""
    runs = read_text_ops(pdf_path, page_index=page_index)

    marks: list[Mark] = []
    for run in runs:
        match = MARK.match(run.text)
        if match:
            marks.append(Mark(hall_key=match.group(1), designator=match.group(2),
                              x=run.x, y=run.y))

    halls: dict[str, tuple[float, float]] = {}
    for run in runs:
        if not HALL_MARK.match(run.text) or not _in_map(run):
            continue
        halls.setdefault(run.text, (run.x, run.y))

    return marks, halls


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
