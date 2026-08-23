import { describe, expect, it } from 'vitest';

import demoJson from '../../public/data/demo-corridor.json';
import compactJson from '../../public/data/registered-graph.json';
import { RouteGraph, type CompactGraph } from './graph';
import { findRoute } from './route';

const compact = compactJson as unknown as CompactGraph;
const demo = demoJson as unknown as {
  startNodeId: string;
  goalNodeId: string;
  representation: string;
  osm: { distanceM: number; nodeIds: number[] };
  uncertainties: Array<{ state: string }>;
};
const graph = RouteGraph.fromCompact(compact);

describe('Wednesday demo corridor', () => {
  it('findet einen echten Graphpfad vom Bahnhof bis Halle 10.1', () => {
    const route = findRoute(graph, demo.startNodeId, demo.goalNodeId);
    expect(route).not.toBeNull();
    expect(route!.nodeIds[0]).toBe(demo.startNodeId);
    expect(route!.nodeIds.at(-1)).toBe(demo.goalNodeId);
    expect(route!.steps.some((step) => step.edge.kind === 'outdoor')).toBe(true);
    expect(route!.steps.some((step) => step.edge.kind === 'portal')).toBe(true);
  });

  it('bewahrt Quellenmass und Unsicherheit statt beides vorzutäuschen', () => {
    const route = findRoute(graph, demo.startNodeId, demo.goalNodeId)!;
    expect(demo.osm.distanceM).toBeCloseTo(479.3, 1);
    expect(demo.osm.nodeIds).toHaveLength(33);
    expect(route.distanceM).toBeGreaterThan(demo.osm.distanceM);
    expect(route.unconfirmed.length).toBeGreaterThan(0);
    expect(demo.uncertainties.every((item) => item.state === 'unbestaetigt')).toBe(true);
    expect(demo.representation).toBe('ROUTE_GRAPH_POLYLINE');
  });

  it('liefert bei ausschliesslich bestaetigten Wegen keinen erfundenen Ersatz', () => {
    expect(findRoute(graph, demo.startNodeId, demo.goalNodeId, { avoidUnconfirmed: true })).toBeNull();
  });
});
