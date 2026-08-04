"""Bereinigt die gesammelte Ausstellerliste.

Der Sammler zieht die Standangaben aus einem Fliesstext und trifft dabei zwei
Fehler, die hier korrigiert werden:

1. **Gekoppelte Standcodes.** ``C030aD029a`` sind zwei Staende, nicht einer. Das
   PRD nennt das unter 5.3 als offenen Punkt.
2. **Verkuerzte Hallenangaben.** ``"Freiflaeche Halle 8 Nord A020"`` wird zu
   Halle ``"8"``, Stand ``"A020"``. Die Halle stimmt dann nicht -- gemeint ist
   die Freiflaeche, die im Hallenplan unter ``F8`` gefuehrt wird.

Beides laesst sich aus dem mitgelieferten ``raw``- und ``rawText``-Feld
rekonstruieren, ohne zu raten.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

STAND_CODE = re.compile(r"^([A-G])(\d{2,3})([a-z]?)$")

# Zwei bis drei aneinandergeschriebene Standcodes: C030aD029a, B030gC031g.
COUPLED = re.compile(r"^(?:[A-G]\d{2,3}[a-z]?){2,}$")
SINGLE = re.compile(r"[A-G]\d{2,3}[a-z]?")

# "Freiflaeche Halle 8 Nord", "Freigelaende Halle 7 West"
OUTDOOR_HINT = re.compile(
    r"(?:Freifl\w*che|Freigel\w*nde)\s+Halle\s+(\d+)\s+(Nord|S\w*d|Ost|West)",
    re.IGNORECASE,
)
# Die verkuerzte Form des Sammlers: "Halle 8 | Nord A020". Eine Himmelsrichtung
# hinter dem Trennstrich gibt es nur bei Freiflaechen -- Hallenstaende tragen
# dort direkt den Standcode.
OUTDOOR_SHORT = re.compile(
    r"Halle\s+(\d+)\s*\|\s*(Nord|S\w*d|Ost|West)\b",
    re.IGNORECASE,
)
PIAZZA_HINT = re.compile(r"\bPiazza\b", re.IGNORECASE)

OUTDOOR_KEY_BY_HALL_SIDE = {
    ("5", "nord"): "FB",
    ("6", "nord"): "F2",
    ("7", "west"): "F7",
    ("8", "nord"): "F8",
}


@dataclass
class Placement:
    """Ein Aussteller an einem konkreten Stand."""

    hall: str
    stand: str
    raw: str
    note: str = ""
    outdoor_key: str | None = None
    derived_from: str | None = None   # Original-Code, falls aufgetrennt


@dataclass
class Exhibitor:
    id: str
    name: str
    country: str
    detail_url: str
    placements: list[Placement] = field(default_factory=list)


def split_coupled(code: str) -> list[str]:
    """Trennt aneinandergeschriebene Standcodes.

    ``C030aD029a`` -> ``["C030a", "D029a"]``. Ein einzelner gueltiger Code
    bleibt unveraendert; unbekannte Formen werden unveraendert durchgereicht,
    damit nichts still verschwindet.
    """
    if not code:
        return []
    if STAND_CODE.match(code):
        return [code]
    if COUPLED.match(code):
        parts = SINGLE.findall(code)
        # Nur auftrennen, wenn die Teile den Code luecklos ergeben.
        if "".join(parts) == code and len(parts) > 1:
            return parts
    return [code]


def _outdoor_key(text: str) -> str | None:
    match = OUTDOOR_HINT.search(text) or OUTDOOR_SHORT.search(text)
    if match:
        side = match.group(2).lower()
        side = "sued" if side.startswith("s") else side
        key = OUTDOOR_KEY_BY_HALL_SIDE.get((match.group(1), side))
        if key:
            return key
    if PIAZZA_HINT.search(text):
        return "B3"
    return None


def classify_outdoor(raw: str, hall: str, raw_text: str) -> str | None:
    """Erkennt, ob *diese* Standangabe eine Freiflaeche meint.

    Die Entscheidung faellt je Placement, nicht je Aussteller: wer eine
    Freiflaeche *und* Hallenstaende hat -- etwa Asus mit Halle 8.1 und der
    Freiflaeche Halle 8 Nord -- darf nicht komplett nach draussen wandern.

    Der knappe ``raw``-Text entscheidet zuerst. Der volle ``rawText`` des
    Ausstellers wird nur herangezogen, wenn die Halle keine Ebene traegt: eine
    Angabe wie ``"8"`` statt ``"8.1"`` ist genau die Spur, die der Sammler
    hinterlaesst, wenn er eine Freiflaechenzeile verkuerzt hat.
    """
    direct = _outdoor_key(raw or "")
    if direct:
        return direct
    if "." not in (hall or ""):
        return _outdoor_key(raw_text or "")
    return None


def load(path: str | Path) -> tuple[list[Exhibitor], dict]:
    """Liest die Sammlerdatei und gibt bereinigte Aussteller plus Metadaten zurueck."""
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    exhibitors: list[Exhibitor] = []

    for raw in payload.get("exhibitors", []):
        exhibitor = Exhibitor(
            id=raw.get("id") or "",
            name=raw.get("name") or "",
            country=raw.get("country") or "",
            detail_url=raw.get("detailUrl") or "",
        )
        raw_text = raw.get("rawText") or ""
        seen: set[tuple[str, str]] = set()

        for placement in raw.get("placements", []):
            hall = (placement.get("hall") or "").strip()
            original = (placement.get("stand") or "").strip()
            if not hall:
                continue

            outdoor = classify_outdoor(placement.get("raw") or "", hall, raw_text)
            codes = split_coupled(original)

            for code in codes:
                key = (outdoor or hall, code)
                if key in seen:
                    continue
                seen.add(key)
                exhibitor.placements.append(Placement(
                    hall=hall,
                    stand=code,
                    raw=placement.get("raw") or "",
                    note=placement.get("note") or "",
                    outdoor_key=outdoor,
                    derived_from=original if code != original else None,
                ))

        exhibitors.append(exhibitor)

    meta = {
        "year": payload.get("year"),
        "collectedAt": payload.get("collectedAt"),
        "source": payload.get("source", {}),
        "stats": payload.get("stats", {}),
    }
    return exhibitors, meta
