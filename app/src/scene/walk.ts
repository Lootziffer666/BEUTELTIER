/**
 * Der Boden, auf dem man steht.
 *
 * Das begehbare Gitter existiert ohnehin — das Routing rechnet darauf. Für
 * die Ego-Perspektive wird es zum zweiten Mal gebraucht, jetzt als Kollision:
 * begehbar ist, wo auch eine Route langgehen dürfte. Damit läuft niemand
 * durch einen Stand, ohne dass dafür eine zweite Geometrie gepflegt werden
 * müsste.
 *
 * Draußen gibt es kein Gitter. Dort wird nicht gesperrt, sondern
 * durchgelassen: eine Karte, die den Nutzer am Hallentor festhält, wäre
 * schlechter als eine, die ihn über den Boulevard laufen lässt.
 */

import type { CompactGraph } from '../routing/graph';
import type { SurfaceProvider } from './surfaces';

/** Augenhöhe über dem Boden. */
export const EYE_HEIGHT_M = 1.7;

interface Layer {
  key: string;
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  z: number;
  level: number;
  bits: Uint8Array;
  basisX: [number, number];
  basisY: [number, number];
}

function gridCoordinates(layer: Layer, x: number, y: number): [number, number] {
  const dx = x - layer.originX;
  const dy = y - layer.originY;
  const [ax, ay] = layer.basisX;
  const [bx, by] = layer.basisY;
  const determinant = ax * by - ay * bx;
  return [(dx * by - dy * bx) / determinant, (dy * ax - dx * ay) / determinant];
}

function gridPoint(layer: Layer, ix: number, iy: number): [number, number] {
  return [layer.originX + ix * layer.basisX[0] + iy * layer.basisY[0],
    layer.originY + ix * layer.basisX[1] + iy * layer.basisY[1]];
}

export type LayoutPatchState = 'open' | 'blocked';

export interface LayoutPatch {
  id: string;
  hallKey: string;
  ix: number;
  iy: number;
  state: LayoutPatchState;
  note?: string;
  changedAt: number;
}

export interface WalkCell {
  hallKey: string;
  ix: number;
  iy: number;
  x: number;
  y: number;
  z: number;
  blocked: boolean;
  patched: LayoutPatch | null;
}

export interface Footing {
  /** Höhe des Bodens in Geländemetern. */
  z: number;
  /** Steht hier ein Stand oder eine Wand? */
  blocked: boolean;
  /** Schlüssel der Hallenebene, oder null im Freien. */
  hallKey: string | null;
  /** Explizite Außen-/Übergangsfläche; Hallen verwenden weiterhin hallKey. */
  surfaceId: string | null;
}

/** Übergangshilfe, bis reale Piazza-/Boulevardpolygone ausgeliefert werden. */
export const LEGACY_OPEN_OUTSIDE: SurfaceProvider = {
  footingAt: () => ({ z: 0, blocked: false, surfaceId: 'legacy-open-outside' }),
};

/** Terrain-Höhenfunktion für Offline-First-Person-Bewegung im Freien. */
export interface TerrainSampler {
  (x: number, y: number): number | null;
}

/**
 * Erweitert WalkGrid um eine Terrain-Höhenfunktion.
 * Im Freien (kein Hall-Grid) wird die Kamera an die Terrain-Höhe gebunden.
 */
export function withTerrainHeight(grid: WalkGrid, sampleHeight: TerrainSampler): WalkGrid {
  const originalMove = grid.move.bind(grid);
  grid.move = (from: { x: number; y: number; z: number }, dx: number, dy: number) => {
    const result = originalMove(from, dx, dy);
    // Wenn WalkGrid uns nicht bewegt hat, ist der Weg blockiert (z.B. Wand)
    // oder im Freien. Im Freien: erlaube Bewegung, aber halte Terrain-Höhe.
    if (result.x === from.x && result.y === from.y) {
      const footing = grid.footingAt(from.x + dx, from.y + dy, from.z);
      if (!footing.blocked && !footing.hallKey) {
        // Freier Raum: bewege und halte Terrain-Höhe
        const terrainZ = sampleHeight(from.x + dx, from.y + dy);
        const z = terrainZ !== null ? terrainZ : from.z;
        return { x: from.x + dx, y: from.y + dy, z };
      }
    }
    return result;
  };
  return grid;
}

function decodeBits(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export class WalkGrid {
  private readonly gridM: number;
  private readonly layers: Layer[];
  private readonly patches: Map<string, LayoutPatch>;
  private readonly outside: SurfaceProvider;

  constructor(
    gridM: number,
    layers: Layer[],
    patches: LayoutPatch[] = [],
    outside: SurfaceProvider = LEGACY_OPEN_OUTSIDE,
  ) {
    this.gridM = gridM;
    this.layers = layers;
    this.patches = new Map(patches.map((patch) => [patch.id, patch]));
    this.outside = outside;
  }

  static fromCompact(compact: CompactGraph, outside?: SurfaceProvider): WalkGrid {
    const layers = compact.grids.map((grid) => ({
      key: grid.key,
      originX: grid.origin[0],
      originY: grid.origin[1],
      cols: grid.cols,
      rows: grid.rows,
      z: grid.z,
      level: grid.level,
      bits: decodeBits(grid.walkable),
      basisX: grid.cellBasisX ?? [compact.gridM, 0],
      basisY: grid.cellBasisY ?? [0, compact.gridM],
    }));
    return new WalkGrid(compact.gridM, layers, [], outside);
  }

  withLayoutPatches(patches: LayoutPatch[]): WalkGrid {
    return new WalkGrid(this.gridM, this.layers, patches, this.outside);
  }

  layoutPatches(): LayoutPatch[] {
    return Array.from(this.patches.values()).sort((a, b) => a.hallKey.localeCompare(b.hallKey) || a.iy - b.iy || a.ix - b.ix);
  }

  private patchId(hallKey: string, ix: number, iy: number): string {
    return `${hallKey}:${ix}:${iy}`;
  }

  private patchedCell(layer: Layer, ix: number, iy: number, original: boolean): { walkable: boolean; patch: LayoutPatch | null } {
    const patch = this.patches.get(this.patchId(layer.key, ix, iy)) ?? null;
    if (!patch) return { walkable: original, patch: null };
    return { walkable: patch.state === 'open', patch };
  }

  private cell(layer: Layer, x: number, y: number): boolean | null {
    const coordinates = gridCoordinates(layer, x, y);
    const ix = Math.floor(coordinates[0]);
    const iy = Math.floor(coordinates[1]);
    if (ix < 0 || iy < 0 || ix >= layer.cols || iy >= layer.rows) return null;
    const position = iy * layer.cols + ix;
    const original = (layer.bits[position >> 3] & (1 << (position & 7))) !== 0;
    return this.patchedCell(layer, ix, iy, original).walkable;
  }

  cellAt(x: number, y: number, preferZ = 0): WalkCell | null {
    let best: WalkCell | null = null;
    let bestGap = Infinity;
    for (const layer of this.layers) {
      const coordinates = gridCoordinates(layer, x, y);
      const ix = Math.floor(coordinates[0]);
      const iy = Math.floor(coordinates[1]);
      if (ix < 0 || iy < 0 || ix >= layer.cols || iy >= layer.rows) continue;
      const position = iy * layer.cols + ix;
      const original = (layer.bits[position >> 3] & (1 << (position & 7))) !== 0;
      const patched = this.patchedCell(layer, ix, iy, original);
      const gap = Math.abs(layer.z - preferZ);
      if (best === null || gap < bestGap) {
        const point = gridPoint(layer, ix + 0.5, iy + 0.5);
        best = {
          hallKey: layer.key,
          ix,
          iy,
          x: point[0],
          y: point[1],
          z: layer.z,
          blocked: !patched.walkable,
          patched: patched.patch,
        };
        bestGap = gap;
      }
    }
    return best;
  }

  patchAt(x: number, y: number, preferZ: number, state: LayoutPatchState, note?: string): LayoutPatch | null {
    const cell = this.cellAt(x, y, preferZ);
    if (!cell) return null;
    return this.patchCell(cell, state, note);
  }

  patchCell(cell: WalkCell, state: LayoutPatchState, note?: string): LayoutPatch {
    return {
      id: this.patchId(cell.hallKey, cell.ix, cell.iy),
      hallKey: cell.hallKey,
      ix: cell.ix,
      iy: cell.iy,
      state,
      note,
      changedAt: Date.now(),
    };
  }

  patchesAlong(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
    widthM: number,
    state: LayoutPatchState,
    note?: string,
  ): LayoutPatch[] {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / (this.gridM * 0.5)));
    const radius = Math.max(0, Math.ceil(widthM / this.gridM / 2));
    const cells = new Map<string, WalkCell>();

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const centre = this.cellAt(x, y, from.z);
      if (!centre) continue;
      const layer = this.layers.find((entry) => entry.key === centre.hallKey);
      if (!layer) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const point = gridPoint(layer, centre.ix + dx + 0.5, centre.iy + dy + 0.5);
          const cell = this.cellAt(point[0], point[1], from.z);
          if (!cell || cell.hallKey !== centre.hallKey) continue;
          cells.set(`${cell.hallKey}:${cell.ix}:${cell.iy}`, cell);
        }
      }
    }

    return Array.from(cells.values()).map((cell) => this.patchCell(cell, state, note));
  }

  /**
   * Was liegt an dieser Stelle unter den Füßen?
   *
   * `preferZ` entscheidet bei gestapelten Hallen, welche Ebene gemeint ist —
   * wer in 10.2 steht, soll nicht plötzlich in 10.1 landen, nur weil beide
   * denselben Grundriss haben.
   */
  footingAt(x: number, y: number, preferZ = 0): Footing {
    let best: Footing | null = null;
    let bestGap = Infinity;

    for (const layer of this.layers) {
      const walkable = this.cell(layer, x, y);
      if (walkable === null) continue;
      const gap = Math.abs(layer.z - preferZ);
      // Ein begehbares Feld schlägt ein gesperrtes auf derselben Ebene:
      // sonst blockiert die untere Halle den Gang in der oberen.
      const better =
        best === null ||
        gap < bestGap - 0.5 ||
        (Math.abs(gap - bestGap) <= 0.5 && walkable && best.blocked);
      if (better) {
        best = { z: layer.z, blocked: !walkable, hallKey: layer.key, surfaceId: null };
        bestGap = gap;
      }
    }
    if (best) return best;
    const outside = this.outside.footingAt(x, y, preferZ);
    return { ...outside, hallKey: null };
  }

  /**
   * Ein Startpunkt, an dem man wirklich stehen kann.
   *
   * Mitten in der Halle, nicht in der ersten Ecke: wer am Geländerand
   * aufwacht und erst einmal zweihundert Meter laufen muss, hält die Ansicht
   * für kaputt. Ohne Hallenangabe wird die groesste Halle auf der
   * Eingangsebene genommen. Eine groessere Obergeschosshalle ist kein
   * sinnvoller Standardstart: dort kann die Kamera unter einer Decke landen,
   * bevor der Besucher ueberhaupt ein Ziel gewaehlt hat.
   */
  spawn(hallKey?: string): { x: number; y: number; z: number } | null {
    const groundLayers = this.layers.filter((layer) => layer.level <= 1);
    const layers = hallKey
      ? this.layers.filter((layer) => layer.key === hallKey)
      : [...(groundLayers.length > 0 ? groundLayers : this.layers)]
        .sort((a, b) => b.cols * b.rows - a.cols * a.rows);

    for (const layer of layers) {
      const midX = (layer.cols - 1) / 2;
      const midY = (layer.rows - 1) / 2;
      let best: { ix: number; iy: number; gap: number } | null = null;
      for (let iy = 0; iy < layer.rows; iy += 1) {
        for (let ix = 0; ix < layer.cols; ix += 1) {
          const position = iy * layer.cols + ix;
          if ((layer.bits[position >> 3] & (1 << (position & 7))) === 0) continue;
          const gap = (ix - midX) ** 2 + (iy - midY) ** 2;
          if (best === null || gap < best.gap) best = { ix, iy, gap };
        }
      }
      if (best) {
        const point = gridPoint(layer, best.ix + 0.5, best.iy + 0.5);
        return {
          x: point[0],
          y: point[1],
          z: layer.z,
        };
      }
    }
    return null;
  }

  /**
   * Bewegt einen Punkt und lässt ihn an Hindernissen entlanggleiten.
   *
   * Wer frontal gegen einen Stand läuft, bleibt stehen; wer ihn schräg
   * streift, rutscht daran vorbei. Ohne das Gleiten bleibt man in jeder Ecke
   * kleben, und das fühlt sich kaputt an, obwohl es nur streng ist.
   */
  move(
    from: { x: number; y: number; z: number },
    dx: number,
    dy: number,
  ): { x: number; y: number; z: number } {
    const tryStep = (x: number, y: number) => {
      const footing = this.footingAt(x, y, from.z);
      return footing.blocked ? null : { x, y, z: footing.z };
    };

    return (
      tryStep(from.x + dx, from.y + dy) ??
      tryStep(from.x + dx, from.y) ??
      tryStep(from.x, from.y + dy) ??
      from
    );
  }
}
