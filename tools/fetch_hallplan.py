#!/usr/bin/env python3
"""Holt die offiziellen gamescom-Hallenpläne als Snapshot.

Hinter dem interaktiven Hallenplan auf exhibitors.gamescom.global liegt eine
JSON-Schnittstelle, die je Halle und Ebene die Standflächen als Polygone in
Metern liefert. Dieses Skript zieht davon einen Schnappschuss nach
``data/raw/hallplan/``.

BEUTELTIER liest im Betrieb ausschliesslich diesen Schnappschuss, niemals die
Schnittstelle selbst -- die App muss auf dem Messegelaende offline laufen. Der
Abruf ist damit ein reproduzierbarer Build-Schritt und kein Laufzeitverhalten.

Aufruf:
    python3 tools/fetch_hallplan.py            # nur fehlende Dateien holen
    python3 tools/fetch_hallplan.py --force    # alles neu holen
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://backends.koelnmesse.io/global/asdb.php"
PARAMS = "sV=0480&sJ=2026&sS=3&route=hallenplan2/api&useNoSession=1&fw_ajax=1"
USER_AGENT = "BEUTELTIER/0.1 (gamescom companion app; hall plan snapshot)"

OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "hallplan"

# Hallen 1-11 auf den Ebenen 1-3. Nicht jede Kombination existiert; leere
# Antworten werden verworfen statt als Datei abgelegt.
HALLS = [str(n) for n in range(1, 12)]
LEVELS = ["1", "2", "3"]

# Freiflaechen fuehrt die Schnittstelle unter eigenen Schluesseln. Die Kuerzel
# stammen aus dem gamescom-Hallenplan 2025, wo sie den Standcodes vorangestellt
# sind ("FBFreiflaeche Halle 5 Nord A022", "F2...Halle 6 Nord", "F7...Halle 7
# West", "F8...Halle 8 Nord", "B3Piazza").
OUTDOOR = ["FB", "F2", "F7", "F8", "B3"]

THROTTLE_SECONDS = 0.5


def fetch(halle: str, level: str, timeout: int = 45) -> dict | None:
    """Holt eine Hallen-Ebene. Gibt None zurueck, wenn dort nichts liegt."""
    url = f"{BASE}?{PARAMS}&halle={halle}&level={level}&stage="
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        print(f"  ! {halle}/{level}: {error}", file=sys.stderr)
        return None

    if not payload.get("staende") and not payload.get("bloecke"):
        return None
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true",
                        help="vorhandene Schnappschuesse ueberschreiben")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = skipped = empty = 0
    stands = blocks = 0

    for halle in HALLS + OUTDOOR:
        for level in LEVELS:
            target = OUT_DIR / f"{halle}_{level}.json"
            if target.exists() and not args.force:
                snapshot = json.loads(target.read_text(encoding="utf-8"))
                stands += len(snapshot.get("staende", []))
                blocks += len(snapshot.get("bloecke", []))
                skipped += 1
                continue

            payload = fetch(halle, level)
            time.sleep(THROTTLE_SECONDS)
            if payload is None:
                empty += 1
                continue

            target.write_text(
                json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True),
                encoding="utf-8",
            )
            n_stands = len(payload.get("staende", []))
            n_blocks = len(payload.get("bloecke", []))
            box = payload.get("minmax") or {}
            print(f"  {halle}.{level}: {n_stands:4d} Staende, {n_blocks:3d} Bloecke, "
                  f"{box.get('w', 0):.1f} x {box.get('h', 0):.1f} m")
            stands += n_stands
            blocks += n_blocks
            written += 1

    print(f"\n{written} geschrieben, {skipped} unveraendert, {empty} ohne Inhalt")
    print(f"{stands} Standflaechen, {blocks} Bloecke in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
