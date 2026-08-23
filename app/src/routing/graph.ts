/**
 * Das Wegenetz zur Laufzeit.
 *
 * Übertragen wird das Gangnetz als Bitmaske je Halle -- ein regelmäßiges
 * Raster, das als Einzelobjekte mehrere Megabyte wöge. Hier wird daraus wieder
 * ein Graph: jede gesetzte Zelle ein Knoten, benachbarte Zellen verbunden.
 *
 * Kanten sind nicht einfach offen oder zu. Sie tragen die Zustände aus PRD 5.5
 * -- Einbahn, nur Eingang, nur Ausgang, überfüllt, unbestätigt -- und genau die
 * ändern sich während der Messe stündlich. Deshalb sind sie Daten und keine
 * Annahme, und deshalb lässt sich jeder von ihnen umschalten, ohne die Karte
 * neu zu bauen.
 */

export type EdgeState =
  | 'offen'
  | 'geschlossen'
  | 'nur_eingang'
  | 'nur_ausgang'
  | 'einbahn'
  | 'links_herum'
  | 'rechts_herum'
  | 'ueberfuellt'
  | 'unbestaetigt';

export type AccessGroup = 'consumer' | 'business' | 'presse';

export type EdgeKind =
  | 'aisle'
  | 'outdoor'
  | 'portal'
  | 'stand_access'
  | 'elevator'
  | 'escalator'
  | 'stairs';

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  z: number;
  kind: 'aisle' | 'stand' | 'portal' | 'vertical' | 'outdoor';
  hallKey: string;
  level: number;
  label?: string;
  meta?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  a: string;
  b: string;
  kind: EdgeKind;
  lengthM: number;
  state: EdgeState;
  /** Richtung, in der eine Einbahnregel gilt: von a nach b. */
  forward: boolean;
  crowd: number;
  confirmed: boolean;
  access?: AccessGroup;
  label?: string;
}

export interface CompactGrid {
  key: string;
  origin: [number, number];
  z: number;
  level: number;
  cols: number;
  rows: number;
  walkable: string;
  /** Gedrehte Zellachsen im amtlichen Szenenraum; fehlen im Legacy-Graph. */
  cellBasisX?: [number, number];
  cellBasisY?: [number, number];
}

interface CompactEnd {
  hallKey?: string;
  cell?: [number, number];
  nodeId?: string;
}

interface CompactConnector {
  id: string;
  kind: 'portal' | 'vertical' | 'outdoor';
  label: string;
  x: number;
  y: number;
  z: number;
  level: number;
  meta: Record<string, unknown>;
  ends: CompactEnd[];
  state?: EdgeState;
}

export interface CompactGraph {
  schema: string;
  coordinatePlane?: string;
  origin?: [number, number, number];
  gridM: number;
  grids: CompactGrid[];
  standLinks: { standId: string; hallKey: string; cell: [number, number] }[];
  connectors: CompactConnector[];
}

/** Geschwindigkeit eines Messebesuchers inklusive Gedränge und Stehenbleiben. */
export const WALK_SPEED_M_PER_MIN = 55;

const aisleId = (hallKey: string, ix: number, iy: number) => `a:${hallKey}:${ix}:${iy}`;

function decodeBits(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class RouteGraph {
  readonly nodes = new Map<string, GraphNode>();
  readonly edges: GraphEdge[] = [];
  /** Nachbarschaftsliste: Knoten-ID -> Indizes in `edges`. */
  private readonly adjacency = new Map<string, number[]>();

  static fromCompact(compact: CompactGraph): RouteGraph {
    const graph = new RouteGraph();
    const grid = compact.gridM;

    for (const hall of compact.grids) {
      const basisX = hall.cellBasisX ?? [grid, 0];
      const basisY = hall.cellBasisY ?? [0, grid];
      const cellPoint = (ix: number, iy: number) => ({
        x: hall.origin[0] + ix * basisX[0] + iy * basisY[0],
        y: hall.origin[1] + ix * basisX[1] + iy * basisY[1],
      });
      const bits = decodeBits(hall.walkable);
      const isSet = (ix: number, iy: number) => {
        if (ix < 0 || iy < 0 || ix >= hall.cols || iy >= hall.rows) return false;
        const position = iy * hall.cols + ix;
        return (bits[position >> 3] & (1 << (position & 7))) !== 0;
      };

      for (let iy = 0; iy < hall.rows; iy += 1) {
        for (let ix = 0; ix < hall.cols; ix += 1) {
          if (!isSet(ix, iy)) continue;
          const point = cellPoint(ix, iy);
          graph.addNode({
            id: aisleId(hall.key, ix, iy),
            x: point.x,
            y: point.y,
            z: hall.z,
            kind: 'aisle',
            hallKey: hall.key,
            level: hall.level,
          });
        }
      }

      // Nur rechts und oben verbinden -- die Gegenrichtung entsteht dadurch von
      // selbst, Diagonalen würden durch Standecken schneiden.
      for (let iy = 0; iy < hall.rows; iy += 1) {
        for (let ix = 0; ix < hall.cols; ix += 1) {
          if (!isSet(ix, iy)) continue;
          if (isSet(ix + 1, iy)) {
            graph.link(aisleId(hall.key, ix, iy), aisleId(hall.key, ix + 1, iy), 'aisle');
          }
          if (isSet(ix, iy + 1)) {
            graph.link(aisleId(hall.key, ix, iy), aisleId(hall.key, ix, iy + 1), 'aisle');
          }
        }
      }
    }

    for (const link of compact.standLinks) {
      const anchor = graph.nodes.get(aisleId(link.hallKey, link.cell[0], link.cell[1]));
      if (!anchor) continue;
      const hall = compact.grids.find((entry) => entry.key === link.hallKey);
      graph.addNode({
        id: `s:${link.standId}`,
        x: anchor.x,
        y: anchor.y,
        z: anchor.z,
        kind: 'stand',
        hallKey: link.hallKey,
        level: hall?.level ?? 1,
        label: link.standId.split(':')[1],
        meta: { standId: link.standId },
      });
      graph.link(`s:${link.standId}`, anchor.id, 'stand_access');
    }

    // Erst alle Knoten, dann alle Kanten. `nodeId` ist Teil des kompakten
    // Vertrags; eine Kette von Aussenwegpunkten darf deshalb nicht davon
    // abhaengen, ob ihr Ziel zufaellig schon vorher im JSON stand.
    for (const connector of compact.connectors) {
      graph.addNode({
        id: connector.id,
        x: connector.x,
        y: connector.y,
        z: connector.z,
        kind: connector.kind,
        hallKey: '',
        level: connector.level,
        label: connector.label,
        meta: connector.meta,
      });

    }

    for (const connector of compact.connectors) {
      const kind: EdgeKind = connector.kind === 'vertical'
        ? ((connector.meta?.kind as EdgeKind) ?? 'elevator')
        : connector.kind === 'outdoor'
          ? 'outdoor'
          : 'portal';

      for (const end of connector.ends) {
        const target =
          end.nodeId ??
          (end.hallKey && end.cell ? aisleId(end.hallKey, end.cell[0], end.cell[1]) : undefined);
        if (!target || !graph.nodes.has(target)) continue;
        // Der Zustand kommt aus der Aufbereitung. Was in keiner Quelle steht,
        // bleibt unbestätigt — auch der Ebenenwechsel: die Aufzüge der
        // Technischen Richtlinien sind Lastenaufzüge, ihre Lage ist amtlich,
        // ihre Benutzbarkeit für Besucher ist es nicht.
        const state: EdgeState = connector.state ?? 'unbestaetigt';
        graph.link(connector.id, target, kind, {
          state,
          confirmed: state === 'offen',
          label: connector.label,
        });
      }
    }

    return graph;
  }

  private addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  private link(
    a: string,
    b: string,
    kind: EdgeKind,
    options: Partial<Pick<GraphEdge, 'state' | 'confirmed' | 'label' | 'crowd' | 'access'>> = {},
  ): void {
    const first = this.nodes.get(a);
    const second = this.nodes.get(b);
    if (!first || !second) return;

    const index = this.edges.length;
    this.edges.push({
      id: `e${index}`,
      a,
      b,
      kind,
      lengthM: Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z),
      state: options.state ?? 'offen',
      forward: true,
      crowd: options.crowd ?? 1,
      confirmed: options.confirmed ?? true,
      access: options.access,
      label: options.label,
    });

    for (const id of [a, b]) {
      const list = this.adjacency.get(id);
      if (list) list.push(index);
      else this.adjacency.set(id, [index]);
    }
  }

  neighbours(nodeId: string): { edge: GraphEdge; other: string }[] {
    const indices = this.adjacency.get(nodeId) ?? [];
    return indices.map((index) => {
      const edge = this.edges[index];
      return { edge, other: edge.a === nodeId ? edge.b : edge.a };
    });
  }

  standNodeId(standId: string): string {
    return `s:${standId}`;
  }
}
