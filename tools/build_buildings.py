#!/usr/bin/env python3
"""Passt das amtliche LoD2-Gebaeudemodell ins BEUTELTIER-Koordinatensystem ein.

Zwei Aufgaben:

1. **Einpassen.** Das LoD2-Modell steht in ETRS89/UTM32, BEUTELTIER in einem
   eigenen metrischen System, das aus dem 2025er Hallenplan stammt. Gesucht ist
   die Drehung, Verschiebung und gegebenenfalls Spiegelung dazwischen.
   Bewertet wird nicht der Abstand von Zentroiden -- die *belegte* Flaeche ist
   nicht der Gebaeudemittelpunkt -- sondern wie viele Pruefpunkte aus den
   eingemessenen Hallen nach der Transformation **innerhalb** eines amtlichen
   Grundrisses landen. Das ist eine Messung mit einer Zahl am Ende.

2. **Ausgeben.** Die Gebaeude als ``data/build/buildings.json`` (Grundrisse und
   Hoehen, fuer Bericht und Pruefung) und als ``app/public/models/messe.glb``
   (Waende, Daecher, Boden als Netz, damit die Karte auf einem echten Gelaende
   steht und begehbar wird).

Aufruf:
    python3 tools/build_buildings.py
"""
from __future__ import annotations

import itertools
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier import gltf, lod2  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LOD2_DIR = ROOT / "data" / "raw" / "lod2"
SITE = ROOT / "data" / "build" / "site.json"
OUT_JSON = ROOT / "data" / "build" / "buildings.json"
OUT_GLB = ROOT / "app" / "public" / "models" / "messe.glb"
ORTHO_META = ROOT / "data" / "build" / "ortho.json"

# Ausschnitt des Messegelaendes in UTM32. Grosszuegig genug fuer die Umgebung,
# eng genug, um nicht halb Deutz mitzunehmen.
BOUNDS = (357700.0, 5645200.0, 358900.0, 5646500.0)

# Ab welcher Grundflaeche ein Gebaeude als Halle in Frage kommt.
HALL_AREA_SQM = 2500.0
# Kleinstes Gebaeude, das ueberhaupt uebernommen wird.
MIN_AREA_SQM = 60.0
# Wie weit zwei Streckenlaengen auseinanderliegen duerfen, damit ein
# Korrespondenzpaar als Kandidat zaehlt.
SPAN_TOLERANCE_M = 25.0
# Ab welchem Anteil der Pruefpunkte ein Gebaeude zu einer Halle gezaehlt wird.
# Darunter ist es ein Nachbargebaeude, das der Umriss streift.
MIN_BUILDING_SHARE = 0.10

# Farben der Teilnetze. Zurueckhaltend -- die Karte lebt von den Staenden,
# nicht vom Gebaeude.
# Farbe *und* Textur je Flaechenart. Ein Senkrechtluftbild zeigt Boden und
# Daecher -- fuer Waende gibt es keine Aufnahme, die bleiben prozedural.
# Wo eine Textur liegt, ist die Grundfarbe weiss, damit das Bild nicht
# eingefaerbt wird.
COLOURS = {
    "wall": (0.62, 0.64, 0.68, 1.0),
    "roof": (1.0, 1.0, 1.0, 1.0),
    "ground": (0.72, 0.73, 0.75, 1.0),
    "closure": (0.62, 0.64, 0.68, 1.0),
}
# Nur das Dach. Das Senkrechtluftbild zeigt Daecher -- auf dem Hallenboden
# waere es das Foto des Daches darueber, also schlicht das falsche Bild.
# Boeden und Waende bekommen prozedurale Texturen in der App.
TEXTURED = {"roof": "ortho"}


def centroid(ring) -> tuple[float, float]:
    return (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))


def inside(poly, point) -> bool:
    x, y = point
    hit = False
    for index in range(len(poly)):
        ax, ay = poly[index][0], poly[index][1]
        bx, by = poly[index - 1][0], poly[index - 1][1]
        if (ay > y) != (by > y) and x < ax + (y - ay) * (bx - ax) / (by - ay):
            hit = not hit
    return hit


def sample_points(ring) -> list[tuple[float, float]]:
    """Gitterpunkte innerhalb eines Grundrisses, zum Pruefen der Passung."""
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    step = max(8.0, (max(xs) - min(xs)) / 12)
    out = []
    x = min(xs) + step / 2
    while x < max(xs):
        y = min(ys) + step / 2
        while y < max(ys):
            if inside(ring, (x, y)):
                out.append((x, y))
            y += step
        x += step
    return out


class Fit:
    """Aehnlichkeitstransformation ohne Massstab, optional gespiegelt."""

    def __init__(self, cos: float, sin: float, tx: float, ty: float, mirror: bool):
        self.cos, self.sin, self.tx, self.ty, self.mirror = cos, sin, tx, ty, mirror

    def apply(self, x: float, y: float) -> tuple[float, float]:
        if self.mirror:
            x = -x
        return (self.cos * x - self.sin * y + self.tx,
                self.sin * x + self.cos * y + self.ty)

    def inverse(self, x: float, y: float) -> tuple[float, float]:
        dx, dy = x - self.tx, y - self.ty
        ix = self.cos * dx + self.sin * dy
        iy = -self.sin * dx + self.cos * dy
        return (-ix if self.mirror else ix, iy)

    @property
    def rotation_deg(self) -> float:
        return math.degrees(math.atan2(self.sin, self.cos))

    def as_dict(self) -> dict:
        return {"rotationDeg": round(self.rotation_deg, 4),
                "mirrored": self.mirror,
                "translation": [round(self.tx, 3), round(self.ty, 3)],
                "note": ("Von BEUTELTIER-Koordinaten nach ETRS89/UTM32. "
                         "Kein Massstab -- beide Systeme sind metrisch.")}

    @classmethod
    def between(cls, a, b, p, q, mirror: bool):
        ax, ay = a
        bx, by = b
        if mirror:
            ax, bx = -ax, -bx
        first = (bx - ax, by - ay)
        second = (q[0] - p[0], q[1] - p[1])
        if math.hypot(*first) < 1 or math.hypot(*second) < 1:
            return None
        rotation = math.atan2(second[1], second[0]) - math.atan2(first[1], first[0])
        cos, sin = math.cos(rotation), math.sin(rotation)
        return cls(cos, sin, p[0] - (cos * ax - sin * ay),
                   p[1] - (sin * ax + cos * ay), mirror)


def find_fit(halls: list[dict], footprints: list[list]) -> tuple[Fit, int, int, dict]:
    """Sucht die Transformation, die die meisten Pruefpunkte trifft."""
    boxed = []
    for ring in footprints:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        boxed.append((ring, (min(xs), min(ys), max(xs), max(ys))))

    def covered(point) -> bool:
        for ring, (minx, miny, maxx, maxy) in boxed:
            if minx <= point[0] <= maxx and miny <= point[1] <= maxy and inside(ring, point):
                return True
        return False

    samples: list[tuple[str, tuple[float, float]]] = []
    anchors: list[tuple[str, tuple[float, float]]] = []
    for hall in halls:
        ring = [(p[0], p[1]) for p in hall["footprint"]]
        anchors.append((hall["key"], centroid(ring)))
        samples += [(hall["key"], point) for point in sample_points(ring)]

    big = [centroid(ring) for ring in footprints
           if abs(lod2.ring_area(ring)) > HALL_AREA_SQM]

    best_fit, best_score = None, -1
    for (_ka, ca), (_kb, cb) in itertools.combinations(anchors, 2):
        span = math.dist(ca, cb)
        for cp, cq in itertools.permutations(big, 2):
            if abs(math.dist(cp, cq) - span) > SPAN_TOLERANCE_M:
                continue
            for mirror in (False, True):
                candidate = Fit.between(ca, cb, cp, cq, mirror)
                if candidate is None:
                    continue
                score = sum(1 for _key, point in samples
                            if covered(candidate.apply(*point)))
                if score > best_score:
                    best_fit, best_score = candidate, score

    if best_fit is None:
        raise ValueError("keine Passung gefunden")

    per_hall: dict[str, list[int]] = {}
    for key, point in samples:
        entry = per_hall.setdefault(key, [0, 0])
        entry[1] += 1
        if covered(best_fit.apply(*point)):
            entry[0] += 1

    return best_fit, best_score, len(samples), per_hall


def main() -> int:
    if not SITE.exists():
        print("data/build/site.json fehlt -- erst tools/build_site.py laufen lassen",
              file=sys.stderr)
        return 1
    tiles = sorted(LOD2_DIR.glob("*.gml"))
    if not tiles:
        print("keine LoD2-Kacheln -- erst tools/fetch_lod2.py laufen lassen",
              file=sys.stderr)
        return 1

    print("LoD2-Kacheln lesen ...")
    buildings: list[lod2.Building] = []
    for tile in tiles:
        found = lod2.read_buildings(tile, BOUNDS)
        buildings += found
        print(f"  {tile.name}: {len(found)} Gebaeude im Ausschnitt")

    buildings = [b for b in buildings
                 if len(b.footprint()) >= 3
                 and abs(lod2.ring_area(b.footprint())) >= MIN_AREA_SQM]
    footprints = [b.footprint() for b in buildings]
    print(f"  {len(buildings)} Gebaeude uebernommen")

    site = json.loads(SITE.read_text(encoding="utf-8"))
    measured = [h for h in site["halls"] if h["placement"]["source"] == "procrustes"]
    print(f"\nEinpassen gegen {len(measured)} eingemessene Hallen ...")
    fit, score, total, per_hall = find_fit(measured, footprints)
    share = 100.0 * score / total
    print(f"  Drehung {fit.rotation_deg:.3f} Grad, "
          f"Spiegelung {'ja' if fit.mirror else 'nein'}")
    print(f"  {score} von {total} Pruefpunkten im Gebaeude ({share:.0f} %)")
    for key in sorted(per_hall):
        hit, count = per_hall[key]
        print(f"    {key:<6} {hit:4d}/{count:<4d} {100 * hit / count:3.0f} %")

    # --- Ausgabe: Grundrisse und Hoehen in Gelaendekoordinaten ---------------
    ground_level = min((b.ground_height for b in buildings
                        if b.ground_height is not None), default=0.0)

    records = []
    for building in buildings:
        ring = building.footprint()
        low, high = building.height_range()
        records.append({
            "id": building.id,
            "areaSqm": round(abs(lod2.ring_area(ring)), 1),
            "groundM": round((building.ground_height or low) - ground_level, 2),
            "heightM": round(high - low, 2),
            "roofType": building.roof_type,
            "footprint": [[round(v, 2) for v in fit.inverse(x, y)] for x, y in ring],
        })
    records.sort(key=lambda r: -r["areaSqm"])

    # --- Welches Gebaeude gehoert zu welcher Halle --------------------------
    # Ueber Enthaltensein, nicht ueber Naehe: eine Halle gehoert in das
    # Gebaeude, in dem ihre belegte Flaeche liegt. Mehrere Hallenebenen
    # teilen sich dabei ein Gebaeude -- 10.1 und 10.2 stehen uebereinander.
    halls_by_building: dict[str, list[tuple[str, float]]] = {}
    hall_building: dict[str, dict] = {}
    for hall in site["halls"]:
        if hall.get("outdoor"):
            continue
        points = sample_points([(p[0], p[1]) for p in hall["footprint"]])
        if not points:
            continue
        tally: dict[str, int] = {}
        outside = 0
        for point in points:
            for record in records:
                if inside(record["footprint"], point):
                    tally[record["id"]] = tally.get(record["id"], 0) + 1
                    break
            else:
                outside += 1
        if not tally:
            continue

        # Eine Halle kann sich ueber mehrere Gebaeude erstrecken -- Halle 5
        # tut das. Wer nur das groesste nimmt, bekommt eine belegte Flaeche,
        # die groesser ist als "ihr" Gebaeude, und das ist Unsinn.
        chosen = [(bid, count) for bid, count in tally.items()
                  if count / len(points) >= MIN_BUILDING_SHARE]
        if not chosen:
            chosen = [max(tally.items(), key=lambda item: item[1])]
        chosen.sort(key=lambda item: -item[1])
        parts = [next(r for r in records if r["id"] == bid) for bid, _ in chosen]
        covered_points = sum(count for _, count in chosen)

        for record in parts:
            halls_by_building.setdefault(record["id"], []).append(
                (hall["key"], covered_points / len(points)))
        hall_building[hall["key"]] = {
            "buildingIds": [record["id"] for record in parts],
            "coveragePct": round(100 * covered_points / len(points), 1),
            "outsideAnyBuildingPct": round(100 * outside / len(points), 1),
            "buildingAreaSqm": round(sum(record["areaSqm"] for record in parts), 1),
            "buildingHeightM": max(record["heightM"] for record in parts),
            "groundM": min(record["groundM"] for record in parts),
            "occupiedAreaSqm": hall["area"]["extentAreaSqm"],
            "officialAreaSqm": hall["area"]["officialAreaSqm"],
        }

    for record in records:
        assigned = halls_by_building.get(record["id"])
        if assigned:
            record["hallKeys"] = [key for key, _ in sorted(assigned)]

    named = sum(1 for r in records if r.get("hallKeys"))
    print(f"  {len(hall_building)} Hallenebenen einem Gebaeude zugeordnet, "
          f"{named} Gebaeude benannt")

    payload = {
        "schema": "beuteltier.buildings.v1",
        "source": {
            "title": "3D-Gebaeudemodell LoD2 (CityGML)",
            "provider": "Geobasis NRW",
            "licence": "Datenlizenz Deutschland Zero 2.0",
            "crs": "ETRS89 / UTM32N, Hoehen DHHN2016 NH",
            "groundReferenceM": round(ground_level, 2),
        },
        "fit": {**fit.as_dict(), "samples": total, "inside": score,
                "sharePct": round(share, 1),
                "perHall": {k: {"inside": v[0], "samples": v[1]}
                            for k, v in sorted(per_hall.items())}},
        # Der Umriss, mit dem geroutet wird, bleibt die *belegte* Flaeche.
        # Hier steht daneben, wie gross das Gebaeude wirklich ist -- beides
        # getrennt, damit niemand das eine fuer das andere haelt.
        "hallBuildings": dict(sorted(hall_building.items())),
        "note": [
            "Der Gebaeudeumriss ersetzt den Routing-Umriss nicht. Wo gamescom",
            "nur einen Teil einer Halle belegt, waere die uebrige Flaeche im",
            "Wegenetz begehbar, obwohl sie waehrend der Messe abgetrennt sein",
            "kann. Die Zahl steht trotzdem hier: sie sagt, wie viel vom",
            "Gebaeude ueberhaupt bespielt wird.",
        ],
        "buildings": records,
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False,
                                   separators=(",", ":")), encoding="utf-8")
    print(f"\n{len(records)} Gebaeude -> {OUT_JSON}")

    # --- Ausgabe: begehbares Netz -------------------------------------------
    # Das Luftbild deckt einen bekannten Ausschnitt ab. Die UV-Koordinaten
    # sind daraus reine Rechnung: keine Zuordnung von Hand, keine Naht.
    ortho = (json.loads(ORTHO_META.read_text(encoding="utf-8"))
             if ORTHO_META.exists() else None)
    if ortho:
        ox0, oy0, ox1, oy1 = ortho["extent"]
        span_x = ox1 - ox0
        span_y = oy1 - oy0

        def planar_uv(point):
            # Szenenpunkt ist (x, hoehe, -y); das Bild beginnt oben bei y1.
            return ((point[0] - ox0) / span_x, (oy1 + point[2]) / span_y)
    else:
        planar_uv = None
        print("  ! ortho.json fehlt -- Modell bleibt ohne Textur", file=sys.stderr)

    parts = {kind: gltf.Part(name=kind, colour=colour,
                             texture=(TEXTURED.get(kind) if ortho else None))
             for kind, colour in COLOURS.items()}
    skipped = 0
    for building in buildings:
        for surface in building.surfaces:
            part = parts.get(surface.kind)
            if part is None:
                continue
            # Triangulierung und Punktliste muessen dieselbe Anbindung der
            # Loecher benutzen, sonst zeigen die Indizes ins Leere.
            triangles, points = lod2.triangulate_with_points(
                surface.ring, surface.holes)
            if not triangles:
                skipped += 1
                continue
            scene = [(lambda p: (p[0], z - ground_level, -p[1]))(fit.inverse(x, y))
                     for x, y, z in points]
            uv = planar_uv if part.texture else None
            for a, b, c in triangles:
                part.add_triangle(scene[a], scene[b], scene[c], uv)

    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    size = gltf.write_glb(
        OUT_GLB, list(parts.values()),
        generator="BEUTELTIER aus LoD2 (Geobasis NRW)",
        extras={"crsNote": "BEUTELTIER-Gelaendemeter, x rechts, y hoch, z sued",
                "groundReferenceM": round(ground_level, 2),
                "licence": "Datenlizenz Deutschland Zero 2.0",
                **({"ortho": ortho["image"], "orthoExtent": ortho["extent"]}
                   if ortho else {})})
    triangles = sum(part.triangle_count for part in parts.values())
    print(f"{triangles} Dreiecke, {size / 1e6:.1f} MB -> {OUT_GLB}")
    if skipped:
        print(f"  {skipped} Flaechen ohne Triangulierung uebersprungen")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
