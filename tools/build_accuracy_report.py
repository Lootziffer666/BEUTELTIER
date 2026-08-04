#!/usr/bin/env python3
"""Schreibt aus dem gebauten Gelaendemodell einen Genauigkeitsbericht.

Der Bericht wird erzeugt und nicht gepflegt. Eine von Hand gefuehrte Tabelle
haette schon beim naechsten Rebuild nicht mehr gestimmt, und eine Zahl, der man
nicht trauen kann, ist schlechter als keine.

Aufruf:
    python3 tools/build_accuracy_report.py
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier import building  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "data" / "build" / "site.json"
GRAPH = ROOT / "data" / "build" / "graph.json"
OUT_JSON = ROOT / "data" / "build" / "accuracy-report.json"
OUT_MD = ROOT / "docs" / "accuracy-report.md"

# Ab hier gilt eine Lage nicht mehr als eingemessen.
ESTIMATED_THRESHOLD_M = 5.0


def classify(hall: dict) -> str:
    source = hall["placement"]["source"]
    if source == "procrustes":
        return "eingemessen"
    if source == "abgeleitet":
        return "von der Ebene darunter uebernommen"
    return "geschaetzt"


def write_survey(halls: list[dict], connectors: list[dict], summary: dict,
                 gaps: list[dict]) -> None:
    """Leitet aus dem verbleibenden Fehler ab, was vor Ort gemessen werden muss.

    Priorisiert wird nach dem, was die groesste Unsicherheit beseitigt -- nicht
    danach, was am leichtesten zu fotografieren ist.
    """
    lines: list[str] = []
    lines.append("# Was vor Ort gemessen werden muss")
    lines.append("")
    lines.append("Erzeugt von `tools/build_accuracy_report.py` aus dem verbleibenden Fehler")
    lines.append("des letzten Baus. Die Reihenfolge ist die Reihenfolge des Nutzens.")
    lines.append("")

    # 1. Hallen ohne eingemessene Lage -- der groesste Einzelposten.
    estimated = [h for h in halls if h["placementSource"] == "geschaetzt"]
    if estimated:
        lines.append("## 1. Hallenlagen einmessen")
        lines.append("")
        lines.append(f"Diese Hallen stehen auf **±{summary['referenceCrossValidatedM']} m** "
                     "genau. Das ist der groesste verbleibende Fehler der Karte.")
        lines.append("")
        lines.append("Gebraucht werden je Halle **drei bis vier Punkte**, deren Lage sich")
        lines.append("eindeutig benennen laesst -- Gebaeudeecken oder Standecken mit Standcode.")
        lines.append("Drei Punkte legen Drehung und Verschiebung fest, der vierte prueft nach.")
        lines.append("")
        for hall in estimated:
            area_hint = ""
            if hall["areaDeviationPct"] is not None:
                area_hint = (f" Der belegte Bereich weicht um {hall['areaDeviationPct']:+.1f} % "
                             "von der offiziellen Flaeche ab.")
            lines.append(f"- **{hall['key']}** — Ecken des belegten Bereichs, "
                         f"moeglichst weit auseinander.{area_hint}")
        lines.append("")

    # 2. Durchgaenge mit grosser Anschlussweite.
    loose = sorted(
        (c for c in connectors if (c.get("snapM") or 0) > 60),
        key=lambda c: -(c.get("snapM") or 0),
    )
    if loose:
        lines.append("## 2. Durchgaenge einmessen")
        lines.append("")
        lines.append("Bei diesen Verbindungen liegt die Lage aus der Layout-Tabelle weit vom")
        lines.append("naechsten Gangpunkt entfernt. Dass es sie gibt, ist belegt; wo genau,")
        lines.append("nicht. Gebraucht wird **je Seite ein Punkt**: wo man die eine Halle")
        lines.append("verlaesst und wo man die andere betritt.")
        lines.append("")
        for connector in loose:
            connects = " ↔ ".join(connector["connects"]) if connector.get("connects") else "?"
            lines.append(f"- **{connector['label'] or connector['id']}** ({connects}) — "
                         f"derzeit {connector['snapM']:.0f} m Anschlussweite")
        lines.append("")

    # 3. Ebenenwechsel -- synthetisch in der Hallenmitte angesetzt.
    verticals = [c for c in connectors if c["kind"] == "vertical"]
    if verticals:
        lines.append("## 3. Ebenenwechsel verorten")
        lines.append("")
        anchored = [c for c in verticals if c.get("positionSource", "").startswith("beobachtet")]
        loose_v = [c for c in verticals if c not in anchored]
        lines.append("Gebraucht wird je Anlage:")
        lines.append("")
        lines.append("- die **untere** Landung, benannt ueber den naechsten Standcode")
        lines.append("- die **obere** Landung, ebenso")
        lines.append("- bei Rolltreppen die **Richtung** und ob sie tageszeitabhaengig wechselt")
        lines.append("")
        if loose_v:
            lines.append("Diese sitzen noch rechnerisch in der Hallenmitte, weil ihr Standort")
            lines.append("in keiner Quelle steht:")
            lines.append("")
            for connector in loose_v:
                connects = " ↔ ".join(connector["connects"]) if connector.get("connects") else "?"
                lines.append(f"- **{connector['label'] or connector['id']}** ({connects})")
            lines.append("")
        if anchored:
            lines.append("Diese haengen an einer Beobachtung und einem verorteten Tor. Sie")
            lines.append("brauchen keine Neuvermessung, sondern eine Bestaetigung:")
            lines.append("")
            for connector in anchored:
                connects = " ↔ ".join(connector["connects"]) if connector.get("connects") else "?"
                lines.append(f"- **{connector['label'] or connector['id']}** ({connects})")
            lines.append("")

    questions = {q["what"]: q for c in connectors for q in c.get("openQuestions", [])}
    if questions:
        lines.append("## 3b. Offene Fragen, die eine Antwort sofort aufloest")
        lines.append("")
        lines.append("Diese Punkte haengen an einer einzigen Angabe. Solange sie offen sind,")
        lines.append("bleibt die betroffene Lage stehen, wie sie ist -- geraten wird nicht.")
        lines.append("")
        for question in questions.values():
            lines.append(f"- **{question['what']}**")
            lines.append(f"  - loest sich mit: {question['resolvesWith']}")
            lines.append(f"  - Beobachtung: `{question['observation']}`")
        lines.append("")

    if gaps:
        lines.append("## 3c. Anlagen, die es gibt, deren Lage aber fehlt")
        lines.append("")
        lines.append("Beschilderung vor Ort nennt mehr, als die Technischen Richtlinien")
        lines.append("fuehren. Gebraucht wird je Anlage ein Foto, auf dem das Torschild und")
        lines.append("ein benennbarer Punkt gleichzeitig zu sehen sind.")
        lines.append("")
        lines.append("| Halle | Anlage | Bekannt | Fehlt |")
        lines.append("|---|---|---|---|")
        for gap in gaps:
            lines.append(f"| {gap['hallKey']} | {gap['kind']} {gap['designator']} | "
                         f"{gap['known']} | {gap['missing']} |")
        lines.append("")

    lines.append("## 4. Betriebszustaende, die in keiner Quelle stehen")
    lines.append("")
    lines.append("Diese Angaben lassen sich nicht aus Plaenen ableiten und aendern sich")
    lines.append("waehrend der Messe. Sie sind der Grund, warum jede Verbindung als")
    lines.append("`unbestaetigt` startet:")
    lines.append("")
    lines.append("- Rolltreppenrichtungen je Tageszeit")
    lines.append("- welche Durchgaenge Einbahn, nur Eingang oder nur Ausgang sind")
    lines.append("- Treppen, die der Barrierefrei-Plan nicht zeigt (er kennt nur Aufzuege)")
    lines.append("- Consumer-, Business- und Pressezugaenge")
    lines.append("")

    lines.append("## Was ein Foto leisten muss, um zu helfen")
    lines.append("")
    lines.append("Ein Bild wird erst zur Messung, wenn sich daraus ein **benennbarer Punkt**")
    lines.append("ergibt. Brauchbar ist deshalb ein Foto, auf dem gleichzeitig zu sehen ist:")
    lines.append("")
    lines.append("- ein Standschild mit Code, eine Hallennummer oder eine Tuerbeschriftung")
    lines.append("- und das gesuchte Bauteil -- Durchgang, Rolltreppe, Aufzug, Treppe")
    lines.append("")
    lines.append("Ein Foto ohne lesbare Beschriftung zeigt, **dass** es etwas gibt, aber nicht")
    lines.append("**wo**. Es hilft beim Bestaetigen, nicht beim Einmessen.")
    lines.append("")

    (ROOT / "docs" / "field-survey.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    if not SITE.exists():
        print("data/build/site.json fehlt -- erst tools/build_all.py laufen lassen",
              file=sys.stderr)
        return 1

    site = json.loads(SITE.read_text(encoding="utf-8"))
    graph = json.loads(GRAPH.read_text(encoding="utf-8")) if GRAPH.exists() else {"connectors": []}
    buildings = building.Buildings()

    halls = []
    for hall in sorted(site["halls"], key=lambda h: h["key"]):
        placement = hall["placement"]
        area = hall["area"]
        height = hall["height"]
        halls.append({
            "key": hall["key"],
            "placementSource": placement["source"],
            "placementLabel": classify(hall),
            "supports": placement["samples"],
            "residualM": placement["residualM"],
            "maxResidualM": placement["maxResidualM"],
            "rotationDeg": placement["rotationDeg"],
            "outlineSource": area["outlineSource"],
            "extentAreaSqm": area["extentAreaSqm"],
            "officialAreaSqm": area["officialAreaSqm"],
            "areaDeviationPct": area["deviationPct"],
            "floorElevationRenderM": height["floorElevationRenderM"],
            "floorElevationMinM": height["floorElevationMinM"],
            "floorElevationMaxM": height["floorElevationMaxM"],
            "clearHeightM": height["clearHeightM"],
            "heightSource": height["heightSource"],
            "heightUncertaintyM": height["heightUncertaintyM"],
            "routable": hall.get("routable", True),
        })

    connectors = []
    for node in graph.get("connectors", []):
        meta = node.get("meta") or {}
        connectors.append({
            "id": node["id"],
            "kind": node["kind"],
            "label": node.get("label", ""),
            "connects": meta.get("connects"),
            "snapM": meta.get("snapM"),
            "uncertaintyM": meta.get("uncertaintyM"),
            "positionSource": meta.get("positionSource") or meta.get("source"),
            "openQuestions": meta.get("openQuestions") or [],
        })

    measured = [h for h in halls if h["placementSource"] == "procrustes"]
    estimated = [h for h in halls if h["placementSource"] == "geschaetzt"]
    deviations = [abs(h["areaDeviationPct"]) for h in halls
                  if h["areaDeviationPct"] is not None]
    snaps = [c["snapM"] for c in connectors if c.get("snapM") is not None]

    summary = {
        "hallLevels": len(halls),
        "measured": len(measured),
        "estimated": len(estimated),
        "measuredResidualMeanM": round(
            statistics.mean(h["residualM"] for h in measured), 3) if measured else None,
        "measuredResidualMaxM": round(
            max(h["maxResidualM"] for h in measured), 3) if measured else None,
        "areaDeviationMeanPct": round(statistics.mean(deviations), 1) if deviations else None,
        "areaDeviationMedianPct": round(statistics.median(deviations), 1) if deviations else None,
        "referenceCrossValidatedM": site["referenceFit"]["crossValidatedM"],
        "slabAssumptionM": site["slabAssumptionM"],
        "connectorSnapMaxM": round(max(snaps), 1) if snaps else None,
        "connectorSnapMedianM": round(statistics.median(snaps), 1) if snaps else None,
    }

    OUT_JSON.write_text(json.dumps(
        {"schema": "beuteltier.accuracy.v1", "summary": summary,
         "halls": halls, "connectors": connectors},
        ensure_ascii=False, indent=1), encoding="utf-8")

    lines: list[str] = []
    lines.append("# Genauigkeitsbericht")
    lines.append("")
    lines.append("Erzeugt von `tools/build_accuracy_report.py`. Nicht von Hand pflegen --")
    lines.append("die Zahlen kommen aus dem jeweils letzten Bau.")
    lines.append("")
    lines.append(f"- Hallenebenen: **{summary['hallLevels']}**, davon "
                 f"{summary['measured']} eingemessen und {summary['estimated']} geschaetzt")
    lines.append(f"- Restfehler der eingemessenen Hallen: "
                 f"**{summary['measuredResidualMeanM']} m** im Mittel, "
                 f"maximal {summary['measuredResidualMaxM']} m")
    lines.append(f"- Lage der geschaetzten Hallen: "
                 f"**±{summary['referenceCrossValidatedM']} m** (kreuzvalidiert)")
    lines.append(f"- Flaechenabweichung gegen die offiziellen Hallenflaechen: "
                 f"**{summary['areaDeviationMeanPct']} %** im Mittel, "
                 f"{summary['areaDeviationMedianPct']} % im Median")
    lines.append(f"- Angenommene Geschossdecke: "
                 f"{summary['slabAssumptionM'][0]}–{summary['slabAssumptionM'][1]} m")
    lines.append("")

    lines.append("## Hallenebenen")
    lines.append("")
    lines.append("| Ebene | Lage aus | Stützen | Rest (m) | max (m) | Umriss | belegt m² | "
                 "offiziell m² | Abw. | Boden (m) | lichte H (m) | Höhe aus |")
    lines.append("|---|---|--:|--:|--:|---|--:|--:|--:|--:|--:|---|")
    def number(value: float | None, spec: str = ".2f") -> str:
        return "—" if value is None else format(value, spec)

    for hall in halls:
        flag = "" if hall["routable"] else " ⚠"
        cells = [
            f"{hall['key']}{flag}",
            hall["placementLabel"],
            str(hall["supports"] or "—"),
            number(hall["residualM"]),
            number(hall["maxResidualM"]),
            hall["outlineSource"],
            number(hall["extentAreaSqm"], ".0f"),
            str(hall["officialAreaSqm"] or "—"),
            "—" if hall["areaDeviationPct"] is None else f"{hall['areaDeviationPct']:+.1f} %",
            number(hall["floorElevationRenderM"]),
            number(hall["clearHeightM"]),
            hall["heightSource"],
        ]
        lines.append("| " + " | ".join(cells) + " |")
    lines.append("")

    lines.append("## Verbindungen")
    lines.append("")
    lines.append("Die Anschlussweite ist der Abstand zwischen der Lage aus der Layout-Tabelle")
    lines.append("und dem naechsten begehbaren Gangpunkt. Grosse Werte heissen nicht, dass es")
    lines.append("den Durchgang nicht gibt -- nur, dass seine Lage grob bekannt ist.")
    lines.append("")
    lines.append("| Verbindung | Art | verbindet | Anschluss (m) |")
    lines.append("|---|---|---|--:|")
    for connector in sorted(connectors, key=lambda c: -(c.get("snapM") or 0)):
        connects = " ↔ ".join(connector["connects"]) if connector.get("connects") else "—"
        snap = connector.get("snapM")
        lines.append(f"| {connector['label'] or connector['id']} | {connector['kind']} | "
                     f"{connects} | {'—' if snap is None else f'{snap:.0f}'} |")
    lines.append("")

    unrouted = [h for h in halls if not h["routable"]]
    if unrouted:
        lines.append("## Nicht im Routing")
        lines.append("")
        for hall in unrouted:
            entry = buildings.entry(hall["key"]) or {}
            reason = entry.get("routableReason") or ["Kein Grund hinterlegt."]
            lines.append(f"- **{hall['key']}**: " + " ".join(reason))
        lines.append("")

    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    write_survey(halls, connectors, summary, site.get("facilityGaps", []))

    print(f"{len(halls)} Hallenebenen, {len(connectors)} Verbindungen")
    print(f"Restfehler eingemessen: {summary['measuredResidualMeanM']} m "
          f"(max {summary['measuredResidualMaxM']} m)")
    print(f"Flaechenabweichung: {summary['areaDeviationMeanPct']} % Mittel, "
          f"{summary['areaDeviationMedianPct']} % Median")
    print(f"-> {OUT_JSON}")
    print(f"-> {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
