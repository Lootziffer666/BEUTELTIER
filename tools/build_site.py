#!/usr/bin/env python3
"""Baut das Geländemodell: alle Hallen, Staende und Durchgaenge in einem System.

Die Quellen ergaenzen sich, und keine allein reicht:

* Die **Hallenplan-Schnittstelle** liefert Standflaechen metrisch exakt, aber
  jede Halle in eigenen lokalen Koordinaten.
* Der **gamescom-Hallenplan 2025** zeigt die Hallen der Ebene 1 gemeinsam --
  daraus folgt ueber die Standcodes, wo jede Halle liegt.
* Die **Layout-Tabelle** der interaktiven Karte kennt alle Hallen und die
  Durchgaenge zwischen ihnen, aber nur grob.

Das Ergebnis landet in ``data/build/site.json``. Jede Halle traegt aus, woher
ihre Lage stammt und wie gross der Restfehler ist.

Aufruf:
    python3 tools/build_site.py
"""
from __future__ import annotations

import json
import re
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier import accessibility, georef, hallplan, pdf_vector  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITEMAP_PDF = ROOT / "data" / "raw" / "pdf" / "gamescom-2025-hallenplan.pdf"
ACCESS_PDF = ROOT / "data" / "raw" / "pdf" / "koelnmesse-barrierefrei.pdf"
LAYOUT = ROOT / "data" / "raw" / "hall-layout.json"
OUT = ROOT / "data" / "build" / "site.json"

# Hoehe je Ebene in Metern. Die Hallen der Koelnmesse sind zweigeschossig mit
# rund zehn Metern lichter Hoehe je Ebene; fuer die Darstellung reicht das.
LEVEL_HEIGHT_M = 11.0
HALL_WALL_HEIGHT_M = 9.5

# Welche Ebene ihre Lage von welcher erbt. Halle 10.2 liegt baulich unmittelbar
# ueber 10.1 und teilt deren Grundriss.
STACKED_ON = {"10.2": "10.1", "2.2": "2.1", "4.2": "4.1", "5.2": "5.1",
              "3.2": "3.1", "1.2": "1.1", "11.2": "11.1"}

# "Freiflaeche Halle 5 Nord" -> Bezugshalle 5, Seite Nord.
OUTDOOR_SIDE = re.compile(r"Halle\s+(\d+)\s+(Nord|Sued|Ost|West)", re.IGNORECASE)
# Norden zeigt im Gelaendesystem nach oben, Osten nach rechts.
COMPASS = {"nord": (0.0, 1.0), "sued": (0.0, -1.0), "ost": (1.0, 0.0), "west": (-1.0, 0.0)}
OUTDOOR_GAP_M = 25.0


def _round_points(points, digits: int = 2) -> list[list[float]]:
    return [[round(x, digits), round(y, digits)] for x, y in points]


def main() -> int:
    if not LAYOUT.exists():
        print("data/raw/hall-layout.json fehlt -- erst tools/fetch_hall_layout.py laufen lassen",
              file=sys.stderr)
        return 1

    levels = hallplan.load_levels()
    if not levels:
        print("keine Hallenplan-Schnappschuesse -- erst tools/fetch_hallplan.py laufen lassen",
              file=sys.stderr)
        return 1

    by_key = {level.key: level for level in levels}

    print("2025er Hallenplan lesen ...")
    runs = pdf_vector.read_text_runs(SITEMAP_PDF)
    polygons = georef.booth_polygons(pdf_vector.read_paths(SITEMAP_PDF))
    labels = georef.booth_labels(runs, polygons)
    print(f"  {len(polygons)} Standflaechen, {len(labels)} Standcodes mit Lage")

    # --- Stufe 1: Hallen mit 2025er Standdaten exakt einpassen ----------------
    transforms: dict[str, georef.Transform] = {}
    for key, level in by_key.items():
        fitted = georef.fit_hall(level, labels, key)
        if fitted is not None:
            transforms[key] = fitted

    # --- Stufe 2: gestapelte Ebenen erben ihre Lage --------------------------
    for upper, lower in STACKED_ON.items():
        if upper in by_key and upper not in transforms and lower in transforms:
            transforms[upper] = georef.derive_stacked(transforms[lower])

    # --- Stufe 3: Rest ueber den Barrierefrei-Plan platzieren ----------------
    # Hallen 3 und 11 waren 2025 nicht mit gamescom-Staenden belegt, Halle 1 nur
    # ausserhalb des Plans. Ihre Lage kommt aus dem Uebersichtsplan der
    # Koelnmesse -- schematisch, aber die einzige Quelle, die alle Hallen zeigt.
    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))
    entries = {str(entry["halle"]): entry for entry in layout["entries"]}

    site_centres = {
        key: transform.apply(by_key[key].origin[0] + by_key[key].width_m / 2.0,
                             by_key[key].origin[1] + by_key[key].height_m / 2.0)
        for key, transform in transforms.items() if transform.source == "procrustes"
    }

    reference_runs = pdf_vector.read_text_ops(ACCESS_PDF)
    reference = accessibility.reference_points(reference_runs, level=1)
    params, fit_error, cross_error, supports = georef.fit_reference_plan(
        reference, site_centres)
    print(f"  Uebersichtsplan auf Gelaende gepasst: {supports} Stuetzen, "
          f"Restfehler {fit_error:.1f} m, kreuzvalidiert {cross_error:.1f} m")

    scale, rotation, tx, ty = params
    cos_r, sin_r = math.cos(rotation) * scale, math.sin(rotation) * scale

    for key, level in sorted(by_key.items()):
        if key in transforms or level.hall in hallplan.OUTDOOR_NAMES:
            continue  # Freiflaechen kommen in Stufe 4 an ihre Halle

        # Die Uebersicht beschriftet Ebene 1; eine Halle, die es nur im
        # Obergeschoss gibt, sitzt ueber ihrem Erdgeschoss-Pendant.
        point = reference.get(key) or reference.get(f"{level.hall}.1")
        if point is None:
            print(f"  ! {key}: keine Lage im Uebersichtsplan", file=sys.stderr)
            continue

        entry = entries.get(level.hall) or entries.get(key)
        rotation_deg = float(entry.get("rot") or 0.0) if entry else 0.0

        transforms[key] = georef.place_at(
            level,
            (cos_r * point[0] - sin_r * point[1] + tx,
             sin_r * point[0] + cos_r * point[1] + ty),
            rotation_deg,
            cross_error,
        )

    # Ebene 2 einer geschaetzten Halle erbt nun von der geschaetzten Ebene 1.
    for upper, lower in STACKED_ON.items():
        if upper in by_key and upper not in transforms and lower in transforms:
            transforms[upper] = georef.derive_stacked(transforms[lower])

    # --- Stufe 4: Freiflaechen an ihre Halle legen ---------------------------
    # Ihr Name sagt, wo sie liegen: "Freiflaeche Halle 5 Nord" grenzt noerdlich
    # an Halle 5. Die Halle selbst ist metrisch bekannt, also laesst sich die
    # Flaeche daneben setzen, statt sie zu raten.
    for key, level in sorted(by_key.items()):
        if key in transforms or level.hall not in hallplan.OUTDOOR_NAMES:
            continue

        match = OUTDOOR_SIDE.search(hallplan.OUTDOOR_NAMES[level.hall])
        host = transforms.get(f"{match.group(1)}.1") if match else None
        if host is None:
            print(f"  ! {key}: keine Bezugshalle fuer die Freiflaeche", file=sys.stderr)
            continue

        host_level = by_key[f"{match.group(1)}.1"]
        host_centre = host.apply(host_level.origin[0] + host_level.width_m / 2.0,
                                 host_level.origin[1] + host_level.height_m / 2.0)

        # Ausdehnung der Halle quer zur gesuchten Richtung, damit die Flaeche
        # neben und nicht auf der Halle landet.
        span = (host_level.height_m if abs(math.cos(host.rotation_rad)) > 0.5
                else host_level.width_m)
        offset = span / 2.0 + level.height_m / 2.0 + OUTDOOR_GAP_M
        dx, dy = COMPASS[match.group(2).lower()]

        transforms[key] = georef.place_at(
            level,
            (host_centre[0] + dx * offset, host_centre[1] + dy * offset),
            host.rotation_deg,
            max(cross_error, OUTDOOR_GAP_M),
        )

    # --- Ausgabe --------------------------------------------------------------
    halls = []
    stands_out = []
    for key in sorted(by_key):
        level = by_key[key]
        transform = transforms.get(key)
        if transform is None:
            continue

        base_y = 0.0 if level.level <= 1 else LEVEL_HEIGHT_M * (level.level - 1)
        corners = [
            (level.origin[0], level.origin[1]),
            (level.origin[0] + level.width_m, level.origin[1]),
            (level.origin[0] + level.width_m, level.origin[1] + level.height_m),
            (level.origin[0], level.origin[1] + level.height_m),
        ]

        halls.append({
            "key": key,
            "hall": level.hall,
            "level": level.level,
            "outdoor": level.hall in hallplan.OUTDOOR_NAMES,
            "name": hallplan.OUTDOOR_NAMES.get(level.hall, f"Halle {key}"),
            "widthM": round(level.width_m, 2),
            "depthM": round(level.height_m, 2),
            "baseY": base_y,
            "wallHeightM": 0.0 if level.hall in hallplan.OUTDOOR_NAMES else HALL_WALL_HEIGHT_M,
            "footprint": _round_points(transform.apply(x, y) for x, y in corners),
            "blocks": [_round_points(transform.apply(x, y) for x, y in block)
                       for block in level.blocks],
            "placement": {
                "source": transform.source,
                "samples": transform.sample_count,
                "residualM": (None if math.isnan(transform.residual_m)
                              else round(transform.residual_m, 2)),
                "maxResidualM": (None if math.isnan(transform.max_residual_m)
                                 else round(transform.max_residual_m, 2)),
                "rotationDeg": round(transform.rotation_deg, 2),
            },
        })

        for stand in level.stands:
            stands_out.append({
                "id": f"{key}:{stand.code}",
                "hallKey": key,
                "level": level.level,
                "code": stand.code,
                "codes": list(stand.codes),
                "areaSqm": round(stand.area_sqm, 1),
                "baseY": base_y,
                "polygon": _round_points(transform.apply(x, y) for x, y in stand.polygon),
            })

    # --- Durchgaenge aus der Layout-Tabelle ----------------------------------
    # Die Tabelle lebt in ihrem eigenen Zeichenraum und braucht eine eigene
    # Transformation -- die des Uebersichtsplans passt hier nicht. Gestuetzt
    # wird wieder auf die exakt bekannten Hallen.
    def outline_centre(coord) -> tuple[float, float]:
        xs = [p[0] for p in coord]
        ys = [p[1] for p in coord]
        # Der Zeichenraum der Karte ist gegenueber dem Gelaende gespiegelt;
        # ohne die Spiegelung liesse sich das nur als Drehung annaehern und der
        # Restfehler bliebe fuenfmal so gross.
        return (sum(xs) / len(xs), -sum(ys) / len(ys))

    layout_reference = {key: outline_centre(entry["coord"])
                        for key, entry in entries.items() if entry.get("coord")}
    layout_supports = {key.split(".")[0]: centre
                       for key, centre in site_centres.items() if key.endswith(".1")}
    layout_params, layout_error, layout_cross, layout_n = georef.fit_reference_plan(
        layout_reference, layout_supports)
    print(f"  Layout-Tabelle auf Gelaende gepasst: {layout_n} Stuetzen, "
          f"Restfehler {layout_error:.1f} m, kreuzvalidiert {layout_cross:.1f} m")

    l_scale, l_rotation, l_tx, l_ty = layout_params
    l_cos, l_sin = math.cos(l_rotation) * l_scale, math.sin(l_rotation) * l_scale

    connectors = []
    for key, entry in entries.items():
        coord = entry.get("coord") or []
        if not coord:
            continue
        connectors.append({
            "key": key,
            "passage": bool(entry.get("pure")),
            "note": entry.get("note") or "",
            "rotationDeg": entry.get("rot"),
            "uncertaintyM": round(layout_cross, 1),
            "outline": _round_points(
                (l_cos * x - l_sin * (-y) + l_tx, l_sin * x + l_cos * (-y) + l_ty)
                for x, y in coord),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "schema": "beuteltier.site.v1",
        "levelHeightM": LEVEL_HEIGHT_M,
        "referenceFit": {"supports": supports,
                         "residualM": round(fit_error, 1),
                         "crossValidatedM": round(cross_error, 1)},
        "halls": halls,
        "stands": stands_out,
        "connectors": connectors,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print()
    print(f"{len(halls)} Hallenebenen, {len(stands_out)} Staende, "
          f"{len(connectors)} Layout-Flaechen -> {OUT}")
    print()
    print("%-6s %-11s %7s %9s %9s" % ("Ebene", "Lage aus", "Stuetzen", "Rest(m)", "max(m)"))
    for hall in halls:
        p = hall["placement"]
        print("%-6s %-11s %7s %9s %9s" % (
            hall["key"], p["source"], p["samples"] or "-",
            "-" if p["residualM"] is None else f"{p['residualM']:.2f}",
            "-" if p["maxResidualM"] is None else f"{p['maxResidualM']:.2f}"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
