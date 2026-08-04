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
