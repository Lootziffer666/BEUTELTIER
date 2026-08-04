#!/usr/bin/env python3
"""Setzt das Wegenetz aus Hallengaengen, Portalen und Ebenenwechseln zusammen.

Innerhalb einer Halle entsteht das Gangnetz aus dem Negativraum zwischen den
Staenden (siehe ``beuteltier.graph``). Zwischen den Hallen zaehlt die
Durchgangstabelle der offiziellen Karte: sie benennt jede Verbindung im
Klartext, "Durchgang Halle 3 zu 4" oder "Passage 10-11".

Was daraus **nicht** folgt, ist der Betriebszustand. Ob ein Durchgang gerade
offen, Einbahn oder nur Ausgang ist, steht in keiner Quelle -- und aendert sich
waehrend der Messe. Alle Verbindungen starten deshalb als ``unbestaetigt``
offen, und die App ist der Ort, an dem das korrigiert wird.

Aufruf:
    python3 tools/build_graph.py
"""
from __future__ import annotations

import base64
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from beuteltier.graph import GRID_M, Edge, Graph, Node, attach_stands, build_hall_aisles  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "data" / "build" / "site.json"
FIELD_NOTES = ROOT / "data" / "curated" / "field-notes.json"
VERTICAL_ACCESS = ROOT / "data" / "curated" / "vertical-access.json"
OUT = ROOT / "data" / "build" / "graph.json"

# "Durchgang Halle 3 zu 4", "Passage 10-11", "Durchgang H1 H4", "Passage 4-5",
# "Durchgang zwischen Halle 1 und 6"
CONNECTS = re.compile(
    r"(?:Durchgang|Passage)\s+(?:zwischen\s+)?(?:Halle\s+|H)?(\d{1,2})"
    r"\s*(?:zu\s+|-|und\s+|\s)\s*(?:Halle\s+|H)?(\d{1,2})",
    re.IGNORECASE,
)

# Die Schluessel der Layout-Tabelle folgen einer Konvention: D oder P, gefolgt
# von den verbundenen Hallennummern -- "D67" verbindet Halle 6 und 7, "D109"
# die Hallen 10 und 9. Wo ein Klartextkommentar danebensteht, bestaetigt er das
# ausnahmslos ("D67" / "Durchgang halle 6 zu 7"). Gebraucht wird die Konvention
# fuer die Faelle ohne Kommentar -- ohne sie haengt Halle 8 am Netz vorbei.
PASSAGE_KEY = re.compile(r"^[DP](\d{2,4})$")

# "Freiflaeche Halle 8 Nord" -> Bezugshalle 8
OUTDOOR_HOST = re.compile(r"Halle\s+(\d+)", re.IGNORECASE)


def split_hall_digits(digits: str, known: set[str]) -> tuple[str, str] | None:
    """Zerlegt eine Ziffernfolge in zwei Hallennummern.

    "67" -> 6 und 7, "109" -> 10 und 9, "1011" -> 10 und 11. Mehrdeutige Faelle
    werden zugunsten der Zerlegung aufgeloest, bei der beide Teile bekannte
    Hallen sind.
    """
    for cut in range(1, len(digits)):
        left, right = digits[:cut], digits[cut:]
        if left in known and right in known and left != right:
            return left, right
    return None

# Wie weit ein Portal hoechstens von einem Gang entfernt sein darf, um daran
# angeschlossen zu werden.
PORTAL_SNAP_M = 90.0

# Ebenenwechsel: die Koelnmesse verbindet die Geschosse jeder zweigeschossigen
# Halle mit Aufzuegen und Rolltreppen. Wo genau, zeigt nur der
# Barrierefrei-Plan schematisch -- deshalb wird je Halle ein Wechsel in der
# Hallenmitte angesetzt und als unbestaetigt gefuehrt.
VERTICAL_PAIRS = [("2.1", "2.2"), ("4.1", "4.2"), ("5.1", "5.2"), ("10.1", "10.2")]

VERTICAL_NAMES = {"elevator": "Aufzug", "escalator": "Rolltreppe", "stairs": "Treppe"}


def resolve_level(hall: str, level: int, halls: dict) -> str | None:
    """Findet die passende Hallenebene, notfalls die einzige belegte."""
    exact = f"{hall}.{level}"
    if exact in halls:
        return exact
    candidates = sorted(k for k in halls if k.split(".")[0] == hall)
    return candidates[0] if len(candidates) == 1 else None


def nearest_aisle(graph: Graph, x: float, y: float, hall_key: str,
                  limit_m: float | None = None) -> tuple[str, float] | None:
    """Findet den naechsten Gangpunkt einer Halle und wie weit er entfernt ist.

    Ohne ``limit_m`` wird immer der naechste zurueckgegeben. Das ist Absicht:
    ein Durchgang, den die offizielle Karte im Klartext benennt, verbindet die
    beiden Hallen tatsaechlich -- nur seine Lage kennen wir bloss auf einige
    Dutzend Meter genau. Die Verbindung daran scheitern zu lassen, waere
    schlechter, als sie herzustellen und die Unsicherheit mitzugeben.
    """
    best: tuple[float, str] | None = None
    for node in graph.nodes.values():
        if node.kind != "aisle" or node.hall_key != hall_key:
            continue
        distance = math.dist((x, y), (node.x, node.y))
        if limit_m is not None and distance > limit_m:
            continue
        if best is None or distance < best[0]:
            best = (distance, node.id)
    return (best[1], best[0]) if best else None


def main() -> int:
    if not SITE.exists():
        print("data/build/site.json fehlt -- erst tools/build_site.py laufen lassen",
              file=sys.stderr)
        return 1

    site = json.loads(SITE.read_text(encoding="utf-8"))
    halls = {hall["key"]: hall for hall in site["halls"]}

    # Eine Beobachtung vor Ort kann eine Ableitung schlagen: wo jemand
    # gesehen hat, dass der Aufgang unmittelbar an einem verorteten Tor
    # liegt, erbt der Aufgang dessen Lage -- statt in der Hallenmitte zu
    # stehen, wo ihn niemand gesehen hat.
    facilities_by_id = {f["id"]: f for f in site.get("facilities", [])}
    anchors: dict[str, dict] = {}
    portal_notes: dict[frozenset[str], dict] = {}
    open_questions: dict[str, list[dict]] = {}
    if FIELD_NOTES.exists():
        notes = json.loads(FIELD_NOTES.read_text(encoding="utf-8"))
        for entry in notes.get("observations", []):
            anchor = entry.get("anchor")
            facility = facilities_by_id.get((anchor or {}).get("facilityId", ""))
            if anchor and facility:
                anchors[anchor["lowerKey"]] = {"facility": facility,
                                               "observation": entry["id"]}
            # Eine offene Frage ist auch ein Ergebnis. Sie haengt an der
            # Verbindung, damit niemand die Lage fuer geklaert haelt.
            question = entry.get("openQuestion")
            if question and question.get("appliesTo") and not question.get("answered"):
                open_questions.setdefault(question["appliesTo"], []).append(
                    {"observation": entry["id"], "what": question["what"],
                     "resolvesWith": question["resolvesWith"]})
            note = entry.get("portalNote")
            if note:
                portal_notes[frozenset(note["connects"])] = dict(
                    note, observation=entry["id"])


    stands_by_hall: dict[str, list[dict]] = defaultdict(list)
    for stand in site["stands"]:
        stands_by_hall[stand["hallKey"]].append(stand)

    graph = Graph()
    indices: dict[str, dict[tuple[int, int], str]] = {}

    print("Gangnetz je Hallenebene ...")
    for key, hall in sorted(halls.items()):
        stands = stands_by_hall.get(key, [])
        index = build_hall_aisles(graph, hall, stands)
        indices[key] = index
        attached = attach_stands(graph, hall, stands, index)
        print(f"  {key:<6} {len(index):5d} Gangpunkte, {attached:4d} von {len(stands):4d} "
              f"Staenden angebunden")

    # --- Portale zwischen den Hallen -----------------------------------------
    print("\nDurchgaenge ...")
    portals = 0
    known_halls = {key.split(".")[0] for key in halls}
    seen_pairs: set[tuple[str, str]] = set()
    for connector in site["connectors"]:
        note = connector.get("note") or ""
        match = CONNECTS.search(note)
        if match:
            pair = (match.group(1), match.group(2))
        else:
            key_match = PASSAGE_KEY.match(connector["key"])
            pair = (split_hall_digits(key_match.group(1), known_halls)
                    if key_match else None)
            # Der Kommentar traegt hier nichts zur Verbindung bei ("7"), also
            # wird sie aus den Hallennummern benannt.
            note = f"Durchgang {pair[0]} zu {pair[1]}" if pair else note
        if not pair:
            continue

        outline = connector["outline"]
        cx = sum(p[0] for p in outline) / len(outline)
        cy = sum(p[1] for p in outline) / len(outline)

        for level in (1, 2):
            # Nicht jede Halle hat beide Ebenen belegt: Halle 1 ist 2026 nur im
            # Obergeschoss bespielt. Ein Durchgang, den es auf der gesuchten
            # Ebene nicht gibt, wird auf die belegte Ebene gezogen, statt die
            # Halle vom Netz zu trennen.
            left = resolve_level(pair[0], level, halls)
            right = resolve_level(pair[1], level, halls)
            if not left or not right or left == right:
                continue
            if (left, right) in seen_pairs:
                continue
            seen_pairs.add((left, right))
            seen_pairs.add((right, left))

            ends = [nearest_aisle(graph, cx, cy, hall_key) for hall_key in (left, right)]
            if not all(ends):
                continue

            # Der Durchgang sitzt zwischen den beiden Anschlusspunkten, nicht auf
            # der groben Layout-Position -- so bleibt er zwischen den Hallen.
            first, second = (graph.nodes[ends[0][0]], graph.nodes[ends[1][0]])
            snap = max(ends[0][1], ends[1][1])

            node_id = f"p:{connector['key']}:{left}:{right}"
            # Die Ebenen mit in den Namen: derselbe Durchgang existiert oft im
            # Erd- und im Obergeschoss, und wer zwei gleich benannte Schalter
            # sieht, weiss nicht, welchen er gerade umlegt.
            label = f"{note} ({left} ↔ {right})"
            graph.add_node(Node(
                id=node_id, x=(first.x + second.x) / 2, y=(first.y + second.y) / 2,
                z=halls[left]["baseY"], kind="portal", level=level, label=label,
                meta={"connects": [left, right], "snapM": round(snap, 1),
                      "uncertaintyM": connector.get("uncertaintyM"),
                      # Wo jemand hingelaufen ist, weiss die Karte mehr als
                      # die Durchgangstabelle: drinnen oder draussen, Weg
                      # oder Aufenthaltsort.
                      **({"observed": portal_notes[frozenset((left, right))]}
                         if frozenset((left, right)) in portal_notes else {})}))

            for end, _ in ends:
                graph.connect(node_id, end, "portal",
                              state="unbestaetigt", confirmed=False, label=label)
            portals += 1
            print(f"  {note:<32} {left:<5} <-> {right:<5} (Anschluss {snap:5.0f} m)")

    # --- Freiflaechen an ihre Halle anbinden ---------------------------------
    # "Freiflaeche Halle 8 Nord" grenzt an Halle 8; die Standflaechen dort sind
    # ueber das Gelaende erreichbar, tauchen aber in keiner Durchgangstabelle
    # auf. Ohne diese Kante haengen 42 Staende -- darunter Red Bull, Porsche und
    # Asus -- ausserhalb des Netzes.
    for hall in site["halls"]:
        if not hall.get("outdoor"):
            continue
        match = OUTDOOR_HOST.search(hall.get("name") or "")
        host = resolve_level(match.group(1), 1, halls) if match else None
        if not host:
            continue

        centre = (sum(p[0] for p in hall["footprint"]) / len(hall["footprint"]),
                  sum(p[1] for p in hall["footprint"]) / len(hall["footprint"]))
        ends = [nearest_aisle(graph, *centre, key) for key in (hall["key"], host)]
        if not all(ends):
            continue

        node_id = f"o:{hall['key']}"
        first, second = graph.nodes[ends[0][0]], graph.nodes[ends[1][0]]
        graph.add_node(Node(
            id=node_id, x=(first.x + second.x) / 2, y=(first.y + second.y) / 2,
            z=0.0, kind="outdoor", hall_key=hall["key"], level=1,
            label=f"Zugang {hall['name']}", meta={"connects": [hall["key"], host]}))
        for end, _ in ends:
            graph.connect(node_id, end, "portal", state="unbestaetigt",
                          confirmed=False, label=f"Zugang {hall['name']}")
        print(f"  {hall['name']:<32} {hall['key']:<5} <-> {host}")

    # --- Ebenenwechsel --------------------------------------------------------
    print("\nEbenenwechsel ...")
    verticals = 0
    # Wo die Technischen Richtlinien einen Aufzug verorten, wird er dort
    # angesetzt. Nur wo keiner verzeichnet ist, bleibt die Hallenmitte -- und
    # das steht dann auch als Herkunft dran.
    # Treppen und Rolltreppen sind nur im Werbeflaechen-Katalog vermasst.
    # Vermasst sind nur die Aufgaenge 4.2 und 10.2. Die Regel dahinter gilt
    # weiter: "Jeder Aufgang verfuegt ueber zwei Rolltreppen" -- fuer das
    # ganze Suedgelaende. Wo die Stufenzahl fehlt, wird sie nicht erfunden;
    # die Zweizahl der Rolltreppen gilt trotzdem.
    aufgaenge: dict[str, dict] = {}
    if VERTICAL_ACCESS.exists():
        access = json.loads(VERTICAL_ACCESS.read_text(encoding="utf-8"))
        measured = {entry["lowerKey"]: entry for entry in access["stairs"]
                    if entry.get("lowerKey")}
        rule = access.get("rule") or {}
        for upper_key in rule.get("appliesTo", []):
            lower_key = f"{upper_key.split('.')[0]}.1"
            aufgaenge[lower_key] = measured.get(lower_key) or {
                "id": rule["id"], "hallKey": upper_key, "lowerKey": lower_key,
                "steps": None, "stepRiseM": None, "widthM": None,
                "escalatorsFlanking": rule["escalatorsPerAufgang"],
            }
        aufgaenge.update(measured)

    official_lifts: dict[str, list[dict]] = defaultdict(list)
    for facility in site.get("facilities", []):
        if facility["kind"] == "elevator":
            official_lifts[facility["hallKey"]].append(facility)

    for lower_key, upper_key in VERTICAL_PAIRS:
        if lower_key not in halls or upper_key not in halls:
            continue
        lower, upper = halls[lower_key], halls[upper_key]

        lifts = official_lifts.get(lower_key) or []
        if lifts:
            # Von mehreren verzeichneten Aufzuegen gibt der mit der groessten
            # Kabine die Stelle vor -- er markiert den Hauptkern der Halle.
            def cabin_area(facility: dict) -> float:
                dims = facility.get("dimensions") or {}
                return dims.get("widthM", 0.0) * dims.get("depthM", 0.0)

            anchor = max(lifts, key=cabin_area)
            cx, cy = anchor["position"]
            lift_source = "official"
            lift_uncertainty = anchor["uncertaintyM"]
            lift_usage = (anchor.get("dimensions") or {}).get("usage")
        else:
            cx = sum(p[0] for p in lower["footprint"]) / len(lower["footprint"])
            cy = sum(p[1] for p in lower["footprint"]) / len(lower["footprint"])
            lift_source = "placeholder"
            lift_uncertainty = None
            lift_usage = None

        # Die Richtlinien fuehren Tragfaehigkeiten von 30 bis 100 kN -- das
        # sind Lastenaufzuege fuer den Standbau. Ihre Lage ist amtlich, ihre
        # Benutzbarkeit fuer Besucher steht nirgends. Also: Ort offiziell,
        # Weg unbestaetigt. Das ist keine Vorsicht, das ist der Kenntnisstand.
        #
        # Treppe und Rolltreppen kommen aus dem Werbeflaechen-Katalog: fuer die
        # Aufgaenge 4.2 und 10.2 nennt er "20 Stufen zw. Rolltreppen" samt
        # Breite und Steigung. Dort stehen also drei Verbindungen nebeneinander
        # -- eine Treppe zwischen zwei Rolltreppen -- und nicht die eine
        # geratene Rolltreppe, die hier vorher stand.
        stair = aufgaenge.get(lower_key)
        if stair:
            plan = [("elevator", 0.0), ("escalator", 12.0), ("stairs", 18.0),
                    ("escalator", 24.0)]
        else:
            plan = [("elevator", 0.0), ("escalator", 18.0)]

        # Der Aufgang steht dort, wo ihn jemand gesehen hat -- nicht in der
        # Hallenmitte. Der Aufzug bleibt davon unberuehrt, er hat seine
        # eigene Quelle.
        observed = anchors.get(lower_key)
        if observed:
            ax, ay = observed["facility"]["position"]
        else:
            ax, ay = cx, cy

        seen_kinds: dict[str, int] = {}
        for kind, offset in plan:
            confirmed = False
            bx, by = (cx, cy) if kind == "elevator" else (ax, ay)
            lower_hit = nearest_aisle(graph, bx + offset, by, lower_key, PORTAL_SNAP_M)
            upper_hit = nearest_aisle(graph, bx + offset, by, upper_key, PORTAL_SNAP_M)
            if not (lower_hit and upper_hit):
                continue
            lower_aisle, upper_aisle = lower_hit[0], upper_hit[0]

            node_lower = graph.nodes[lower_aisle]
            node_upper = graph.nodes[upper_aisle]
            index = seen_kinds.get(kind, 0)
            seen_kinds[kind] = index + 1
            suffix = f":{index}" if index else ""
            node_id = f"v:{lower_key}:{kind}{suffix}"

            name = VERTICAL_NAMES[kind]
            label = f"{name} {lower_key} ↔ {upper_key}"
            meta = {"connects": [lower_key, upper_key], "kind": kind,
                    "source": lift_source if kind == "elevator" else "placeholder"}
            if kind == "elevator":
                if lift_uncertainty:
                    meta["uncertaintyM"] = lift_uncertainty
                if lift_usage:
                    meta["usage"] = lift_usage
            elif stair:
                # Was der Katalog hergibt, gilt fuer beide: die Treppe ist
                # vermasst, die Rolltreppen sind durch "zw. Rolltreppen"
                # belegt. Die Lage bleibt trotzdem ein Platzhalter -- der
                # Katalog verkauft Flaechen, er zeichnet keine Karte.
                meta["source"] = "official"
                meta["evidence"] = stair["id"]
                if observed:
                    # Lage amtlich (das Tor), Zuordnung beobachtet (die
                    # Nachbarschaft). Beides steht dran, damit niemand das
                    # eine fuer das andere haelt.
                    meta["positionSource"] = "beobachtet am amtlichen Tor"
                    meta["positionAnchor"] = observed["facility"]["id"]
                    meta["observation"] = observed["observation"]
                    meta["uncertaintyM"] = observed["facility"]["uncertaintyM"]
                else:
                    meta["positionSource"] = "placeholder"
                if open_questions.get(lower_key):
                    meta["openQuestions"] = open_questions[lower_key]
                if kind == "stairs":
                    # Die Stufenmasse des Katalogs gehoeren zu einer anderen
                    # Stelle: 20 Stufen sind 2,80 m, der Geschosswechsel misst
                    # ueber 7 m, und der Boulevard liegt flach auf Ebene 2.
                    # Die Verbindung bleibt belegt, ihr Mass gilt woanders.
                    label = f"Treppe {lower_key} ↔ {upper_key}"
                    meta["dimensionSource"] = "unbekannt"
                    if stair.get("notTheLevelChange"):
                        meta["note"] = (
                            f"Der Katalog vermasst den Aufgang mit "
                            f"{stair['steps']} Stufen "
                            f"({round(stair['steps'] * stair['stepRiseM'], 2)} m). "
                            f"Das ist nicht dieser Wechsel: die Ebenen liegen "
                            f"{round(upper['baseY'] - lower['baseY'], 2)} m "
                            f"auseinander. Die Stufen gehoeren zur Passage, "
                            f"die BEUTELTIER nicht modelliert.")
                else:
                    label = (f"Rolltreppe {lower_key} ↔ {upper_key} "
                             f"({'West' if index == 0 else 'Ost'} der Treppe)")
                    meta["flanksStairs"] = stair["id"]

            graph.add_node(Node(id=node_id, x=node_lower.x, y=node_lower.y,
                                z=node_lower.z, kind="vertical", hall_key=lower_key,
                                level=lower["level"], label=label, meta=meta))
            graph.connect(lower_aisle, node_id, kind, state="offen")
            # Die eigentliche vertikale Kante traegt die Hoehendifferenz.
            graph.add_edge(Edge(
                id=f"e{len(graph.edges)}", source=node_id, target=upper_aisle,
                kind=kind,
                length_m=round(abs(node_upper.z - node_lower.z)
                               + math.dist((node_lower.x, node_lower.y),
                                           (node_upper.x, node_upper.y)), 2),
                state="offen" if confirmed else "unbestaetigt",
                confirmed=confirmed,
                label=label,
            ))
            verticals += 1
            print(f"  {lower_key} -> {upper_key} ueber {name} "
                  f"[{meta['source']}]{'' if confirmed else ' unbestaetigt'}")

    # --- Kompakt schreiben ----------------------------------------------------
    # Das Gangnetz ist ein regelmaessiges Raster; als 15.000 Einzelobjekte
    # ausgeschrieben waere es mehrere Megabyte, die auf dem Messegelaende ueber
    # ueberlastetes WLAN gehen muessten. Uebertragen wird deshalb je Halle nur
    # die Bitmaske der begehbaren Zellen -- die App baut Knoten und Kanten in
    # Millisekunden daraus auf.
    hall_grids = []
    for key, index in sorted(indices.items()):
        if not index:
            continue
        hall = halls[key]
        footprint = hall["footprint"]
        origin = (min(p[0] for p in footprint), min(p[1] for p in footprint))
        cols = max(ix for ix, _ in index) + 1
        rows = max(iy for _, iy in index) + 1

        bits = bytearray((cols * rows + 7) // 8)
        for ix, iy in index:
            position = iy * cols + ix
            bits[position >> 3] |= 1 << (position & 7)

        hall_grids.append({
            "key": key,
            "origin": [round(origin[0], 2), round(origin[1], 2)],
            "z": hall["baseY"],
            "level": hall["level"],
            "cols": cols,
            "rows": rows,
            "walkable": base64.b64encode(bytes(bits)).decode("ascii"),
        })

    def cell_of(node_id: str) -> list[int] | None:
        parts = node_id.split(":")
        return [int(parts[-2]), int(parts[-1])] if parts[0] == "a" else None

    stand_links = []
    for edge in graph.edges:
        if edge.kind != "stand_access":
            continue
        stand_node = graph.nodes[edge.source]
        cell = cell_of(edge.target)
        if cell is not None:
            stand_links.append({"standId": stand_node.meta.get("standId"),
                                "hallKey": stand_node.hall_key, "cell": cell})

    def link_payload(node: Node) -> dict:
        # Beide Richtungen einsammeln. Ein Ebenenwechsel wird von unten
        # angebunden und nach oben gefuehrt -- wer nur die ausgehenden Kanten
        # nimmt, verliert die untere Haelfte und damit den ganzen Wechsel.
        ends = []
        state = None
        for edge in graph.edges:
            if edge.source == node.id:
                other = edge.target
            elif edge.target == node.id and not edge.directed:
                other = edge.source
            else:
                continue
            if state is None or edge.state == "unbestaetigt":
                state = edge.state
            cell = cell_of(other)
            end = ({"hallKey": graph.nodes[other].hall_key, "cell": cell}
                   if cell is not None else {"nodeId": other})
            if end not in ends:
                ends.append(end)
        payload = {"id": node.id, "kind": node.kind, "label": node.label,
                   "x": round(node.x, 2), "y": round(node.y, 2), "z": round(node.z, 2),
                   "level": node.level, "meta": node.meta, "ends": ends}
        # Der Zustand gehoert an die Verbindung, nicht in eine Annahme der App.
        payload["state"] = state or "unbestaetigt"
        return payload

    connectors_out = [link_payload(node) for node in graph.nodes.values()
                      if node.kind in ("portal", "outdoor", "vertical")]

    payload = {
        "schema": "beuteltier.graph.v2",
        "gridM": GRID_M,
        "grids": hall_grids,
        "standLinks": stand_links,
        "connectors": connectors_out,
        "counts": {"nodes": len(graph.nodes), "edges": len(graph.edges)},
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")

    print(f"\n{len(graph.nodes)} Knoten, {len(graph.edges)} Kanten, "
          f"{portals} Durchgaenge, {verticals} Ebenenwechsel -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
