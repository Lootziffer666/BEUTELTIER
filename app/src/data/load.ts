/**
 * Lädt die aufbereiteten Daten.
 *
 * Geladen werden eingecheckte Schnappschüsse, nie eine fremde Schnittstelle:
 * die App muss auf dem Messegelände funktionieren, wo das Netz genau dann
 * zusammenbricht, wenn alle es brauchen.
 */

import { RouteGraph, type CompactGraph } from '../routing/graph';
import type { Registry, Site } from './types';

const BASE = `${import.meta.env.BASE_URL}data`;

export interface Dataset {
  site: Site;
  registry: Registry;
  graph: RouteGraph;
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
  const [site, registry, compact] = await Promise.all([
    fetchJson<Site>('site.json'),
    fetchJson<Registry>('registry.json'),
    fetchJson<CompactGraph>('graph.json'),
  ]);

  return {
    site,
    registry,
    graph: RouteGraph.fromCompact(compact),
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
