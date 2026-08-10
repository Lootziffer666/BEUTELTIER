/**
 * Das Gelände in 3D.
 *
 * Warum nicht flach: die Koelnmesse geht über zwei Ebenen, und die Laufwege
 * ändern sich stündlich. Eine 2D-Karte mit Ebenenumschalter zerreißt genau
 * die Information, auf die es ankommt -- den Ebenenwechsel als Teil der Route.
 * Hier ist er ein sichtbares senkrechtes Stück im Weg.
 *
 * Die flache Ansicht geht dabei nicht verloren: „Laufmodus" ist eine
 * Kameraposition von oben, kein zweiter Renderer.
 */

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, useGLTF, type OrbitControlsProps } from '@react-three/drei';
import * as THREE from 'three';

import type { Dataset } from '../data/load';
import { siteCentre } from '../data/load';
import type { Ortho } from '../data/load';
import type { Route } from '../routing/route';
import { mergePolygons, polygonCentre, projiziereUV, toScene } from './geometry';
import { EYE_HEIGHT_M } from './walk';
import {
  ceilingSurface,
  disposeSurface,
  facadeSurface,
  floorSurface,
  hallenbodenSurface,
  hallendeckeSurface,
  orthoTexture,
  standSurface,
  WELT_KACHEL_M,
  type Surface,
} from './materials';
import { fernsteuerungErlaubt } from './fernsteuerung';
import { Beleuchtung } from './lighting';
import { Deckenleuchten, Hallenhuelle, Hallenlicht } from './interior';
import { Boulevard } from './boulevard';
import { Markenstaende } from './Markenstaende';
import { MARKEN_STAND_IDS } from './marken';
import { Vertikalverbindungen } from './vertical';
import type { CameraSnapshot } from './survey';
import { ProceduralStaging } from './ProceduralStaging';
import {
  FAMILIEN,
  konturHuelle,
  konturStaerke,
  stufenTextur,
  toonMaterial,
  type Familie,
} from './stil';
import { Kontur } from './Kontur';

export type CameraPreset = 'uebersicht' | 'halle' | 'laufmodus' | 'ego';

export interface SceneProps {
  data: Dataset;
  /** Sichtbarkeit der oberen Ebene: 0 = ausgeblendet, 1 = voll. */
  upperOpacity: number;
  selectedStandId: string | null;
  routeStandIds: string[];
  route: Route | null;
  preset: CameraPreset;
  focusHallKey: string | null;
  onSelectStand: (standId: string | null) => void;
  /** Verlässt die Ego-Perspektive, wenn der Nutzer Escape drückt. */
  onLeaveEgo?: () => void;
  /** Sparsames Glas: keine Transmission, kein Durchblick -- dafür schnell. */
  previewSafe?: boolean;
  /**
   * Der BEUTELTIER-Look: gestufte Beleuchtung und Konturen statt PBR.
   *
   * Ein Schalter und keine Annahme im Quelltext, weil der alte Look die
   * Rückfallebene bleibt, solange nicht alles umgestellt ist -- und weil man
   * beim Vergleichen sofort sehen will, was der Stil eigentlich tut.
   */
  cel?: boolean;
  /** Vermessungsmodus: Kollision aus, um Referenzfoto-Perspektiven zu erreichen. */
  noClip?: boolean;
  /** Bewegung und Umsehen pausiert, während ein Referenzfoto ausgerichtet wird. */
  frozen?: boolean;
  /** Zeiger ist für das Referenzfoto-Overlay freigegeben, kein Pointer Lock. */
  viewfinderOpen?: boolean;
  onToggleNoClip?: () => void;
  onToggleFreeze?: () => void;
  onToggleViewfinder?: () => void;
  /** Aktueller Kamerazustand wird an den Aufrufer gereicht, keine Beschreibung nötig. */
  onMark?: (snapshot: CameraSnapshot) => void;
  onCameraSnapshot?: (snapshot: CameraSnapshot) => void;
  /** Meldet die Zahl tatsächlich erzeugter ProceduralStaging-Objekte --
   * bestimmt, ob der Inszenierungs-Hinweis angezeigt werden darf. */
  onStagingObjectCount?: (count: number) => void;
}

const COLOURS = {
  ground: '#12141b',
  hallLower: '#243044',
  hallUpper: '#3a2f46',
  block: '#161b26',
  standLower: '#3f7dd6',
  standUpper: '#d98a3f',
  standOccupied: '#f0b23c',
  // Von oben trennt Farbe die Ebenen. Auf Augenhöhe steht man dagegen im
  // Messebau, und der ist weiß bis hellgrau -- ein blauer Klotz neben dem
  // LEGO-Stand sähe aus wie ein Spielzeug, nicht wie eine Halle.
  standInterior: '#c6cad2',
  standInteriorOccupied: '#e6dcc6',
  selected: '#ff5c8a',
  route: '#4ade80',
  routeUnconfirmed: '#facc15',
  estimated: '#8b6f2f',
};

const STAND_HEIGHT_M = 2.6;

/** Das eingepasste LoD2-Modell der Koelnmesse, gebaut von tools/build_buildings.py. */
const MODEL_URL = `${import.meta.env.BASE_URL}models/messe.glb`;
/** Das entzerrte Senkrechtluftbild, gebaut von tools/build_ortho.py. */
const ORTHO_URL = `${import.meta.env.BASE_URL}models/gelaende.jpg`;
/**
 * Darf `__SETZEN` gestellt werden? Einmal beim Laden entschieden -- die Adresse
 * ändert sich innerhalb einer Sitzung nicht (siehe `fernsteuerung.ts`).
 */
const SETZEN_ERLAUBT =
  typeof window !== 'undefined' && fernsteuerungErlaubt(window.location.search);

/** Wie durchsichtig die Gebäudehülle in der Übersicht ist. */
const SHELL_OPACITY = 0.16;
/** In der Ego-Perspektive ist die Wand eine Wand. */
const SHELL_OPACITY_EGO = 0.92;

/** Gehgeschwindigkeit auf einer vollen Messe -- kein Sprint. */
const WALK_SPEED_M_PER_S = 1.6;
const RUN_SPEED_M_PER_S = 4.2;

/**
 * Der Boden ist das Luftbild, nicht eine graue Fläche.
 *
 * Der Ausschnitt steht in `data/build/ortho.json` und wird beim Bauen in
 * dieselben Geländemeter entzerrt wie alles andere — deshalb genügt hier ein
 * achsparalleles Rechteck ohne jede Drehung.
 */
function Ground({
  extent,
  centre,
  ortho: meta,
}: {
  extent: number;
  centre: [number, number];
  ortho: Ortho | null;
}) {
  const ortho = useMemo(() => (meta ? orthoTexture(ORTHO_URL) : null), [meta]);
  if (!meta || !ortho) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]} receiveShadow>
        <planeGeometry args={[extent * 2.2, extent * 2.2]} />
        <meshStandardMaterial color={COLOURS.ground} roughness={1} />
      </mesh>
    );
  }
  const extentM = meta.extent;
  const width = extentM[2] - extentM[0];
  const height = extentM[3] - extentM[1];
  const midX = (extentM[0] + extentM[2]) / 2 - centre[0];
  const midZ = (extentM[1] + extentM[3]) / 2 - centre[1];

  return (
    <group>
      {/* Dahinter, damit der Horizont nicht abreisst. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]} receiveShadow>
        <planeGeometry args={[extent * 3, extent * 3]} />
        <meshStandardMaterial color={COLOURS.ground} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[midX, -0.4, midZ]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={ortho} roughness={0.88} envMapIntensity={0.6} />
      </mesh>
    </group>
  );
}

/** OSM-Wege/POIs und nur die von LoD2 nicht abgedeckten ALKIS-Nebenbauten. */
function Umgebung({ data, centre }: { data: Dataset; centre: [number, number] }) {
  const roads = useMemo(() => {
    const positions: number[] = [];
    for (const road of data.surroundings?.roads ?? []) {
      for (let index = 1; index < road.points.length; index += 1) {
        for (const point of [road.points[index - 1], road.points[index]]) {
          positions.push(point[0] - centre[0], -0.24, point[1] - centre[1]);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, [data.surroundings, centre]);
  const markers = useMemo(() => {
    const positions = (data.surroundings?.markers ?? []).flatMap(({ point }) =>
      [point[0] - centre[0], 0.15, point[1] - centre[1]]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, [data.surroundings, centre]);
  const gaps = useMemo(() => (data.footprints?.footprints ?? [])
    .filter((one) => !one.lod2Covered)
    .map((one) => {
      const shape = new THREE.Shape(one.footprint.map(([x, y]) =>
        // Gegengespiegelt: die Drehung beim Einhängen legt lokales Y auf -Z.
        new THREE.Vector2(x - centre[0], centre[1] - y)));
      return { id: one.id, geometry: new THREE.ShapeGeometry(shape) };
    }), [data.footprints, centre]);
  useEffect(() => () => {
    roads.dispose();
    markers.dispose();
    gaps.forEach(({ geometry }) => geometry.dispose());
  }, [roads, markers, gaps]);
  if (!data.surroundings && !data.footprints) return null;
  return (
    <group>
      <lineSegments geometry={roads}>
        <lineBasicMaterial color="#d9d4c3" transparent opacity={0.9} />
      </lineSegments>
      <points geometry={markers}>
        <pointsMaterial color="#ffca52" size={2.2} sizeAttenuation />
      </points>
      {gaps.map(({ id, geometry }) => (
        <mesh key={id} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]}>
          {/* Die Umgebung hat keine Familie: die Stilbibel fuehrt zehn fuer
              die Messe, und Nachbargebaeude sind keine davon. Sie behalten
              ihr gedecktes Grau und bekommen nur die Stufen -- als Familie
              gestrichen waeren sie heller als die Halle davor und damit
              Vordergrund. */}
          <meshToonMaterial color="#68737c" gradientMap={stufenTextur(2)} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Das amtliche Gebäudemodell als Gelände.
 *
 * Die Grundrisse kommen aus dem LoD2-Modell der Geobasis NRW und stehen in
 * denselben Geländemetern wie alles andere — eingepasst mit 96 % Treffern.
 * Die Wände bleiben durchscheinend: das Gebäude ist der Rahmen, die Stände
 * sind der Inhalt. Erst im Laufmodus wird daraus eine Wand, an der man steht.
 */
function Gelaende({
  centre,
  opacity,
  interior,
}: {
  centre: [number, number];
  opacity: number;
  /** Steht der Betrachter im Gebäude? Dann ist das Dach eine Decke. */
  interior: boolean;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const ortho = useMemo(() => orthoTexture(ORTHO_URL), []);

  // Drei Flächenarten, drei Materialsätze — jeder mit Farbe, Normale und
  // Rauheit. Erzeugt wird einmal, nicht je Halle.
  const surfaces = useMemo<Record<string, Surface>>(
    () => ({
      facade: facadeSurface(false),
      interior: facadeSurface(true),
      floor: floorSurface(),
      ceiling: ceilingSurface(),
    }),
    [],
  );
  useEffect(
    () => () => Object.values(surfaces).forEach(disposeSurface),
    [surfaces],
  );

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const source = node.material as THREE.MeshStandardMaterial;
      const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });

      // Welche Fläche welche Herkunft bekommt, steht im Modell selbst —
      // build_buildings.py schreibt es beim Erzeugen hinein.
      const roof = (source.userData?.texture ?? '') === 'ortho';
      const kind = (source.name ?? '').toLowerCase();

      if (roof && !interior) {
        material.map = ortho;
        material.roughness = 0.92;
        material.envMapIntensity = 0.5;
      } else if (roof) {
        // Von innen ist das Dach eine Decke. Ein Luftbild wäre dort das Foto
        // der Oberseite -- also das falsche Bild an der falschen Stelle.
        const surface = surfaces.ceiling;
        material.map = surface.map;
        material.normalMap = surface.normalMap;
        material.roughnessMap = surface.roughnessMap;
        material.color.set('#8d919a');
        material.metalness = 0.45;
        material.envMapIntensity = 0.6;
      } else if (kind === 'ground') {
        const surface = surfaces.floor;
        material.map = surface.map;
        material.normalMap = surface.normalMap;
        material.roughnessMap = surface.roughnessMap;
        material.roughness = 0.32;
        material.metalness = 0.12;
        // Der Boden ist das hellste Element auf den Referenzfotos, weil er
        // die Leuchtbänder zurückwirft. Genau dafür die hohe Intensität.
        material.envMapIntensity = 1.5;
      } else {
        const surface = interior ? surfaces.interior : surfaces.facade;
        material.map = surface.map;
        material.normalMap = surface.normalMap;
        material.roughnessMap = surface.roughnessMap;
        material.emissiveMap = surface.emissiveMap ?? null;
        material.emissive.set(interior ? '#7fa8cd' : '#101820');
        material.emissiveIntensity = interior ? 1.1 : 0.35;
        material.metalness = 0.18;
        material.envMapIntensity = 1.1;
      }

      material.normalScale = new THREE.Vector2(1.1, 1.1);
      material.transparent = opacity < 0.99;
      material.opacity = opacity;
      material.depthWrite = opacity > 0.9;
      node.material = material;
      node.castShadow = !interior;
      node.receiveShadow = true;
    });
    return clone;
  }, [scene, opacity, interior, ortho, surfaces]);

  useEffect(
    () => () => {
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) (node.material as THREE.Material).dispose();
      });
    },
    [model],
  );

  return <primitive object={model} position={[-centre[0], 0, -centre[1]]} />;
}

/**
 * Welcher Bauteil eine Fläche des amtlichen Modells ist.
 *
 * Es steht im Materialnamen, den build_buildings.py schreibt:
 * `UUID|<Building|BuildingPart>|<teil>|<index>|<klasse>`. Beide Schreibweisen
 * kommen im Modell vor -- ein Gebäude ohne Gebäudeteile heisst `Building`,
 * eines mit heisst `BuildingPart`. Wer nur eine davon kennt, lässt knapp ein
 * Drittel der Flächen unbehandelt stehen; genau daran blieb der Hallenboden
 * eine graue Fläche ohne Textur.
 */
function bauteil(name: string): 'roof' | 'ground' | 'wall' | null {
  const parts = (name ?? '').split('|');
  if (parts.length < 3) return null;
  if (parts[1] !== 'Building' && parts[1] !== 'BuildingPart') return null;
  if (parts[2] === 'roof') return 'roof';
  if (parts[2] === 'ground') return 'ground';
  return 'wall';
}

/**
 * Fertig behandelte Weltmodelle, nach Datei und Blickrichtung.
 *
 * Das Modell hat 490 Flächen; es bei jedem Rendern neu zu klonen kostet
 * spürbar und bringt nichts, denn das Ergebnis hängt nur an zwei Dingen --
 * welche Datei und ob man drinnen oder draussen steht. Zwei Einträge je
 * Datei, den Rest der Sitzung wiederverwendet.
 */
const weltCache = new Map<string, THREE.Object3D>();

/**
 * Die Oberflächen des Weltmodells, ebenfalls je Blickrichtung einmal.
 *
 * Sie hängen an den zwischengespeicherten Modellen; würden sie beim
 * Aushängen der Szene freigegeben, zeigte das nächste Betreten der Halle
 * leere Texturen. Zwei Sätze Leinwandtexturen für die ganze Sitzung.
 */
const weltFlaechenCache = new Map<string, { boden: Surface; decke: Surface; wand: Surface }>();

function weltFlaechen(interior: boolean) {
  const schluessel = String(interior);
  let satz = weltFlaechenCache.get(schluessel);
  if (!satz) {
    satz = {
      boden: hallenbodenSurface(),
      decke: hallendeckeSurface(),
      wand: facadeSurface(interior),
    };
    weltFlaechenCache.set(schluessel, satz);
  }
  return satz;
}

/**
 * Wie deckend die amtlichen Weltpakete je Preset stehen.
 *
 * Aus der Übersicht ist das Modell eine Karte: die Hülle bleibt als Andeutung
 * stehen, sonst verdeckt sie genau die Stände, wegen derer man hinsieht. Auf
 * Augenhöhe ist sie das Gebäude und steht undurchsichtig.
 *
 * Der Kern bleibt im Ego-Blick bei 1,0 und nicht bei den vorgeschlagenen 0,92:
 * drinnen kommen die Wände aus `Hallenhuelle`, und ein Schleier darauf liesse
 * die Nachbarhalle durchscheinen. Draussen hat das Modell keine Meinung, dort
 * gelten die gemessenen Profile.
 */
const WELT_DECKKRAFT: Record<CameraPreset, { kern: number; umgebung: number }> = {
  uebersicht: { kern: 0.18, umgebung: 0.35 },
  halle: { kern: 0.35, umgebung: 0.25 },
  laufmodus: { kern: 0.18, umgebung: 0.3 },
  ego: { kern: 1.0, umgebung: 0.15 },
};

/** Legt den Preset-Schleier auf ein Material. 1,0 lässt es unberührt. */
function schleier(material: THREE.Material, deckkraft: number) {
  if (deckkraft > 0.99) return;
  material.transparent = true;
  material.opacity = deckkraft;
  // Ohne das schreibt eine durchsichtige Wand ihre Tiefe und schneidet aus,
  // was hinter ihr steht -- man saehe durch die Halle hindurch ins Nichts.
  material.depthWrite = false;
}

/**
 * Welche Materialfamilie ein Bauteil im Cel-Look bekommt.
 *
 * Die Zuordnung ist die einzige Stelle, an der die Stilbibel auf das amtliche
 * Modell trifft. Sie ist absichtlich grob: das Modell weiss nur, ob eine
 * Fläche Dach, Boden oder Wand ist, und mehr braucht es für den Grundlook
 * auch nicht. Glas, Metall und Vegetation bekommen ihre Familien dort, wo sie
 * als eigene Objekte entstehen, nicht hier.
 */
function familieFuer(teil: 'roof' | 'ground' | 'wall', kern: boolean): Familie {
  if (!kern) return FAMILIEN.M05;          // Umgebung bleibt heller Beton
  if (teil === 'roof') return FAMILIEN.M02;
  if (teil === 'ground') return FAMILIEN.M03;
  return FAMILIEN.M01;
}

function OfficialPackage({
  uri,
  interior,
  surfaces,
  behandeln,
  deckkraft,
  cel,
}: {
  uri: string;
  interior: boolean;
  surfaces: { boden: Surface; decke: Surface; wand: Surface } | null;
  /** Nur der Hallenkern wird umgebaut; die Umgebung bleibt, wie sie kommt. */
  behandeln: boolean;
  /** Deckkraft dieses Pakets im aktuellen Preset. */
  deckkraft: number;
  /** Cel-Shading statt PBR: gestufte Beleuchtung und eine Kontur am Kern. */
  cel: boolean;
}) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}${uri}`);

  const model = useMemo(() => {
    // Umgebaut wird nur, was man von drinnen sieht -- von aussen bleibt das
    // Weltmodell inhaltlich, wie es geliefert wird.
    const umbauen = behandeln && !!surfaces && interior;
    // Ohne Umbau, ohne Schleier und ohne Cel-Look gibt es nichts zu tun; dann
    // ist die gelieferte Szene das Ergebnis und wird nicht einmal geklont.
    if (!umbauen && deckkraft > 0.99 && !cel) return scene;

    const schluessel = `${uri}|${interior}|${deckkraft.toFixed(2)}|${cel}`;
    const fertig = weltCache.get(schluessel);
    if (fertig) return fertig;

    const clone = scene.clone(true);
    if (cel) {
      // Erst sammeln, dann anhängen: wer während `traverse` Kinder einfügt,
      // läuft in seine eigenen Konturen hinein und umrandet die Umrandung.
      const meshes: THREE.Mesh[] = [];
      clone.traverse((node) => {
        if (node instanceof THREE.Mesh) meshes.push(node);
      });
      for (const mesh of meshes) {
        const quelle = mesh.material as THREE.MeshStandardMaterial;
        const teil = bauteil(quelle.name) ?? 'wall';
        const familie = familieFuer(teil, behandeln);
        if (umbauen && teil !== 'wall') {
          // Drinnen kommen Boden und Decke aus `Hallenhuelle` -- siehe unten.
          mesh.visible = false;
          continue;
        }
        if (umbauen && surfaces) projiziereUV(mesh.geometry, WELT_KACHEL_M.wand);
        const material = toonMaterial(familie, {
          map: umbauen && surfaces ? surfaces.wand.map : quelle.map,
          normalMap: umbauen && surfaces ? surfaces.wand.normalMap : quelle.normalMap,
        }, { side: THREE.DoubleSide });
        schleier(material, deckkraft);
        mesh.material = material;
        mesh.receiveShadow = true;
        mesh.castShadow = !interior && behandeln;
        // Die Kontur trägt nur der Kern. Die Umgebung ist Hintergrund, und
        // eine Linie um jedes Nebengebäude macht aus der Karte ein Netz.
        // Durchsichtige Flächen bekommen auch keine: die Linie stünde vor
        // dem, was man durch sie hindurch sehen will.
        if (!behandeln || deckkraft <= 0.99) continue;
        const huelle = konturHuelle(mesh, konturStaerke(familie.kontur));
        if (huelle) mesh.add(huelle);
      }
      weltCache.set(schluessel, clone);
      return clone;
    }
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const quelle = node.material as THREE.MeshStandardMaterial;
      const teil = bauteil(quelle.name);
      if (!umbauen || !teil || !surfaces) {
        // Nur der Schleier. Das Material wird geklont, weil die Vorlage aus
        // dem GLB-Cache kommt und von anderen Presets weiterbenutzt wird --
        // sie hier zu veraendern faerbte auch die Übersicht ein.
        if (deckkraft <= 0.99) {
          const kopie = quelle.clone();
          schleier(kopie, deckkraft);
          node.material = kopie;
        }
        return;
      }

      const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
      // Von innen ist das Dach die Decke und der Boden der Hallenboden. Von
      // aussen bleibt beides, wie das Geländemodell es meint.
      // Innen tragen Boden und Decke ein anderes Höhendatum als die
      // begehbare Ebene -- die Bodenplatte des Modells läge über dem Kopf
      // des Besuchers. Drinnen kommen beide deshalb aus `Hallenhuelle`,
      // und die Flächen des Modells bleiben aus.
      // Boden und Decke tragen im Modell ein anderes Höhendatum als die
      // begehbare Ebene -- seine Bodenplatte läge über dem Kopf des
      // Besuchers. Drinnen kommen beide deshalb aus `Hallenhuelle`.
      if (teil !== 'wall') {
        node.visible = false;
        return;
      }
      projiziereUV(node.geometry, WELT_KACHEL_M.wand);
      material.map = surfaces.wand.map;
      material.normalMap = surfaces.wand.normalMap;
      material.roughnessMap = surfaces.wand.roughnessMap;
      material.color.copy(quelle.color ?? new THREE.Color('#ffffff'));
      material.metalness = 0.18;
      material.envMapIntensity = 0.9;
      material.normalScale = new THREE.Vector2(1.0, 1.0);
      schleier(material, deckkraft);
      node.material = material;
      node.receiveShadow = true;
      node.castShadow = false;
    });

    weltCache.set(schluessel, clone);
    return clone;
  }, [scene, interior, surfaces, behandeln, uri, deckkraft, cel]);

  return <primitive object={model} />;
}

function OfficialWorld({
  data,
  centre,
  preset,
  cel,
}: {
  data: Dataset;
  centre: [number, number];
  preset: CameraPreset;
  cel: boolean;
}) {
  const interior = preset === 'ego';
  const surfaces = weltFlaechen(interior);
  const deckkraft = WELT_DECKKRAFT[preset];

  const packages = data.world?.manifest.packages.filter(
    (entry) => entry.available && entry.role === 'render',
  ) ?? [];

  if (!packages.length) return null;
  // Die GLB-Pakete stehen im selben rechtshaendigen System wie alles andere:
  // `world-origin.json` fuehrt sceneZ = -(worldY - originY), also Z nach
  // Sueden -- und die Gelaendemeter zaehlen y ebenfalls nach Sueden. Hier
  // stand deshalb lange `scale={[1, 1, -1]}`: eine Spiegelung, die die
  // korrekten Pakete in die damals falsche 2D-Ebene drehte. Mit dem richtigen
  // Vorzeichen in `toScene` faellt sie ersatzlos weg.
  return (
    <group position={[-centre[0], 0, -centre[1]]}>
      {packages.map((entry) => {
        // Der Kern ist die Messe selbst, alles andere ist Umgebung. Die
        // Kollisionspakete kommen hier gar nicht an -- sie sind oben schon
        // ueber `role === 'render'` ausgesiebt.
        const kern = entry.id.startsWith('core/');
        return (
          <OfficialPackage
            key={entry.id}
            uri={entry.uri}
            interior={interior}
            surfaces={surfaces}
            behandeln={kern}
            deckkraft={kern ? deckkraft.kern : deckkraft.umgebung}
            cel={cel}
          />
        );
      })}
    </group>
  );
}

function Halls({
  data,
  centre,
  upperOpacity,
}: {
  data: Dataset;
  centre: [number, number];
  upperOpacity: number;
}) {
  const groups = useMemo(() => {
    const lower = data.site.halls.filter((hall) => hall.level <= 1);
    const upper = data.site.halls.filter((hall) => hall.level > 1);
    const build = (halls: typeof lower) =>
      mergePolygons(
        halls.map((hall) => ({
          id: hall.key,
          polygon: hall.footprint,
          baseY: hall.baseY,
          height: hall.wallHeightM || 0.3,
        })),
        centre,
      );
    return { lower: build(lower), upper: build(upper) };
  }, [data, centre]);

  useEffect(
    () => () => {
      groups.lower.geometry.dispose();
      groups.upper.geometry.dispose();
    },
    [groups],
  );

  return (
    <group>
      <mesh geometry={groups.lower.geometry}>
        <meshStandardMaterial
          color={COLOURS.hallLower}
          transparent
          opacity={0.28}
          roughness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
      {upperOpacity > 0.02 && (
        <mesh geometry={groups.upper.geometry}>
          <meshStandardMaterial
            color={COLOURS.hallUpper}
            transparent
            opacity={0.26 * upperOpacity}
            roughness={0.9}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

/** Höhe der Standfläche, wenn sie in der fokussierten Halle nur noch als
 * Bodenkontur dient statt als massiver Platzhalterkörper. */
const STAND_FLOOR_HEIGHT_M = 0.04;

function Stands({
  data,
  centre,
  upperOpacity,
  selectedStandId,
  routeStandIds,
  interior,
  reduceHallKey,
  onSelectStand,
}: {
  data: Dataset;
  centre: [number, number];
  upperOpacity: number;
  selectedStandId: string | null;
  routeStandIds: string[];
  /** Steht der Betrachter mitten drin? Dann gelten andere Regeln. */
  interior: boolean;
  /** Halle, deren Standkörper auf eine Bodenkontur reduziert werden -- die
   * fokussierte Halle in Halle/Ego, sonst null (Übersicht bleibt unverändert). */
  reduceHallKey: string | null;
  onSelectStand: (standId: string | null) => void;
}) {
  const surface = useMemo(() => standSurface(), []);
  useEffect(() => () => disposeSurface(surface), [surface]);

  const merged = useMemo(() => {
    // Aus der Vogelperspektive ist eine um ±25 m unsichere Freifläche eine
    // nützliche Angabe. Auf Augenhöhe ist sie es nicht: dort steht sie mitten
    // in einer anderen Halle und verdeckt den halben Blick. Was nicht genau
    // genug verortet ist, um daneben zu stehen, wird hier nicht gezeichnet.
    const shown = data.site.stands.filter((stand) => {
      // Markenstände tragen eine eigene Fassade und dürfen nicht zusätzlich
      // im Sammelkörper stecken -- zwei deckungsgleiche Wände flackern.
      if (MARKEN_STAND_IDS.has(stand.id)) return false;
      if (!interior) return true;
      const hall = data.hallsByKey.get(stand.hallKey);
      return !hall || hall.placement.source !== 'geschaetzt';
    });
    // Die fokussierte Halle bekommt eine flache Bodenkontur statt eines
    // massiven Platzhalterkörpers -- der verdeckt sonst jede Inszenierung
    // vollständig, egal wie transparent er ist.
    const reduced = reduceHallKey ? shown.filter((stand) => stand.hallKey === reduceHallKey) : [];
    const full = reduceHallKey ? shown.filter((stand) => stand.hallKey !== reduceHallKey) : shown;

    const build = (items: typeof shown, level: 'lower' | 'upper', height: number) =>
      mergePolygons(
        items
          .filter((stand) => (level === 'lower' ? stand.level <= 1 : stand.level > 1))
          .map((stand) => ({
            id: stand.id,
            polygon: stand.polygon,
            baseY: stand.baseY + 0.05,
            height,
          })),
        centre,
      );

    return {
      fullLower: build(full, 'lower', STAND_HEIGHT_M),
      fullUpper: build(full, 'upper', STAND_HEIGHT_M),
      reducedLower: build(reduced, 'lower', STAND_FLOOR_HEIGHT_M),
      reducedUpper: build(reduced, 'upper', STAND_FLOOR_HEIGHT_M),
    };
  }, [data, centre, interior, reduceHallKey]);

  useEffect(
    () => () => {
      merged.fullLower.geometry.dispose();
      merged.fullUpper.geometry.dispose();
      merged.reducedLower.geometry.dispose();
      merged.reducedUpper.geometry.dispose();
    },
    [merged],
  );

  /** Belegte Stände heben sich ab -- ein leerer Stand ist kein Ziel. */
  const paint = (group: typeof merged.fullLower, level: 'lower' | 'upper') => {
    const geometry = group.geometry;
    const count = geometry.getAttribute('position').count;
    const colours = new Float32Array(count * 3);
    const base = new THREE.Color(
      interior
        ? COLOURS.standInterior
        : level === 'lower'
          ? COLOURS.standLower
          : COLOURS.standUpper,
    );
    const occupied = new THREE.Color(
      interior ? COLOURS.standInteriorOccupied : COLOURS.standOccupied,
    );
    const selected = new THREE.Color(COLOURS.selected);
    const onRoute = new THREE.Color(COLOURS.route);

    for (const range of group.ranges) {
      let colour = base;
      if (data.registry.occupancy[range.id]) colour = occupied;
      if (routeStandIds.includes(range.id)) colour = onRoute;
      if (range.id === selectedStandId) colour = selected;
      for (let i = range.start; i < range.start + range.count; i += 1) {
        colours[i * 3] = colour.r;
        colours[i * 3 + 1] = colour.g;
        colours[i * 3 + 2] = colour.b;
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    return geometry;
  };

  const fullLowerGeometry = useMemo(
    () => paint(merged.fullLower, 'lower'),
    [merged, selectedStandId, routeStandIds, data],
  );
  const fullUpperGeometry = useMemo(
    () => paint(merged.fullUpper, 'upper'),
    [merged, selectedStandId, routeStandIds, data],
  );
  const reducedLowerGeometry = useMemo(
    () => paint(merged.reducedLower, 'lower'),
    [merged, selectedStandId, routeStandIds, data],
  );
  const reducedUpperGeometry = useMemo(
    () => paint(merged.reducedUpper, 'upper'),
    [merged, selectedStandId, routeStandIds, data],
  );

  const pick = (group: typeof merged.fullLower) => (faceIndex: number | null | undefined) => {
    if (faceIndex === null || faceIndex === undefined) return;
    const vertex = faceIndex * 3;
    const hit = group.ranges.find(
      (range) => vertex >= range.start && vertex < range.start + range.count,
    );
    onSelectStand(hit?.id ?? null);
  };

  return (
    <group>
      <mesh
        geometry={fullLowerGeometry}
        castShadow
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          pick(merged.fullLower)(event.faceIndex);
        }}
      >
        <meshToonMaterial
          vertexColors
          map={surface.map}
          normalMap={surface.normalMap}
          gradientMap={stufenTextur(FAMILIEN.M01.stufen)}
          // Andere Hallen als die fokussierte bleiben vereinfachte Körper --
          // in Ego zurückhaltend transparent, sie stehen nicht im Weg.
          transparent={interior}
          opacity={interior ? 0.5 : 1}
          depthWrite={!interior}
        />
      </mesh>
      {/* Die Kontur macht aus dem Klotz eine Zeichnung. Sie haengt an den
          vollen Koerpern und nicht an den flachen Konturflaechen der
          fokussierten Halle -- eine Linie um eine Bodenflaeche waere ein
          Rahmen, kein Umriss. In Ego stehen die Koerper durchsichtig, dort
          stuende die Linie vor dem, was man sehen will. */}
      {!interior && (
        <Kontur
          geometry={fullLowerGeometry}
          staerke={konturStaerke(FAMILIEN.M01.kontur)}
        />
      )}
      {upperOpacity > 0.02 && (
        <mesh
          geometry={fullUpperGeometry}
          castShadow
          receiveShadow
          onClick={(event) => {
            event.stopPropagation();
            pick(merged.fullUpper)(event.faceIndex);
          }}
        >
          <meshToonMaterial
            vertexColors
            map={surface.map}
            normalMap={surface.normalMap}
            gradientMap={stufenTextur(FAMILIEN.M01.stufen)}
            transparent={upperOpacity < 0.99}
            opacity={upperOpacity}
          />
        </mesh>
      )}
      {/* Fokussierte Halle: keine massiven Platzhalterkörper mehr, nur eine
          flache, undurchsichtige Bodenkontur -- Fläche bleibt farblich
          zuordenbar (belegt/Route/ausgewählt) und anklickbar, verdeckt aber
          nichts mehr, das darüber steht. */}
      <mesh
        geometry={reducedLowerGeometry}
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          pick(merged.reducedLower)(event.faceIndex);
        }}
      >
        <meshToonMaterial
          vertexColors
          map={surface.map}
          normalMap={surface.normalMap}
          gradientMap={stufenTextur(FAMILIEN.M01.stufen)}
        />
      </mesh>
      {upperOpacity > 0.02 && (
        <mesh
          geometry={reducedUpperGeometry}
          receiveShadow
          onClick={(event) => {
            event.stopPropagation();
            pick(merged.reducedUpper)(event.faceIndex);
          }}
        >
          <meshToonMaterial
            vertexColors
            map={surface.map}
            normalMap={surface.normalMap}
            gradientMap={stufenTextur(FAMILIEN.M01.stufen)}
            transparent={upperOpacity < 0.99}
            opacity={upperOpacity}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Die Route als Band durch beide Ebenen.
 *
 * Die senkrechten Stücke sind die eigentliche Aussage: hier wechselt man das
 * Geschoss. In einer flachen Karte wäre genau das unsichtbar.
 */
function RouteRibbon({
  data,
  route,
  centre,
}: {
  data: Dataset;
  route: Route | null;
  centre: [number, number];
}) {
  const geometry = useMemo(() => {
    if (!route || route.steps.length === 0) return null;
    const points = route.nodeIds
      .map((id) => data.graph.nodes.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => toScene(node.x, node.y, node.z + 1.6, centre));
    if (points.length < 2) return null;
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.02);
    return new THREE.TubeGeometry(curve, Math.min(points.length * 2, 900), 1.1, 6, false);
  }, [route, data, centre]);

  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;

  const hasUnconfirmed = (route?.unconfirmed.length ?? 0) > 0;
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={hasUnconfirmed ? COLOURS.routeUnconfirmed : COLOURS.route}
        emissive={hasUnconfirmed ? COLOURS.routeUnconfirmed : COLOURS.route}
        emissiveIntensity={0.65}
        roughness={0.4}
      />
    </mesh>
  );
}

function HallLabels({
  data,
  centre,
  upperOpacity,
}: {
  data: Dataset;
  centre: [number, number];
  upperOpacity: number;
}) {
  return (
    <group>
      {data.site.halls.map((hall) => {
        const [cx, cy] = polygonCentre(hall.footprint);
        const estimated = hall.placement.source === 'geschaetzt';
        const dim = hall.level > 1 && upperOpacity < 0.2;
        if (dim) return null;
        return (
          <Html
            key={hall.key}
            position={toScene(cx, cy, hall.baseY + hall.wallHeightM + 6, centre)}
            center
            distanceFactor={340}
            occlude={false}
          >
            <div className={`hall-label${estimated ? ' hall-label--estimated' : ''}`}>
              {hall.outdoor ? hall.name : hall.key}
              {estimated && (
                <span
                  className="hall-label__badge"
                  title={`Lage geschätzt, rund ${Math.round(hall.placement.residualM ?? 0)} m genau`}
                >
                  ±{Math.round(hall.placement.residualM ?? 0)} m
                </span>
              )}
            </div>
          </Html>
        );
      })}
    </group>
  );
}

/**
 * Ego-Perspektive: durch die Halle laufen statt auf sie zu schauen.
 *
 * Das ist keine Spielerei. Eine Route ist eine Behauptung darüber, wie es
 * vor Ort aussieht — und diese Ansicht ist die einzige, in der sich diese
 * Behauptung prüfen lässt, ohne hinzufahren. Wenn ein Gang zu schmal wirkt
 * oder ein Ebenenwechsel ins Leere führt, sieht man es hier.
 *
 * Kollidiert wird gegen dasselbe Gitter, auf dem geroutet wird. Was die
 * Route nicht darf, darf hier auch niemand.
 */
/** Steigen/Sinken im No-Clip-Flug -- kein Kollisionsgitter kennt „oben". */
const FLY_SPEED_M_PER_S = 2.4;

function WalkControls({
  data,
  centre,
  active,
  start,
  onExit,
  noClip = false,
  frozen = false,
  viewfinderOpen = false,
  onToggleNoClip,
  onToggleFreeze,
  onToggleViewfinder,
  onMark,
  onCameraSnapshot,
}: {
  data: Dataset;
  centre: [number, number];
  active: boolean;
  start: THREE.Vector3 | null;
  onExit: () => void;
  noClip?: boolean;
  frozen?: boolean;
  viewfinderOpen?: boolean;
  onToggleNoClip?: () => void;
  onToggleFreeze?: () => void;
  onToggleViewfinder?: () => void;
  onMark?: (snapshot: CameraSnapshot) => void;
  onCameraSnapshot?: (snapshot: CameraSnapshot) => void;
}) {
  const { camera, gl } = useThree();
  const position = useRef({ x: 0, y: 0, z: 0 });
  const look = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  const locked = useRef(false);

  // Als Refs gespiegelt, damit der Ereignis-Effekt nicht bei jedem Tastendruck
  // oder jedem Render der Elternkomponente neu gebunden werden muss -- die
  // Callback-Props sind in App.tsx inline definiert und damit bei jedem
  // Render neue Funktionsobjekte. Nur die aktuellen Werte zählen hier.
  const noClipRef = useRef(noClip);
  const frozenRef = useRef(frozen);
  const viewfinderRef = useRef(viewfinderOpen);
  const onExitRef = useRef(onExit);
  const onToggleNoClipRef = useRef(onToggleNoClip);
  const onToggleFreezeRef = useRef(onToggleFreeze);
  const onToggleViewfinderRef = useRef(onToggleViewfinder);
  const onMarkRef = useRef(onMark);
  const onCameraSnapshotRef = useRef(onCameraSnapshot);
  const lastSnapshotAt = useRef(0);
  useEffect(() => {
    noClipRef.current = noClip;
  }, [noClip]);
  useEffect(() => {
    frozenRef.current = frozen;
  }, [frozen]);
  useEffect(() => {
    viewfinderRef.current = viewfinderOpen;
    // Das Overlay braucht den echten Zeiger zum Ausrichten des Fotos --
    // Pointer Lock würde ihn einsperren.
    if (viewfinderOpen && document.pointerLockElement) document.exitPointerLock?.();
  }, [viewfinderOpen]);
  useEffect(() => {
    onExitRef.current = onExit;
    onToggleNoClipRef.current = onToggleNoClip;
    onToggleFreezeRef.current = onToggleFreeze;
    onToggleViewfinderRef.current = onToggleViewfinder;
    onMarkRef.current = onMark;
    onCameraSnapshotRef.current = onCameraSnapshot;
  });

  // Startpunkt: die fokussierte Halle, sonst der erste begehbare Punkt.
  useEffect(() => {
    if (!active) return;
    const site = start
      ? { x: start.x + centre[0], y: start.z + centre[1], z: start.y }
      : null;
    // Der Mittelpunkt einer Halle liegt oft mitten in einem Stand -- in Halle 9
    // genau im LEGO-Block. Dann ist der nächstgelegene freie Punkt derselben
    // Halle gemeint und nicht der erste begehbare Punkt des ganzen Geländes,
    // der irgendwo im Obergeschoss von Halle 10 liegt.
    // Der Mittelpunkt einer Halle liegt oft mitten in einem Stand -- in Halle 9
    // genau im LEGO-Block. Gesucht ist dann nicht irgendein freier Punkt, sondern
    // der Gang: wer mit der Nase an der Standwand startet, sieht von der Halle
    // nichts. Deshalb zählt nicht „frei", sondern wie viel Platz ringsum ist.
    const luft = (x: number, y: number, z: number) => {
      if (data.walk.footingAt(x, y, z).blocked) return -1;
      let weite = 0;
      for (const abstand of [2, 4, 6]) {
        const offen = [[abstand, 0], [-abstand, 0], [0, abstand], [0, -abstand]].every(
          ([dx, dy]) => !data.walk.footingAt(x + dx, y + dy, z).blocked,
        );
        if (!offen) break;
        weite = abstand;
      }
      return weite;
    };

    let footing: { x: number; y: number; z: number } | null = null;
    if (site) {
      let beste = -1;
      for (let radius = 0; radius <= 40 && beste < 6; radius += 2) {
        const schritte = radius === 0 ? 1 : 24;
        for (let step = 0; step < schritte; step += 1) {
          const winkel = (step / schritte) * Math.PI * 2;
          const x = site.x + Math.cos(winkel) * radius;
          const y = site.y + Math.sin(winkel) * radius;
          const weite = luft(x, y, site.z);
          if (weite > beste) {
            beste = weite;
            footing = { x, y, z: data.walk.footingAt(x, y, site.z).z };
          }
          if (beste >= 6) break;
        }
      }
    }
    if (!footing) footing = data.walk.spawn();
    if (footing) position.current = footing;
    look.current = { yaw: 0, pitch: 0 };
  }, [active, start, data, centre]);

  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement;
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(target.tagName);

    const request = () => {
      if (!locked.current && !viewfinderRef.current) void canvas.requestPointerLock?.();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
      if (!locked.current) keys.current.clear();
    };
    const onMove = (event: MouseEvent) => {
      if (!locked.current || frozenRef.current) return;
      look.current.yaw -= event.movementX * 0.0022;
      look.current.pitch = Math.max(
        -1.2,
        Math.min(1.2, look.current.pitch - event.movementY * 0.0022),
      );
    };
    const onDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (event.key === 'Escape') {
        onExitRef.current();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'n') {
        onToggleNoClipRef.current?.();
        return;
      }
      if (key === 'f') {
        onToggleFreezeRef.current?.();
        return;
      }
      if (key === 'v') {
        onToggleViewfinderRef.current?.();
        return;
      }
      if (key === 'm') {
        const { x, y, z } = position.current;
        onMarkRef.current?.({
          x,
          y,
          z,
          yaw: look.current.yaw,
          pitch: look.current.pitch,
          hallKey: data.walk.footingAt(x, y, z).hallKey,
        });
        return;
      }
      keys.current.add(key);
    };
    const onUp = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      keys.current.delete(event.key.toLowerCase());
    };

    canvas.addEventListener('click', request);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      canvas.removeEventListener('click', request);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      keys.current.clear();
    };
    // Bewusst ohne die Callback-Props in den Abhängigkeiten -- sie sind in
    // App.tsx inline definiert (neue Funktion bei jedem Render) und würden
    // sonst Pointer-Lock- und Tastatur-Listener bei jedem Tastendruck neu
    // binden. Aktuelle Werte kommen aus den Refs oben.
  }, [active, gl, data]);

  // Die Kamera von aussen setzen -- nur, wenn die Adresse es erlaubt. Der
  // Bilderpruefer (`gang-check.mjs`, `tuer-check.mjs`) stellt sie in Sekunden
  // dorthin, wofuer Laufen unter dem Software-Renderer Minuten braucht.
  // Einmal gestellt statt in jedem Bild neu: die Refs darin sind stabil.
  useEffect(() => {
    if (!active || !SETZEN_ERLAUBT) return;
    const global = globalThis as { __SETZEN?: unknown };
    global.__SETZEN = (px: number, py: number, pz: number, yaw: number) => {
      position.current = { x: px, y: py, z: pz };
      look.current.yaw = yaw;
      look.current.pitch = 0;
    };
    return () => {
      delete global.__SETZEN;
    };
  }, [active]);

  useFrame((state, delta) => {
    if (!active) return;

    if (!frozenRef.current) {
      const pressed = keys.current;
      const forward =
        (pressed.has('w') || pressed.has('arrowup') ? 1 : 0) -
        (pressed.has('s') || pressed.has('arrowdown') ? 1 : 0);
      const strafe =
        (pressed.has('d') || pressed.has('arrowright') ? 1 : 0) -
        (pressed.has('a') || pressed.has('arrowleft') ? 1 : 0);
      const climb = (pressed.has(' ') ? 1 : 0) - (pressed.has('control') ? 1 : 0);

      if (forward || strafe) {
        const speed = (pressed.has('shift') ? RUN_SPEED_M_PER_S : WALK_SPEED_M_PER_S) * delta;
        const { yaw } = look.current;
        // Die Kamera blickt nach -Z, und Szenen-Z zeigt nach Sueden -- der
        // Blick geht also nach Norden, und Norden ist in Gelaendemetern das
        // kleinere y. Deshalb steht vor dy ein Minus und vor dx keines.
        // Wer das hier verwechselt, laeuft seitwaerts statt geradeaus.
        const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed;
        const dy = (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed;
        position.current = noClipRef.current
          ? { ...position.current, x: position.current.x + dx, y: position.current.y + dy }
          : data.walk.move(position.current, dx, dy);
      }

      // Vertikal fliegen gibt es nur ohne Kollision -- das Gitter kennt keine
      // Höhe über der eigenen Ebene, ein "oben" ergäbe dort keinen Sinn.
      if (noClipRef.current && climb) {
        position.current = {
          ...position.current,
          z: position.current.z + climb * FLY_SPEED_M_PER_S * delta,
        };
      }
    }

    const { x, y, z } = position.current;
    if (state.clock.elapsedTime - lastSnapshotAt.current > 0.25) {
      lastSnapshotAt.current = state.clock.elapsedTime;
      onCameraSnapshotRef.current?.({
        x,
        y,
        z,
        yaw: look.current.yaw,
        pitch: look.current.pitch,
        hallKey: data.walk.footingAt(x, y, z).hallKey,
      });
    }
    camera.position.set(x - centre[0], z + EYE_HEIGHT_M, y - centre[1]);
    camera.rotation.set(0, 0, 0);
    camera.rotateY(look.current.yaw);
    camera.rotateX(look.current.pitch);
  });

  return null;
}

function CameraRig({
  preset,
  focus,
  extent,
}: {
  preset: CameraPreset;
  focus: THREE.Vector3 | null;
  extent: number;
}) {
  const controls = useRef<OrbitControlsProps & { target: THREE.Vector3; update: () => void }>(null);
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  const wanted = useRef(new THREE.Vector3());

  useEffect(() => {
    const centre = focus ?? new THREE.Vector3(0, 0, 0);
    target.current.copy(centre);
    if (preset === 'laufmodus') {
      // Praktisch von oben -- die flache Karte, ohne den Renderer zu wechseln.
      wanted.current.set(centre.x, centre.y + extent * 0.9, centre.z + 0.001);
    } else if (preset === 'halle') {
      wanted.current.set(centre.x + extent * 0.16, centre.y + extent * 0.22, centre.z + extent * 0.3);
    } else {
      wanted.current.set(centre.x + extent * 0.5, centre.y + extent * 0.62, centre.z + extent * 0.85);
    }
  }, [preset, focus, extent]);

  useFrame((_, delta) => {
    const speed = Math.min(1, delta * 3);
    camera.position.lerp(wanted.current, speed);
    if (controls.current) {
      controls.current.target.lerp(target.current, speed);
      controls.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controls as never}
      enableDamping
      dampingFactor={0.12}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={30}
      maxDistance={extent * 2.4}
    />
  );
}

export function SiteScene(props: SceneProps) {
  const { data, upperOpacity, route, preset, focusHallKey } = props;
  const cel = props.cel ?? true;
  const centre = useMemo(() => siteCentre(data.site), [data.site]);
  const registered = data.spatialMode === 'registered';

  const extent = useMemo(() => {
    const points = data.site.halls.flatMap((hall) => hall.footprint);
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }, [data.site]);

  const focus = useMemo(() => {
    if (!focusHallKey) return null;
    const hall = data.hallsByKey.get(focusHallKey);
    if (!hall) return null;
    const [cx, cy] = polygonCentre(hall.footprint);
    return toScene(cx, cy, hall.baseY, centre);
  }, [focusHallKey, data, centre]);

  return (
    <Canvas
      camera={{ fov: preset === 'ego' ? 70 : 42, near: 0.15, far: extent * 6, position: [extent * 0.5, extent * 0.6, extent * 0.85] }}
      dpr={[1, 1.8]}
      shadows="soft"
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        // Ohne Tone Mapping kippt alles Helle nach Weiß, und genau das ließ
        // die Szene wie ein eingefärbtes Drahtgitter aussehen.
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
      onPointerMissed={() => props.onSelectStand(null)}
    >
      <color attach="background" args={[preset === 'ego' ? '#1a1d24' : '#8fa8bf']} />
      <fog
        attach="fog"
        args={[
          preset === 'ego' ? '#20242c' : '#9fb4c8',
          preset === 'ego' ? extent * 0.25 : extent * 1.1,
          preset === 'ego' ? extent * 1.2 : extent * 3.2,
        ]}
      />
      <Beleuchtung extent={extent} interior={preset === 'ego'} />

      {/* Das Orthofoto bleibt Bodenreferenz, solange kein amtlicher Boden aus
          den Weltpaketen zur Verfügung steht -- auch im registrierten Modus. */}
      <Ground extent={extent} centre={centre} ortho={data.ortho} />
      <Umgebung data={data} centre={centre} />
      {/* Fällt das Modell aus, bleibt die Karte benutzbar -- die Hallenkörper
          tragen sie weiterhin. Deshalb Suspense ohne Ersatzdarstellung. */}
      {!registered && (
        <Suspense fallback={null}>
          <Gelaende
            centre={centre}
            opacity={preset === 'ego' ? SHELL_OPACITY_EGO : SHELL_OPACITY}
            interior={preset === 'ego'}
          />
        </Suspense>
      )}
      {registered && (
        <Suspense fallback={null}>
          <OfficialWorld data={data} centre={centre} preset={preset} cel={cel} />
        </Suspense>
      )}
      {(preset === 'halle' || preset === 'ego') && focusHallKey && (
        <ProceduralStaging
          data={data}
          centre={centre}
          preset={preset}
          focusHallKey={focusHallKey}
          onObjectCount={props.onStagingObjectCount}
        />
      )}
      {/* Hallenkörper und Schilder sind Hilfsmittel der Übersicht. Auf
          Augenhöhe stehen sie als farbiger Schleier vor der Nase und legen
          sich über genau das, was man sehen will -- dort sind die Wände des
          Gebäudemodells die Halle, nicht ein eingefärbter Block darüber. */}
      {preset !== 'ego' && (
        <Halls data={data} centre={centre} upperOpacity={upperOpacity} />
      )}
      <Stands
        data={data}
        centre={centre}
        upperOpacity={upperOpacity}
        selectedStandId={props.selectedStandId}
        routeStandIds={props.routeStandIds}
        interior={preset === 'ego'}
        reduceHallKey={(preset === 'halle' || preset === 'ego') ? focusHallKey : null}
        onSelectStand={props.onSelectStand}
      />
      <Markenstaende data={data} centre={centre} onSelectStand={props.onSelectStand} />
      <Hallenhuelle data={data} centre={centre} visible={preset === 'ego'} />
      <Boulevard
        data={data}
        centre={centre}
        visible={preset === 'ego'}
        previewSafe={props.previewSafe ?? true}
      />
      <Deckenleuchten data={data} centre={centre} visible={preset === 'ego'} />
      <Hallenlicht
        data={data}
        centre={centre}
        hallKey={focusHallKey}
        active={preset === 'ego'}
      />
      <Vertikalverbindungen data={data} centre={centre} />
      <RouteRibbon data={data} route={route} centre={centre} />
      {preset !== 'ego' && (
        <HallLabels data={data} centre={centre} upperOpacity={upperOpacity} />
      )}
      {preset === 'ego' ? (
        <WalkControls
          data={data}
          centre={centre}
          active
          start={focus}
          onExit={() => props.onLeaveEgo?.()}
          noClip={props.noClip}
          frozen={props.frozen}
          viewfinderOpen={props.viewfinderOpen}
          onToggleNoClip={props.onToggleNoClip}
          onToggleFreeze={props.onToggleFreeze}
          onToggleViewfinder={props.onToggleViewfinder}
          onMark={props.onMark}
          onCameraSnapshot={props.onCameraSnapshot}
        />
      ) : (
        <CameraRig preset={preset} focus={focus} extent={extent} />
      )}
    </Canvas>
  );
}
