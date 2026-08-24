/**
 * Lädt die aufbereiteten Daten.
 *
 * Geladen werden eingecheckte Schnappschüsse, nie eine fremde Schnittstelle:
 * die App muss auf dem Messegelände funktionieren, wo das Netz genau dann
 * zusammenbricht, wenn alle es brauchen.
 */

import { RouteGraph, type CompactGraph } from '../routing/graph';
import { LEGACY_OPEN_OUTSIDE, WalkGrid } from '../scene/walk';
import { boulevardAchse } from '../scene/boulevard';
import { BoulevardSurfaces } from '../scene/boulevardSurfaces';
import {
  FlatSurfaceProvider,
  PrioritySurfaceProvider,
  TriangleSurfaceProvider,
  type SurfaceProvider,
  type TriangleSurface,
} from '../scene/surfaces';
import type { Registry, Site } from './types';

const BASE = `${import.meta.env.BASE_URL}data`;

/** Was das Luftbild abdeckt -- gebaut von tools/build_ortho.py. */
export interface Ortho {
  schema: 'beuteltier.ortho.v1';
  image: string;
  /** [x0, y0, x1, y1] in Geländemetern. */
  extent: [number, number, number, number];
  metresPerPixel: number;
  /**
   * Die vier Ecken nach der Ueberfuehrung in den amtlichen Szenenraum:
   * x0/y0, x1/y0, x0/y1, x1/y1. Fehlt nur im Legacy-Modus.
   */
  corners?: [[number, number], [number, number], [number, number], [number, number]];
  coordinatePlane?: 'legacy-site' | 'sceneX/sceneZ';
}

export interface Surroundings {
  schema: 'beuteltier.surroundings.v1';
  coordinatePlane?: 'legacy-site' | 'sceneX/sceneZ';
  attribution: string;
  roads: Array<{ id: number; kind: string; name: string | null; points: [number, number][] }>;
  markers: Array<{ id: number; kind: string; name: string | null; point: [number, number] }>;
}

export interface Footprints {
  schema: 'beuteltier.footprints.v1';
  coordinatePlane?: 'legacy-site' | 'sceneX/sceneZ';
  gapsWithoutLod2: number;
  footprints: Array<{ id: string; lod2Covered: boolean; footprint: [number, number][] }>;
}

export interface LegacySiteFit {
  rotationDeg: number;
  mirrored: boolean;
  translation: [number, number];
}

interface BuildingsSnapshot {
  schema: string;
  fit: LegacySiteFit;
}

/**
 * Alter Planraum -> amtlicher Szenenraum.
 *
 * `surroundings.v1`, `footprints.v1` und `ortho.v1` wurden mit der inversen
 * LoD2-Passung in den alten Hallenplan geschrieben. Die registrierten Hallen
 * liegen dagegen direkt relativ zu `world-origin.json`. Diese Funktion ist
 * exakt die Rueckrichtung derselben Passung; sie schaetzt und registriert
 * nichts neu.
 */
export function legacyPointToRegistered(
  point: [number, number],
  fit: LegacySiteFit,
  worldOrigin: [number, number, number],
): [number, number] {
  const angle = fit.rotationDeg * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const planX = fit.mirrored ? -point[0] : point[0];
  const worldX = cos * planX - sin * point[1] + fit.translation[0];
  const worldY = sin * planX + cos * point[1] + fit.translation[1];
  return [worldX - worldOrigin[0], -(worldY - worldOrigin[1])];
}

export function alignLegacyLayers(
  ortho: Ortho | null,
  surroundings: Surroundings | null,
  footprints: Footprints | null,
  fit: LegacySiteFit,
  worldOrigin: [number, number, number],
): { ortho: Ortho | null; surroundings: Surroundings | null; footprints: Footprints | null } {
  const point = (value: [number, number]) => legacyPointToRegistered(value, fit, worldOrigin);

  const registeredOrtho = ortho ? (() => {
    const [x0, y0, x1, y1] = ortho.extent;
    const corners: NonNullable<Ortho['corners']> = [
      point([x0, y0]),
      point([x1, y0]),
      point([x0, y1]),
      point([x1, y1]),
    ];
    return {
      ...ortho,
      coordinatePlane: 'sceneX/sceneZ' as const,
      corners,
    };
  })() : null;

  const registeredSurroundings = surroundings ? {
    ...surroundings,
    coordinatePlane: 'sceneX/sceneZ' as const,
    roads: surroundings.roads.map((road) => ({
      ...road,
      points: road.points.map(point),
    })),
    markers: surroundings.markers.map((marker) => ({
      ...marker,
      point: point(marker.point),
    })),
  } : null;

  const registeredFootprints = footprints ? {
    ...footprints,
    coordinatePlane: 'sceneX/sceneZ' as const,
    footprints: footprints.footprints.map((entry) => ({
      ...entry,
      footprint: entry.footprint.map(point),
    })),
  } : null;

  return {
    ortho: registeredOrtho,
    surroundings: registeredSurroundings,
    footprints: registeredFootprints,
  };
}

export interface WorldManifest {
  schema: 'beuteltier.world.v1';
  modelVersion: string;
  status: 'migration' | 'ready';
  origin: [number, number, number];
  packages: Array<{
    id: string;
    role: string;
    status: string;
    uri: string;
    available: boolean;
    bytes: number | null;
  }>;
  data: Record<string, string>;
  registrationSummary: {
    total: number;
    draft: number;
    registered: number;
    withTargetFeatures: number;
    constrained?: number;
  };
  fallback: { orthophoto: boolean; uri: string; walkable: boolean };
}

export interface WorldDiagnostics {
  manifest: WorldManifest;
  walkableSurfaces: {
    schema: string;
    outsidePolicy: {
      unknownBlocked: boolean;
      orthophotoWalkable: boolean;
      terrainWalkableByDefault: boolean;
      legacyFallbackStillActive: boolean;
    };
    gaps: string[];
  } | null;
  portals: {
    schema: string;
    counts: { total: number; verifiedPhysical: number; draft: number };
  } | null;
  lod2Inventory: {
    schema: string;
    totals: {
      features: Record<string, number>;
      surfaces: Record<string, number>;
      polygonsBySurface: Record<string, number>;
      trianglesEstimated: number;
      diagnosticReasons: Record<string, number>;
    };
    problemFeatures: Array<{
      file: string;
      featureId: string;
      featureClass: string;
      function: string | null;
      zMin: number | null;
      zMax: number | null;
      surfaces: Record<string, number>;
      polygons: number;
      triangleEstimate: number;
      reasons: string[];
    }>;
  } | null;
  officialDiagnostic: {
    schema: string;
    features: Record<string, number>;
    surfaces: Record<string, number>;
    primitives: number;
    triangles: number;
    skippedSurfaces: number;
    registrationTransformApplied: boolean;
    bytes: number;
  } | null;
  worldPackages: {
    schema: string;
    packages: Array<{
      id: string;
      role: 'render' | 'collision';
      features: number;
      primitives: number;
      triangles: number;
      bytes: number;
    }>;
    distantStatus: string;
  } | null;
  visibilityAnalysis: {
    schema: string;
    method: string;
    occlusionTested: boolean;
    counts: Record<string, number>;
    missingSemanticSamples: string[];
    status: string;
  } | null;
  surfaceClassification: {
    schema: string;
    granularity: string;
    zoneCounts: Record<string, number>;
    materialAssignments: Record<string, number>;
    policy: {
      groundSurfaceWalkableByDefault: boolean;
      orthophotoWalkable: boolean;
      collisionCandidateIsWalkable: boolean;
    };
    status: string;
  } | null;
  collisionSurfaces: {
    schema: string;
    coordinatePlane: string;
    counts: { triangles: number; approvedWalkable: number };
    heightRange: [number, number] | null;
    policy: {
      unknownBlocked: boolean;
      rawLod2Walkable: boolean;
      heightQueryAllowed: boolean;
    };
  } | null;
  hallRegistrations: {
    registrations: Array<{
      hallKey: string;
      targetFeatureIds: string[];
      floorZ: number;
      floorWorldZ: number;
      floorSource: 'OFFICIAL_LOD2_GROUND_PLUS_PLAN_LEVEL' | 'UNCONFIRMED_GLOBAL_GROUND_REFERENCE';
      lod2GroundOffsetM: number | null;
      status: 'draft' | 'constrained' | 'registered';
      source: string;
      residualM: number | null;
      constraint: {
        coverageBeforePct: number;
        coverageAfterPct: number;
        shiftM: number;
        samples: number;
      } | null;
    }>;
  } | null;
  registeredLayout: {
    schema: string;
    counts: {
      halls: number;
      stands: number;
      walkGrids: number;
      facilities: number;
      portalEnds: number;
    };
    policy: {
      portalsAreRegistrationAnchors: boolean;
      relativeHallContentScale: number;
    };
  } | null;
}

/**
 * Der Nordboulevard, aus den amtlichen Gebaeudeumrissen gerechnet.
 *
 * Gebaut von tools/build_boulevard.py. Stationen in Metern ab der Stirnseite
 * von Halle 8, Richtung Sueden; `art` sagt, ob dort eine Wand steht oder Glas.
 */
export interface BoulevardAbschnitt {
  von: number;
  bis: number;
  art: 'wand' | 'glas';
  was: string;
  featureId: string | null;
  hallKey: string | null;
}

/**
 * Eine Aussenflaeche neben dem Gang, in Station und Quermass.
 *
 * `endetAn` sagt, woran die Tiefe aufgehoert hat: an einem Gebaeude, am Ende
 * des flacheren Nachbarn -- oder an einer Vorgabe. Die ersten beiden sind
 * Messungen, die dritte ist keine, und `gekappt` macht den Unterschied
 * unuebersehbar.
 */
export interface BoulevardAussen {
  id: string;
  seite: 'ost' | 'west' | 'nord';
  vonM: number;
  bisM: number;
  qVonM: number;
  qBisM: number;
  tiefeM: number;
  zwischen: (string | null)[];
  endetAn: string;
  gekappt: boolean;
  herkunft: string;
}

/**
 * Ein Zugang von einer Halle in den Gang.
 *
 * `gemessen` ist bei diesen Eintraegen immer false, und das ist keine
 * Nachlaessigkeit: kein verfuegbarer Datensatz nennt die Hallentueren am
 * Nordboulevard. Gemessen ist die Fassade, an der der Zugang liegt
 * (`abschnittVonM`/`abschnittBisM`); abgeleitet ist seine Mitte, vorgegeben
 * sind Anzahl und Groesse.
 */
export interface BoulevardDurchgang {
  id: string;
  seite: 'ost' | 'west';
  /** null beim Uebergang in den Nordknoten -- der gehoert zu keiner Halle. */
  hallKey: string | null;
  featureId: string | null;
  abschnittVonM: number;
  abschnittBisM: number;
  stationM: number;
  breiteM: number;
  hoeheM: number;
  gemessen: boolean;
  herkunft: string;
}

/**
 * Ein benannter Platz am Gelaende.
 *
 * Aus OpenStreetMap und nicht aus LoD2 -- nicht aus Bequemlichkeit, sondern
 * weil ein Gebaeudemodell Gebaeude fuehrt und ein Platz keines ist. Der Umriss
 * wird uebernommen und nicht in ein Rechteck gepresst: der Messeplatz hat 39
 * Ecken, und ein Huellquader um ihn herum wuerde Flaeche behaupten, die es
 * nicht gibt.
 */
export interface BoulevardPlatz {
  id: string;
  name: string;
  quelle: string;
  osmWayId: number;
  vonM: number;
  bisM: number;
  qVonM: number;
  qBisM: number;
  hoeheM: number;
  art: 'platz' | 'parkplatz';
  /**
   * Was dort waehrend der Messe stattfindet -- Angabe vor Ort, nicht aus den
   * Daten ableitbar. null, wo nichts bekannt ist.
   */
  nutzung: string | null;
  belag: string | null;
  beleuchtet: boolean;
  /** Der volle Umriss in Geländemetern. */
  polygon: [number, number][];
  /**
   * Eine abgesperrte Kante des Platzes. Bisher nur bei P8: nach Nordwesten
   * endet die Flaeche an der Unterfuehrung unter der Zoobruecke, und zur
   * gamescom steht dort ein Zaun.
   *
   * `tiefeGemessenM` schneidet nichts weg -- die Zahl prueft den Umriss:
   * senkrecht zur Kante ist er bei `tiefeBeiM` genau so tief wie gemessen.
   */
  zaun?: {
    was: string;
    kante: [[number, number], [number, number]];
    laengeM: number;
    tiefeGemessenM: number;
    gefaelleGemessenM: number;
    tiefeBeiM: number;
    messlinie: [[number, number], [number, number]];
    quelle: string;
  };
}

/**
 * Der zur Messe abgesperrte Bereich hinter Halle 8.
 *
 * Ein Dreieck: die lange Seite liegt an der Nordwand von Halle 8, die beiden
 * anderen sind 104 m (West) und 118 m (Ost). Drei Laengen an einer liegenden
 * Kante legen die Figur fest -- offen bleibt nur die Seite, und die ist
 * draussen.
 *
 * Zwei Felder halten fest, was **nicht** gemessen ist: `ueberhangM` ist der
 * Rest der Wand, den die Grundkante nicht bedeckt (sie liegt mittig, das ist
 * eine Setzung), und `tiefeM` ist die Hoehe ueber der Grundkante, die sich aus
 * den drei Laengen ergibt -- sie widerspricht der frueher gemessenen Tiefe bis
 * zur Unterfuehrung, siehe `offen`.
 */
export interface BoulevardAussenHalle8 {
  id: string;
  was: string;
  featureId: string;
  basisM: number;
  westM: number;
  ostM: number;
  /** Die Nordwand im amtlichen Umriss -- laenger als die Grundkante. */
  wandM: number;
  ueberhangM: number;
  /** Hoehe ueber der Grundkante, gerechnet und nicht gemessen. */
  tiefeM: number;
  flaecheSqm: number;
  hoeheM: number;
  grundkante: [[number, number], [number, number]];
  spitze: [number, number];
  polygon: [number, number][];
  herkunft: string;
  offen: string;
}

/**
 * Der Knick am Nordende.
 *
 * Anders als der Suedknoten ist er nicht konstruiert, sondern uebernommen: der
 * amtliche Umriss enthaelt den Knick bereits, mit allen 67 Ecken und der
 * gerundeten Fassade zum Messeplatz. Gerundet wird sie hier nicht weggerechnet
 * -- gerade sie ist die Seite, an der man auf den Platz hinaustritt.
 */
export interface BoulevardNordknoten {
  id: string;
  featureId: string;
  was: string;
  vonM: number;
  bisM: number;
  qVonM: number;
  qBisM: number;
  flaecheSqm: number;
  bodenM: number;
  deckeM: number;
  bodenHerkunft: string;
  deckeHerkunft: string;
  /** Stationsbereich, in dem er die Ostwand des Gangs beruehrt. */
  anschlussM: [number, number] | null;
  quelle: string;
  polygon: [number, number][];
}

/**
 * Das Aussengelaende zwischen Halle 9 und Halle 10.
 *
 * Bewusst stark vereinfacht: zwei ebene Vierecke und eine Rampe dazwischen,
 * kein Terrain. Von Sueden nach Norden Ebene 1 -> Schraege -> Ebene 0; die
 * Nordkante der oberen ist die Suedkante der unteren. Fuer Kollision und
 * Wegfindung sind die drei **eine** durchgehende Oberflaeche.
 *
 * Die Kantenlaengen sind vor Ort gemessen, die Lage ueber die amtlichen
 * Hallenkanten verortet -- dass sich dabei alle acht Laengen wiederfinden,
 * ist die Bestaetigung.
 */
export interface BoulevardAussenEbene {
  id: string;
  vonM: number;
  bisM: number;
  qVonM: number;
  qBisM: number;
  hoeheM: number;
  polygon: [number, number][];
  herkunft: string;
}

export interface BoulevardAussenSchraege {
  id: string;
  vonM: number;
  bisM: number;
  qVonM: number;
  qBisM: number;
  obenM: number;
  untenM: number;
  laufM: number;
  hoeheGemessenM: number;
  steigungProzent: number;
  polygon: [number, number][];
  /** Zwei Dreiecke mit Hoehe je Ecke; die Neigung steckt nur hier. */
  dreiecke: [number, number, number][][];
  herkunft: string;
}

export interface BoulevardAussen910 {
  id: string;
  was: string;
  quelle: string;
  grenzeM: number;
  versatzM: number;
  versatzHerkunft: string;
  /** Nebenmessung auf Ebene 1; bestimmt die Geometrie nicht. */
  streckeZurRampeM: number;
  streckeZurRampeHerkunft: string;
  ueberlappM: number;
  /**
   * Beide Flaechen sind Vierecke, auf denen die Halle steht -- so bleibt die
   * Bodenplatte robust und verschwindet unter den Hallenkanten. Was draussen
   * uebrig bleibt, ist ein U; `offenNach` sagt, wohin.
   */
  form: {
    ebene1: { traegt: string; offenNach: string; streifenZumBoulevardM: number };
    ebene0: { traegt: string; offenNach: string; streifenZumBoulevardM: number };
  };
  ebene1: BoulevardAussenEbene;
  schraege: BoulevardAussenSchraege;
  ebene0: BoulevardAussenEbene;
}

export interface BoulevardPlan {
  schema: 'beuteltier.boulevard.v1';
  achse: {
    /** Station 0 auf der Mittelachse, in Geländemetern. */
    x0: number;
    y0: number;
    /** Einheitsvektoren laengs (wachsende Station) und quer. */
    laengs: [number, number];
    quer: [number, number];
    winkelDeg: number;
  };
  laengeM: number;
  breiteM: number;
  hoeheM: number;
  /** Abstand der beiden Wandlinien von der Achse, quer gemessen. */
  seitenQ: { ost: number; west: number };
  /** Wie weit der Gang geometrisch reicht -- bis Halle 5 und Halle 10. */
  geometrieLaengeM: number;
  /** Was an den beiden Enden liegt, als Hallennummern -- fuer die Wegweiser. */
  enden: { nord: string[]; sued: string[] };
  seiten: { ost: BoulevardAbschnitt[]; west: BoulevardAbschnitt[] };
  /**
   * Das Aussengelaende: die Hoefe zwischen den Hallen und das freie Gelaende
   * hinter Halle 8. Dort, wo der Gang "Aussenflaeche" meldet, liegt eine
   * dieser Flaechen hinter dem Glas.
   *
   * Fehlt in aelteren Schnappschuessen -- deshalb erlaubt leer.
   */
  aussen?: BoulevardAussen[];
  /**
   * Die Zugaenge von den Hallen in den Gang -- abgeleitet, nicht gemessen.
   *
   * Fehlt in aelteren Schnappschuessen; dann bleibt der Gang geschlossen.
   */
  durchgaenge?: BoulevardDurchgang[];
  /** Benannte Plaetze aus OpenStreetMap; fehlen in aelteren Schnappschuessen. */
  plaetze?: BoulevardPlatz[];
  /**
   * Der Knick am Nordende: dort biegt der Gang nach Osten ab und fuehrt zum
   * Congress-Centrum Nord und zum Eingang Nord. Der Umriss ist amtlich, die
   * Ebene beobachtet -- siehe `bodenHerkunft`.
   */
  nordknoten?: BoulevardNordknoten | null;
  /** Das Aussengelaende zwischen Halle 9 und Halle 10. */
  aussen9_10?: BoulevardAussen910 | null;
  /** Der zur Messe abgesperrte Bereich hinter Halle 8. */
  aussenHalle8?: BoulevardAussenHalle8 | null;
  /**
   * Der Suedteil: dort weitet sich der Gang zwischen Halle 5 und Halle 10 und
   * liegt eine Ebene hoeher. `kanteM` ist die gemessene Lage der senkrechten
   * Verbindungen aus `portals.json`.
   */
  sued: {
    vonM: number;
    bisM: number;
    /**
     * Gerechnet aus den Hallenausdehnungen -- und zu kurz. Vor Ort sind ab
     * dem Treppenkopf 183,81 m gemessen; die enden bei Station 487,6, und
     * Halle 10.2 endet amtlich bei 486,95.
     */
    laengeGerechnetM?: number;
    laengeGemessenM?: number;
    laengeHerkunft?: string;
    breiteM: number;
    seitenQ: { ost: number; west: number };
    obenM: number | null;
    untenM: number;
    kanteM: number | null;
    seiten: { ost: BoulevardAbschnitt[]; west: BoulevardAbschnitt[] };
  } | null;
  /** Der Suedknoten: Querriegel, Treppe und Passage zur Piazza. */
  knoten: {
    riegel: { vonM: number; bisM: number; hoeheM: number };
    treppeM: number;
    /** Ostrand des Riegels und die Stufenzahl hinunter zu Halle 10.1. */
    qOstM: number;
    stufenOst: number;
    piazzaVonM: number;
    piazzaHoeheM: number;
  } | null;
  /** Die Treppenanlage zwischen beiden Teilen. */
  treppe: {
    vonM: number;
    bisM: number;
    untenM: number;
    obenM: number | null;
  } | null;
}

export interface DemoCorridor {
  schema: 'beuteltier.demo-corridor.v1';
  id: string;
  title: string;
  startNodeId: string;
  goalNodeId: string;
  start: { label: string; osmNodeId: number };
  target: {
    label: string;
    hallKey: string;
    registered: boolean;
    viaConnector: string;
  };
  stages: Array<{
    id: string;
    label: string;
    status: 'source-recorded' | 'source-derived' | 'observed-unconfirmed' | 'registered-unconfirmed-access';
  }>;
  osm: {
    source: Record<string, unknown>;
    distanceM: number;
    nodeIds: number[];
    ways: Array<{ id: number; highway: string | null; name: string | null }>;
  };
  uncertainties: Array<{
    from: string;
    to: string;
    state: 'unbestaetigt';
    reason: string;
  }>;
  representation: 'ROUTE_GRAPH_POLYLINE';
}

export interface Dataset {
  site: Site;
  registry: Registry;
  graph: RouteGraph;
  /** Dasselbe Gitter, aber als Boden zum Draufstehen. */
  walk: WalkGrid;
  /** Ausdehnung des entzerrten Luftbilds, oder null ohne Luftbild. */
  ortho: Ortho | null;
  surroundings: Surroundings | null;
  footprints: Footprints | null;
  /** Migrations-/Diagnosedaten; fehlen in älteren Offline-Snapshots erlaubt. */
  world: WorldDiagnostics | null;
  /** Der Nordboulevard; fehlt in älteren Offline-Snapshots. */
  boulevard: BoulevardPlan | null;
  /** Der belegte Mittwochskorridor; im registrierten Demo-Build verpflichtend. */
  demoCorridor: DemoCorridor | null;
  /** registered = Halleninhalte und Routing liegen im lokalen amtlichen Raum. */
  spatialMode: 'legacy' | 'registered';
  standsById: Map<string, Site['stands'][number]>;
  hallsByKey: Map<string, Site['halls'][number]>;
  exhibitorsById: Map<string, Registry['exhibitors'][number]>;
}

/**
 * Nur die Geometrie des Gelaendes.
 *
 * Wer Hallen und Staende in Koerper umrechnet, braucht weder Wegenetz noch
 * Registry. Als eigener Typ geschrieben, damit derselbe Rechenweg auch
 * ausserhalb der laufenden App laeuft -- der Bauplan-Export fuer den
 * Blockeditor hat nur die Standortdatei, aber dieselben Hallen.
 */
export type Gelaende = Pick<Dataset, 'site' | 'hallsByKey'>;

async function fetchJson<T>(name: string): Promise<T> {
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) throw new Error(`${name} konnte nicht geladen werden (${response.status})`);
  return (await response.json()) as T;
}

/**
 * Was ausserhalb der Hallengitter unter den Fuessen liegt.
 *
 * Zuerst der Boulevard: er bringt eigene Fussboeden und eigene Waende mit.
 * Was er nicht kennt, faellt weiter auf die alte Regel zurueck -- draussen ist
 * offen. Die Reihenfolge ist der ganze Trick: `PrioritySurfaceProvider` nimmt
 * den ersten Geber, der sich zustaendig erklaert, und der Boulevard erklaert
 * sich nur dort zustaendig, wo er auch steht. Das uebrige Gelaende bleibt
 * damit unveraendert begehbar.
 *
 * Ohne `boulevard.json` -- in aelteren Offline-Schnappschuessen -- bleibt alles
 * beim Alten.
 */
function aussenraum(plan: BoulevardPlan | null): SurfaceProvider {
  const achse = plan ? boulevardAchse({ boulevard: plan }) : null;
  if (!plan || !achse) return LEGACY_OPEN_OUTSIDE;
  // Die Plaetze liegen hinter dem Boulevard in der Reihenfolge: wo beide etwas
  // sagen, gilt der Gang. Ihr Umriss kommt unveraendert aus dem Plan, deshalb
  // reicht hier der vorhandene Polygongeber.
  const knoten = plan.nordknoten;
  const aussen = plan.aussen9_10;
  // Die Rampe steht **vor** den ebenen Flaechen: sie ueberdeckt den Suedrand
  // der unteren Ebene, und dort soll ihre geneigte Hoehe gelten und nicht die
  // ebene darunter. Ein Hoehenvergleich wuerde das nicht entscheiden -- am
  // Fusspunkt sind beide gleich hoch.
  const rampe = new TriangleSurfaceProvider(
    (aussen ? aussen.schraege.dreiecke : []).map((dreieck, index) => ({
      id: `${aussen!.schraege.id}:${index}`,
      triangle: dreieck as unknown as TriangleSurface['triangle'],
      blocked: false,
    })),
  );
  const flaechen = new FlatSurfaceProvider([
    // Der Knick zuerst: er liegt innen und traegt einen eigenen Fussboden.
    ...(knoten ? [{
      id: knoten.id,
      polygon: knoten.polygon,
      z: knoten.bodenM,
      blocked: false,
      priority: 1,
    }] : []),
    ...(aussen ? [aussen.ebene1, aussen.ebene0].map((ebene) => ({
      id: ebene.id,
      polygon: ebene.polygon,
      z: ebene.hoeheM,
      blocked: false,
      priority: 1,
    })) : []),
    // Vor den Plaetzen: das Dreieck hinter Halle 8 liegt in P8 und ist der
    // gemessene Zuschnitt, waehrend P8 der Parkplatz des ganzen Jahres ist.
    // Wer dort steht, steht im Messebereich -- deshalb soll er ihn melden.
    ...(plan.aussenHalle8 ? [{
      id: plan.aussenHalle8.id,
      polygon: plan.aussenHalle8.polygon,
      z: plan.aussenHalle8.hoeheM,
      blocked: false,
      priority: 1,
    }] : []),
    ...(plan.plaetze ?? []).map((platz) => ({
      id: platz.id,
      polygon: platz.polygon,
      z: platz.hoeheM,
      blocked: false,
    })),
  ]);
  return new PrioritySurfaceProvider([
    new BoulevardSurfaces(plan, achse),
    rampe,
    flaechen,
    LEGACY_OPEN_OUTSIDE,
  ]);
}

export async function loadDataset(): Promise<Dataset> {
  const [legacySite, registry, legacyCompact, registeredSite, registeredCompact, buildings] = await Promise.all([
    fetchJson<Site>('site.json'),
    fetchJson<Registry>('registry.json'),
    fetchJson<CompactGraph>('graph.json'),
    fetchJson<Site>('registered-site.json').catch(() => null),
    fetchJson<CompactGraph>('registered-graph.json').catch(() => null),
    // Die Passung ist im registrierten Build zwingende Geometriequelle.
    // Ein HTTP-Fehler darf nicht zu einem spaeteren, irrefuehrenden
    // "buildings.fit fehlt" umetikettiert werden.
    fetchJson<BuildingsSnapshot>('buildings.json'),
  ]);
  const site = registeredSite ?? legacySite;
  const compact = registeredSite && registeredCompact ? registeredCompact : legacyCompact;
  const spatialMode = registeredSite && registeredCompact ? 'registered' : 'legacy';

  // Ohne Luftbild bleibt die Karte benutzbar -- sie ist dann nur grau.
  const [legacyOrtho, legacySurroundings, legacyFootprints, manifest, walkableSurfaces, portals, lod2Inventory, officialDiagnostic, worldPackages, visibilityAnalysis, surfaceClassification, collisionSurfaces, hallRegistrations, registeredLayout] = await Promise.all([
    fetchJson<Ortho>('ortho.json').catch(() => null),
    fetchJson<Surroundings>('surroundings.json').catch(() => null),
    fetchJson<Footprints>('footprints.json').catch(() => null),
    fetchJson<WorldManifest>('world-manifest.json').catch(() => null),
    fetchJson<WorldDiagnostics['walkableSurfaces']>('walkable-surfaces.json').catch(() => null),
    fetchJson<WorldDiagnostics['portals']>('portals.json').catch(() => null),
    fetchJson<WorldDiagnostics['lod2Inventory']>('lod2-inventory.json').catch(() => null),
    fetchJson<WorldDiagnostics['officialDiagnostic']>('official-world-diagnostic.json').catch(() => null),
    fetchJson<WorldDiagnostics['worldPackages']>('world-packages.json').catch(() => null),
    fetchJson<WorldDiagnostics['visibilityAnalysis']>('visibility-analysis.json').catch(() => null),
    fetchJson<WorldDiagnostics['surfaceClassification']>('surface-classification.json').catch(() => null),
    fetchJson<WorldDiagnostics['collisionSurfaces']>('collision-surfaces.json').catch(() => null),
    fetchJson<WorldDiagnostics['hallRegistrations']>('hall-registrations.json').catch(() => null),
    fetchJson<WorldDiagnostics['registeredLayout']>('registered-layout.json').catch(() => null),
  ]);
  const [boulevard, demoCorridor] = await Promise.all([
    fetchJson<BoulevardPlan>('boulevard.json').catch(() => null),
    fetchJson<DemoCorridor>('demo-corridor.json').catch(() => null),
  ]);
  if (spatialMode === 'registered' && !demoCorridor) {
    throw new Error('Registrierter Demo-Korridor fehlt: demo-corridor.json konnte nicht geladen werden.');
  }

  let ortho = legacyOrtho;
  let surroundings = legacySurroundings;
  let footprints = legacyFootprints;
  if (spatialMode === 'registered' && (ortho || surroundings || footprints)) {
    const origin = registeredCompact?.origin;
    if (!buildings?.fit || !origin) {
      throw new Error(
        'Registrierte Aussenwelt kann nicht ausgerichtet werden: buildings.fit oder Graph-Ursprung fehlt.',
      );
    }
    ({ ortho, surroundings, footprints } = alignLegacyLayers(
      ortho,
      surroundings,
      footprints,
      buildings.fit,
      origin,
    ));
  }

  return {
    site,
    registry,
    graph: RouteGraph.fromCompact(compact),
    walk: WalkGrid.fromCompact(compact, aussenraum(boulevard)),
    ortho,
    surroundings,
    footprints,
    world: manifest ? {
      manifest, walkableSurfaces, portals, lod2Inventory, officialDiagnostic,
      worldPackages, visibilityAnalysis, surfaceClassification, collisionSurfaces, hallRegistrations,
      registeredLayout,
    } : null,
    boulevard,
    demoCorridor,
    spatialMode,
    standsById: new Map(site.stands.map((stand) => [stand.id, stand])),
    hallsByKey: new Map(site.halls.map((hall) => [hall.key, hall])),
    exhibitorsById: new Map(registry.exhibitors.map((one) => [one.id, one])),
  };
}

/** Mittelpunkt des Geländes, damit die Szene um den Ursprung liegt. */
export function siteCentre(site: Site): [number, number] {
  const points = site.halls.flatMap((hall) => hall.footprint);
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
