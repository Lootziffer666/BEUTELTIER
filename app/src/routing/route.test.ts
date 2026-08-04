import { describe, expect, it } from 'vitest';
import { RouteGraph, type CompactGraph } from './graph';
import { findRoute, planTour } from './route';

/**
 * Ein kleines Gelände mit zwei Ebenen und zwei Wegen dazwischen -- gerade
 * genug, um zu prüfen, was zählt: dass eine Sperre die Route ändert und dass
 * ein Ebenenwechsel als solcher auftaucht.
 *
 *   Ebene 1: 5x1 Gang            Ebene 2: 5x1 Gang
 *   verbunden ueber zwei Portale (links kurz, rechts lang)
 */
function bits(count: number): string {
  const bytes = new Uint8Array(Math.ceil(count / 8));
  for (let i = 0; i < count; i += 1) bytes[i >> 3] |= 1 << (i & 7);
  return btoa(String.fromCharCode(...bytes));
}

const compact: CompactGraph = {
  schema: 'test',
  gridM: 10,
  grids: [
    { key: 'A.1', origin: [0, 0], z: 0, level: 1, cols: 5, rows: 1, walkable: bits(5) },
    { key: 'B.1', origin: [0, 100], z: 0, level: 1, cols: 5, rows: 1, walkable: bits(5) },
  ],
  standLinks: [
    { standId: 'A.1:START', hallKey: 'A.1', cell: [0, 0] },
    { standId: 'B.1:ZIEL', hallKey: 'B.1', cell: [0, 0] },
  ],
  connectors: [
    {
      id: 'p:kurz',
      kind: 'portal',
      label: 'kurzer Durchgang',
      x: 0,
      y: 50,
      z: 0,
      level: 1,
      meta: {},
      ends: [
        { hallKey: 'A.1', cell: [0, 0] },
        { hallKey: 'B.1', cell: [0, 0] },
      ],
    },
    {
      id: 'p:lang',
      kind: 'portal',
      label: 'langer Durchgang',
      x: 40,
      y: 50,
      z: 0,
      level: 1,
      meta: {},
      ends: [
        { hallKey: 'A.1', cell: [4, 0] },
        { hallKey: 'B.1', cell: [4, 0] },
      ],
    },
  ],
};

const graph = RouteGraph.fromCompact(compact);
const start = graph.standNodeId('A.1:START');
const goal = graph.standNodeId('B.1:ZIEL');

describe('findRoute', () => {
  it('findet den kurzen Weg', () => {
    const route = findRoute(graph, start, goal);
    expect(route).not.toBeNull();
    expect(route!.steps.some((step) => step.edge.label === 'kurzer Durchgang')).toBe(true);
    expect(route!.portals).toBeGreaterThan(0);
  });

  it('weicht auf den langen Weg aus, wenn der kurze gesperrt ist', () => {
    const direct = findRoute(graph, start, goal)!;
    const blockedEdge = direct.steps.find((step) => step.edge.label === 'kurzer Durchgang')!;

    const detour = findRoute(graph, start, goal, {
      blockedEdgeIds: new Set([blockedEdge.edge.id]),
    });
    expect(detour).not.toBeNull();
    expect(detour!.distanceM).toBeGreaterThan(direct.distanceM);
    expect(detour!.steps.some((step) => step.edge.label === 'langer Durchgang')).toBe(true);
  });

  it('gibt auf, wenn alle Durchgaenge zu sind -- statt etwas zu erfinden', () => {
    const closed = new Set(
      graph.edges.filter((edge) => edge.kind === 'portal').map((edge) => edge.id),
    );
    expect(findRoute(graph, start, goal, { blockedEdgeIds: closed })).toBeNull();
  });

  it('weist unbestaetigte Abschnitte aus', () => {
    const route = findRoute(graph, start, goal)!;
    // Durchgaenge kommen als unbestaetigt aus der Aufbereitung.
    expect(route.unconfirmed.length).toBeGreaterThan(0);
  });

  it('meidet unbestaetigte Wege auf Wunsch ganz', () => {
    expect(findRoute(graph, start, goal, { avoidUnconfirmed: true })).toBeNull();
  });

  it('rechnet Gehminuten aus der Strecke', () => {
    const route = findRoute(graph, start, goal)!;
    expect(route.minutes).toBeGreaterThan(0);
    expect(route.minutes).toBeCloseTo(route.distanceM / 55, 5);
  });
});

describe('planTour', () => {
  it('ordnet mehrere Ziele zu einem Beutezug', () => {
    const tour = planTour(graph, start, [goal, graph.standNodeId('A.1:START')]);
    expect(tour).not.toBeNull();
    expect(tour!.order).toHaveLength(2);
    expect(tour!.totalM).toBeGreaterThan(0);
  });
});
