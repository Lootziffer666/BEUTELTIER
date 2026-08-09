#!/usr/bin/env python3
"""Holt Wege, Strassen, POIs und Eingaenge um die Koelnmesse via Overpass.

Zwei Abrufe mit verschiedenen Aufgaben:

`koelnmesse.json` ist der alte Bestand -- Wege und POIs im weiten Umfeld.

`flaechen.json` kam dazu, als sich zeigte, dass LoD2 zwei Dinge prinzipiell
nicht liefern kann. Erstens **Plaetze**: der Messeplatz ist keine Gebaeude-,
sondern eine Verkehrsflaeche, und ein Gebaeudemodell kennt sie nicht. Zweitens
**Verbindungsbauten** zwischen den Hallen, die im amtlichen Umriss fehlen --
zwischen Halle 7 und Halle 6 steht einer, der den Hof hinten schliesst.

Die Arbeitsteilung bleibt trotzdem bestehen und ist keine Geschmacksfrage:
Gebaeude kommen aus LoD2, weil sie dort amtlich gemessen sind. OSM liefert,
was LoD2 nicht fuehren kann, und jede daraus abgeleitete Kante wird in der
Ergebnisdatei als OSM-Kante ausgewiesen.
"""
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/raw/osm"
# Overpass antwortet unter Last mit 504. Das ist kein Fehler in der Abfrage,
# sondern Betrieb -- deshalb mehrere Anlaeufe und mehrere Spiegel, statt den
# Bau daran scheitern zu lassen.
URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
VERSUCHE = 4
BBOX = "50.932,6.965,50.954,7.005"
QUERY = f'''[out:json][timeout:120];(
way[highway]({BBOX});node[amenity]({BBOX});node[entrance]({BBOX});
node[shop]({BBOX});node[tourism]({BBOX}););out body;>;out skel qt;'''

# Enger Ausschnitt: nur das Messegelaende. Der weite Radius des ersten Abrufs
# brauchte es fuer Wege und POIs, hier waere er nur Ballast.
BBOX_GELAENDE = "50.9390,6.9730,50.9550,6.9960"
QUERY_FLAECHEN = f'''[out:json][timeout:180];(
way[building]({BBOX_GELAENDE});
way[highway][area=yes]({BBOX_GELAENDE});
way[highway=pedestrian]({BBOX_GELAENDE});
way[amenity=parking]({BBOX_GELAENDE});
);out body;>;out skel qt;'''


def hole(query: str) -> dict:
    letzter: Exception | None = None
    for versuch in range(VERSUCHE):
        for url in URLS:
            try:
                request = urllib.request.Request(
                    url, data=urllib.parse.urlencode({"data": query}).encode(),
                    headers={"User-Agent": "BEUTELTIER/1.0"})
                with urllib.request.urlopen(request, timeout=240) as response:
                    return json.load(response)
            except Exception as fehler:  # noqa: BLE001 -- jeder Ausfall zaehlt gleich
                letzter = fehler
                print(f"  {url}: {type(fehler).__name__} -- naechster Versuch")
        time.sleep(10 * (versuch + 1))
    raise SystemExit(f"Overpass antwortet nicht: {letzter}")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    payload = hole(QUERY)
    target = OUT / "koelnmesse.json"
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(payload['elements'])} OSM-Elemente -> {target}")

    flaechen = hole(QUERY_FLAECHEN)
    ziel_flaechen = OUT / "flaechen.json"
    ziel_flaechen.write_text(
        json.dumps(flaechen, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(flaechen['elements'])} OSM-Elemente -> {ziel_flaechen}")

    (OUT / "QUELLE.json").write_text(json.dumps({
        "title": "OpenStreetMap-Ausschnitt Koelnmesse", "provider": "OpenStreetMap-Mitwirkende",
        "url": "https://www.openstreetmap.org/copyright", "retrieval": payload.get("osm3s", {}).get("timestamp_osm_base"),
        "licence": "Open Data Commons Open Database License (ODbL) 1.0",
        "query": QUERY,
        "flaechen": {
            "datei": "flaechen.json",
            "query": QUERY_FLAECHEN,
            "retrieval": flaechen.get("osm3s", {}).get("timestamp_osm_base"),
            "zweck": ("Plaetze und Verbindungsbauten -- beides fuehrt LoD2 nicht. "
                      "Gebaeudegeometrie kommt weiterhin aus LoD2."),
        },
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
