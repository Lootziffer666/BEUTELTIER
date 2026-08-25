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

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, MapControls, useGLTF } from '@react-three/drei';
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
import { fernsteuerungErlaubt, leerErlaubt } from './fernsteuerung';
import { Beleuchtung } from './lighting';
import {
  Deckenleuchten,
  Hallenhuelle,
  Hallenlicht,
  Hallenstuetzen,
  Hallenwaende,
  Lichtspiegel,
} from './interior';
import { Boulevard } from './boulevard';
import { KleineStaende } from './KleineStaende';
import { Markenstaende } from './Markenstaende';
import { MARKEN_STAND_IDS } from './marken';
import { Vertikalverbindungen } from './vertical';
import type { CameraSnapshot } from './survey';
import { ProceduralStaging } from './ProceduralStaging';
import {
  FAMILIEN,
  familienMaterial,
  konturHuelle,
  konturStaerke,
  ROHBAU_PHASE,
  stufenTextur,
  toonMaterial,
  type Familie,
} from './stil';
import { KACHEL_M } from './textur';
import { Kontur } from './Kontur';
import { Ausstattung } from './Ausstattung';
import { worldPresentation, type WorldPreset } from './worldPresentation';
import {
  applyRegisteredOrthoUv,
  bareTerrainGeometry,
  orthophotoTerrainGeometry,
  parseTerrainHeightmap,
  registeredOrthoContains,
  repairTerrainGrid,
  sampleRegisteredTerrainHeight,
  terrainDrapedSegments,
  type RegisteredCorners,
  type TerrainHeightmap,
} from './terrainGeometry';

export type CameraPreset = WorldPreset;

export interface SceneProps {
  data: Dataset;
  /** Sichtbarkeit der oberen Ebene: 0 = ausgeblendet, 1 = voll. */
  upperOpacity: number;
  selectedStandId: string | null;
  routeStandIds: string[];
  route: Route | null;
  preset: CameraPreset;
  focusHallKey: string | null;
  /** Darf vom Kamerafokus abweichen, etwa beim Ziel des Gesamtkorridors. */
  highlightHallKey?: string | null;
  /** Standkoerper sind eine zuschaltbare Informationsebene, nicht die Welt. */
  showStands: boolean;
  /** Nur der Demokorridor darf als demonstrative Linie vor Geometrie stehen. */
  routeOnTop?: boolean;
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
/** Das DGM1-Terrain, gebaut von tools/build_terrain.py. */
const TERRAIN_URL = `${import.meta.env.BASE_URL}models/terrain.glb`;
/** Das entzerrte Senkrechtluftbild, gebaut von tools/build_ortho.py. */
const ORTHO_URL = `${import.meta.env.BASE_URL}models/gelaende.jpg`;
/**
 * Darf `__SETZEN` gestellt werden? Einmal beim Laden entschieden -- die Adresse
 * ändert sich innerhalb einer Sitzung nicht (siehe `fernsteuerung.ts`).
 */
const SETZEN_ERLAUBT =
  typeof window !== 'undefined' && fernsteuerungErlaubt(window.location.search);

/** Siehe `SETZEN_ERLAUBT` -- dieselbe Begründung, für `?leer`. */
const LEER_ERLAUBT =
  typeof window !== 'undefined' && leerErlaubt(window.location.search);

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
  ortho,
  map,
  backdropY,
}: {
  extent: number;
  centre: [number, number];
  ortho: Ortho | null;
  map: THREE.Texture | null;
  backdropY: number;
}) {
  if (!ortho || !map) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, backdropY, 0]} receiveShadow>
        <planeGeometry args={[extent * 3, extent * 3]} />
        <meshStandardMaterial color={COLOURS.ground} roughness={1} />
      </mesh>
    );
  }
  const extentM = ortho.extent;
  const width = extentM[2] - extentM[0];
  const height = extentM[3] - extentM[1];
  const midX = (extentM[0] + extentM[2]) / 2 - centre[0];
  const midZ = (extentM[1] + extentM[3]) / 2 - centre[1];

  return (
    <group>
      {/* Dahinter, damit der Horizont nicht abreisst. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, backdropY, 0]} receiveShadow>
        <planeGeometry args={[extent * 3, extent * 3]} />
        <meshStandardMaterial color={COLOURS.ground} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[midX, -0.4, midZ]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={map} roughness={0.88} envMapIntensity={0.6} />
      </mesh>
    </group>
  );
}

/** OSM-Wege/POIs und nur die von LoD2 nicht abgedeckten ALKIS-Nebenbauten. */
function Umgebung({
  data,
  centre,
  registered,
  terrainHeight,
  terrainReady,
}: {
  data: Dataset;
  centre: [number, number];
  registered: boolean;
  terrainHeight: (x: number, z: number) => number | null;
  terrainReady: boolean;
}) {
  const orthoCorners = registered && data.ortho?.corners
    ? data.ortho.corners as RegisteredCorners
    : null;
  const roads = useMemo(() => {
    const positions = registered
      ? (terrainReady ? terrainDrapedSegments(
          (data.surroundings?.roads ?? []).map((road) => road.points),
          terrainHeight,
          orthoCorners,
        ) : [])
      : (data.surroundings?.roads ?? []).flatMap((road) => {
          const line: number[] = [];
          for (let index = 1; index < road.points.length; index += 1) {
            for (const point of [road.points[index - 1], road.points[index]]) {
              line.push(point[0], -0.24, point[1]);
            }
          }
          return line;
        });
    for (let index = 0; index < positions.length; index += 3) {
      positions[index] -= centre[0];
      positions[index + 2] -= centre[1];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, [data.surroundings, centre, registered, terrainHeight, terrainReady, orthoCorners]);
  const markers = useMemo(() => {
    const positions: number[] = [];
    for (const { point } of data.surroundings?.markers ?? []) {
      if (registered) {
        if (!terrainReady || (orthoCorners && !registeredOrthoContains(
          point[0], point[1], orthoCorners,
        ))) continue;
        const height = terrainHeight(point[0], point[1]);
        if (height === null) continue;
        positions.push(point[0] - centre[0], height + 0.15, point[1] - centre[1]);
      } else {
        positions.push(point[0] - centre[0], 0.15, point[1] - centre[1]);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, [data.surroundings, centre, registered, terrainHeight, terrainReady, orthoCorners]);
  const gaps = useMemo(() => (data.footprints?.footprints ?? [])
    .filter((one) => !one.lod2Covered)
    .flatMap((one) => {
      if (registered && !terrainReady) return [];
      const shape = new THREE.Shape(one.footprint.map(([x, y]) =>
        // Gegengespiegelt: die Drehung beim Einhängen legt lokales Y auf -Z.
        new THREE.Vector2(x - centre[0], centre[1] - y)));
      const geometry = new THREE.ShapeGeometry(shape);
      if (registered) {
        const position = geometry.getAttribute('position');
        let complete = true;
        for (let index = 0; index < position.count; index += 1) {
          const worldX = position.getX(index) + centre[0];
          const worldZ = centre[1] - position.getY(index);
          if (orthoCorners && !registeredOrthoContains(worldX, worldZ, orthoCorners)) {
            complete = false;
            break;
          }
          const height = terrainHeight(worldX, worldZ);
          if (height === null) {
            complete = false;
            break;
          }
          position.setZ(index, height + 0.03);
        }
        if (!complete) {
          geometry.dispose();
          return [];
        }
        geometry.computeVertexNormals();
      }
      return [{ id: one.id, geometry }];
    }), [data.footprints, centre, registered, terrainHeight, terrainReady, orthoCorners]);
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
        <mesh
          key={id}
          geometry={geometry}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, registered ? 0 : -0.18, 0]}
        >
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

/** Das amtliche DGM1-Terrain mit dem registrierten Luftbild als Oberflaeche. */
function Terrain({
  centre,
  ortho,
  map,
}: {
  centre: [number, number];
  ortho: Ortho | null;
  map: THREE.Texture | null;
}) {
  const { scene } = useGLTF(TERRAIN_URL);
  const prepared = useMemo(() => {
    try {
      let source: THREE.BufferGeometry | null = null;
      scene.traverse((node) => {
        if (!source && node instanceof THREE.Mesh) source = node.geometry;
      });
      if (!source) throw new Error('Terrain-GLB enthaelt kein Mesh.');
      const repaired = repairTerrainGrid(source);
      const drape = ortho?.corners && map
        ? orthophotoTerrainGeometry(
            repaired.geometry,
            repaired.cols,
            repaired.rows,
            ortho.corners as RegisteredCorners,
          )
        : null;
      // Grundnetz und Luftbild-Haut lagen bislang deckungsgleich uebereinander
      // und verliessen sich auf `polygonOffset`, um im Tiefentest zu
      // gewinnen. An steilen Kanten (grosser Hoehensprung auf kurzer
      // Strecke, etwa an wieder geschlossenen Gebaeudemasken) kippt dieser
      // Test lokal um, und das unbelichtete Grundmaterial blitzt als dunkler
      // Fleck durch. `bare` traegt deshalb nur noch die Dreiecke, die das
      // Luftbild nicht bereits zeichnet -- ausserhalb seiner Abdeckung, wo
      // das Grundnetz weiterhin der einzige Bodenkontakt ist.
      const bare = drape ? bareTerrainGeometry(repaired.geometry, drape) : repaired.geometry;
      return { ...repaired, drape, bare, error: null };
    } catch (cause) {
      return {
        geometry: null,
        drape: null,
        bare: null,
        cols: 0,
        rows: 0,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }, [scene, ortho, map]);

  useEffect(() => () => {
    prepared.drape?.dispose();
    if (prepared.bare !== prepared.geometry) prepared.bare?.dispose();
    prepared.geometry?.dispose();
  }, [prepared]);

  if (prepared.error || !prepared.geometry) {
    return (
      <Html position={[0, 8, 0]} center>
        <div className="scene-data-error">Gelände nicht verfügbar: {prepared.error}</div>
      </Html>
    );
  }

  return (
    <group position={[-centre[0], 0, -centre[1]]}>
      {/*
       * Ohne Drape bleibt das Grundnetz sichtbar -- ein dunkelgruener Boden
       * (color #4f5a55) ueberall, wo kein Luftbild deckt. Mit Drape wird der
       * Grundkoerper ausgeblendet: das Orthobild liegt direkt auf der Hoehen-
       * karte auf, der zusaetzliche Boden bringt nichts und produziert genau
       * das Z-Fight-Muster, das man auf Phone-Screenshots sieht -- feine
       * hellblaue Streifen entlang von Gebaeudekanten, weil Grundnetz und
       * Drape an diesen Stellen um den gleichen Z-Wert streiten. Wer die
       * `bare`-Geometrie wieder sehen will, bekommt sie ueber die Render-
       * Reihenfolge statt einer doppelten Lage zurueck.
       */}
      {prepared.bare && !prepared.drape && (
        <mesh geometry={prepared.bare} receiveShadow>
          <meshStandardMaterial color="#4f5a55" roughness={1} />
        </mesh>
      )}
      {prepared.drape && map && (
        /*
         * position.y = -0.05: das Drape liegt einen halben Zentimeter unter
         * dem null-Niveau. Bei einer orthogonalen Kamera aus der Vogelsicht
         * reicht das, um Z-Fights an Gebaeudekanten sicher zu unterdruecken
         * -- die Hallenwaende ragen ueber das Drape hinaus, das Orthobild
         * kann nicht mehr durch die Daecher durchscheinen. Wer das Niveau
         * spaeter anpasst: das Original-DGM1-Baremesh sitzt auf y=0, der
         * Wert hier muss negativ sein, sonst hilft er nichts.
         */
        <mesh
          geometry={prepared.drape}
          receiveShadow
          renderOrder={1}
          position={[0, -0.05, 0]}
        >
          <meshStandardMaterial
            map={map}
            color="#ffffff"
            roughness={0.9}
            envMapIntensity={0.5}
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-8}
          />
        </mesh>
      )}
    </group>
  );
}

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
  
  // Facade textures from the GLB extras
  const facadeTextures = useMemo(() => {
    const refs = (scene.userData as any)?.facades ?? {};
    return Object.fromEntries(
      Object.entries(refs).map(([key, path]) => {
        const url = `${import.meta.env.BASE_URL}models/${path}`;
        const tex = new THREE.TextureLoader().load(url);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 8;
        return [key, tex];
      })
    );
  }, [scene.userData]);

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
      const texName = source.userData?.texture ?? '';
      const roof = texName === 'ortho';
      const kind = (source.name ?? '').toLowerCase();
      const facadeKey = texName.startsWith('facade_') ? texName.replace(/^facade_/, '') : null;

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
      } else if (facadeKey && facadeTextures[facadeKey]) {
        // Hall-Fassade mit echtem Foto von dz.nrw.de
        const facadeTex = facadeTextures[facadeKey];
        material.map = facadeTex;
        material.roughness = 0.85;
        material.metalness = 0.05;
        material.emissive.set('#101820');
        material.emissiveIntensity = 0.25;
        material.envMapIntensity = 0.8;
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
  }, [scene, opacity, interior, ortho, surfaces, facadeTextures]);

  useEffect(
    () => () => {
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) (node.material as THREE.Material).dispose();
      });
      Object.values(facadeTextures).forEach((tex) => tex.dispose());
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

function featureId(name: string): string | null {
  const [id, featureClass] = (name ?? '').split('|');
  return id && (featureClass === 'Building' || featureClass === 'BuildingPart') ? id : null;
}

interface RegisteredOrthophoto {
  map: THREE.Texture;
  corners: RegisteredCorners;
}

function hallenHighlight(material: THREE.MeshStandardMaterial | THREE.MeshToonMaterial) {
  material.color.set('#ffc247');
  material.emissive.set('#6b3700');
  material.emissiveIntensity = 0.55;
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
function familieFuer(teil: 'roof' | 'ground' | 'wall'): Familie {
  // Die Umgebung ist Hintergrund und bleibt gedeckt -- aber sie ist deshalb
  // nicht **eine** Fläche. Hier stand `return FAMILIEN.M05` für alles, und
  // M05 ist Aussenbeton: ein Plattenraster mit Fuge. Jede Wand jedes
  // Nachbargebäudes trug damit einen Bodenbelag, senkrecht gestellt --
  // sichtbar als Kachelmuster auf Fassaden über das halbe Bild.
  //
  // Boden bleibt Boden, Wand wird Wand. Dass die Umgebung ruhiger ist als der
  // Kern, entscheidet die Deckkraft und nicht eine falsche Familie.
  //
  // `ground` ist die amtliche LoD2-Grundflaeche des Gebaeudes -- draussen der
  // Fussabdruck auf dem Vorplatz, nicht der Hallenboden. M03 (FLOOR_DARK) ist
  // fuer den dunklen *Innen*boden gedacht; drinnen wird diese Flaeche ohnehin
  // ausgeblendet und durch `Hallenhuelle` ersetzt (siehe `umbauen` oben). Bis
  // hierher stand fuer den Kern trotzdem M03, und zwar unabhaengig davon, ob
  // man drinnen oder draussen steht -- der Kernhallen-Fussabdruck erschien von
  // aussen deshalb als dunkler Fleck im hellen Aussengelaende, wo eigentlich
  // derselbe Aussenbeton wie um jedes andere Gebaeude steht.
  // `roof` ist der zweite Fall ohne Lichtbild: fehlt fuer eine Dachflaeche das
  // reale Orthofoto (ausserhalb des belegten Bildausschnitts, oder Paket ohne
  // `orthophoto`-Prop), griff hier bisher M02 -- STRUCTURE_DARK, "Stuetzen,
  // Deckentraeger, dunkle Hallenstruktur". Das ist eine senkrechte
  // Tragwerksfarbe, keine Dachfarbe: der Kern-Fussabdruck bekam dadurch ein
  // fast schwarzes Dach, sobald das Foto fehlte, sichtbar als dunkler Block
  // mitten im hellen Aussengelaende.
  if (teil === 'roof' || teil === 'ground') return FAMILIEN.M05;
  return FAMILIEN.M01;
}

function OfficialPackage({
  uri,
  interior,
  surfaces,
  behandeln,
  deckkraft,
  cel,
  orthophoto,
  highlightFeatureIds,
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
  /** Reales Luftbild, nur fuer belegte Dachflaechen im Bildausschnitt. */
  orthophoto: RegisteredOrthophoto | null;
  /** Amtliche Feature-IDs der ausgewaehlten Halle. */
  highlightFeatureIds: readonly string[];
}) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}${uri}`);

  const model = useMemo(() => {
    // Umgebaut wird nur, was man von drinnen sieht -- von aussen bleibt das
    // Weltmodell inhaltlich, wie es geliefert wird.
    const umbauen = behandeln && !!surfaces && interior;
    const highlightKey = [...highlightFeatureIds].sort().join(',');
    // Ohne Umbau, Schleier, Luftbild, Highlight und Cel-Look gibt es nichts
    // zu tun; dann ist die gelieferte Szene das Ergebnis und wird nicht geklont.
    if (
      !umbauen && deckkraft > 0.99 && !cel && !orthophoto && !highlightKey
    ) return scene;

    const schluessel = [
      uri,
      interior,
      deckkraft.toFixed(2),
      cel,
      orthophoto ? 'ortho' : 'ohne-ortho',
      highlightKey,
    ].join('|');
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
      // Konturhuellen fuer Waende: gesammelt und erst nach der Schleife
      // angehaengt, aus demselben Grund wie oben -- sonst umrandet die
      // Kontur sich selbst. Nur Waende, nicht Dach/Boden: die tragen bereits
      // reale Struktur (Foto oder Familienzeichnung); eine Kontur um jede
      // Dachflaeche waere bei einem 490-Flaechen-Modell ohne sichtbaren
      // Gewinn ein zweiter Durchlauf durchs ganze Gebaeude.
      const huellen: { parent: THREE.Object3D; huelle: THREE.Mesh }[] = [];
      for (const mesh of meshes) {
        const quelle = mesh.material as THREE.MeshStandardMaterial;
        let eigeneGeometrie = false;
        const editierbareGeometrie = () => {
          if (!eigeneGeometrie) {
            // scene.clone(true) teilt die Geometrie mit dem useGLTF-Cache.
            // UV-Projektion darf deshalb nie die geladene Vorlage veraendern.
            mesh.geometry = mesh.geometry.clone();
            eigeneGeometrie = true;
          }
          return mesh.geometry;
        };
        const teil = bauteil(quelle.name) ?? 'wall';
        const highlighted = highlightFeatureIds.includes(featureId(quelle.name) ?? '');
        const familie = familieFuer(teil);
        if (umbauen && teil !== 'wall') {
          // Drinnen kommen Boden und Decke aus `Hallenhuelle` -- siehe unten.
          mesh.visible = false;
          continue;
        }
        if (umbauen && surfaces) projiziereUV(editierbareGeometrie(), WELT_KACHEL_M.wand);
        // Die amtlichen GLB-Pakete bringen fuer Waende kein Foto mit. Aussen
        // bleibt die Wand deshalb bewusst eine saubere Materialklasse statt
        // einer erfundenen Fassadentextur -- aber "Materialklasse" heisst die
        // gezeichnete Familienstruktur (Fugen, Platten), nicht eine einzelne
        // flache Farbe ohne jede Zeichnung. Hier stand fuer die Aussenwand ein
        // eigener Zweig, der `familienMaterial` genau umging und nur die
        // nackte Grundfarbe der Familie setzte -- deshalb blieben Fassaden
        // aussen eine einfarbige Flaeche, waehrend dieselbe Familie innen (mit
        // `familienMaterial` unten) sichtbar strukturiert ist. Der allgemeine
        // Zweig unten deckt Waende jetzt mit ab: er projiziert dieselbe
        // Familienzeichnung, kein Foto.
        const eigeneKarte = umbauen && surfaces ? surfaces.wand : null;
        // Dächer im Cel-Look: niemals die gezeichnete Plattenstruktur der
        // Familie aufbringen -- die ist senkrecht an Wänden lesbar, von oben
        // produziert sie nur ein gleichmäßiges Flimmern, das nichts mit dem
        // amtlichen Bauwerk zu tun hat. Mit Orthophoto: das echte Luftbild
        // (oder eine Karte) liegt drauf. Ohne: die Familiengrundfarbe als
        // flacher Toon, ohne Karten, ohne Kachelung, ohne Normalmap. Eine
        // einzelne flache Farbe ist hier ehrlicher als eine erfundene Zeichnung.
        let material: THREE.MeshToonMaterial;
        if (teil === 'roof') {
          if (orthophoto) {
            material = toonMaterial(familie, { map: orthophoto.map }, { side: THREE.DoubleSide });
            material.color.set('#ffffff');
          } else {
            material = toonMaterial(familie, {}, { side: THREE.DoubleSide });
          }
        } else if (eigeneKarte) {
          material = toonMaterial(familie, {
            map: eigeneKarte.map, normalMap: eigeneKarte.normalMap,
          }, { side: THREE.DoubleSide });
        } else if (quelle.map) {
          material = toonMaterial(familie, {
            map: quelle.map, normalMap: quelle.normalMap,
          }, { side: THREE.DoubleSide });
        } else {
          projiziereUV(editierbareGeometrie(), KACHEL_M[familie.id] ?? 6);
          material = familienMaterial(familie, undefined, { side: THREE.DoubleSide });
        }
        if (highlighted) hallenHighlight(material);
        schleier(material, deckkraft);
        mesh.material = material;
        mesh.receiveShadow = true;
        mesh.castShadow = !interior && behandeln;
        if (teil === 'wall' && deckkraft > 0.99 && mesh.parent) {
          const huelle = konturHuelle(mesh, konturStaerke(familie.kontur));
          if (huelle) huellen.push({ parent: mesh.parent, huelle });
        }
      }
      // Als Geschwister des Originalmeshs angehaengt, nicht an der Wurzel:
      // die Geometrie liegt im lokalen Raum des Meshs, und nur sein eigener
      // Elternknoten traegt die passende Transformation dorthin.
      for (const { parent, huelle } of huellen) parent.add(huelle);
      weltCache.set(schluessel, clone);
      return clone;
    }
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const quelle = node.material as THREE.MeshStandardMaterial;
      let eigeneGeometrie = false;
      const editierbareGeometrie = () => {
        if (!eigeneGeometrie) {
          node.geometry = node.geometry.clone();
          eigeneGeometrie = true;
        }
        return node.geometry;
      };
      const teil = bauteil(quelle.name);
      const highlighted = highlightFeatureIds.includes(featureId(quelle.name) ?? '');
      const realesDach = teil === 'roof' && orthophoto
        ? applyRegisteredOrthoUv(editierbareGeometrie(), orthophoto.corners)
        : false;
      if (!umbauen || !teil || !surfaces) {
        // Schleier, reales Dachbild und Highlight brauchen eine eigene Kopie:
        // die Vorlage kommt aus dem GLB-Cache und wird von anderen Ansichten
        // weiterbenutzt.
        if (deckkraft <= 0.99 || realesDach || highlighted) {
          const kopie = quelle.clone();
          if (realesDach && orthophoto) {
            kopie.map = orthophoto.map;
            kopie.color.set('#ffffff');
            kopie.roughness = 0.9;
          }
          if (highlighted) hallenHighlight(kopie);
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
      projiziereUV(editierbareGeometrie(), WELT_KACHEL_M.wand);
      material.map = surfaces.wand.map;
      material.normalMap = surfaces.wand.normalMap;
      material.roughnessMap = surfaces.wand.roughnessMap;
      material.color.copy(quelle.color ?? new THREE.Color('#ffffff'));
      material.metalness = 0.18;
      material.envMapIntensity = 0.9;
      material.normalScale = new THREE.Vector2(1.0, 1.0);
      if (highlighted) hallenHighlight(material);
      schleier(material, deckkraft);
      node.material = material;
      node.receiveShadow = true;
      node.castShadow = false;
    });

    weltCache.set(schluessel, clone);
    return clone;
  }, [
    scene,
    interior,
    surfaces,
    behandeln,
    uri,
    deckkraft,
    cel,
    orthophoto,
    highlightFeatureIds,
  ]);

  return <primitive object={model} />;
}

function OfficialWorld({
  data,
  centre,
  preset,
  cel,
  deckkraft,
  orthophoto,
  highlightHallKey,
}: {
  data: Dataset;
  centre: [number, number];
  preset: CameraPreset;
  cel: boolean;
  deckkraft: { kern: number; umgebung: number };
  orthophoto: RegisteredOrthophoto | null;
  highlightHallKey: string | null;
}) {
  const interior = preset === 'ego';
  const surfaces = weltFlaechen(interior);

  const alleWeltpakete = data.world?.manifest.packages.filter(
    (entry) => entry.available && entry.role === 'render',
  ) ?? [];
  // In Ego steht man innerhalb einer Halle: deren eigene Waende verdecken
  // die vier Umgebungspakete (surroundings/ost|nord|sued|west, zusammen
  // ~15.500 Primitive) ohnehin vollstaendig -- kein Pixel davon ist je
  // sichtbar. Trotzdem mitgeladen wurden sie mit voller Deckkraft (bei
  // registrierten Daten immer 1) UND mit eigenen Cel-Konturhuellen an
  // jeder Aussenwand, weil `cel` unabhaengig vom Hallenkern fuer jedes
  // Paket lief. Das Ergebnis war ein Renderbudget von 16.037 Manifest-
  // Primitiven plus verdoppelten Aussenkonturen im Ego-Modus fuer eine
  // Ansicht, die strukturell nie mehr als eine Halle zeigt.
  const packages = interior
    ? alleWeltpakete.filter((entry) => entry.id.startsWith('core/'))
    : alleWeltpakete;
  const highlightFeatureIds = useMemo(() => {
    if (!highlightHallKey) return [];
    return data.world?.hallRegistrations?.registrations.find(
      (entry) => entry.hallKey === highlightHallKey,
    )?.targetFeatureIds ?? [];
  }, [data.world, highlightHallKey]);

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
            orthophoto={orthophoto}
            highlightFeatureIds={highlightFeatureIds}
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
  onTop,
}: {
  data: Dataset;
  route: Route | null;
  centre: [number, number];
  onTop: boolean;
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
    <mesh geometry={geometry} renderOrder={onTop ? 50 : 0}>
      <meshStandardMaterial
        color={hasUnconfirmed ? COLOURS.routeUnconfirmed : COLOURS.route}
        emissive={hasUnconfirmed ? COLOURS.routeUnconfirmed : COLOURS.route}
        emissiveIntensity={0.65}
        roughness={0.4}
        depthTest={!onTop}
        depthWrite={!onTop}
      />
    </mesh>
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

/**
 * Terrain-Höhenabfrage über eine Heightmap-Tabelle.
 *
 * Die Heightmap ist ein flaches Float-Array, ein eingecheckter 10-m-Abgriff
 * des DGM1-WCS-Rasters. Fuer jede (x, y) Position wird bilinear interpoliert --
 * das kostet O(1) und ist für First-Person ausreichend schnell.
 *
 * Konstruiert aus dem eingecheckten DGM1-Binaersnapshot. Ein Lade- oder
 * Formatfehler wird sichtbar gemeldet; es gibt keinen behaupteten
 * Terrain-Erfolg auf einer erfundenen flachen Hoehe.
 */
function useTerrainHeightmap(worldOrigin: [number, number, number] | null): {
  sample: (x: number, y: number) => number | null;
  error: string | null;
  ready: boolean;
} {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const cache = useRef<{
    worldOrigin: [number, number, number];
    map: TerrainHeightmap;
  } | null>(null);

  // Lazy-load: Binary-Heightmap beim ersten Render
  useEffect(() => {
    const abort = new AbortController();
    cache.current = null;
    setReady(false);
    if (!worldOrigin) {
      setError('Amtlicher Szenenursprung fehlt.');
      return () => abort.abort();
    }
    setError(null);
    fetch(`${import.meta.env.BASE_URL}data/terrain_heightmap.bin`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buf: ArrayBuffer) => {
        if (abort.signal.aborted) return;
        cache.current = {
          worldOrigin,
          map: parseTerrainHeightmap(buf),
        };
        setError(null);
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (abort.signal.aborted) return;
        cache.current = null;
        setReady(false);
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => abort.abort();
  }, [worldOrigin]);

  const sample = useCallback((x: number, y: number): number | null => {
    const loaded = cache.current;
    return loaded
      ? sampleRegisteredTerrainHeight(loaded.map, loaded.worldOrigin, x, y)
      : null;
  }, []);

  return { sample, error, ready };
}

function WalkControls({
  data,
  centre,
  active,
  start,
  onExit,
  noClip = false,
  frozen = false,
  viewfinderOpen = false,
  terrainHeight,
  terrainReady,
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
  terrainHeight: (x: number, y: number) => number | null;
  terrainReady: boolean;
  onToggleNoClip?: () => void;
  onToggleFreeze?: () => void;
  onToggleViewfinder?: () => void;
  onMark?: (snapshot: CameraSnapshot) => void;
  onCameraSnapshot?: (snapshot: CameraSnapshot) => void;
}) {
  const { camera, gl, scene } = useThree();
  const position = useRef({ x: 0, y: 0, z: 0 });
  /** Siehe Startpunkt-Effekt unten: verhindert, dass eine spaet ladende
   * Hoehenkarte die laufende Person zurueck zum Spawn teleportiert. */
  const bewegt = useRef(false);
  const look = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  const locked = useRef(false);
  const touchMovement = useRef({ forward: 0, strafe: 0 });
  const touchPointers = useRef(new Map<number, {
    role: 'move' | 'look';
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  }>());

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
  //
  // Diese Abhaengigkeit auf `terrainReady`/`terrainHeight` war ein Fehler:
  // die Hoehenkarte laedt asynchron nach, und wenn sie erst *waehrend* des
  // Laufens fertig wird, feuerte dieser Effekt erneut -- mitten in der
  // Bewegung sprang die Kamera zurueck zum Ausgangspunkt und der Blick auf
  // Gieren/Nicken null, ohne jede sichtbare Ursache. Genau das Bild von
  // "die Ego-Ansicht friert ein" oder "die Kamera springt zurueck". `bewegt`
  // haelt fest, ob der Mensch schon selbst gesteuert hat; ab dann ist dieser
  // Effekt nur noch fuer den naechsten Ego-Eintritt zustaendig.
  useEffect(() => {
    if (!active) {
      bewegt.current = false;
      return;
    }
    if (bewegt.current) return;
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
    if (footing) {
      const surface = data.walk.footingAt(footing.x, footing.y, footing.z);
      const piazzaId = data.boulevard?.plaetze?.find((platz) => platz.name === 'Piazza')?.id;
      const terrainZ = !surface.hallKey && (
        surface.surfaceId === 'legacy-open-outside' ||
        (surface.surfaceId?.startsWith('platz-') && surface.surfaceId !== piazzaId)
      )
        ? terrainHeight(footing.x, footing.y)
        : null;
      position.current = terrainZ === null ? footing : { ...footing, z: terrainZ };
    }
    look.current = { yaw: 0, pitch: 0 };
  }, [active, start, data, centre, terrainHeight, terrainReady]);

  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement;
    const activeKeys = keys.current;
    const activePointers = touchPointers.current;
    const isTyping = (target: EventTarget | null) =>
      target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(target.tagName);

    const request = () => {
      if (window.matchMedia('(pointer: coarse)').matches) return;
      if (!locked.current && !viewfinderRef.current) void canvas.requestPointerLock?.();
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === canvas;
      if (!locked.current) activeKeys.clear();
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
      activeKeys.add(key);
    };
    const onUp = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      activeKeys.delete(event.key.toLowerCase());
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' || frozenRef.current || viewfinderRef.current) return;
      event.preventDefault();
      const role: 'move' | 'look' = event.clientX < window.innerWidth / 2 ? 'move' : 'look';
      if ([...activePointers.values()].some((pointer) => pointer.role === role)) return;
      activePointers.set(event.pointerId, {
        role,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
      });
      canvas.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      const pointer = activePointers.get(event.pointerId);
      if (!pointer || frozenRef.current) return;
      event.preventDefault();
      if (pointer.role === 'look') {
        look.current.yaw -= (event.clientX - pointer.lastX) * 0.006;
        look.current.pitch = Math.max(
          -1.2,
          Math.min(1.2, look.current.pitch - (event.clientY - pointer.lastY) * 0.006),
        );
        pointer.lastX = event.clientX;
        pointer.lastY = event.clientY;
        return;
      }
      const strafe = Math.max(-1, Math.min(1, (event.clientX - pointer.startX) / 70));
      const forward = Math.max(-1, Math.min(1, (pointer.startY - event.clientY) / 70));
      const length = Math.max(1, Math.hypot(strafe, forward));
      touchMovement.current = { strafe: strafe / length, forward: forward / length };
    };
    const onPointerEnd = (event: PointerEvent) => {
      const pointer = activePointers.get(event.pointerId);
      if (pointer?.role === 'move') touchMovement.current = { forward: 0, strafe: 0 };
      activePointers.delete(event.pointerId);
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };

    canvas.addEventListener('click', request);
    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      canvas.removeEventListener('click', request);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      activeKeys.clear();
      activePointers.clear();
      touchMovement.current = { forward: 0, strafe: 0 };
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
    // `pitch` ist optional und war es immer -- ohne ihn schaut die Kamera
    // waagerecht, wie bisher. Mit ihm lässt sich senkrecht nach unten
    // blicken, und das ist die einzige Ansicht, in der man prüfen kann, ob
    // Stützenreihen tatsächlich parallel laufen und die Leuchtbänder
    // zwischen ihnen liegen. In der Perspektive sieht beides plausibel aus,
    // auch wenn es falsch ist.
    global.__SETZEN = (px: number, py: number, pz: number, yaw: number, pitch = 0) => {
      position.current = { x: px, y: py, z: pz };
      look.current.yaw = yaw;
      look.current.pitch = pitch;
      // Ein manuelles Setzen ist ebenfalls eine bewusste Positionierung --
      // der Startpunkt-Effekt darf sie nicht spaeter ueberschreiben.
      bewegt.current = true;
    };
    return () => {
      delete global.__SETZEN;
    };
  }, [active]);

  /**
   * Diagnose-Haken fuer die Bildpruefer: Kamerapose, Rendererstatistik und
   * ein Raycast entlang der Blickrichtung.
   *
   * Ohne diesen haette jede Behauptung "die Wand blockiert jetzt den Blick"
   * nur am Bild geprüft werden können -- richtig, aber ohne zu sagen, *was*
   * den Blick blockiert (welches Mesh, welche Distanz, welches Material).
   * Wie `__SETZEN` nur hinter `?setzen` und nie im ausgelieferten Verhalten
   * fuer Besucher sichtbar.
   */
  useEffect(() => {
    if (!active || !SETZEN_ERLAUBT) return;
    const global = globalThis as { __DIAGNOSE?: unknown };
    const strahl = new THREE.Raycaster();
    global.__DIAGNOSE = () => {
      strahl.far = Infinity;
      strahl.set(camera.position.clone(), camera.getWorldDirection(new THREE.Vector3()));
      const treffer = strahl.intersectObjects(scene.children, true)
        .filter((hit) => hit.object.visible && !hit.object.userData?.kontur);
      const erster = treffer[0] ?? null;
      const material = erster && 'material' in erster.object
        ? (erster.object as THREE.Mesh).material
        : null;
      const materialInfo = Array.isArray(material)
        ? material.map((m) => ({
            name: m.name,
            transparent: m.transparent,
            opacity: m.opacity,
            depthWrite: m.depthWrite,
          }))
        : material
          ? {
              name: material.name,
              transparent: material.transparent,
              opacity: material.opacity,
              depthWrite: material.depthWrite,
            }
          : null;
      const alleTreffer = treffer.slice(0, 8).map((hit) => ({
        name: hit.object.name,
        type: hit.object.type,
        distance: hit.distance,
        point: [hit.point.x, hit.point.y, hit.point.z],
        parentName: hit.object.parent?.name ?? null,
      }));
      const nahebei: { name: string; type: string; y: number; dist: number; parentName: string | null }[] = [];
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const world = new THREE.Vector3();
        obj.getWorldPosition(world);
        const dist = Math.hypot(world.x - camera.position.x, world.z - camera.position.z);
        if (dist < 60) {
          nahebei.push({
            name: obj.name,
            type: obj.geometry?.type ?? '?',
            y: world.y,
            dist,
            parentName: obj.parent?.name ?? null,
          });
        }
      });
      return {
        hallKey: data.walk.footingAt(position.current.x, position.current.y, position.current.z).hallKey,
        position: { x: position.current.x, y: position.current.y, z: position.current.z },
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        yaw: look.current.yaw,
        pitch: look.current.pitch,
        fov: (camera as THREE.PerspectiveCamera).fov,
        near: (camera as THREE.PerspectiveCamera).near,
        far: (camera as THREE.PerspectiveCamera).far,
        raycast: erster
          ? { name: erster.object.name, distance: erster.distance, material: materialInfo }
          : null,
        raycastAll: alleTreffer,
        nahebeiCount: nahebei.length,
        nahebei: nahebei.sort((a, b) => a.dist - b.dist).slice(0, 40),
        rendererInfo: {
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length ?? null,
        },
        lights: (() => {
          const out: {
            type: string;
            distance?: number;
            castShadow?: boolean;
            shadowMapSize?: number;
            pos: number[];
            parentName: string | null;
          }[] = [];
          scene.traverse((obj) => {
            if (obj instanceof THREE.PointLight || obj instanceof THREE.DirectionalLight || obj instanceof THREE.SpotLight) {
              const world = new THREE.Vector3();
              obj.getWorldPosition(world);
              out.push({
                type: obj.type,
                distance: 'distance' in obj ? (obj as THREE.PointLight).distance : undefined,
                castShadow: obj.castShadow,
                shadowMapSize: obj.castShadow ? obj.shadow.mapSize.width : undefined,
                pos: [Math.round(world.x), Math.round(world.y), Math.round(world.z)],
                parentName: obj.parent?.name ?? null,
              });
            }
          });
          return out;
        })(),
      };
    };
    return () => {
      delete global.__DIAGNOSE;
    };
  }, [active, camera, gl, scene]);

  /**
   * Rohbau-Ansicht fuer den Bildpruefer: alles weg, was nicht zur
   * Orientierung im Raum gehoert -- Texturen, Lampen, Deckengitter --
   * damit sich Geometrie (Stuetzenraster, Hallenmasse, Proportionen)
   * beurteilen laesst, ohne dass Material- oder Lichtfragen mit hineinreden.
   * `__ROHBAU(true)` schaltet um, `__ROHBAU(false)` stellt die Originale
   * wieder her. Nur hinter `?setzen`, wie `__SETZEN`/`__DIAGNOSE`.
   */
  useEffect(() => {
    if (!active || !SETZEN_ERLAUBT) return;
    const global = globalThis as { __ROHBAU?: unknown };
    const gesicherteMaterialien = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const gesicherteLichter = new Map<THREE.Light, boolean>();
    const rohbauMaterial = new THREE.MeshBasicMaterial({ color: '#9aa0a8' });
    let zusatzlicht: THREE.AmbientLight | null = null;

    const KEIN_ROHBAU = new Set(['hallendecke']);

    const wiederherstellen = () => {
      gesicherteMaterialien.forEach((material, mesh) => {
        mesh.material = material;
        if (KEIN_ROHBAU.has(mesh.name)) mesh.visible = true;
      });
      gesicherteMaterialien.clear();
      gesicherteLichter.forEach((sichtbar, licht) => { licht.visible = sichtbar; });
      gesicherteLichter.clear();
      if (zusatzlicht) {
        scene.remove(zusatzlicht);
        zusatzlicht = null;
      }
    };

    global.__ROHBAU = (an: boolean) => {
      if (an) {
        if (zusatzlicht) return 'bereits an';
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh && !obj.userData?.kontur) {
            gesicherteMaterialien.set(obj, obj.material);
            if (KEIN_ROHBAU.has(obj.name)) {
              obj.visible = false;
            } else {
              obj.material = rohbauMaterial;
            }
          }
          if (obj instanceof THREE.Light) {
            gesicherteLichter.set(obj, obj.visible);
            obj.visible = false;
          }
        });
        zusatzlicht = new THREE.AmbientLight('#ffffff', 3);
        scene.add(zusatzlicht);
        return 'rohbau an';
      }
      wiederherstellen();
      return 'rohbau aus';
    };
    return () => {
      // Sonst blieb die Szene grau/lichtlos zurueck, wenn der Effekt mit
      // eingeschaltetem Rohbau neu lief (z.B. `active` wechselt) -- die
      // einzige Rueckholfunktion war schon geloescht, bevor sie je aufraeumen
      // konnte.
      wiederherstellen();
      rohbauMaterial.dispose();
      delete global.__ROHBAU;
    };
  }, [active, scene]);

  useFrame((state, delta) => {
    if (!active) return;

    if (!frozenRef.current) {
      const pressed = keys.current;
      const forward =
        (pressed.has('w') || pressed.has('arrowup') ? 1 : 0) -
        (pressed.has('s') || pressed.has('arrowdown') ? 1 : 0) + touchMovement.current.forward;
      const strafe =
        (pressed.has('d') || pressed.has('arrowright') ? 1 : 0) -
        (pressed.has('a') || pressed.has('arrowleft') ? 1 : 0) + touchMovement.current.strafe;
      const climb = (pressed.has(' ') ? 1 : 0) - (pressed.has('control') ? 1 : 0);

      if (forward || strafe) {
        bewegt.current = true;
        const speed = (pressed.has('shift') ? RUN_SPEED_M_PER_S : WALK_SPEED_M_PER_S) * delta;
        const { yaw } = look.current;
        const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed;
        const dy = (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed;
        if (noClipRef.current) {
          position.current = { ...position.current, x: position.current.x + dx, y: position.current.y + dy };
        } else {
          const moved = data.walk.move(position.current, dx, dy);
          if (moved.x !== position.current.x || moved.y !== position.current.y) {
            const footing = data.walk.footingAt(moved.x, moved.y, moved.z);
            // WalkGrid laesst den unbekannten Aussenraum bewusst bei z=0
            // offen. Nur dort ersetzt das echte DGM1 diese Arbeitsebene;
            // Hallen, Rampen und belegte Boulevardflaechen behalten ihre
            // jeweils autoritative Hoehe.
            const piazzaId = data.boulevard?.plaetze
              ?.find((platz) => platz.name === 'Piazza')?.id;
            const terrainZ = !footing.hallKey && (
              footing.surfaceId === 'legacy-open-outside' ||
              (footing.surfaceId?.startsWith('platz-') && footing.surfaceId !== piazzaId)
            )
              ? terrainHeight(moved.x, moved.y)
              : null;
            position.current = terrainZ === null ? moved : { ...moved, z: terrainZ };
          }
        }
      }

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

  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div className="walk-touch-guide" aria-hidden="true">
        <span>ziehen · bewegen</span>
        <span>ziehen · umsehen</span>
      </div>
    </Html>
  );
}

/**
 * Haelt Sichtfeld und Clipping-Ebenen der Kamera synchron zum Preset.
 *
 * `<Canvas camera={{...}}>` sieht nach einer reaktiven Prop aus, ist es aber
 * nicht: `@react-three/fiber` legt die Kamera beim ersten Aufbau der Szene an
 * und uebernimmt diese Angaben genau einmal -- "Create default camera, don't
 * overwrite any user-set state" steht im Quelltext der Bibliothek, und der
 * Vergleich, der eine spaetere Aktualisierung ausloesen wuerde, vergleicht
 * eine THREE.Camera-Instanz mit einem Props-Objekt und ist deshalb nie
 * gleich. Ergebnis: die Szene startet in der Uebersicht mit 42 Grad
 * Sichtfeld, und dieses Sichtfeld blieb *fuer die gesamte Sitzung* stehen --
 * auch nach dem Wechsel in den Ego-Modus, der eigentlich 70 Grad will. Wer
 * das ausprobiert, sieht eine Halle wie durch ein Teleobjektiv: schmal, ohne
 * das Gefuehl von Bewegung, obwohl Kollision und Blickrichtung laengst
 * korrekt arbeiten -- genau das Bild von "Kameraeinstellungen tun nichts".
 * Bestaetigt mit einem Raycast-Diagnosehaken (`__DIAGNOSE`) gegen den
 * gebauten Stand: `fov` blieb 42 in allen vier Blickrichtungen des
 * Ego-Modus. Dieser Baustein setzt die Werte deshalb selbst, jedes Mal, wenn
 * sich das Preset oder die Gelaendeausdehnung aendert.
 */
function KameraOptik({ preset, extent }: { preset: CameraPreset; extent: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    if (typeof persp.fov !== 'number') return;
    const fov = preset === 'ego' ? 70 : 42;
    const near = 0.15;
    // Draussen braucht die Fernebene das ganze Gelaende (Uebersicht sieht bis
    // zum Horizont). Drinnen ist das Vielfache zu viel: Nebel schneidet den
    // Ego-Blick ohnehin bei extent * 1.2 ab (siehe unten), und eine
    // Fernebene von mehreren Kilometern verschenkt nur Tiefenschaerfe genau
    // dort, wo sie zaehlt -- an der naechsten Wand, ein paar Meter entfernt.
    const far = preset === 'ego' ? Math.min(extent * 1.5, 900) : Math.max(extent * 6, 200);
    if (persp.fov === fov && persp.near === near && persp.far === far) return;
    persp.fov = fov;
    persp.near = near;
    persp.far = far;
    persp.updateProjectionMatrix();
  }, [camera, preset, extent]);
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
  const controls = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  const wanted = useRef(new THREE.Vector3());
  const resetting = useRef(true);

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
    resetting.current = true;
  }, [preset, focus, extent]);

  useFrame((_, delta) => {
    const speed = Math.min(1, delta * 3);
    if (resetting.current) {
      camera.position.lerp(wanted.current, speed);
      if (camera.position.distanceTo(wanted.current) < 0.05) {
        resetting.current = false;
      }
    }
    if (controls.current) {
      controls.current.target.lerp(target.current, speed);
      controls.current.update();
    }
  });

  return (
    <MapControls
      ref={controls as never}
      enableDamping
      dampingFactor={0.12}
      enablePan
      screenSpacePanning={false}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2 - 0.02}
      minDistance={4}
      maxDistance={extent * 2.4}
      mouseButtons={{
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      }}
      touches={{
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE,
      }}
      onStart={() => { resetting.current = false; }}
    />
  );
}

export function SiteScene(props: SceneProps) {
  const { data, upperOpacity, route, preset, focusHallKey } = props;
  const cel = props.cel ?? true;
  const centre = useMemo(() => siteCentre(data.site), [data.site]);
  const registered = data.spatialMode === 'registered';
  const terrainHeightmap = useTerrainHeightmap(data.world?.manifest.origin ?? null);
  const terrainHeight = terrainHeightmap.sample;
  const presentation = worldPresentation(preset, registered);
  // Eine Texturinstanz fuer Terrain und Dachprojektion. Sie bleibt wie die
  // Weltmodelle fuer die Sitzung im Cache; deren Materialien verweisen darauf.
  const orthoMap = useMemo(() => (data.ortho ? orthoTexture(ORTHO_URL) : null), [data.ortho]);
  const registeredOrthophoto = useMemo<RegisteredOrthophoto | null>(() => (
    registered && data.ortho?.corners && orthoMap
      ? { map: orthoMap, corners: data.ortho.corners as RegisteredCorners }
      : null
  ), [registered, data.ortho, orthoMap]);

  /**
   * In welcher Halle die Kamera gerade steht.
   *
   * `focusHallKey` taugt dafür nicht: es wird ausschliesslich von einem
   * Suchtreffer gesetzt (`pickHit` in App.tsx). Wer zu Fuss in eine Halle
   * läuft, hatte deshalb keine -- und `Hallenlicht`, die einzige echte
   * Lichtquelle drinnen, rendert dann gar nichts. Die Halle lag im Dunkeln,
   * beleuchtet nur von einer schwachen Halbkugel; Stützen wurden schwarze
   * Silhouetten ohne Flächenunterschied, Schatten gab es keine.
   *
   * Der Schnappschuss der Laufkamera weiss es dagegen ohnehin -- er führt
   * `hallKey` aus dem Wegenetz mit. Viermal je Sekunde, deshalb wird nur bei
   * einem echten Wechsel neu gesetzt.
   */
  const [egoHallKey, setEgoHallKey] = useState<string | null>(null);
  const [egoSnapshotSeen, setEgoSnapshotSeen] = useState(false);
  const defaultEgoHallKey = useMemo(() => {
    const spawn = data.walk.spawn(focusHallKey ?? undefined);
    return spawn
      ? data.walk.footingAt(spawn.x, spawn.y, spawn.z).hallKey
      : null;
  }, [data, focusHallKey]);
  useEffect(() => {
    if (preset !== 'ego') return;
    setEgoSnapshotSeen(false);
    setEgoHallKey(null);
  }, [preset]);
  const onCameraSnapshot = useCallback((snapshot: CameraSnapshot) => {
    setEgoSnapshotSeen(true);
    setEgoHallKey((bisher) => (bisher === snapshot.hallKey ? bisher : snapshot.hallKey));
    props.onCameraSnapshot?.(snapshot);
  }, [props.onCameraSnapshot]);
  const lichtHallKey = preset === 'ego'
    ? (egoSnapshotSeen ? egoHallKey : (focusHallKey ?? defaultEgoHallKey))
    : focusHallKey;

  useEffect(() => {
    if (!SETZEN_ERLAUBT) return;
    (globalThis as { __LICHT_HALL_KEY?: unknown }).__LICHT_HALL_KEY = {
      lichtHallKey, egoHallKey, egoSnapshotSeen, focusHallKey, defaultEgoHallKey, preset,
    };
  }, [lichtHallKey, egoHallKey, egoSnapshotSeen, focusHallKey, defaultEgoHallKey, preset]);

  const viewBounds = useMemo(() => {
    const points = data.site.halls.flatMap((hall) => hall.footprint);
    for (const nodeId of route?.nodeIds ?? []) {
      const node = data.graph.nodes.get(nodeId);
      if (node) points.push([node.x, node.y]);
    }
    const xs = points.map((point) => point[0]);
    const ys = points.map((point) => point[1]);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [data.site, data.graph, route]);

  const extent = Math.max(viewBounds.maxX - viewBounds.minX, viewBounds.maxY - viewBounds.minY);

  const focus = useMemo(() => {
    if (focusHallKey) {
      const hall = data.hallsByKey.get(focusHallKey);
      if (!hall) return null;
      const [cx, cy] = polygonCentre(hall.footprint);
      return toScene(cx, cy, hall.baseY, centre);
    }
    if (route && preset === 'uebersicht') {
      return toScene(
        (viewBounds.minX + viewBounds.maxX) / 2,
        (viewBounds.minY + viewBounds.maxY) / 2,
        0,
        centre,
      );
    }
    return null;
  }, [focusHallKey, data, centre, route, preset, viewBounds]);

  return (
    <Canvas
      camera={{ fov: preset === 'ego' ? 70 : 42, near: 0.15, far: extent * 6, position: [extent * 0.5, extent * 0.6, extent * 0.85] }}
      // Auf dem Telefon entscheidet DPR zwischen 30 fps und 0.1 fps. Wir
      // zaehlen nicht den vollen devicePixelRatio, sondern capen bei 1.5x:
      // das Xiaomi 14T Pro hat 3.3x, ein 6"-Panel liegt bei 2-3x, ein
      // Desktop-Monitor bei 1-2x. Bei 1.5x rendert ein 14T Pro knapp die
      // Haelfte der physischen Pixel -- das Auge sieht die fehlende
      // Schärfe nicht, der GPU sieht ein Drittel weniger Fragmentlast.
      // Wer auf einem Retina-Desktop testet, bekommt mit 1.5x sichtbar
      // schärfer als 1x, ohne in den 3.24x-Killbereich zu rutschen.
      dpr={[1, 1.5]}
      // Echtzeit-Schatten sind im Cel-Look entbehrlich (siehe Beleuchtung):
      // die Stufen ersetzen den Hell-Dunkel-Verlauf, und die BackSide-
      // Konturhuellen liefern die Silhouette. Wer den Schatten-Apparat
      // dennoch anfordert, zahlt dafuer auf dem Telefon 4-16 MB/s
      // Bandbreite, ohne dass der Look etwas davon hat.
      shadows={false}
      // MSAA auf dem WebGL-Framebuffer kostet auf Telefon-GPUs mehr als
      // die dreifache Fragmentlast einer einzelnen Probe. Cel-Linien sind
      // ohnehin BackSide-Huellen, die keine Anti-Aliasing-Kante brauchen,
      // und die Bander im Cel-Look sind harte Stufen -- ein weicher
      // Rahmen durch MSAA wuerde sie nur verwischen. Wer auf einem
      // hochauflösenden Monitor testet, sieht den Verlust; die Banding-
      // Konturen fallen am Bildschirmrand niemals auf.
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      style={{ touchAction: 'none' }}
      onCreated={({ gl }) => {
        // Ohne Tone Mapping kippt alles Helle nach Weiß, und genau das ließ
        // die Szene wie ein eingefärbtes Drahtgitter aussehen.
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        // Drinnen dunkler belichten als draussen. In der Halle sind die
        // Lichtbaender die hellsten Flaechen im Bild; bei 1,05 fressen sie
        // aus und ziehen den Boden gleich mit ins Weisse -- genau der Grund,
        // warum der Hallenboden auf den Aufnahmen keine Zeichnung zeigte,
        // obwohl er sie traegt. Weniger Belichtung ist hier kein Abdunkeln,
        // sondern das Gegenteil: die Zeichnung kommt zurueck.
        gl.toneMappingExposure = preset === 'ego' ? 0.86 : 1.05;
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
      <KameraOptik preset={preset} extent={extent} />
      <Beleuchtung extent={extent} interior={preset === 'ego'} />

      {registered && terrainHeightmap.error && (
        <Html position={[0, 12, 0]} center>
          <div className="scene-data-error">
            Gelände-Höhenabfrage nicht verfügbar: {terrainHeightmap.error}
          </div>
        </Html>
      )}

      {/* Das amtliche DGM1-Terrain -- das Fundament, auf dem alles steht.
          Nicht in Ego: der komplette 7x3-km-DGM-Ausschnitt (701x301 Punkte,
          ~420k Dreiecke in zwei Meshes: `bare` + Orthophoto-`drape`) laedt
          synchron beim Mount (GLB laden, repairTerrainGrid, beide
          Geometrien bauen, GPU-Upload) und ist als Riesenmesh praktisch
          nicht frustum-kullbar -- die Bounding Sphere schneidet die Kamera
          immer, egal wohin man in der Halle schaut. Von drinnen sieht man
          das Gelaende ohnehin nie, der Hallenboden verdeckt es vollstaendig
          -- exakt derselbe Grund, aus dem OfficialWorld die vier
          Umgebungspakete in Ego schon nicht mehr mountet. Die
          Hoehenabfrage fuers Laufen (`useTerrainHeightmap`/`terrainHeight`)
          haengt nicht an diesem Mesh, sondern an einer eigenen,
          unabhaengig geladenen Binaer-Heightmap -- faellt hier also nicht
          mit weg. */}
      {registered && preset !== 'ego' && (
        <Suspense fallback={null}>
          <Terrain centre={centre} ortho={data.ortho} map={orthoMap} />
        </Suspense>
      )}
      {/* Im registrierten Modus liegt das Luftbild auf dem DGM1 oben. Die
          flache Variante bleibt nur fuer den alten Planraum erhalten. */}
      {!registered && (
        <Ground
          extent={extent}
          centre={centre}
          ortho={data.ortho}
          map={orthoMap}
          backdropY={-0.6}
        />
      )}
      <Umgebung
        data={data}
        centre={centre}
        registered={registered}
        terrainHeight={terrainHeight}
        terrainReady={terrainHeightmap.ready}
      />
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
          <OfficialWorld
            data={data}
            centre={centre}
            preset={preset}
            cel={cel}
            deckkraft={presentation.deckkraft}
            orthophoto={registeredOrthophoto}
            highlightHallKey={props.highlightHallKey ?? focusHallKey}
          />
        </Suspense>
      )}
      {props.showStands && (preset === 'halle' || preset === 'ego') && focusHallKey && !LEER_ERLAUBT && (
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
      {presentation.showHallOverlay && (
        <Halls data={data} centre={centre} upperOpacity={upperOpacity} />
      )}
      {props.showStands && !LEER_ERLAUBT && (
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
      )}
      {props.showStands && !LEER_ERLAUBT && (
        <Markenstaende data={data} centre={centre} onSelectStand={props.onSelectStand} />
      )}
      {/* Waende fuer die gewoehnlichen Staende -- vorerst abgeschaltet.
          Erst muss die LEERE Halle (Stuetzen, Deckeninstallation, Boden)
          optisch stimmen; die Staende kommen danach dazu, und der erste
          reale Stand wird aus einer gelieferten GLB gebaut, nicht laenger
          prozedural. Datei bleibt bestehen, nur das Rendern ist aus. */}
      {false && props.showStands && !LEER_ERLAUBT && (preset === 'halle' || preset === 'ego') && focusHallKey && (
        <KleineStaende data={data} centre={centre} hallKey={focusHallKey} />
      )}
      <Hallenhuelle
        data={data}
        centre={centre}
        hallKey={lichtHallKey}
        visible={preset === 'ego'}
      />
      {/* Sicherheitsnetz gegen amtliche Luecken in der Aussenwand -- siehe
          die Begruendung an `Hallenwaende` selbst. Steht knapp ausserhalb
          der echten Kante und wird von einer vorhandenen amtlichen Wand
          immer verdeckt; sichtbar wird sie nur dort, wo keine steht. */}
      <Hallenwaende
        data={data}
        centre={centre}
        hallKey={lichtHallKey}
        visible={preset === 'ego'}
      />
      <Hallenstuetzen
        data={data}
        centre={centre}
        hallKey={lichtHallKey}
        visible={preset === 'ego'}
      />
      <Lichtspiegel
        data={data}
        centre={centre}
        hallKey={lichtHallKey}
        visible={preset === 'ego'}
      />
      <Boulevard
        data={data}
        centre={centre}
        visible={preset === 'ego'}
        previewSafe={props.previewSafe ?? true}
      />
      <Deckenleuchten
        data={data}
        centre={centre}
        hallKey={lichtHallKey}
        visible={preset === 'ego' && !ROHBAU_PHASE}
      />
      {/* Die A-Stufen der Detailhierarchie: Deckenraster, Fassadengliederung,
          Hallennummern, Zaun. Ohne sie bleiben M02, M07, M08 und M10 Familien
          ohne Traeger -- Materialien, die in der Welt niemand anhat. */}
      <Ausstattung
        data={data}
        centre={centre}
        drinnen={preset === 'ego'}
        hallKey={lichtHallKey}
      />
      <Hallenlicht
        data={data}
        centre={centre}
        hallKey={lichtHallKey}
        active={preset === 'ego'}
      />
      <Vertikalverbindungen data={data} centre={centre} />
      <RouteRibbon
        data={data}
        route={route}
        centre={centre}
        onTop={props.routeOnTop ?? false}
      />
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
          terrainHeight={terrainHeight}
          terrainReady={terrainHeightmap.ready}
          onToggleNoClip={props.onToggleNoClip}
          onToggleFreeze={props.onToggleFreeze}
          onToggleViewfinder={props.onToggleViewfinder}
          onMark={props.onMark}
          onCameraSnapshot={onCameraSnapshot}
        />
      ) : (
        <CameraRig preset={preset} focus={focus} extent={extent} />
      )}
    </Canvas>
  );
}
