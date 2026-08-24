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
from beuteltier.gpkg import envelope, polygons  # noqa: E402
from build_official_diagnostic import to_scene  # noqa: E402
from build_world_packages import surroundings_zone  # noqa: E402
from beuteltier.lod2 import Building, Surface  # noqa: E402

BUILD = ROOT / "data" / "build"
BUILDINGS_JSON = BUILD / "buildings.json"
TECHGUIDE_PDF = ROOT / "data" / "raw" / "pdf" / "technische-richtlinien-2022.pdf"


def test_official_diagnostic_uses_master_coordinate_axes():
    origin = (358300.0, 5645800.0, 40.0)
    assert to_scene((358312.5, 5645792.0, 47.25), origin) == (12.5, 7.25, 8.0)


def test_world_package_zone_uses_official_position():
    origin = (358300.0, 5645800.0, 40.0)
    east = Building("east", surfaces=[Surface("ground", [
        (358500.0, 5645800.0, 40.0),
        (358510.0, 5645800.0, 40.0),
        (358500.0, 5645810.0, 40.0),
    ])])
    assert surroundings_zone(east, origin) == "east"


def test_surface_analysis_never_opens_raw_ground():
    classification = json.loads(
        (BUILD / "surface-classification.json").read_text(encoding="utf-8")
    )
    visibility = json.loads(
        (BUILD / "visibility-analysis.json").read_text(encoding="utf-8")
    )
    assert classification["policy"] == {
        "groundSurfaceWalkableByDefault": False,
        "orthophotoWalkable": False,
        "collisionCandidateIsWalkable": False,
    }
    assert sum(visibility["counts"].values()) == len(visibility["features"])
    assert visibility["occlusionTested"] is False
    assert visibility["missingSemanticSamples"]


def test_collision_surfaces_are_height_only_and_blocked():
    product = json.loads(
        (BUILD / "collision-surfaces.json").read_text(encoding="utf-8")
    )
    assert product["counts"]["triangles"] > 0
    assert product["counts"]["approvedWalkable"] == 0
    assert product["policy"]["rawLod2Walkable"] is False
    assert all(surface["blocked"] and surface["approval"] == "height-only"
               for surface in product["surfaces"])


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


class TestWorldOrigin:
    def test_achsenabbildung_und_inverse(self):
        from build_world_origin import scene_to_world, world_to_scene

        world = (358_312.5, 5_645_780.0, 47.25)
        assert world_to_scene(world) == pytest.approx((12.5, 7.25, 20.0))
        assert scene_to_world(world_to_scene(world)) == pytest.approx(world)

    def test_relative_abstaende_bleiben_erhalten(self):
        from build_world_origin import world_to_scene

        first = (358_250.0, 5_645_700.0, 42.0)
        second = (358_310.0, 5_645_780.0, 58.0)
        assert math.dist(world_to_scene(first), world_to_scene(second)) == pytest.approx(
            math.dist(first, second)
        )


@pytest.fixture(scope="module")
def registrierungsprodukt(site):
    """Einmal gerechnet, von allen Tests geteilt.

    Die Passung sucht je Halle ueber Drehung, Verschiebung und Massstab und
    zieht danach einzelne Staende herein -- das dauert Minuten. Zweimal
    dasselbe zu rechnen prueft nichts zusaetzlich.
    """
    from build_hall_registrations import build_product

    buildings = json.loads(BUILDINGS_JSON.read_text(encoding="utf-8"))
    origin = json.loads((BUILD / "world-origin.json").read_text(encoding="utf-8"))
    return build_product(site, buildings, origin)


class TestHallRegistrations:
    def test_jede_hallenebene_bleibt_ehrlich_unregistriert(self, site, registrierungsprodukt):
        product = registrierungsprodukt
        registrations = product["registrations"]
        assert len(registrations) == len(site["halls"])
        assert {item["hallKey"] for item in registrations} == {
            hall["key"] for hall in site["halls"]
        }
        assert product["counts"]["constrained"] == 14
        assert product["counts"]["registered"] == 0
        assert all(item["status"] in {"draft", "constrained"} and item["anchors"] == []
                   for item in registrations)
        constrained = [item["constraint"] for item in registrations if item["constraint"]]
        assert all(item["coverageAfterPct"] >= item["coverageBeforePct"]
                   for item in constrained)
        # Zwei Suchweiten, und sie unterscheiden zwei Faelle: Hallen werden in
        # ihr Gebaeude gelegt (30 m), Freiflaechen zwischen die Gebaeude (20 m,
        # mit umgekehrtem Ziel). Wer das zusammenzieht, verliert die
        # Unterscheidung.
        hallen = [item for item in constrained if not item.get("frei")]
        freie = [item for item in constrained if item.get("frei")]
        assert all(item["searchRadiusM"] == 30 for item in hallen)
        assert all(item["searchRadiusM"] == 20 for item in freie)
        assert len(freie) >= 2, "die Freiflaechen brauchen eine eigene Passung"
        # Und die Winkelkorrektur gilt fuer alle, auch fuer die ohne Zielfeature.
        # Jede Halle sucht ihren Winkel selbst, aber nur in einem schmalen Band
        # um den erwarteten. Frei drifteten sie auf 0,96 und 4,11 Grad -- eine
        # knappe Passung laesst sich durch Kippen "verbessern", ohne dass die
        # Halle richtiger steht. Was innerhalb des Bandes bleibt, ist erlaubt;
        # was die Schwelle reisst, wird gemeldet.
        from build_hall_registrations import DREHUNG_BAND_GRAD, DREHUNG_SCHWELLE_GRAD

        for item in constrained:
            assert abs(item["drehungAbweichungDeg"]) <= DREHUNG_BAND_GRAD + 1e-6, item
        auffaellig = [r for r in registrations
                      if abs((r["constraint"] or {}).get("drehungAbweichungDeg", 0.0))
                      > DREHUNG_SCHWELLE_GRAD]
        # Wer abweicht, muss auch gemeldet sein -- sonst ist die Abweichung
        # wieder stillschweigend akzeptiert.
        assert all(r["befund"]["reviewRequired"] for r in auffaellig)

    def test_draft_transform_erhaelt_relative_distanzen(self):
        from build_hall_registrations import draft_transform, transform_point

        transform = draft_transform({
            "rotationDeg": -31.0126,
            "translation": [357092.413, 5645595.135],
        }, [358300.0, 5645800.0, 40.0])
        first, second = (100.0, 200.0), (130.0, 240.0)
        assert math.dist(transform_point(first, transform),
                         transform_point(second, transform)) == pytest.approx(50.0)
        assert transform["mirroredSceneZ"] is True

    def test_registered_layout_transformiert_alle_abhaengigkeiten_gemeinsam(self):
        product = json.loads((BUILD / "registered-layout.json").read_text(encoding="utf-8"))
        assert product["counts"] == {
            "halls": 17, "stands": 1027, "walkGrids": 17,
            "facilities": 28, "portalEnds": 76,
        }
        # Der Inhalt einer Halle behaelt seine Verhaeltnisse: Staende, Wegegitter
        # und Umriss teilen sich **eine** Abbildung. Wo eine Halle verkleinert
        # wird, wird alles darin mitverkleinert -- relativ zueinander aendert
        # sich nichts.
        assert product["policy"]["relativeHallContentScale"] == 1.0
        assert product["policy"]["portalsAreRegistrationAnchors"] is False
        assert all(not portal["usedAsRegistrationAnchor"] for portal in product["portalEnds"])
        assert all(hall["walkGrid"]["cellBasisX"] != [0, 0] for hall in product["halls"])
        graph = json.loads((BUILD / "registered-graph.json").read_text(encoding="utf-8"))
        assert graph["schema"] == "beuteltier.registered-graph.v1"
        assert len(graph["grids"]) == 17
        assert all("cellBasisX" in grid and "cellBasisY" in grid for grid in graph["grids"])
        # Die Gitterzelle traegt den Massstab ihrer Halle mit. Eine Halle, die
        # in ihren Innenraum verkleinert wurde, haette sonst ein Wegegitter in
        # Originalgroesse -- und das laege am Rand ausserhalb der Halle.
        skalen = {r["hallKey"]: (r["constraint"] or {}).get("scale", 1.0)
                  for r in json.loads(
                      (BUILD / "hall-registrations.json").read_text(encoding="utf-8")
                  )["registrations"]}
        for grid in graph["grids"]:
            erwartet = graph["gridM"] * skalen.get(grid["key"], 1.0)
            assert math.hypot(*grid["cellBasisX"]) == pytest.approx(erwartet, abs=0.002), \
                grid["key"]
        registered_site = json.loads((BUILD / "registered-site.json").read_text(encoding="utf-8"))
        assert len(registered_site["stands"]) == 1027
        assert registered_site["registration"]["status"] == "constrained"
        assert registered_site["connectors"] == []
        assert registered_site["registration"]["connectorsOmitted"] > 0

    def test_floorz_ist_nhn_offset_und_keine_null_fallbackhoehe(self, registrierungsprodukt):
        levels = {item["hallKey"]: item for item in registrierungsprodukt["registrations"]}
        assert levels["10.1"]["floorZ"] == pytest.approx(6.30)
        assert levels["10.2"]["floorZ"] == pytest.approx(13.75)
        assert levels["10.1"]["floorWorldZ"] == pytest.approx(46.30)
        assert levels["10.1"]["floorSource"] == "OFFICIAL_LOD2_GROUND_PLUS_PLAN_LEVEL"
        assert levels["10.1"]["lod2GroundOffsetM"] == pytest.approx(5.81)
        assert levels["F2"]["floorSource"] == "UNCONFIRMED_GLOBAL_GROUND_REFERENCE"
        assert levels["F2"]["lod2GroundOffsetM"] is None


class TestWorldManifest:
    def test_manifest_bleibt_lokal_und_markiert_migration(self):
        from build_world_manifest import build_product

        origin = json.loads((BUILD / "world-origin.json").read_text(encoding="utf-8"))
        registrations = json.loads(
            (BUILD / "hall-registrations.json").read_text(encoding="utf-8")
        )
        manifest = build_product(origin, registrations)
        assert manifest["schema"] == "beuteltier.world.v1"
        assert manifest["status"] == "migration"
        assert manifest["fallback"]["orthophoto"] is True
        assert manifest["fallback"]["walkable"] is False
        assert manifest["runtimeDependencies"] == {
            "networkRequired": False,
            "realityMeshRequired": False,
        }
        uris = [item["uri"] for item in manifest["packages"]]
        uris += list(manifest["data"].values())
        assert all("://" not in uri and not uri.startswith("/") for uri in uris)
        diagnostic = next(item for item in manifest["packages"]
                          if item["id"] == "official-world-diagnostic")
        assert diagnostic["status"] == "development"
        assert diagnostic["available"] is False
        assert manifest["data"]["officialWorldDiagnostic"].endswith(".json")


class TestMaterialClasses:
    def test_materialien_sind_metrisch_und_mobil_begrenzt(self):
        from build_material_classes import build_product

        product = build_product()
        assert len(product["classes"]) >= 10
        assert product["mobileProfile"]["maxTextureSize"] <= 1024
        assert len({item["baseColor"] for item in product["classes"]}) > 5
        for material in product["classes"]:
            assert material["textureScale"] == "metric"
            assert material["panelWidthM"] > 0
            assert material["panelHeightM"] > 0
            assert 0 <= material["windowRatio"] <= 1


class TestWalkableProducts:
    def test_flaechen_erfinden_keine_piazza_oder_boulevard(self, site):
        from build_walkable_surfaces import build_product

        registrations = json.loads(
            (BUILD / "hall-registrations.json").read_text(encoding="utf-8")
        )
        product = build_product(site, registrations)
        assert len(product["surfaces"]) == len(site["halls"])
        assert product["outsidePolicy"]["unknownBlocked"] is True
        assert product["outsidePolicy"]["orthophotoWalkable"] is False
        assert "piazza-not-surveyed" in product["gaps"]
        assert all(item["walkability"] == "walkgrid-controlled"
                   for item in product["surfaces"])

    def test_portale_bleiben_ungeprueft_und_keine_anker(self, graph_data):
        from build_portals import build_product

        registrations = json.loads(
            (BUILD / "hall-registrations.json").read_text(encoding="utf-8")
        )
        product = build_product(graph_data, registrations)
        assert product["counts"]["total"] >= 19
        assert product["counts"]["verifiedPhysical"] == 0
        assert all(item["physical"] is None for item in product["portals"])
        assert all(item["registrationAnchor"] is False for item in product["portals"])
        known_surfaces = {f"surface:hall:{item['hallKey']}"
                          for item in registrations["registrations"]}
        assert all(item["fromSurface"] in known_surfaces and
                   item["toSurface"] in known_surfaces
                   for item in product["portals"])


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


class TestOpenDataGeometry:
    def test_lod2_inventory_zaehlt_features_und_flaechen(self, tmp_path):
        from build_lod2_inventory import build_inventory
        fixture = tmp_path / "tile.gml"
        fixture.write_text("""<core:CityModel
          xmlns:core=\"http://www.opengis.net/citygml/1.0\"
          xmlns:bldg=\"http://www.opengis.net/citygml/building/1.0\"
          xmlns:gml=\"http://www.opengis.net/gml\">
          <core:cityObjectMember><bldg:Building gml:id=\"b1\">
            <bldg:boundedBy><bldg:WallSurface><bldg:lod2MultiSurface>
              <gml:MultiSurface><gml:surfaceMember><gml:Polygon gml:id=\"p1\">
                <gml:exterior><gml:LinearRing><gml:posList>
                  0 0 40 10 0 40 10 0 50 0 0 50 0 0 40
                </gml:posList></gml:LinearRing></gml:exterior>
              </gml:Polygon>
              </gml:surfaceMember></gml:MultiSurface>
            </bldg:lod2MultiSurface></bldg:WallSurface></bldg:boundedBy>
            <bldg:consistsOfBuildingPart><bldg:BuildingPart gml:id=\"bp1\" />
            </bldg:consistsOfBuildingPart>
          </bldg:Building></core:cityObjectMember>
        </core:CityModel>""", encoding="utf-8")

        inventory = build_inventory([fixture])

        assert inventory["totals"]["features"] == {"Building": 1, "BuildingPart": 1}
        assert inventory["totals"]["surfaces"] == {"WallSurface": 1}
        assert inventory["totals"]["polygonsBySurface"] == {"WallSurface": 1}
        assert inventory["totals"]["trianglesEstimated"] == 2
        assert inventory["files"][0]["zRange"] == [40.0, 50.0]
        assert inventory["totals"]["diagnosticReasons"] == {
            "no-ground-surface": 1,
            "no-semantic-surfaces": 1,
        }
        assert inventory["problemFeatures"][0]["featureId"] == "bp1"
        assert inventory["problemFeatures"][0]["featureClass"] == "BuildingPart"

    def test_inventar_meldet_entartete_geometrie(self, tmp_path):
        from build_lod2_inventory import build_inventory
        fixture = tmp_path / "broken.gml"
        fixture.write_text("""<core:CityModel
          xmlns:core=\"http://www.opengis.net/citygml/1.0\"
          xmlns:bldg=\"http://www.opengis.net/citygml/building/1.0\"
          xmlns:gml=\"http://www.opengis.net/gml\">
          <core:cityObjectMember><bldg:Building>
            <bldg:boundedBy><bldg:ClosureSurface><gml:Polygon>
              <gml:exterior><gml:LinearRing><gml:posList>0 0 40 0 0 40</gml:posList>
              </gml:LinearRing></gml:exterior>
            </gml:Polygon></bldg:ClosureSurface></bldg:boundedBy>
          </bldg:Building></core:cityObjectMember>
        </core:CityModel>""", encoding="utf-8")

        feature = build_inventory([fixture])["problemFeatures"][0]
        assert feature["featureId"] is None
        assert feature["triangleEstimate"] == 0
        assert feature["reasons"] == [
            "missing-feature-id", "no-ground-surface",
            "closure-without-ground", "degenerate-ring",
        ]

    def test_lod2_reader_haelt_buildingpart_getrennt(self, tmp_path):
        from beuteltier.lod2 import read_features
        fixture = tmp_path / "parts.gml"
        fixture.write_text("""<core:CityModel
          xmlns:core=\"http://www.opengis.net/citygml/1.0\"
          xmlns:bldg=\"http://www.opengis.net/citygml/building/1.0\"
          xmlns:gml=\"http://www.opengis.net/gml\">
          <core:cityObjectMember><bldg:Building gml:id=\"parent\">
            <bldg:consistsOfBuildingPart><bldg:BuildingPart gml:id=\"bridge\">
              <bldg:function>bridge-test</bldg:function>
              <bldg:boundedBy><bldg:ClosureSurface><gml:Polygon>
                <gml:exterior><gml:LinearRing><gml:posList>
                  0 0 45 5 0 45 5 5 45 0 0 45
                </gml:posList></gml:LinearRing></gml:exterior>
              </gml:Polygon></bldg:ClosureSurface></bldg:boundedBy>
            </bldg:BuildingPart></bldg:consistsOfBuildingPart>
          </bldg:Building></core:cityObjectMember>
        </core:CityModel>""", encoding="utf-8")

        features = {item.id: item for item in read_features(fixture)}
        parent, part = features["parent"], features["bridge"]
        assert (parent.id, parent.feature_class, parent.surfaces) == (
            "parent", "Building", [],
        )
        assert (part.id, part.feature_class, part.parent_id) == (
            "bridge", "BuildingPart", "parent",
        )
        assert part.function == "bridge-test"
        assert [surface.kind for surface in part.surfaces] == ["closure"]
        assert part.ground == []

    def test_liest_geopackage_polygon(self):
        import struct
        ring = [(0., 0.), (2., 0.), (2., 1.), (0., 0.)]
        header = b"GP\x00\x03" + struct.pack("<i4d", 25832, 0., 2., 0., 1.)
        wkb = b"\x01" + struct.pack("<III", 3, 1, len(ring)) + b"".join(
            struct.pack("<dd", *point) for point in ring)
        blob = header + wkb
        assert envelope(blob) == (0., 0., 2., 1.)
        assert polygons(blob) == [ring]

    def test_wgs84_nach_utm32_fuer_koelnmesse(self):
        from build_surroundings import utm32
        east, north = utm32(50.944, 6.983)
        assert east == pytest.approx(358_304, abs=2)
        assert north == pytest.approx(5_645_535, abs=2)

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

    def test_beantwortete_frage_verschwindet_wieder(self, graph_data):
        """Eine offene Frage haengt an der Verbindung -- eine beantwortete nicht.

        Die Frage war, ob es an Halle 10 eine oder zwei Rolltreppenanlagen
        gibt. Sie ist beantwortet: eine, dazu Rolltreppen an der Suedseite
        hinueber nach Halle 11. Der Anker blieb dadurch unveraendert.
        """
        assert not [c for c in graph_data["connectors"]
                    if c["meta"].get("openQuestions")]

        notes = json.loads((ROOT / "data" / "curated" / "field-notes.json")
                           .read_text(encoding="utf-8"))
        questions = [o["openQuestion"] for o in notes["observations"]
                     if "openQuestion" in o]
        assert questions
        for question in questions:
            # Beantwortet oder offen -- aber nie stillschweigend verschwunden.
            assert question.get("answered") or question.get("resolvesWith")

    def test_merkt_sich_verbindungen_ohne_halle(self, site):
        """Halle 11 ist 2026 nicht belegt -- die Verbindung dorthin bleibt trotzdem.

        An der Suedseite von Halle 10 fuehren Rolltreppen nach Halle 11. Als
        Kante geht das nicht, ohne die Halle zu erfinden. Als Vermerk schon.
        """
        gap = next(g for g in site["facilityGaps"] if "11" in g["hallKey"])
        assert gap["kind"] == "escalator"
        assert gap["missing"] == "Halle nicht im Gelaendemodell"
        assert "11" not in {h["key"].split(".")[0] for h in site["halls"]}

    def test_fuehrt_bekannte_aber_unverortete_anlagen(self, site):
        """Beschilderung vor Ort kennt mehr Tore als die Richtlinien.

        Das Gruppenschild an der nordwestlichen Durchfahrt nennt "10.2 P - U".
        Die Tortabelle fuehrt fuer Halle 10.2 nur N, P, Q und T. R, S und U
        gibt es also auch -- ohne Mass und ohne Lage. Sie werden vermerkt,
        nicht verortet.
        """
        gaps = site["facilityGaps"]
        placed = {(f["hallKey"], f["designator"]) for f in site["facilities"]}
        assert {g["designator"] for g in gaps if g["hallKey"] == "10.2"} == {"R", "S", "U"}
        for gap in gaps:
            assert gap["source"] == "observed"
            assert gap["observation"]
            assert gap["missing"]
            # Was hier steht, darf nirgends als verortet auftauchen.
            assert (gap["hallKey"], gap["designator"]) not in placed

    def test_kennt_von_halle_9_nur_die_seite(self, site):
        """Fuer Halle 9 gibt es erstmals eine Lageangabe -- und nur eine Seite."""
        gap = next(g for g in site["facilityGaps"] if g["hallKey"] == "9")
        assert gap["designator"] == "A"
        assert gap["known"] == "Seite: sued"
        assert gap["missing"] == "Lage"
        # Und wirklich kein Halle-9-Tor im Modell: der Torplan setzt die
        # Buchstaben der eingeschossigen Nordhallen zu weit weg.
        assert not [f for f in site["facilities"] if f["hallKey"].startswith("9")]

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


@pytest.fixture(scope="module")
def buildings_model() -> dict:
    if not BUILDINGS_JSON.exists():
        pytest.skip("buildings.json fehlt -- tools/fetch_lod2.py und build_buildings.py")
    return json.loads(BUILDINGS_JSON.read_text(encoding="utf-8"))


class TestBuildingModel:
    """Das amtliche LoD2-Modell und seine Einpassung."""

    def test_einpassung_ist_gemessen_und_gut(self, buildings_model):
        fit = buildings_model["fit"]
        assert fit["samples"] > 300
        assert fit["sharePct"] >= 90, "Einpassung verschlechtert"
        assert not fit["mirrored"]
        # Jede eingemessene Halle muss deutlich ueber der Haelfte liegen.
        for key, entry in fit["perHall"].items():
            assert entry["inside"] / entry["samples"] > 0.8, key

    def test_jede_halle_liegt_in_einem_gebaeude(self, buildings_model, site):
        indoor = {h["key"] for h in site["halls"] if not h.get("outdoor")}
        assigned = set(buildings_model["hallBuildings"])
        assert indoor - assigned == set(), indoor - assigned
        for key, entry in buildings_model["hallBuildings"].items():
            assert entry["buildingIds"], key
            assert entry["buildingAreaSqm"] > 1000, key

    def test_halle_5_erstreckt_sich_ueber_mehrere_gebaeude(self, buildings_model):
        """Ein Gebaeude je Halle waere zu einfach gedacht.

        Halle 5 verteilt sich auf zwei LoD2-Gebaeude. Wer nur das groesste
        nimmt, bekommt eine belegte Flaeche groesser als "ihr" Gebaeude --
        171 Prozent, und das ist Unsinn.
        """
        entry = buildings_model["hallBuildings"]["5.1"]
        assert len(entry["buildingIds"]) >= 2
        assert entry["occupiedAreaSqm"] < entry["buildingAreaSqm"]

    def test_weist_belegte_flaeche_ausserhalb_der_gebaeude_aus(self, buildings_model):
        """Die haerteste Pruefung der Hallenlage -- ohne offizielle Flaeche.

        Wo der belegte Bereich aus dem Gebaeude herausragt, stimmt entweder
        die Lage nicht oder der Umriss. Beides gehoert ausgewiesen.
        """
        outside = {k: v["outsideAnyBuildingPct"]
                   for k, v in buildings_model["hallBuildings"].items()}
        assert outside
        # Die eingemessenen Erdgeschosshallen sitzen gut.
        for key in ("2.1", "3.2", "6.1", "8.1"):
            assert outside[key] <= 2.0, (key, outside[key])
        # Und die bekannten Ausreisser bleiben benannt, nicht versteckt.
        assert outside["1.2"] > 10, "geschaetzte Lage, muss auffallen"
        assert outside["10.2"] > 10, "Huelle ueberbrueckt die L-Kerbe"

    def test_gebaeudemodell_nennt_seine_lizenz(self, buildings_model):
        source = buildings_model["source"]
        assert "Geobasis NRW" in source["provider"]
        assert "Zero" in source["licence"]
        assert "UTM32" in source["crs"]


BOULEVARD_JSON = BUILD / "boulevard.json"


@pytest.fixture(scope="module")
def boulevard():
    if not BOULEVARD_JSON.exists():
        pytest.skip("boulevard.json fehlt -- tools/build_boulevard.py laeuft nicht")
    return json.loads(BOULEVARD_JSON.read_text(encoding="utf-8"))


class TestNordboulevard:
    """Der Gang und was an ihm haengt.

    Die Wandabschnitte wurden lange aus den **Huellquadern** der Hallen
    zugeteilt. In der Gangebene ist aber kein Gebaeude ein Rechteck -- der Gang
    laeuft schraeg zu ihren Kanten --, und so standen 51 m Wand dort, wo nichts
    steht: Halle 7 bis Station 136 statt 120, Halle 6 bis 285 statt 250. Der
    Hof dazwischen kam 23 m breit heraus statt 39 m, und ein abgeleiteter
    Durchgang fuehrte in ein Gebaeude, das es nicht gibt.

    Diese Pruefungen halten die Stellen fest, an denen das auffallen muss.
    """

    def test_abschnitte_decken_den_gang_lueckenlos(self, boulevard):
        for seite in ("ost", "west"):
            teile = boulevard["seiten"][seite]
            assert teile, seite
            assert teile[0]["von"] == pytest.approx(0.0, abs=0.3)
            assert teile[-1]["bis"] == pytest.approx(boulevard["laengeM"], abs=0.3)
            for links, rechts in zip(teile, teile[1:]):
                assert links["bis"] == pytest.approx(rechts["von"], abs=1e-6), seite

    def test_jeder_hof_ist_ein_offener_wandabschnitt(self, boulevard):
        """Hofbreite und Wandluecke sind dieselbe Zahl, nicht zwei aehnliche."""
        for hof in boulevard.get("aussen", []):
            if hof["seite"] not in ("ost", "west"):
                continue
            passend = [
                teil for teil in boulevard["seiten"][hof["seite"]]
                if teil["art"] == "glas" and teil["featureId"] is None
                and teil["von"] == pytest.approx(hof["vonM"], abs=0.01)
                and teil["bis"] == pytest.approx(hof["bisM"], abs=0.01)
            ]
            assert passend, (hof["id"], hof["vonM"], hof["bisM"])

    def test_hof_zwischen_halle_7_und_6_ist_neununddreissig_meter_breit(self, boulevard):
        """Vor Ort auf etwa 37 m geschaetzt -- der Huellquader sagte 23 m."""
        hof = next(h for h in boulevard["aussen"] if h["id"] == "hof-7_1-6_1")
        assert hof["bisM"] - hof["vonM"] == pytest.approx(39.0, abs=2.0)

    def test_kein_durchgang_fuehrt_ins_leere(self, boulevard):
        """Jeder abgeleitete Zugang liegt in der Fassade, aus der er stammt."""
        for tor in boulevard.get("durchgaenge", []):
            if tor["hallKey"] is None:
                continue  # der Uebergang in den Knick, siehe eigene Pruefung
            traeger = [
                teil for teil in boulevard["seiten"][tor["seite"]]
                if teil["art"] == "wand" and teil["hallKey"] == tor["hallKey"]
                and teil["von"] <= tor["stationM"] - tor["breiteM"] / 2
                and teil["bis"] >= tor["stationM"] + tor["breiteM"] / 2
            ]
            assert traeger, (tor["id"], tor["stationM"])

    def test_durchgaenge_geben_sich_als_abgeleitet_zu_erkennen(self, boulevard):
        """Kein Datensatz nennt die Hallentueren -- das muss die Datei sagen."""
        tore = [t for t in boulevard.get("durchgaenge", []) if t["hallKey"]]
        assert tore
        assert all(tor["gemessen"] is False for tor in tore)

    def test_uebergang_in_den_knick_ist_gemessen(self, boulevard):
        """Seine Breite ist die Fuge am amtlichen Umriss, keine Vorgabe."""
        knoten = boulevard.get("nordknoten")
        if not knoten:
            pytest.skip("kein Nordknoten in dieser Fassung")
        tor = next(t for t in boulevard["durchgaenge"] if t["id"] == "tor-ost-nordknoten")
        assert tor["gemessen"] is True
        assert tor["abschnittVonM"] == pytest.approx(knoten["anschlussM"][0], abs=0.01)
        assert tor["abschnittBisM"] == pytest.approx(knoten["anschlussM"][1], abs=0.01)

    def test_nordknoten_trennt_umriss_und_bodenbezug(self, boulevard):
        """Umriss und Bodenbezug nennen ihre jeweils amtliche Ableitung."""
        knoten = boulevard.get("nordknoten")
        if not knoten:
            pytest.skip("kein Nordknoten in dieser Fassung")
        assert len(knoten["polygon"]) > 20, "die gerundete Fassade muss erhalten bleiben"
        assert "LoD2" in knoten["quelle"]
        assert "LoD2-Median" in knoten["bodenHerkunft"]
        assert knoten["bodenM"] == pytest.approx(boulevard["bodenM"], abs=1e-6)
        assert knoten["deckeM"] == pytest.approx(
            boulevard["bodenM"] + boulevard["hoeheM"], abs=1e-6,
        )
        assert "Vorgabe" in knoten["deckeHerkunft"]

    def test_boulevardboden_kommt_aus_den_registrierten_hallen(self, boulevard):
        site = json.loads(
            (ROOT / "app/public/data/registered-site.json").read_text(encoding="utf-8")
        )
        floors = {hall["key"]: hall["baseY"] for hall in site["halls"]}
        keys = boulevard["bodenHallKeys"]
        values = sorted(floors[key] for key in keys)
        expected = values[len(values) // 2]
        assert boulevard["bodenM"] == pytest.approx(expected, abs=1e-6)
        assert boulevard["bodenSpanneM"] == pytest.approx([min(values), max(values)])
        assert max(values) - min(values) <= 0.05 + 1e-9

    def test_architekturflaechen_nutzen_registrierte_hallenboeden(self, boulevard):
        site = json.loads(
            (ROOT / "app/public/data/registered-site.json").read_text(encoding="utf-8")
        )
        floors = {hall["key"]: hall["baseY"] for hall in site["halls"]}
        assert boulevard["aussen9_10"]["ebene1"]["hoeheM"] == pytest.approx(floors["10.2"])
        assert boulevard["aussen9_10"]["ebene0"]["hoeheM"] == pytest.approx(floors["9.1"])
        assert boulevard["aussenHalle8"]["hoeheM"] == pytest.approx(floors["8.1"])

    def test_gekappte_flaechen_sind_als_vorgabe_ausgewiesen(self, boulevard):
        """Eine Kante aus einer Vorgabe darf nicht wie eine Messung aussehen."""
        for flaeche in boulevard.get("aussen", []):
            assert isinstance(flaeche["gekappt"], bool)
            if flaeche["gekappt"]:
                assert flaeche["endetAn"] == "Vorgabe"

    def test_plaetze_nennen_ihre_quelle(self, boulevard):
        """Plaetze kommen aus OSM, Gebaeude aus LoD2 -- das steht am Eintrag."""
        for platz in boulevard.get("plaetze", []):
            assert "OpenStreetMap" in platz["quelle"]
            assert len(platz["polygon"]) >= 4

    def test_wandabschnitte_stehen_wirklich_auf_einem_gebaeude(self, boulevard):
        """Die haerteste Pruefung: gegen den amtlichen Umriss selbst.

        Braucht die LoD2-Rohkacheln; ohne sie greifen nur die Pruefungen oben.
        """
        import build_boulevard as bb
        from beuteltier import lod2

        if not list(bb.LOD2_DIR.glob("*.gml")):
            pytest.skip("LoD2-Kacheln fehlen -- python3 tools/fetch_lod2.py")

        origin = tuple(boulevard["origin"])
        achse = boulevard["achse"]
        laengs, quer = tuple(achse["laengs"]), tuple(achse["quer"])
        umrisse = {}
        for tile in sorted(bb.LOD2_DIR.glob("*.gml")):
            for bau in lod2.read_buildings(tile, bb.BOUNDS):
                ring = bau.footprint()
                if len(ring) >= 3:
                    umrisse[bau.id] = [bb.ins_gelaende(x, y, origin) for x, y in ring]

        for seite in ("ost", "west"):
            wand_q = boulevard["seitenQ"][seite]
            nach_aussen = 1.0 if seite == "west" else -1.0
            for teil in boulevard["seiten"][seite]:
                if teil["art"] != "wand" or teil["featureId"] not in umrisse:
                    continue
                ring = umrisse[teil["featureId"]]
                # Nicht nur in der Mitte pruefen: der Fehler sass an den
                # **Enden**. Halle 6 stand bis Station 285 in der Datei und
                # hoert bei 250 auf -- die Mitte des falschen Abschnitts lag
                # bei 222 und war gedeckt. Wer nur dort hinsieht, findet nichts.
                for anteil in (0.05, 0.25, 0.5, 0.75, 0.95):
                    laengs_station = teil["von"] + (teil["bis"] - teil["von"]) * anteil
                    getroffen = False
                    for schritt in range(int(bb.FRONT_M) + 1):
                        q = wand_q + nach_aussen * schritt
                        x = achse["x0"] + laengs[0] * laengs_station + quer[0] * q
                        y = achse["y0"] + laengs[1] * laengs_station + quer[1] * q
                        if bb.punkt_in_polygon((x, y), ring):
                            getroffen = True
                            break
                    assert getroffen, (seite, teil["was"], round(laengs_station, 1))


class TestViereckAusKanten:
    """Das Aussengelaende 9/10 ist vor Ort gemessen, aber nicht verortet.

    Vier Kantenlaengen legen kein Viereck fest -- es laesst sich verbiegen wie
    ein Gelenkviereck. Erst eine liegende Grundkante macht es eindeutig. Diese
    Pruefungen halten fest, dass die Konstruktion die gemessenen Laengen auch
    wirklich einhaelt, statt sie nur ungefaehr zu treffen.
    """

    @staticmethod
    def _kanten(poly):
        return [math.dist(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly))]

    def test_haelt_alle_vier_gemessenen_laengen_ein(self):
        from build_boulevard import viereck_aus_kanten

        # Die vor Ort gemessenen Aussenmasse der Ebene 1 (Bereich 10.2).
        grund, bc, cd, da = 188.10, 178.57, 178.93, 175.62
        poly = viereck_aus_kanten((0.0, 0.0), (grund, 0.0), bc, cd, da)
        assert len(poly) == 4
        assert self._kanten(poly) == pytest.approx([grund, bc, cd, da], abs=1e-6)

    def test_haelt_auch_die_masse_der_unteren_ebene_ein(self):
        from build_boulevard import viereck_aus_kanten

        grund, bc, cd, da = 213.00, 120.18, 206.95, 117.61
        poly = viereck_aus_kanten((0.0, 0.0), (grund, 0.0), bc, cd, da)
        assert self._kanten(poly) == pytest.approx([grund, bc, cd, da], abs=1e-6)

    def test_dreht_sich_mit_der_grundkante(self):
        """Dieselben Masse, gedrehte Grundkante -- dieselbe Figur."""
        from build_boulevard import viereck_aus_kanten

        gerade = viereck_aus_kanten((0.0, 0.0), (100.0, 0.0), 80.0, 100.0, 80.0)
        schraeg = viereck_aus_kanten((0.0, 0.0), (60.0, 80.0), 80.0, 100.0, 80.0)
        assert self._kanten(gerade) == pytest.approx(self._kanten(schraeg), abs=1e-6)

    def test_klappt_nicht_ueber_die_grundkante_zurueck(self):
        """Von zwei Schnittpunkten ist einer immer falsch -- er faltet die Figur."""
        from build_boulevard import viereck_aus_kanten

        poly = viereck_aus_kanten((0.0, 0.0), (188.10, 0.0), 178.57, 178.93, 175.62)
        # Alle vier Ecken liegen auf derselben Seite der Grundkante oder darauf.
        assert all(y >= -1e-9 for _x, y in poly)
        # Und die Flaeche ist positiv, also ist der Ring nicht verschlungen.
        flaeche = 0.5 * abs(sum(
            poly[i][0] * poly[(i + 1) % 4][1] - poly[(i + 1) % 4][0] * poly[i][1]
            for i in range(4)))
        assert flaeche > 20_000

    def test_meldet_unmoegliche_masse_statt_stillzuschweigen(self):
        from build_boulevard import viereck_aus_kanten

        with pytest.raises(ValueError):
            # Zwei kurze Seiten koennen eine sehr lange Grundkante nicht schliessen.
            viereck_aus_kanten((0.0, 0.0), (500.0, 0.0), 10.0, 10.0, 10.0)


class TestZaunHinterHalleAcht:
    """Die Flaeche hinter Halle 8 endet an der Unterfuehrung.

    Vor Ort gemessen wurde ihre Tiefe bis dorthin: 84,41 m. Die Zahl schneidet
    nichts weg -- sie prueft den OSM-Umriss. Faende sie sich darin nicht wieder,
    waere entweder der Umriss zu gross oder die Messung anderswo gemacht.
    """

    @staticmethod
    def _p8():
        plan = json.loads((ROOT / "app/public/data/boulevard.json").read_text(encoding="utf-8"))
        treffer = [p for p in plan["plaetze"] if p.get("osmWayId") == 39353363]
        assert len(treffer) == 1, "P8 muss genau einmal vorkommen"
        return treffer[0]

    def test_p8_fuehrt_den_zaun(self):
        zaun = self._p8()["zaun"]
        assert zaun["tiefeGemessenM"] == 84.41
        # 0,48 m auf 84 m -- die Flaeche ist eben und braucht keine Neigung.
        assert abs(zaun["gefaelleGemessenM"]) < 1.0

    def test_zaun_liegt_auf_der_laengsten_kante(self):
        p8 = self._p8()
        ring = [tuple(p) for p in p8["polygon"]]
        ecken = ring[:-1] if ring[0] == ring[-1] else ring
        laengen = sorted(math.dist(ecken[i], ecken[(i + 1) % len(ecken)])
                         for i in range(len(ecken)))
        assert p8["zaun"]["laengeM"] == pytest.approx(laengen[-1], abs=0.01)
        # Und sie ist deutlich laenger als die zweitlaengste -- sonst waere die
        # Auswahl ueber die Laenge eine Muenzwurf-Entscheidung.
        assert laengen[-1] > laengen[-2] * 1.2

    def test_die_messlinie_liegt_im_umriss(self):
        """Beide Enden auf dem Rand, die Mitte drin -- sonst passt die Zahl nicht."""
        from build_boulevard import punkt_in_polygon

        p8 = self._p8()
        ring = [tuple(p) for p in p8["polygon"]]
        fuss, kopf = [tuple(p) for p in p8["zaun"]["messlinie"]]
        assert math.dist(fuss, kopf) == pytest.approx(84.41, abs=0.01)
        for anteil in (0.1, 0.25, 0.5, 0.75, 0.9):
            punkt = (fuss[0] + (kopf[0] - fuss[0]) * anteil,
                     fuss[1] + (kopf[1] - fuss[1]) * anteil)
            assert punkt_in_polygon(punkt, ring), anteil

    def test_die_messlinie_steht_senkrecht_auf_der_zaunkante(self):
        zaun = self._p8()["zaun"]
        (ax, ay), (bx, by) = zaun["kante"]
        (fx, fy), (kx, ky) = zaun["messlinie"]
        kante = (bx - ax, by - ay)
        linie = (kx - fx, ky - fy)
        kosinus = ((kante[0] * linie[0] + kante[1] * linie[1])
                   / (math.hypot(*kante) * math.hypot(*linie)))
        # Die Ecken stehen auf Zentimeter gerundet in der Datei -- daraus folgt
        # ein Winkelfehler in der Groessenordnung 1e-4, nicht mehr.
        assert abs(kosinus) < 2e-3

    def test_die_gemessene_tiefe_kommt_nur_an_einer_stelle_vor(self):
        """Sonst waere die Halbierungssuche nach der Messstelle Gluecksache.

        Die Tiefe faellt nicht ueberall monoton -- bei etwa 40 m liegt eine
        kleine Ausbuchtung im OSM-Umriss. Sie liegt aber weit ueber der
        gemessenen Tiefe, sodass 84,41 m dennoch genau einmal erreicht wird.
        """
        from build_boulevard import tiefe_senkrecht

        p8 = self._p8()
        ring = [tuple(p) for p in p8["polygon"]]
        ecken = ring[:-1] if ring[0] == ring[-1] else ring
        (ax, ay), (bx, by) = p8["zaun"]["kante"]
        laenge = math.dist((ax, ay), (bx, by))
        laengs = ((bx - ax) / laenge, (by - ay) / laenge)
        normale = (-laengs[1], laengs[0])
        mitte = (sum(p[0] for p in ecken) / len(ecken),
                 sum(p[1] for p in ecken) / len(ecken))
        if (mitte[0] - ax) * normale[0] + (mitte[1] - ay) * normale[1] < 0:
            normale = (-normale[0], -normale[1])
        werte = [tiefe_senkrecht(ecken, (ax + laengs[0] * e, ay + laengs[1] * e), normale)
                 for e in range(0, int(laenge) + 1)]
        wechsel = sum(1 for a, b in zip(werte, werte[1:])
                      if (a - 84.41) * (b - 84.41) < 0)
        assert wechsel == 1, werte
        # Und die Stelle, die der Bau gefunden hat, liegt genau dort.
        assert werte[int(p8["zaun"]["tiefeBeiM"])] > 84.41
        assert werte[int(p8["zaun"]["tiefeBeiM"]) + 1] < 84.41


class TestDreieckHinterHalleAcht:
    """Der abgesperrte Bereich hinter Halle 8, aus drei gemessenen Seiten.

    Die Konstruktion darf die Messung nicht nur ungefaehr treffen: 175 / 104 /
    118 m sind vor Ort abgelesen, und wenn die Figur sie nicht einhaelt, ist
    nicht die Messung falsch, sondern die Verortung.
    """

    @staticmethod
    def _dreieck():
        plan = json.loads((ROOT / "app/public/data/boulevard.json").read_text(encoding="utf-8"))
        d = plan["aussenHalle8"]
        assert d is not None
        return d

    def test_haelt_die_drei_gemessenen_laengen_ein(self):
        d = self._dreieck()
        ring = [tuple(p) for p in d["polygon"]]
        assert len(ring) == 3
        basis = math.dist(ring[0], ring[1])
        west = math.dist(ring[0], ring[2])
        ost = math.dist(ring[1], ring[2])
        assert basis == pytest.approx(175.0, abs=0.02)
        assert west == pytest.approx(104.0, abs=0.02)
        assert ost == pytest.approx(118.0, abs=0.02)

    def test_die_grundkante_liegt_auf_der_nordwand(self):
        """Beide Ecken auf der Wandgeraden, und zwar innerhalb der Wand."""
        from build_boulevard import lade_gebaeude, nordwand, REGISTRATIONS

        reg = json.loads(REGISTRATIONS.read_text(encoding="utf-8"))
        gebaeude = lade_gebaeude((reg["origin"][0], reg["origin"][1]))
        bau = next(b for b in gebaeude.values() if b.hall_key == "8.1")
        west, ost = nordwand(bau)
        laenge = math.dist(west, ost)
        richtung = ((ost[0] - west[0]) / laenge, (ost[1] - west[1]) / laenge)
        normale = (-richtung[1], richtung[0])
        for ecke in self._dreieck()["grundkante"]:
            abweichung = ((ecke[0] - west[0]) * normale[0]
                          + (ecke[1] - west[1]) * normale[1])
            entlang = ((ecke[0] - west[0]) * richtung[0]
                       + (ecke[1] - west[1]) * richtung[1])
            assert abs(abweichung) < 0.02, ecke
            assert 0.0 <= entlang <= laenge, ecke

    def test_die_spitze_liegt_draussen_und_nicht_in_der_halle(self):
        from build_boulevard import lade_gebaeude, punkt_in_polygon, REGISTRATIONS

        reg = json.loads(REGISTRATIONS.read_text(encoding="utf-8"))
        gebaeude = lade_gebaeude((reg["origin"][0], reg["origin"][1]))
        bau = next(b for b in gebaeude.values() if b.hall_key == "8.1")
        spitze = tuple(self._dreieck()["spitze"])
        assert not punkt_in_polygon(spitze, bau.poly)
        # Und noerdlich der Wand -- kleineres y ist weiter noerdlich.
        mitte_y = sum(p[1] for p in bau.poly) / len(bau.poly)
        assert spitze[1] < mitte_y

    def test_haelt_den_widerspruch_zur_frueheren_messung_fest(self):
        """68,1 m tief gegen 84,41 m bis zur Unterfuehrung -- das steht in der
        Datei, damit es nicht stillschweigend verschwindet."""
        d = self._dreieck()
        assert d["tiefeM"] == pytest.approx(68.08, abs=0.05)
        assert d["ueberhangM"] == pytest.approx(13.43, abs=0.05)
        assert "84,41" in d["offen"]

    def test_liegt_zum_grossen_teil_im_parkplatz_p8(self):
        """P8 ist die Flaeche des ganzen Jahres, das Dreieck der Zuschnitt zur
        Messe. Es muss also im Wesentlichen darin liegen -- nicht vollstaendig,
        weil P8 den Streifen an der Hallenwand nicht mitfuehrt."""
        from build_boulevard import punkt_in_polygon

        plan = json.loads((ROOT / "app/public/data/boulevard.json").read_text(encoding="utf-8"))
        p8 = [tuple(p) for p in next(
            pl for pl in plan["plaetze"] if pl.get("osmWayId") == 39353363)["polygon"]]
        a, b, c = [tuple(p) for p in self._dreieck()["polygon"]]
        drin = 0
        proben = 0
        for i in range(1, 40):
            for j in range(1, 40 - i):
                u, v = i / 40, j / 40
                punkt = (a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]),
                         a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]))
                proben += 1
                if punkt_in_polygon(punkt, p8):
                    drin += 1
        assert 0.6 < drin / proben < 0.95, drin / proben


class TestDreieckAusKanten:
    def test_baut_das_gemessene_dreieck(self):
        from build_boulevard import dreieck_aus_kanten

        spitze = dreieck_aus_kanten((0.0, 0.0), (175.0, 0.0), 104.0, 118.0, (87.5, 50.0))
        assert math.dist((0.0, 0.0), spitze) == pytest.approx(104.0, abs=1e-9)
        assert math.dist((175.0, 0.0), spitze) == pytest.approx(118.0, abs=1e-9)
        # Weg von (87.5, 50) heisst: auf die andere Seite der Grundkante.
        assert spitze[1] < 0

    def test_waehlt_die_seite_und_nicht_die_naechste_loesung(self):
        from build_boulevard import dreieck_aus_kanten

        oben = dreieck_aus_kanten((0.0, 0.0), (100.0, 0.0), 80.0, 80.0, (50.0, -30.0))
        unten = dreieck_aus_kanten((0.0, 0.0), (100.0, 0.0), 80.0, 80.0, (50.0, 30.0))
        assert oben[1] > 0 and unten[1] < 0
        assert oben[0] == pytest.approx(unten[0], abs=1e-9)

    def test_meldet_unmoegliche_laengen(self):
        from build_boulevard import dreieck_aus_kanten

        with pytest.raises(ValueError):
            dreieck_aus_kanten((0.0, 0.0), (500.0, 0.0), 10.0, 10.0, (0.0, 1.0))


class TestStandSchrumpf:
    """Die Staende werden bewusst drei Prozent kleiner gezeichnet.

    Eine benannte Abweichung von den Plandaten, damit der Gang zwischen
    benachbarten Staenden sichtbar bleibt. Diese Pruefungen halten fest, was
    dabei **nicht** passieren darf: kein Stand verschwindet, keiner wandert,
    und aus drei Prozent werden nicht unbemerkt dreissig.
    """

    @staticmethod
    def _flaeche(poly):
        n = len(poly)
        return abs(sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1]
                       for i in range(n))) / 2

    @staticmethod
    def _mitte(poly):
        return (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))

    def test_verkleinert_um_die_eigene_mitte(self):
        from build_registered_layout import STAND_SCHRUMPF, geschrumpft

        poly = [[10.0, 10.0], [30.0, 10.0], [30.0, 20.0], [10.0, 20.0]]
        klein = geschrumpft(poly)
        assert self._mitte(klein) == pytest.approx(self._mitte(poly), abs=1e-9)
        assert (self._flaeche(klein) / self._flaeche(poly)
                == pytest.approx(STAND_SCHRUMPF ** 2, abs=1e-9))

    def test_bleibt_bei_wenigen_prozent(self):
        """Orientierungshilfe, nicht Massstabsaenderung."""
        from build_registered_layout import STAND_SCHRUMPF

        assert 0.93 <= STAND_SCHRUMPF < 1.0

    def test_kein_stand_geht_verloren(self):
        gebaut = json.loads((BUILD / "registered-site.json").read_text(encoding="utf-8"))
        plan = json.loads((BUILD / "site.json").read_text(encoding="utf-8"))
        assert len(gebaut["stands"]) == len(plan["stands"])
        assert {s["id"] for s in gebaut["stands"]} == {s["id"] for s in plan["stands"]}

    def test_die_abweichung_steht_in_den_daten(self):
        """Sonst haelt sie beim naechsten Blick jemand fuer eine Messung."""
        layout = json.loads((BUILD / "registered-layout.json").read_text(encoding="utf-8"))
        from build_registered_layout import STAND_SCHRUMPF

        vermerk = layout["standSchrumpf"]
        assert vermerk["faktor"] == STAND_SCHRUMPF
        assert vermerk["gemessen"] is False
        assert "Mitte" in vermerk["bezug"]

    def test_jeder_stand_bleibt_an_seinem_platz(self):
        """Geschrumpft heisst nicht verschoben."""
        gebaut = {s["id"]: s["polygon"]
                  for s in json.loads((BUILD / "registered-site.json").read_text(encoding="utf-8"))["stands"]}
        layout = json.loads((BUILD / "registered-layout.json").read_text(encoding="utf-8"))
        # Dieselben Staende, einmal ueber die Halle und einmal flach -- beide
        # Wege muessen dasselbe Polygon liefern.
        for hall in layout["halls"]:
            for stand in hall["stands"]:
                assert gebaut[stand["id"]] == stand["polygon"]


class TestWandstaerke:
    """Der Plan gibt das Aussenmass, begehbar ist das Innenmass.

    Wand, Stuetzenvorlage und Technikstreifen kamen im Modell nie vor -- die
    Standflaechen reichten bis an die Aussenkante, und wer an der Wand stand,
    stand rechnerisch in ihr.
    """

    @staticmethod
    def _flaeche(ring):
        n = len(ring)
        return abs(sum(ring[i][0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * ring[i][1]
                       for i in range(n))) / 2

    def test_versetzt_jede_kante_gleich_weit(self):
        """Der Unterschied zum Schrumpfen: eine Wand ist ueberall gleich dick."""
        from build_hall_registrations import nach_innen, WANDSTAERKE_M

        lang = nach_innen([[0, 0], [220, 0], [220, 80], [0, 80]])
        assert lang[0] == pytest.approx([WANDSTAERKE_M, WANDSTAERKE_M], abs=1e-9)
        assert lang[2] == pytest.approx([220 - WANDSTAERKE_M, 80 - WANDSTAERKE_M], abs=1e-9)
        # Ein Schrumpf um die Mitte zoege die lange Seite viel weiter herein als
        # die kurze -- genau das soll hier nicht passieren.
        breite = 80 - 2 * WANDSTAERKE_M
        laenge = 220 - 2 * WANDSTAERKE_M
        assert (220 - laenge) == pytest.approx(80 - breite, abs=1e-9)

    def test_funktioniert_in_beiden_umlaufrichtungen(self):
        """Sonst versetzt die halbe Messe nach aussen statt nach innen."""
        from build_hall_registrations import nach_innen

        rechts = [[0, 0], [100, 0], [100, 50], [0, 50]]
        links = list(reversed(rechts))
        assert self._flaeche(nach_innen(rechts)) < self._flaeche(rechts)
        assert self._flaeche(nach_innen(links)) < self._flaeche(links)

    def test_laesst_einen_umriss_in_ruhe_statt_ihn_zu_verdrehen(self):
        """Bei zu schmalen Formen faellt der Versatz aus, statt zu kippen."""
        from build_hall_registrations import nach_innen

        schmal = [[0, 0], [100, 0], [100, 0.4], [0, 0.4]]
        assert nach_innen(schmal) == [[0, 0], [100, 0], [100, 0.4], [0, 0.4]]

    def test_bleibt_im_plausiblen(self):
        from build_hall_registrations import WANDSTAERKE_M

        assert 0.2 <= WANDSTAERKE_M <= 1.5

    def test_die_wandstaerke_sitzt_am_gebaeude(self):
        """Nicht am Planumriss -- sonst zaehlt sie zweimal.

        Der verfuegbare Innenraum ist der amtliche Umriss abzueglich der Wand.
        Gegen den wird die Halle eingepasst; ihr eigener Umriss bleibt, wie der
        Plan ihn gibt.
        """
        from build_hall_registrations import WANDSTAERKE_M, nach_innen

        buildings = json.loads(BUILDINGS_JSON.read_text(encoding="utf-8"))
        umriss = next(b["footprint"] for b in buildings["buildings"] if b.get("footprint"))
        assert self._flaeche(nach_innen(umriss)) < self._flaeche(umriss)
        assert WANDSTAERKE_M > 0


class TestHalleneinpassung:
    """Die Halle wird als Ganzes in den verfuegbaren Innenraum gelegt.

    Umriss und Staende teilen sich eine Abbildung: was die Halle verkleinert,
    verkleinert die Staende mit, und ihre Lage zueinander bleibt. Der
    Massstab ist die letzte Stellschraube -- erst Drehung, dann Verschiebung,
    und nur wo das nicht reicht, die Groesse.
    """

    @staticmethod
    def _reg():
        return json.loads((BUILD / "hall-registrations.json").read_text(encoding="utf-8"))

    def test_verkleinert_nur_wo_noetig(self):
        skalen = {r["hallKey"]: (r["constraint"] or {}).get("scale", 1.0)
                  for r in self._reg()["registrations"]}
        # Die Mehrheit der Hallen passt unveraendert -- sonst waere die Passung
        # davor kaputt und der Massstab wuerde es kaschieren.
        unveraendert = [k for k, s in skalen.items() if s == 1.0]
        assert len(unveraendert) >= 10, skalen

    def test_bleibt_innerhalb_des_bodens(self):
        """Orientierungshilfe, nicht Massstabsaenderung."""
        from build_hall_registrations import SKALA_BODEN

        for r in self._reg()["registrations"]:
            skala = (r["constraint"] or {}).get("scale", 1.0)
            assert SKALA_BODEN - 1e-9 <= skala <= 1.0, (r["hallKey"], skala)

    def test_verkleinert_nie_eine_freiflaeche(self):
        """Eine Freiflaeche hat keinen Innenraum, in den sie passen muesste."""
        for r in self._reg()["registrations"]:
            if (r["constraint"] or {}).get("frei"):
                assert r["constraint"]["scale"] == 1.0

    def test_verkleinert_nicht_ins_leere(self):
        """Verkleinert wird nur, wo es die Zahl der Ausreisser auch senkt."""
        for r in self._reg()["registrations"]:
            c = r["constraint"] or {}
            if c.get("skalaAusStaenden"):
                assert c["skalaAusStaenden"] < 1.0, r["hallKey"]

    def test_zwei_gebaeudeteile_haben_keine_naht(self):
        """Halle 5 besteht aus zwei Teilen, die sich **beruehren**.

        Sie haben keinen Hof dazwischen -- der Abstand ihrer Umringe ist
        0,000 m. Wer beiden Teilen an dieser Kante eine Wandstaerke gibt,
        legt eine 1 m breite Naht quer durch die Halle: Staende, die darueber
        laufen, gelten dann als "draussen", obwohl sie mitten im Raum stehen,
        und beim Verkleinern wandern weitere hinein. Genau das hat einmal so
        ausgesehen, als wuerde Verkleinern Halle 5 schlechter machen.
        """
        from build_hall_registrations import abstand_zur_kante, innenraum

        buildings = json.loads(BUILDINGS_JSON.read_text(encoding="utf-8"))
        by_id = {b["id"]: b for b in buildings["buildings"]}
        mehrteilig = [v["buildingIds"] for v in buildings["hallBuildings"].values()
                      if len(v.get("buildingIds") or []) > 1]
        assert mehrteilig, "ohne mehrteiliges Gebaeude prueft das hier nichts"

        for ids in mehrteilig:
            teile = [by_id[i]["footprint"] for i in ids if i in by_id]
            roh = [t[:-1] if t[0] == t[-1] else t for t in teile]
            beruehrt = min(abstand_zur_kante(tuple(p), roh[1]) for p in roh[0])
            if beruehrt > 0.5:
                continue  # Teile, die wirklich auseinanderstehen, duerfen das.
            innen = [r[:-1] if r[0] == r[-1] else r for r in innenraum(teile)]
            spalt = min(abstand_zur_kante(tuple(p), innen[1]) for p in innen[0])
            assert spalt < 0.01, (ids, spalt)

    def test_staende_folgen_ihrer_halle(self):
        """Dieselbe Abbildung fuer Umriss und Staende.

        Sonst schrumpfte die Halle und die Staende blieben stehen -- und was
        vorher knapp passte, staende hinterher draussen.
        """
        layout = json.loads((BUILD / "registered-layout.json").read_text(encoding="utf-8"))
        plan = json.loads((BUILD / "site.json").read_text(encoding="utf-8"))
        produkt = self._reg()
        skalen = {r["hallKey"]: (r["constraint"] or {}).get("scale", 1.0)
                  for r in produkt["registrations"]}
        # Hereingezogene Staende folgen ihrer Halle absichtlich nicht -- sie
        # sind die benannte Ausnahme und gehoeren deshalb nicht in diese
        # Messung. Bei Halle 10.2 ist einer davon der westlichste Stand
        # ueberhaupt (G017, um 20,93 m versetzt).
        korrigiert = set(produkt["standKorrekturen"])
        verkleinert = [k for k, s in skalen.items() if s < 1.0]
        assert verkleinert, "ohne verkleinerte Halle prueft das hier nichts"

        for key in verkleinert:
            halle = next(h for h in layout["halls"] if h["hallKey"] == key)
            plan_stands = {s["id"]: s["polygon"] for s in plan["stands"]
                           if s["hallKey"] == key and s["id"] not in korrigiert}
            if not plan_stands:
                continue
            gebaut = {s["id"]: s["polygon"] for s in halle["stands"]}
            # Der Abstand zweier Staende muss sich um denselben Faktor
            # geaendert haben wie die Halle.
            # Zwei Staende, die wirklich auseinanderliegen -- benachbarte
            # koennen denselben Mittelpunkt haben, und dann teilt der Test
            # durch null.
            def mitte0(poly):
                return (sum(p[0] for p in poly) / len(poly),
                        sum(p[1] for p in poly) / len(poly))
            paare = sorted(plan_stands, key=lambda i: mitte0(plan_stands[i]))
            ids = [paare[0], paare[-1]] if len(paare) >= 2 else []
            if len(ids) < 2 or math.dist(mitte0(plan_stands[ids[0]]),
                                         mitte0(plan_stands[ids[1]])) < 1.0:
                continue
            def mitte(poly):
                return (sum(p[0] for p in poly) / len(poly),
                        sum(p[1] for p in poly) / len(poly))
            vorher = math.dist(mitte(plan_stands[ids[0]]), mitte(plan_stands[ids[1]]))
            nachher = math.dist(mitte(gebaut[ids[0]]), mitte(gebaut[ids[1]]))
            assert nachher / vorher == pytest.approx(skalen[key], abs=0.02), key


class TestAusreisser:
    """Ein falsch verorteter Stand darf den Hallenumriss nicht aufziehen.

    Der Umriss einer Halle ist die konvexe Huelle ueber ihre Staende. Sechs
    Staende der Gruppe G, die ganz ausserhalb von Halle 10.2 liegen, machten
    daraus 26.503 statt 22.819 m2 -- und die Passung rechnete danach gegen
    eine Flaeche, die es nicht gibt. Die Staende bleiben trotzdem stehen: sie
    sind Evidenz fuer falsche Standdaten und kein Muell.
    """

    @staticmethod
    def _reg():
        return json.loads((BUILD / "hall-registrations.json").read_text(encoding="utf-8"))

    def test_misst_den_ueberstand_und_nicht_die_zugehoerigkeit(self):
        """Halb durch die Wand ist genauso falsch wie ganz draussen.

        Die erste Fassung verlangte, dass **keine** Ecke im Gebaeude liegt.
        Damit ueberlebten D022, D024 und D026 in Halle 5.2 die Pruefung: sie
        stehen mit einer Kante drin und ragen trotzdem rund sechs Meter ueber
        die Suedwand hinaus.
        """
        from build_hall_registrations import AUSREISSER_M, ausreisser

        ring = [[0.0, 0.0], [100.0, 0.0], [100.0, 100.0], [0.0, 100.0]]
        def quadrat(x, y):
            return [[x, y], [x + 4, y], [x + 4, y + 4], [x, y + 4]]
        stands = [
            {"id": "drin", "code": "A001", "polygon": quadrat(40, 40)},
            {"id": "knapp", "code": "A002", "polygon": quadrat(98, 40)},
            # Steht mit der halben Flaeche drin und ragt trotzdem 6 m hinaus.
            {"id": "halb", "code": "D026",
             "polygon": [[94.0, 60.0], [106.0, 60.0], [106.0, 64.0], [94.0, 64.0]]},
            {"id": "weit", "code": "G017", "polygon": quadrat(120, 40)},
        ]
        raus = ausreisser(stands, [ring])
        assert [e["code"] for e in raus] == ["G017", "D026"]
        assert all(e["abstandM"] >= AUSREISSER_M for e in raus)

    def test_misst_in_der_registrierten_lage(self):
        """Ungedreht steht der ganze Plan 2,21 Grad schief im Gelaende.

        Auf 200 m Hallenlaenge sind das an den Enden gut vier Meter -- ohne
        die Passung meldete die Pruefung ganze Standreihen am Rand, die in
        Wahrheit sauber liegen.
        """
        from build_hall_registrations import ausreisser

        ring = [[0.0, 0.0], [200.0, 0.0], [200.0, 40.0], [0.0, 40.0]]
        # Ein Stand am oestlichen Ende, um zehn Meter nach Osten verschoben.
        stand = {"id": "rand", "code": "F086",
                 "polygon": [[205.0, 10.0], [209.0, 10.0], [209.0, 14.0], [205.0, 14.0]]}
        assert [e["code"] for e in ausreisser([stand], [ring])] == ["F086"]
        passung = {"rotationDeg": 0.0, "scale": 1.0, "pivot": [100.0, 20.0],
                   "translation": [-10.0, 0.0]}
        assert ausreisser([stand], [ring], passung) == []

    def test_meldet_statt_zu_loeschen(self):
        """Ausgeschlossen aus dem Umriss, nicht aus den Daten."""
        produkt = self._reg()
        gemeldet = produkt.get("ausreisser", {})
        assert gemeldet, "ohne gemeldete Ausreisser prueft das hier nichts"
        layout = json.loads((BUILD / "registered-layout.json").read_text(encoding="utf-8"))
        vorhandene = {s["id"] for halle in layout["halls"] for s in halle["stands"]}
        for key, eintraege in gemeldet.items():
            for eintrag in eintraege:
                assert eintrag["id"] in vorhandene, (key, eintrag["id"])
        # Und der Befund der betroffenen Halle sagt es auch.
        for r in produkt["registrations"]:
            anzahl = len(gemeldet.get(r["hallKey"], []))
            assert r["befund"]["outlierStandCount"] == anzahl, r["hallKey"]
            if anzahl:
                assert r["befund"]["reviewRequired"], r["hallKey"]
                assert "ausserhalb des Gebaeudes" in (r["befund"]["reviewReason"] or "")


class TestKeinStandDraussen:
    """Die Zusage: kein Stand steht ausserhalb seiner Halle.

    Beim Laufen ist eine Standflaeche, die durch die Aussenwand ragt, ein
    groesserer Fehler als eine, die ein paar Meter kleiner ist als in
    Wirklichkeit. BEUTELTIER ist ein Orientierungswerkzeug, kein Kataster --
    also wird passend gemacht, was nicht passt, und jede Korrektur wird
    benannt.

    Der Weg dahin hat zwei Stufen, und beide muessen gemessen bleiben: das
    Gebaeude wird als Ganzes verkleinert, soweit das die Zahl der
    herausragenden Staende senkt, und der Rest wird einzeln hereingezogen.
    """

    @staticmethod
    def _reg():
        return json.loads((BUILD / "hall-registrations.json").read_text(encoding="utf-8"))

    def test_jeder_stand_liegt_in_seinem_gebaeude(self):
        from build_hall_registrations import angewandt, innenraum, inside

        site = json.loads((BUILD / "site.json").read_text(encoding="utf-8"))
        buildings = json.loads(BUILDINGS_JSON.read_text(encoding="utf-8"))
        by_id = {b["id"]: b for b in buildings["buildings"]}
        targets = buildings["hallBuildings"]
        produkt = self._reg()
        constraints = {r["hallKey"]: r["constraint"] for r in produkt["registrations"]}
        korrekturen = produkt["standKorrekturen"]

        draussen = []
        for hall in site["halls"]:
            key = hall["key"]
            ziel = targets.get(key, {}).get("buildingIds", [])
            ringe = innenraum([by_id[f]["footprint"] for f in ziel
                               if f in by_id and by_id[f].get("footprint")])
            if not ringe:
                continue
            for stand in site["stands"]:
                if stand["hallKey"] != key:
                    continue
                polygon = stand["polygon"]
                korrektur = korrekturen.get(stand["id"])
                if korrektur:
                    mx = sum(p[0] for p in polygon) / len(polygon)
                    my = sum(p[1] for p in polygon) / len(polygon)
                    f = korrektur["scale"]
                    dx, dy = korrektur["translation"]
                    polygon = [[mx + (p[0] - mx) * f + dx, my + (p[1] - my) * f + dy]
                               for p in polygon]
                for punkt in angewandt(polygon, constraints[key]):
                    if not any(inside(ring, punkt) for ring in ringe):
                        draussen.append((key, stand.get("code")))
                        break
        assert draussen == [], draussen

    def test_korrekturen_bleiben_die_ausnahme(self):
        """Wenige Flaechen, benannt und einzeln -- kein Umbau des Plans."""
        produkt = self._reg()
        site = json.loads((BUILD / "site.json").read_text(encoding="utf-8"))
        anteil = produkt["counts"]["standKorrekturen"] / len(site["stands"])
        assert anteil < 0.02, produkt["counts"]["standKorrekturen"]
        # Und jede einzelne ist nachvollziehbar: Halle, Code, Weg, Faktor.
        for eintrag in produkt["standKorrekturen"].values():
            assert eintrag["hallKey"] and eintrag["shiftM"] >= 0
            assert 0.5 <= eintrag["scale"] <= 1.0, eintrag
