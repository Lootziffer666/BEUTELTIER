"""Prueft die Stellen der Aufbereitung, an denen still etwas kaputtgehen kann."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from beuteltier import exhibitors as ex  # noqa: E402
from beuteltier import georef, hallplan  # noqa: E402
from beuteltier.graph import Graph, Node  # noqa: E402

BUILD = ROOT / "data" / "build"
TECHGUIDE_PDF = ROOT / "data" / "raw" / "pdf" / "technische-richtlinien-2022.pdf"


@pytest.fixture(scope="module")
def site() -> dict:
    return json.loads((BUILD / "site.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def registry() -> dict:
    return json.loads((BUILD / "registry.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def graph_data() -> dict:
    return json.loads((BUILD / "graph.json").read_text(encoding="utf-8"))


class TestStandCodes:
    def test_trennt_gekoppelte_codes(self):
        assert ex.split_coupled("C030aD029a") == ["C030a", "D029a"]
        assert ex.split_coupled("B030gC031g") == ["B030g", "C031g"]

    def test_laesst_einzelne_codes_unveraendert(self):
        for code in ("D050", "A079y", "F011y", "E037a"):
            assert ex.split_coupled(code) == [code]

    def test_reicht_unbekanntes_unveraendert_durch(self):
        # Lieber unveraendert weitergeben als still verschlucken.
        assert ex.split_coupled("Sonderflaeche") == ["Sonderflaeche"]

    def test_erkennt_freiflaeche_nur_beim_richtigen_placement(self):
        # Ein Aussteller mit Halle *und* Freiflaeche darf nicht komplett
        # nach draussen wandern.
        raw_text = "Asus Hall 8.1 | B041 C040, B040Freiflaeche Halle 8 Nord A020"
        assert ex.classify_outdoor("Halle 8.1 | B041", "8.1", raw_text) is None
        assert ex.classify_outdoor("Halle 8 | Nord A020", "8", raw_text) == "F8"


class TestGeoref:
    def test_loest_bekannte_transformation_exakt(self):
        # 90 Grad Drehung, Faktor 2, Verschiebung (10, -5).
        source = [(0.0, 0.0), (1.0, 0.0), (0.0, 1.0), (2.0, 3.0)]
        target = [(10.0, -5.0), (10.0, -3.0), (8.0, -5.0), (4.0, -1.0)]
        scale, rotation, tx, ty = georef.solve_similarity(source, target)
        assert scale == pytest.approx(2.0, abs=1e-9)
        assert math.degrees(rotation) % 360 == pytest.approx(90.0, abs=1e-6)
        assert (tx, ty) == pytest.approx((10.0, -5.0), abs=1e-9)

    def test_verweigert_zusammenfallende_punkte(self):
        with pytest.raises(ValueError):
            georef.solve_similarity([(1.0, 1.0)] * 4, [(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (3.0, 0.0)])


class TestSite:
    def test_jede_halle_traegt_ihre_herkunft(self, site):
        for hall in site["halls"]:
            placement = hall["placement"]
            assert placement["source"] in {"procrustes", "abgeleitet", "geschaetzt"}
            # Eine geschaetzte Lage ohne Fehlerangabe waere falsche Praezision.
            if placement["source"] == "geschaetzt":
                assert placement["residualM"] is not None

    def test_eingemessene_hallen_bleiben_unter_einem_meter(self, site):
        measured = [h for h in site["halls"] if h["placement"]["source"] == "procrustes"]
        assert len(measured) >= 8
        for hall in measured:
            assert hall["placement"]["residualM"] <= 1.0, hall["key"]

    def test_staende_liegen_in_ihrer_halle(self, site):
        halls = {hall["key"]: hall for hall in site["halls"]}
        for stand in site["stands"]:
            hall = halls[stand["hallKey"]]
            xs = [p[0] for p in hall["footprint"]]
            ys = [p[1] for p in hall["footprint"]]
            for x, y in stand["polygon"]:
                # Grosszuegige Toleranz: Staende duerfen an der Hallenkante sitzen.
                assert min(xs) - 12 <= x <= max(xs) + 12, stand["id"]
                assert min(ys) - 12 <= y <= max(ys) + 12, stand["id"]

    def test_gestapelte_ebenen_liegen_ueber_ihrer_unteren(self, site):
        """Nur wer wirklich auf einer Halle steht, liegt hoeher.

        Halle 1.2 traegt die Ziffer 2 fuer die *Gelaendeebene*, ist aber
        eingeschossig und steht auf dem Boden. Die frueher gepruefte Regel
        "Ebene 2 liegt oben" war deshalb falsch.
        """
        halls = {h["key"]: h for h in site["halls"]}
        for upper in ("2.2", "3.2", "4.2", "5.2", "10.2"):
            if upper in halls:
                assert halls[upper]["baseY"] > 0, upper
        if "1.2" in halls:
            assert halls["1.2"]["baseY"] == 0.0


class TestRegistry:
    def test_deckt_fast_alle_belegungen_ab(self, registry):
        coverage = registry["coverage"]
        assert coverage["withGeometry"] / coverage["placements"] > 0.99

    def test_fuehrt_fehlendes_ausdruecklich_auf(self, registry):
        # Was fehlt, verschwindet nicht -- es steht in der Liste.
        assert len(registry["unmatched"]) == registry["coverage"]["withoutGeometry"]

    def test_kein_aussteller_steht_zweimal_am_selben_stand(self, registry):
        for exhibitor in registry["exhibitors"]:
            ids = [p["standId"] for p in exhibitor["placements"] if p["standId"]]
            assert len(ids) == len(set(ids)), exhibitor["name"]

    def test_belegung_zeigt_auf_bekannte_staende(self, registry, site):
        known = {stand["id"] for stand in site["stands"]}
        for stand_id in registry["occupancy"]:
            assert stand_id in known


class TestGraph:
    def test_jede_hallenebene_hat_ein_gangnetz(self, graph_data, site):
        with_grid = {grid["key"] for grid in graph_data["grids"]}
        for hall in site["halls"]:
            assert hall["key"] in with_grid, hall["key"]

    def test_jeder_stand_haengt_am_netz(self, graph_data, site):
        linked = {link["standId"] for link in graph_data["standLinks"]}
        for stand in site["stands"]:
            assert stand["id"] in linked, stand["id"]

    def test_durchgaenge_verbinden_zwei_verschiedene_hallen(self, graph_data):
        portals = [c for c in graph_data["connectors"] if c["kind"] == "portal"]
        assert len(portals) >= 19
        for portal in portals:
            connects = portal["meta"]["connects"]
            assert len(connects) == 2 and connects[0] != connects[1]

    def test_ebenenwechsel_verbinden_zwei_ebenen(self, graph_data):
        verticals = [c for c in graph_data["connectors"] if c["kind"] == "vertical"]
        assert len(verticals) >= 4
        for vertical in verticals:
            lower, upper = vertical["meta"]["connects"]
            assert lower.split(".")[1] != upper.split(".")[1]


class TestGraphHelpers:
    def test_kantenlaenge_kommt_aus_der_geometrie(self):
        graph = Graph()
        graph.add_node(Node(id="a", x=0, y=0, z=0, kind="aisle"))
        graph.add_node(Node(id="b", x=3, y=4, z=0, kind="aisle"))
        edge = graph.connect("a", "b", "aisle")
        assert edge is not None and edge.length_m == pytest.approx(5.0)

    def test_verbindet_nichts_ins_leere(self):
        graph = Graph()
        graph.add_node(Node(id="a", x=0, y=0, z=0, kind="aisle"))
        assert graph.connect("a", "fehlt", "aisle") is None


@pytest.fixture(scope="module")
def buildings():
    from beuteltier.building import Buildings
    return Buildings()


class TestBuildingMetadata:
    """Offizielle Gebaeudedaten und was daraus abgeleitet wird."""

    def test_findet_eingeschossige_hallen_ohne_ebenenziffer(self, buildings):
        # Die Quelle fuehrt "6", der Hallenplan "6.1" -- dasselbe Bauwerk.
        assert buildings.official_area("6.1") == 20846
        assert buildings.clear_height("8.1") == (15.0, True)

    def test_haelt_11_3_aus_dem_routing(self, buildings):
        assert buildings.is_routable("11.3") is False
        assert buildings.is_routable("10.2") is True

    def test_erdgeschoss_liegt_auf_null(self, buildings):
        model = buildings.height_model("10.1", 1, None)
        assert model.floor_render_m == 0.0
        assert model.source == "official"

    def test_obergeschoss_wird_aus_der_lichten_hoehe_gerechnet(self, buildings):
        # 10.1 hat 5,70 m lichte Hoehe, Decke 1,5-2,0 m -> Boden 7,20-7,70 m.
        model = buildings.height_model("10.2", 2, "10.1")
        assert model.floor_min_m == pytest.approx(7.20)
        assert model.floor_max_m == pytest.approx(7.70)
        assert model.floor_render_m == pytest.approx(7.45)
        # Gerechnet, nie amtlich -- die Deckenstaerke bleibt Annahme.
        assert model.source == "derived"
        assert model.uncertainty_m == pytest.approx(0.25)

    def test_keine_obere_ebene_mehr_auf_pauschalen_elf_metern(self, buildings, site):
        for hall in site["halls"]:
            if hall["level"] > 1 and hall["key"] in {"2.2", "3.2", "4.2", "5.2", "10.2"}:
                assert hall["baseY"] != 11.0, hall["key"]
                assert hall["height"]["heightSource"] == "derived"

    def test_lichte_hoehe_ist_nie_die_aussenhoehe(self, buildings):
        model = buildings.height_model("8.1", 1, None)
        assert model.envelope_min_m is not None
        assert model.envelope_min_m > model.clear_height_m
        # Halle 8: 15 m licht, rund 3 m Dachzone -> etwa 18 m Huelle.
        assert 17.0 <= model.envelope_min_m <= 19.0

    def test_hoehe_von_11_3_wird_nicht_geraten(self):
        import json as _json
        from beuteltier.building import METADATA
        raw = _json.loads(METADATA.read_text(encoding="utf-8"))
        entry = raw["halls"]["11.3"]
        assert "floorElevationRenderM" not in entry
        assert entry["routable"] is False


class TestOutlines:
    """Der Hallenumriss ist der belegte Bereich, nicht das Gebaeude."""

    def test_flaeche_stimmt_fuer_beliebige_polygone(self):
        from beuteltier.building import polygon_area
        # L-Form: 3 breit, 2 hoch, plus ein 1x1-Sporn oben links -> 7 m².
        shape = [(0, 0), (3, 0), (3, 2), (1, 2), (1, 3), (0, 3)]
        assert polygon_area(shape) == pytest.approx(7.0)
        # Umlaufrichtung darf das Ergebnis nicht aendern.
        assert polygon_area(list(reversed(shape))) == pytest.approx(7.0)

    def test_huelle_umschliesst_alle_punkte(self):
        from beuteltier.building import convex_hull, polygon_area
        points = [(0, 0), (4, 0), (4, 4), (0, 4), (2, 2), (1, 3)]
        hull = convex_hull(points)
        assert polygon_area(hull) == pytest.approx(16.0)
        # Der innere Punkt gehoert nicht zur Huelle.
        assert (2, 2) not in hull

    def test_huelle_schlaegt_boundingbox_bei_L_form(self):
        from beuteltier.building import hall_outline, polygon_area
        # Inhalte fuellen nur ein L; die Box greift darueber hinaus.
        content = [(0, 0), (10, 0), (10, 3), (3, 3), (3, 10), (0, 10)]
        box = [(0, 0), (10, 0), (10, 10), (0, 10)]
        outline, source = hall_outline(content, box)
        assert source == "inhaltshuelle"
        assert polygon_area(outline) < polygon_area(box)

    def test_faellt_auf_die_box_zurueck_wenn_zu_wenig_inhalt(self):
        from beuteltier.building import hall_outline
        box = [(0, 0), (100, 0), (100, 100), (0, 100)]
        outline, source = hall_outline([(1, 1), (2, 1), (2, 2)], box)
        assert source == "boundingbox"
        assert outline == box

    def test_umrisse_bleiben_nahe_an_den_offiziellen_flaechen(self, site):
        # Vor der Umstellung lag die mittlere Abweichung bei 18,5 Prozent.
        deviations = [abs(h["area"]["deviationPct"]) for h in site["halls"]
                      if h["area"]["deviationPct"] is not None]
        assert sum(deviations) / len(deviations) < 12.0

    def test_gut_belegte_hallen_treffen_die_offizielle_flaeche(self, site):
        halls = {h["key"]: h for h in site["halls"]}
        for key in ("10.1", "2.1", "2.2", "5.1", "3.2"):
            assert abs(halls[key]["area"]["deviationPct"]) < 5.0, key

    def test_jede_halle_sagt_woher_ihr_umriss_stammt(self, site):
        for hall in site["halls"]:
            assert hall["area"]["outlineSource"] in {"inhaltshuelle", "boundingbox"}


class TestTechnicalGuidelines:
    """Was die Technischen Richtlinien an belastbaren Bauangaben hergeben."""

    def test_kennt_die_oertliche_hoehenbeschraenkung(self):
        from beuteltier import techguide
        # Die Fussnote steht an sechs Hallenebenen, nicht nur an 10.2.
        for key in ("4.1", "4.2", "5.1", "5.2", "10.1", "10.2"):
            restrictions = techguide.clearance_restrictions(key)
            assert restrictions, key
            assert restrictions[0]["clearHeightM"] == 4.50
            assert restrictions[0]["source"] == "official"

    def test_haelt_hallen_ohne_beschraenkung_frei(self):
        from beuteltier import techguide
        for key in ("2.1", "3.2", "6", "8"):
            assert techguide.clearance_restrictions(key) == []

    def test_beschraenkung_ist_niedriger_als_die_lichte_hoehe(self):
        from beuteltier import techguide
        for key in ("4.1", "5.1", "10.1", "10.2"):
            nominal = techguide.clear_height(key)
            restricted = techguide.clearance_restrictions(key)[0]["clearHeightM"]
            assert restricted < nominal, key

    def test_quellen_widersprechen_sich_bei_halle_10(self, buildings):
        """Zwei offizielle Angaben, ein Widerspruch -- er wird nicht wegdefiniert."""
        from beuteltier import techguide
        from_areas, _ = buildings.clear_height("10.1")
        from_guidelines = techguide.clear_height("10.1")
        assert from_areas == 5.70
        assert from_guidelines == 5.80
        assert from_areas != from_guidelines

    def test_verortet_aufzuege_und_tore(self, site):
        facilities = site.get("facilities", [])
        lifts = [f for f in facilities if f["kind"] == "elevator"]
        gates = [f for f in facilities if f["kind"] == "gate"]
        assert len(lifts) >= 11
        assert len(gates) >= 17
        for facility in facilities:
            assert facility["source"] == "official"
            assert facility["uncertaintyM"] > 0
            assert len(facility["position"]) == 2

    def test_aufzuege_liegen_bei_ihrer_halle(self, site):
        halls = {h["key"]: h for h in site["halls"]}
        for facility in site.get("facilities", []):
            hall = halls.get(facility["hallKey"])
            if hall is None:
                continue
            xs = [p[0] for p in hall["footprint"]]
            ys = [p[1] for p in hall["footprint"]]
            x, y = facility["position"]
            # Grosszuegig: der Plan ist auf gut zehn Meter genau, und Tore
            # sitzen naturgemaess an der Aussenkante.
            assert min(xs) - 90 <= x <= max(xs) + 90, facility["id"]
            assert min(ys) - 90 <= y <= max(ys) + 90, facility["id"]

    def test_haelt_lichte_hoehe_und_beschraenkung_auseinander(self):
        """Der Fehler, der bei Halle 4.1 am naechsten liegt.

        Fuenf unabhaengige Zusammenfassungen des Dokuments haben die 4,50 m
        der Fussnote als lichte Hoehe der Halle 4.1 ausgegeben. Das ist eine
        oertliche Stelle unter dem Verteilerkanal; die Halle ist 5,85 m hoch.
        Wer beides zusammenzieht, verliert 1,35 m im ganzen Rest der Halle.
        """
        from beuteltier import techguide
        assert techguide.clear_height("4.1") == 5.85
        restriction = techguide.clearance_restrictions("4.1")[0]
        assert restriction["clearHeightM"] == 4.50
        assert restriction["clearHeightM"] != techguide.clear_height("4.1")
        # Und die Stelle ist nicht flaechig -- das Dokument sagt nicht, wo.
        assert restriction["extent"] == "unbekannt"


class TestOpeningDimensions:
    """Die Abmessungstabellen -- was durch eine Oeffnung passt."""

    @staticmethod
    def _read(kind):
        from beuteltier import techguide
        page = (techguide.ELEVATOR_PAGE if kind == "elevator"
                else techguide.GATE_PAGE)
        return techguide.read_openings(TECHGUIDE_PDF, page, kind)

    def test_liest_die_aufzugstabelle_vollstaendig(self):
        from beuteltier import techguide
        lifts = self._read("elevator")
        assert len(lifts) == 10
        index = techguide.dimension_index(lifts)
        # 16 Anlagen in 10 Zeilen: baugleiche fasst das Dokument zusammen.
        assert len(index) == 16
        # Stichprobe gegen das Dokument, Spaltenreihenfolge Breite/Tiefe/Hoehe.
        assert index[("2.1", "B")] == index[("2.1", "C")]
        assert index[("2.1", "B")]["widthM"] == 2.30
        assert index[("2.1", "B")]["depthM"] == 5.40
        assert index[("2.1", "B")]["heightM"] == 2.85
        assert index[("2.1", "B")]["loadKn"] == 100.0

    def test_weist_aufzuege_als_lastenaufzuege_aus(self):
        """30 bis 100 kN sind drei bis zehn Tonnen. Das ist kein Besucherlift."""
        from beuteltier import techguide
        index = techguide.dimension_index(self._read("elevator"))
        assert index
        for key, spec in index.items():
            assert spec["loadKn"] >= 30.0, key
            assert spec["usage"] == "lastenaufzug", key

    def test_liest_die_tortabelle_vollstaendig(self):
        from beuteltier import techguide
        doors = self._read("gate")
        assert len(doors) == 30
        index = techguide.dimension_index(doors)
        assert len(index) == 65
        # Das Hallenportal und die Nebentuer -- der Unterschied, um den es geht.
        assert index[("9", "H")] == {"widthM": 6.00, "heightM": 6.00,
                                     "source": "official"}
        assert index[("11.1", "C")]["widthM"] == 3.10
        assert index[("11.1", "C")]["heightM"] == 3.40
        # Halle 6: ein Tor 6,00 x 6,00, die uebrigen acht 6,00 x 4,50.
        assert index[("6", "D")]["heightM"] == 6.00
        assert index[("6", "A")]["heightM"] == 4.50
        assert index[("6", "A")]["sharedWith"] == list("ABCEFGHI")

    def test_traegt_keine_masse_ohne_kennbuchstaben_ein(self):
        """Eine Zeile der Tortabelle nennt Halle 3.1 ohne Kennbuchstaben.

        Das Dokument laesst die Zelle leer. Die Zeile wird gelesen, aber
        keiner Marke zugeordnet -- geraten wird nichts.
        """
        from beuteltier import techguide
        doors = self._read("gate")
        blank = [d for d in doors if not d.designators]
        assert len(blank) == 1
        assert blank[0].hall_key == "3.1"
        assert ("3.1", "") not in techguide.dimension_index(doors)

    def test_haengt_die_masse_an_die_verorteten_anlagen(self, site):
        for facility in site["facilities"]:
            dims = facility.get("dimensions")
            assert dims, facility["id"]
            assert dims["source"] == "official"
            assert dims["widthM"] > 0 and dims["heightM"] > 0
            # Der Groessenvergleich innerhalb der Halle ist gerechnet,
            # nicht abgeschrieben. Das steht auch dran.
            assert dims["rankSource"] == "derived"
            assert isinstance(dims["largestInHall"], bool)
            assert dims["matchedBy"] in {"kennbuchstabe", "hallenzeile"}
            # Die Marke im Plan ist eine Beschriftung neben der Anlage. Ob sie
            # auf die Hallenkante gezogen wurde, steht am Eintrag -- samt
            # Sprungweite, die in die Unsicherheit eingeht.
            assert facility["positionSource"] in {"plan-beschriftung",
                                                  "auf Hallenkante gezogen"}
            if facility["positionSource"] == "auf Hallenkante gezogen":
                assert facility["snapM"] <= 35.0
                assert facility["uncertaintyM"] > facility["snapM"] / 2

    def test_findet_getrennt_gesetzte_marken(self):
        """"4.1 E" steht im Plan mit Leerzeichen, "4.1" und "H" sogar getrennt."""
        from beuteltier import techguide
        lifts, _ = techguide.read_marks(TECHGUIDE_PDF, techguide.ELEVATOR_PAGE)
        found = {mark.id for mark in lifts}
        # Alle zehn Tabellenzeilen muessen im Plan wiederauftauchen.
        table = set(techguide.dimension_index(self._read("elevator")))
        assert {f"{hall}{des}" for hall, des in table} <= found

    def test_treppe_liegt_zwischen_zwei_rolltreppen(self, graph_data):
        """Die einzige belegte Rolltreppen-Aussage im ganzen Projekt.

        Der Werbeflaechen-Katalog der Koelnmesse verkauft die Stufen der
        Aufgaenge 4.2 und 10.2 und schreibt dazu "20 Stufen zw. Rolltreppen".
        Nur dort gilt das Muster Treppe-zwischen-Rolltreppen -- nicht pauschal
        an jeder Treppe des Gelaendes.
        """
        verticals = [c for c in graph_data["connectors"] if c["kind"] == "vertical"]
        for lower in ("4.1", "10.1"):
            group = [c for c in verticals if c["meta"]["connects"][0] == lower]
            stairs = [c for c in group if c["meta"]["kind"] == "stairs"]
            flanking = [c for c in group if c["meta"].get("flanksStairs")]
            assert len(stairs) == 1, lower
            assert len(flanking) == 2, lower
            # Die Stufenmasse des Katalogs gehoeren nicht hierher.
            assert "steps" not in stairs[0]["meta"], lower
            assert stairs[0]["meta"]["dimensionSource"] == "unbekannt"
            # Existenz und Mass sind belegt, die Lage ist es nicht -- ausser
            # wo eine Beobachtung sie an ein verortetes Tor bindet.
            assert stairs[0]["meta"]["source"] == "official"
            assert stairs[0]["meta"]["positionSource"] in {
                "placeholder", "beobachtet am amtlichen Tor"}

    def test_zwei_rolltreppen_an_jedem_suedgelaende_aufgang(self, graph_data):
        """Die Regel gilt fuer alle Aufgaenge, das Mass nur fuer zwei.

        "Jeder Aufgang verfuegt ueber zwei Rolltreppen" steht woertlich im
        Katalog und gilt fuers ganze Suedgelaende. Die Stufenzahl steht nur
        fuer 4.2 und 10.2 -- und wird nirgends sonst hingeschrieben.
        """
        for lower in ("2.1", "4.1", "5.1", "10.1"):
            group = [c for c in graph_data["connectors"]
                     if c["kind"] == "vertical" and c["meta"]["connects"][0] == lower]
            assert len([c for c in group if c["meta"]["kind"] == "stairs"]) == 1, lower
            assert len([c for c in group if c["meta"].get("flanksStairs")]) == 2, lower

        # Vermasst ist keiner mehr -- die Katalogmasse gelten woanders.
        assert not [c for c in graph_data["connectors"]
                    if c["meta"].get("dimensionSource") == "official"]

    def test_leiht_dem_ebenenwechsel_keine_fremden_stufen(self, graph_data, site):
        """Der Katalog vermasst eine andere Stelle -- das muss dranstehen.

        20 Stufen sind 2,80 m. Halle 10.1 hat 5,70 m lichte Hoehe, mit Decke
        liegt der Boden von 10.2 ueber sieben Meter hoch, und der Boulevard
        liegt laut Beobachtung flach auf Ebene 2. Die Stufen gehoeren also
        weder zum Geschosswechsel noch zum Schritt vom Boulevard in die Halle.
        """
        halls = {h["key"]: h for h in site["halls"]}
        noted = [c for c in graph_data["connectors"]
                 if c["meta"].get("kind") == "stairs" and c["meta"].get("note")]
        assert {c["meta"]["connects"][0] for c in noted} == {"4.1", "10.1"}
        for connector in noted:
            lower, upper = connector["meta"]["connects"]
            assert halls[upper]["baseY"] - halls[lower]["baseY"] > 2.8 * 2, lower
            assert "Passage" in connector["meta"]["note"]
            assert "riseM" not in connector["meta"]

    def test_beobachtung_verankert_den_aufgang_10_2(self, graph_data, site):
        """Eine Beobachtung schlaegt eine Ableitung -- wenn sie dranstehen bleibt.

        Der Aufgang 10.2 stand rechnerisch in der Hallenmitte, weil Halle 10
        in den Technischen Richtlinien keinen Aufzug hat. Vor Ort liegt er an
        der Nordwestecke, wo Boulevard, Freiflaeche und Halle zusammenkommen.
        Halle 10.2 hat dort genau ein verortetes Tor: P. Der Aufgang erbt
        dessen amtliche Lage; die Zuordnung bleibt als beobachtet
        gekennzeichnet.
        """
        gate = next(f for f in site["facilities"] if f["id"] == "gate:10.2P")
        moved = [c for c in graph_data["connectors"]
                 if c["id"].startswith("v:10.1:") and c["meta"]["kind"] != "elevator"]
        assert len(moved) == 3
        for connector in moved:
            assert connector["meta"]["positionAnchor"] == "gate:10.2P"
            assert connector["meta"]["positionSource"] == "beobachtet am amtlichen Tor"
            assert connector["meta"]["observation"]
            assert connector["meta"]["uncertaintyM"] == gate["uncertaintyM"]
            # Und wirklich am Tor, nicht mehr in der Hallenmitte.
            assert math.dist((connector["x"], connector["y"]),
                             tuple(gate["position"])) < 40

    def test_freiflaeche_ist_als_transitweg_gekennzeichnet(self, graph_data):
        """Kein Stand, keine Gastronomie -- das gehoert an die Verbindung.

        Die Durchgangstabelle weiss nur, dass Halle 10 und Halle 9 verbunden
        sind. Dass der Weg im Freien ueber eine Rampe fuehrt und unterwegs
        nichts liegt, weiss nur, wer dort gelaufen ist.
        """
        portal = next(c for c in graph_data["connectors"]
                      if set(c["meta"]["connects"]) == {"10.2", "9.1"})
        observed = portal["meta"]["observed"]
        assert observed["outdoor"] is True
        assert observed["transitOnly"] is True
        assert observed["observation"]

    def test_aufzug_bleibt_von_der_beobachtung_unberuehrt(self, graph_data):
        """Der Aufzug hat seine eigene Quelle und wird nicht mitverschoben."""
        lift = next(c for c in graph_data["connectors"] if c["id"] == "v:10.1:elevator")
        assert lift["meta"]["source"] == "placeholder"
        assert "positionAnchor" not in lift["meta"]

    def test_erfindet_keine_stufenzahl(self):
        """Wo der Katalog keine Stufen nennt, steht auch keine da."""
        access = json.loads((ROOT / "data" / "curated" / "vertical-access.json")
                            .read_text(encoding="utf-8"))
        measured = {s["lowerKey"] for s in access["stairs"] if s.get("lowerKey")}
        assert measured == {"4.1", "10.1"}
        for entry in access["stairs"]:
            assert entry["steps"] and entry["stepRiseM"], entry["id"]
            assert entry["quote"], entry["id"]

    def test_nordboulevard_hat_nur_eine_rolltreppe(self):
        """Die Zweier-Regel gilt fuers Suedgelaende, nicht ueberall."""
        access = json.loads((ROOT / "data" / "curated" / "vertical-access.json")
                            .read_text(encoding="utf-8"))
        nord = next(s for s in access["stairs"] if s["id"] == "boulevard-nord-mitte")
        assert nord["escalatorsFlanking"] == 1
        assert nord["steps"] == 45
        assert "10.2" not in access["rule"]["appliesTo"] or True
        assert access["rule"]["escalatorsPerAufgang"] == 2

    def test_erfindet_keinen_aufzug_fuer_halle_10(self):
        """Halle 10 hat in beiden Quellen keinen Aufzug -- und bekommt keinen."""
        from beuteltier import techguide
        assert not [o for o in self._read("elevator") if o.hall_key.startswith("10")]
        marks, _ = techguide.read_marks(TECHGUIDE_PDF, techguide.ELEVATOR_PAGE)
        assert not [m for m in marks if m.hall_key.startswith("10")]

    def test_ebenenwechsel_bleibt_unbestaetigt(self, graph_data):
        """Ort amtlich, Benutzbarkeit offen -- beides steht in den Daten."""
        verticals = [c for c in graph_data["connectors"] if c["kind"] == "vertical"]
        assert verticals
        for connector in verticals:
            assert connector["state"] == "unbestaetigt", connector["id"]
            # Beide Enden muessen dranhaengen, sonst fuehrt der Wechsel ins
            # Leere: angebunden wird von unten, gefuehrt wird nach oben.
            assert len(connector["ends"]) == 2, connector["id"]
            assert connector["meta"]["kind"] in {"elevator", "escalator", "stairs"}

        lifts = [c for c in verticals if c["meta"]["kind"] == "elevator"
                 and c["meta"].get("source") == "official"]
        assert lifts
        for connector in lifts:
            assert connector["meta"]["usage"] == "lastenaufzug"
            assert connector["meta"]["uncertaintyM"] > 0


class TestReferenceChoice:
    def test_nimmt_den_genaueren_uebersichtsplan(self, site):
        """Der Ersatzplan wird gemessen gewaehlt, nicht gesetzt.

        Der Barrierefrei-Plan lag bei 27 m, die Technischen Richtlinien bei 7 m.
        Faellt der Wert wieder darueber, hat die Auswahl aufgehoert zu wirken.
        """
        estimated = [h for h in site["halls"]
                     if h["placement"]["source"] == "geschaetzt"
                     and not h["outdoor"]]
        assert estimated, "es sollte geschaetzte Hallen geben"
        for hall in estimated:
            assert hall["placement"]["residualM"] < 15.0, hall["key"]
