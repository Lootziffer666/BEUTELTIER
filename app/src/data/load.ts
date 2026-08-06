/**
 * Lädt die aufbereiteten Daten.
 *
 * Geladen werden eingecheckte Schnappschüsse, nie eine fremde Schnittstelle:
 * die App muss auf dem Messegelände funktionieren, wo das Netz genau dann
 * zusammenbricht, wenn alle es brauchen.
 */

import { RouteGraph, type CompactGraph } from '../routing/graph';
import { WalkGrid } from '../scene/walk';
import type { Registry, Site } from './types';

const BASE = `${import.meta.env.BASE_URL}data`;

/** Was das Luftbild abdeckt -- gebaut von tools/build_ortho.py. */
export interface Ortho {
  image: string;
  /** [x0, y0, x1, y1] in Geländemetern. */
  extent: [number, number, number, number];
  metresPerPixel: number;
}

export interface Surroundings {
  attribution: string;
  roads: Array<{ id: number; kind: string; name: string | null; points: [number, number][] }>;
  markers: Array<{ id: number; kind: string; name: string | null; point: [number, number] }>;
}

export interface Footprints {
  gapsWithoutLod2: number;
  footprints: Array<{ id: string; lod2Covered: boolean; footprint: [number, number][] }>;
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
  /** registered = Halleninhalte und Routing liegen im lokalen amtlichen Raum. */
  spatialMode: 'legacy' | 'registered';
  standsById: Map<string, Site['stands'][number]>;
  hallsByKey: Map<string, Site['halls'][number]>;
  exhibitorsById: Map<string, Registry['exhibitors'][number]>;
}

async function fetchJson<T>(name: string): Promise<T> {
  const response = await fetch(`${BASE}/${name}`);
  if (!response.ok) throw new Error(`${name} konnte nicht geladen werden (${response.status})`);
  return (await response.json()) as T;
}

export async function loadDataset(): Promise<Dataset> {
  const [legacySite, registry, legacyCompact, registeredSite, registeredCompact] = await Promise.all([
    fetchJson<Site>('site.json'),
    fetchJson<Registry>('registry.json'),
    fetchJson<CompactGraph>('graph.json'),
    fetchJson<Site>('registered-site.json').catch(() => null),
    fetchJson<CompactGraph>('registered-graph.json').catch(() => null),
  ]);
  const site = registeredSite ?? legacySite;
  const compact = registeredSite && registeredCompact ? registeredCompact : legacyCompact;
  const spatialMode = registeredSite && registeredCompact ? 'registered' : 'legacy';

  // Ohne Luftbild bleibt die Karte benutzbar -- sie ist dann nur grau.
  const [ortho, surroundings, footprints, manifest, walkableSurfaces, portals, lod2Inventory, officialDiagnostic, worldPackages, visibilityAnalysis, surfaceClassification, collisionSurfaces, hallRegistrations, registeredLayout] = await Promise.all([
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

  return {
    site,
    registry,
    graph: RouteGraph.fromCompact(compact),
    walk: WalkGrid.fromCompact(compact),
    ortho,
    surroundings,
    footprints,
    world: manifest ? {
      manifest, walkableSurfaces, portals, lod2Inventory, officialDiagnostic,
      worldPackages, visibilityAnalysis, surfaceClassification, collisionSurfaces, hallRegistrations,
      registeredLayout,
    } : null,
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
