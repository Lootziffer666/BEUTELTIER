/**
 * Wegsuche über das Netz -- mit den Zuständen, die sich stündlich ändern.
 *
 * Die eigentliche Leistung liegt nicht im Dijkstra, sondern darin, dass jede
 * Kante einen Betriebszustand trägt und ein Zustandswechsel die Route sofort
 * neu bestimmt. Genau das verlangt PRD 7.8: einen Zugang sperren und sehen,
 * was stattdessen geht.
 *
 * Unbestätigte Wege werden nicht verschwiegen und nicht ausgeschlossen. Sie
 * kosten einen Aufschlag und werden in der Route ausgewiesen -- „vielleicht
 * offen" ist eine Information, keine Zusage (PRD-Leitprinzip 2).
 */

import {
  WALK_SPEED_M_PER_MIN,
  type AccessGroup,
  type EdgeState,
  type GraphEdge,
  type RouteGraph,
} from './graph';

export interface RouteOptions {
  /** Besuchergruppe; Kanten mit anderer Zugangsbeschränkung entfallen. */
  access?: AccessGroup;
  /** Unbestätigte Verbindungen ganz meiden statt nur zu bestrafen. */
  avoidUnconfirmed?: boolean;
  /** Aufzüge bevorzugen, Rolltreppen und Treppen meiden. */
  stepFree?: boolean;
  /** Kanten, die der Nutzer selbst gesperrt hat. */
  blockedEdgeIds?: ReadonlySet<string>;
  /** Zustände, die der Nutzer abweichend gemeldet hat. */
  stateOverrides?: ReadonlyMap<string, EdgeState>;
}

export interface RouteStep {
  edge: GraphEdge;
  from: string;
  to: string;
  state: EdgeState;
}

export interface Route {
  steps: RouteStep[];
  /** Tatsächlich zu gehende Strecke, ohne Zuschläge. */
  distanceM: number;
  minutes: number;
  levelChanges: number;
  portals: number;
  /** Abschnitte, die auf unbestätigten Verbindungen liegen. */
  unconfirmed: RouteStep[];
  nodeIds: string[];
}

/** Aufschlag auf Kanten, deren Zustand niemand bestätigt hat. */
const UNCONFIRMED_PENALTY = 1.6;
/** Überfüllte Abschnitte kosten Zeit, sind aber begehbar. */
const CROWDED_PENALTY = 2.2;
/** Rolltreppen und Treppen im barrierefreien Modus. */
const STEP_PENALTY = 40;

const IMPASSABLE: ReadonlySet<EdgeState> = new Set<EdgeState>(['geschlossen']);

/**
 * Prüft, ob eine Kante in der gewünschten Richtung begehbar ist.
 *
 * `nur_eingang` und `nur_ausgang` beziehen sich auf die Richtung, in der die
 * Kante angelegt wurde: a ist außen, b ist innen.
 */
function passable(edge: GraphEdge, state: EdgeState, fromA: boolean): boolean {
  if (IMPASSABLE.has(state)) return false;
  if (state === 'einbahn' || state === 'nur_eingang') return fromA === edge.forward;
  if (state === 'nur_ausgang') return fromA !== edge.forward;
  return true;
}

function cost(edge: GraphEdge, state: EdgeState, options: RouteOptions): number {
  let weight = edge.lengthM * Math.max(1, edge.crowd);
  if (state === 'ueberfuellt') weight *= CROWDED_PENALTY;
  if (state === 'unbestaetigt' || !edge.confirmed) weight *= UNCONFIRMED_PENALTY;
  if (options.stepFree && (edge.kind === 'escalator' || edge.kind === 'stairs')) {
    weight += STEP_PENALTY;
  }
  return weight;
}

/** Binärer Heap; ein Array-Scan wäre bei 14.000 Knoten spürbar langsamer. */
class MinHeap {
  private readonly items: { key: number; id: string }[] = [];

  push(key: number, id: string): void {
    this.items.push({ key, id });
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].key <= this.items[index].key) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  pop(): { key: number; id: string } | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.items.length && this.items[left].key < this.items[smallest].key) {
          smallest = left;
        }
        if (right < this.items.length && this.items[right].key < this.items[smallest].key) {
          smallest = right;
        }
        if (smallest === index) break;
        [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
        index = smallest;
      }
    }
    return top;
  }

  get size(): number {
    return this.items.length;
  }
}

export function effectiveState(edge: GraphEdge, options: RouteOptions): EdgeState {
  if (options.blockedEdgeIds?.has(edge.id)) return 'geschlossen';
  return options.stateOverrides?.get(edge.id) ?? edge.state;
}

export function findRoute(
  graph: RouteGraph,
  startId: string,
  goalId: string,
  options: RouteOptions = {},
): Route | null {
  if (!graph.nodes.has(startId) || !graph.nodes.has(goalId)) return null;

  const best = new Map<string, number>([[startId, 0]]);
  const cameFrom = new Map<string, { from: string; edge: GraphEdge; state: EdgeState }>();
  const settled = new Set<string>();
  const queue = new MinHeap();
  queue.push(0, startId);

  while (queue.size > 0) {
    const current = queue.pop()!;
    if (settled.has(current.id)) continue;
    settled.add(current.id);
    if (current.id === goalId) break;

    for (const { edge, other } of graph.neighbours(current.id)) {
      const state = effectiveState(edge, options);
      if (options.avoidUnconfirmed && (state === 'unbestaetigt' || !edge.confirmed)) continue;
      if (edge.access && options.access && edge.access !== options.access) continue;
      if (!passable(edge, state, edge.a === current.id)) continue;

      const candidate = current.key + cost(edge, state, options);
      if (candidate < (best.get(other) ?? Number.POSITIVE_INFINITY)) {
        best.set(other, candidate);
        cameFrom.set(other, { from: current.id, edge, state });
        queue.push(candidate, other);
      }
    }
  }

  if (!cameFrom.has(goalId) && startId !== goalId) return null;

  const steps: RouteStep[] = [];
  const nodeIds: string[] = [goalId];
  let cursor = goalId;
  while (cursor !== startId) {
    const previous = cameFrom.get(cursor);
    if (!previous) return null;
    steps.push({ edge: previous.edge, from: previous.from, to: cursor, state: previous.state });
    nodeIds.push(previous.from);
    cursor = previous.from;
  }
  steps.reverse();
  nodeIds.reverse();

  const distanceM = steps.reduce((sum, step) => sum + step.edge.lengthM, 0);
  return {
    steps,
    distanceM,
    minutes: distanceM / WALK_SPEED_M_PER_MIN,
    levelChanges: steps.filter((step) =>
      ['elevator', 'escalator', 'stairs'].includes(step.edge.kind),
    ).length,
    portals: steps.filter((step) => step.edge.kind === 'portal').length,
    unconfirmed: steps.filter((step) => step.state === 'unbestaetigt' || !step.edge.confirmed),
    nodeIds,
  };
}

/**
 * Beutezug: eine Route über mehrere Ziele.
 *
 * Die Reihenfolge wird erst gierig gewählt und dann mit 2-opt entkreuzt. Für
 * die Handvoll Ziele, die ein Messetag hergibt, liefert das Ergebnisse nahe am
 * Optimum, ohne dass jemand auf eine exakte Lösung wartet.
 */
export function planTour(
  graph: RouteGraph,
  startId: string,
  targetIds: string[],
  options: RouteOptions = {},
): { order: string[]; legs: Route[]; totalM: number; minutes: number } | null {
  if (targetIds.length === 0) return { order: [], legs: [], totalM: 0, minutes: 0 };

  const cache = new Map<string, Route | null>();
  const leg = (from: string, to: string): Route | null => {
    const key = `${from}|${to}`;
    if (!cache.has(key)) cache.set(key, findRoute(graph, from, to, options));
    return cache.get(key)!;
  };
  const legDistance = (from: string, to: string): number =>
    leg(from, to)?.distanceM ?? Number.POSITIVE_INFINITY;

  const remaining = [...targetIds];
  const order: string[] = [];
  let cursor = startId;
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, index) => {
      const distance = legDistance(cursor, candidate);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    cursor = remaining[bestIndex];
    order.push(cursor);
    remaining.splice(bestIndex, 1);
  }

  const totalFor = (sequence: string[]): number => {
    let sum = 0;
    let previous = startId;
    for (const target of sequence) {
      sum += legDistance(previous, target);
      previous = target;
    }
    return sum;
  };

  let improved = true;
  let guard = 0;
  while (improved && guard < 40) {
    improved = false;
    guard += 1;
    for (let i = 0; i < order.length - 1; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        const candidate = [...order];
        candidate.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
        if (totalFor(candidate) + 0.5 < totalFor(order)) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    }
  }

  const legs: Route[] = [];
  let previous = startId;
  for (const target of order) {
    const route = leg(previous, target);
    if (!route) return null;
    legs.push(route);
    previous = target;
  }

  const totalM = legs.reduce((sum, route) => sum + route.distanceM, 0);
  return { order, legs, totalM, minutes: totalM / WALK_SPEED_M_PER_MIN };
}
