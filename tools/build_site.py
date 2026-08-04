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

from beuteltier import (accessibility, building, georef, hallplan,  # noqa: E402
                        pdf_vector, techguide)

ROOT = Path(__file__).resolve().parent.parent
SITEMAP_PDF = ROOT / "data" / "raw" / "pdf" / "gamescom-2025-hallenplan.pdf"
ACCESS_PDF = ROOT / "data" / "raw" / "pdf" / "koelnmesse-barrierefrei.pdf"
TECHGUIDE_PDF = ROOT / "data" / "raw" / "pdf" / "technische-richtlinien-2022.pdf"
LAYOUT = ROOT / "data" / "raw" / "hall-layout.json"
OUT = ROOT / "data" / "build" / "site.json"

# Die Hoehen kommen jetzt aus data/curated/hall-metadata.json. Diese Festwerte
# bleiben nur als Rueckfallebene stehen, falls die Datei fehlt -- sie duerfen
# die Geometrie nicht mehr bestimmen.
LEGACY_LEVEL_HEIGHT_M = 11.0
LEGACY_WALL_HEIGHT_M = 9.5

# Welche Ebene ihre Lage von welcher erbt. Halle 10.2 liegt baulich unmittelbar
# ueber 10.1 und teilt deren Grundriss.
STACKED_ON = {"10.2": "10.1", "2.2": "2.1", "4.2": "4.1", "5.2": "5.1",
              "3.2": "3.1", "1.2": "1.1", "11.2": "11.1"}

# Welche Ebene baulich unter welcher liegt -- fuer das Hoehenmodell. Halle 1.2
# ist eingeschossig und steht trotz der Ziffer 2 im Schluessel auf dem Boden;
# sie taucht hier deshalb nicht auf.
STACKED_ON_LOWER = {"2.2": "2.1", "3.2": "3.1", "4.2": "4.1", "5.2": "5.1",
                    "10.2": "10.1", "11.2": "11.1"}

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

    buildings = building.Buildings()

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

    # Zwei schematische Uebersichtsplaene kommen als Ersatzquelle in Frage. Statt
    # einen davon zu waehlen, werden beide gegen die eingemessenen Hallen
    # geprueft und der genauere genommen -- das ist eine Messung, keine
    # Geschmacksfrage.
    candidates: list[tuple[str, dict, tuple, float, float, int]] = []

    access_points = accessibility.reference_points(
        pdf_vector.read_text_ops(ACCESS_PDF), level=1)
    candidates.append(("Barrierefrei-Plan", access_points,
                       *georef.fit_reference_plan(access_points, site_centres)))

    # Die Technischen Richtlinien fuehren einen Aufzugsplan, dessen
    # Hallenmarken sich ebenfalls einpassen lassen -- und der Aufzuege verortet.
    _, techguide_halls = techguide.read_marks(TECHGUIDE_PDF, techguide.ELEVATOR_PAGE)
    if len(set(techguide_halls) & set(k.split(".")[0] for k in site_centres)) >= 4:
        base_centres = {key.split(".")[0]: value for key, value in site_centres.items()
                        if key.endswith(".1")}
        try:
            candidates.append(("Technische Richtlinien", techguide_halls,
                               *georef.fit_reference_plan(techguide_halls, base_centres)))
        except ValueError:
            pass

    for name, _points, _params, fit, cross, count in candidates:
        print(f"  {name}: {count} Stuetzen, Restfehler {fit:.1f} m, "
              f"kreuzvalidiert {cross:.1f} m")

    chosen = min(candidates, key=lambda entry: entry[4])
    reference_name, reference, params, fit_error, cross_error, supports = chosen
    print(f"  -> genommen wird der genauere: {reference_name} (±{cross_error:.1f} m)")

    scale, rotation, tx, ty = params
    cos_r, sin_r = math.cos(rotation) * scale, math.sin(rotation) * scale

    for key, level in sorted(by_key.items()):
        if key in transforms or level.hall in hallplan.OUTDOOR_NAMES:
            continue  # Freiflaechen kommen in Stufe 4 an ihre Halle

        # Die Uebersicht beschriftet Ebene 1; eine Halle, die es nur im
        # Obergeschoss gibt, sitzt ueber ihrem Erdgeschoss-Pendant.
        point = (reference.get(key) or reference.get(f"{level.hall}.1")
                 or reference.get(level.hall.split(".")[0]))
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

        outdoor = level.hall in hallplan.OUTDOOR_NAMES

        # Hoehenmodell: der Boden einer oberen Ebene ergibt sich aus der lichten
        # Hoehe darunter plus Geschossdecke, nicht aus einer Pauschale. Halle
        # 3.2 stand mit dem alten Festwert von 11 m mehr als vier Meter zu hoch.
        lower_key = STACKED_ON_LOWER.get(key)
        height = buildings.height_model(key, level.level, lower_key)
        base_y = height.floor_render_m

        corners = [
            (level.origin[0], level.origin[1]),
            (level.origin[0] + level.width_m, level.origin[1]),
            (level.origin[0] + level.width_m, level.origin[1] + level.height_m),
            (level.origin[0], level.origin[1] + level.height_m),
        ]

        # Die Umgrenzung ist der belegte Bereich, nicht der Gebaeudeumriss. Die
        # Bounding-Box der Schnittstelle greift bei L-foermigen Hallen weit
        # darueber hinaus; die Huelle der gezeichneten Flaechen trifft besser.
        content = [point for stand in level.stands for point in stand.polygon]
        content += [point for block in level.blocks for point in block]
        outline, outline_source = building.hall_outline(content, corners)
        footprint = [transform.apply(x, y) for x, y in outline]

        extent_area = building.polygon_area(footprint)
        official_area = buildings.official_area(key)
        area_check = {
            "extentAreaSqm": round(extent_area, 0),
            "officialAreaSqm": official_area,
            "deviationPct": (None if not official_area
                             else round(100 * (extent_area - official_area) / official_area, 1)),
            "outlineSource": outline_source,
            "note": ("Belegter Bereich, nicht der Gebaeudeumriss -- wo gamescom nur "
                     "einen Teil der Halle nutzt, faellt er kleiner aus."
                     if official_area else "Keine offizielle Flaeche hinterlegt."),
        }

        halls.append({
            "key": key,
            "hall": level.hall,
            "level": level.level,
            "outdoor": outdoor,
            "name": hallplan.OUTDOOR_NAMES.get(level.hall, f"Halle {key}"),
            "widthM": round(level.width_m, 2),
            "depthM": round(level.height_m, 2),
            "baseY": round(base_y, 2),
            # Die sichtbare Wandhoehe ist die lichte Hoehe der Ebene, gedeckelt
            # auf etwas Ansehnliches -- eine 15 m hohe Halle 8 wuerde die
            # Uebersicht sonst erschlagen.
            "wallHeightM": 0.0 if outdoor else round(min(height.clear_height_m, 12.0), 2),
            "height": height.as_dict(),
            "area": area_check,
            "routable": buildings.is_routable(key),
            "footprint": _round_points(footprint),
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

    # --- Aufzuege und Tore aus den Technischen Richtlinien --------------------
    # Die Richtlinien fuehren beide mit Kennbuchstaben und zeichnen sie auf
    # Uebersichtsplaenen ein. Damit stehen Aufzuege nicht mehr rechnerisch in
    # der Hallenmitte, sondern dort, wo die Koelnmesse sie eintraegt.
    facilities = []
    for page, kind in ((techguide.ELEVATOR_PAGE, "elevator"), (techguide.GATE_PAGE, "gate")):
        marks, plan_halls = techguide.read_marks(TECHGUIDE_PDF, page)
        if not marks:
            continue
        base_centres = {key.split(".")[0]: value for key, value in site_centres.items()
                        if key.endswith(".1")}
        try:
            plan_params, _plan_fit, plan_cross, plan_n = georef.fit_reference_plan(
                plan_halls, base_centres)
        except ValueError:
            print(f"  ! {kind}: Plan laesst sich nicht einpassen", file=sys.stderr)
            continue

        p_scale, p_rot, p_tx, p_ty = plan_params
        p_cos, p_sin = math.cos(p_rot) * p_scale, math.sin(p_rot) * p_scale
        for mark in marks:
            facilities.append({
                "id": f"{kind}:{mark.id}",
                "kind": kind,
                "hallKey": mark.hall_key,
                "designator": mark.designator,
                "position": [round(p_cos * mark.x - p_sin * mark.y + p_tx, 2),
                             round(p_sin * mark.x + p_cos * mark.y + p_ty, 2)],
                "source": "official",
                "uncertaintyM": round(plan_cross, 1),
            })
        print(f"  {kind}: {len(marks)} verortet, Plan auf ±{plan_cross:.1f} m "
              f"({plan_n} Stuetzen)")

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
        "schema": "beuteltier.site.v2",
        "slabAssumptionM": [buildings.slab_min, buildings.slab_max],
        "referenceFit": {"supports": supports,
                         "residualM": round(fit_error, 1),
                         "crossValidatedM": round(cross_error, 1)},
        "halls": halls,
        "stands": stands_out,
        "connectors": connectors,
        "facilities": facilities,
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
