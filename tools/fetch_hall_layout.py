#!/usr/bin/env python3
"""Holt die offizielle Hallen-Platzierungstabelle des Koelnmesse-Gelaendeplans.

Die Hallenplan-Schnittstelle liefert jede Halle in eigenen lokalen Metern. Wo
die Hallen zueinander liegen, steht in der Seite selbst: die interaktive Karte
fuehrt ein ``hallen``-Array mit

* ``coord`` -- Grundriss im Gelaendekoordinatensystem (SVG-viewBox 1172 x 903),
* ``rot``   -- Drehung, mit der die lokalen Standkoordinaten eingesetzt werden,
* ``dx``/``dy`` -- Feinversatz.

Darin stehen nicht nur die Hallen, sondern auch die **Durchgaenge** zwischen
ihnen (``P14`` = Durchgang Halle 1 zu Halle 4, ``P15``, ``PC1``/``PC2`` zum
Confex). Das ist die Grundlage des Wegenetzes.

Aufruf:
    python3 tools/fetch_hall_layout.py [--force]
"""
from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

PAGE_URL = "https://exhibitors.gamescom.global/en/gamescom-exhibitors/hall-plan/"
USER_AGENT = "BEUTELTIER/0.1 (gamescom companion app; hall layout snapshot)"

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "raw" / "hall-layout.json"

# Die Kommentare hinter den Eintraegen benennen die Durchgaenge im Klartext
# ("// Durchgang Confex und H2") und sind fuer das Wegenetz zu wertvoll, um sie
# beim Aufraeumen wegzuwerfen.
TRAILING_COMMENT = re.compile(r"\}\s*,?\s*//([^\n]*)")


def extract_array(html: str) -> tuple[str, list[str]]:
    """Schneidet das ``hallen``-Array aus der Seite und sammelt die Kommentare."""
    start = html.find("var hallen = [")
    if start < 0:
        raise ValueError("hallen-Array nicht gefunden")
    open_bracket = html.index("[", start)

    depth = 0
    for position in range(open_bracket, len(html)):
        char = html[position]
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                segment = html[open_bracket:position + 1]
                notes = [m.group(1).strip() for m in TRAILING_COMMENT.finditer(segment)]
                return segment, notes
    raise ValueError("hallen-Array nicht geschlossen")


def to_json(segment: str) -> list[dict]:
    """Uebersetzt das JavaScript-Literal in JSON.

    Auskommentierte Eintraege sind bewusst deaktiviert und fliegen mit den
    Kommentaren raus. Danach bleiben nur noch JS-Eigenheiten: unquotierte
    Schluessel, einfache Anfuehrungszeichen und Kommas vor der Klammer.
    """
    text = re.sub(r"/\*.*?\*/", "", segment, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    text = re.sub(r"(?<![\"\w])(\w+)\s*:", r'"\1":', text)
    text = re.sub(r"\"\"(\w+)\"\":", r'"\1":', text)
    text = re.sub(r"'([^']*)'", r'"\1"', text)
    text = re.sub(r",\s*([\]}])", r"\1", text)
    return json.loads(text)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if OUT_PATH.exists() and not args.force:
        print(f"{OUT_PATH} vorhanden -- --force zum Neuholen")
        return 0

    request = urllib.request.Request(PAGE_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=60) as response:
        html = response.read().decode("utf-8", errors="replace")

    segment, notes = extract_array(html)
    entries = to_json(segment)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps({
        "source": PAGE_URL,
        "viewBox": [1172, 903],
        "notes": notes,
        "entries": entries,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    passages = [e for e in entries if e.get("pure")]
    print(f"{len(entries)} Eintraege, davon {len(passages)} Durchgaenge -> {OUT_PATH}")
    for entry in entries:
        kind = "Durchgang" if entry.get("pure") else "Halle    "
        print(f"  {kind} {str(entry.get('halle')):<7} rot={str(entry.get('rot')):>4} "
              f"dx={str(entry.get('dx')):>5} dy={str(entry.get('dy')):>5} "
              f"pts={len(entry.get('coord') or [])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
