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
}

/** Draußen, ohne Gitter — freie Bewegung auf Höhe null. */
const OPEN: Footing = { z: 0, blocked: false, hallKey: null };

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

  constructor(gridM: number, layers: Layer[], patches: LayoutPatch[] = []) {
    this.gridM = gridM;
    this.layers = layers;
    this.patches = new Map(patches.map((patch) => [patch.id, patch]));
  }

  static fromCompact(compact: CompactGraph): WalkGrid {
    const layers = compact.grids.map((grid) => ({
      key: grid.key,
      originX: grid.origin[0],
      originY: grid.origin[1],
      cols: grid.cols,
      rows: grid.rows,
      z: grid.z,
      level: grid.level,
      bits: decodeBits(grid.walkable),
    }));
    return new WalkGrid(compact.gridM, layers);
  }

  withLayoutPatches(patches: LayoutPatch[]): WalkGrid {
    return new WalkGrid(this.gridM, this.layers, patches);
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
    const ix = Math.floor((x - layer.originX) / this.gridM);
    const iy = Math.floor((y - layer.originY) / this.gridM);
    if (ix < 0 || iy < 0 || ix >= layer.cols || iy >= layer.rows) return null;
    const position = iy * layer.cols + ix;
    const original = (layer.bits[position >> 3] & (1 << (position & 7))) !== 0;
    return this.patchedCell(layer, ix, iy, original).walkable;
  }

  cellAt(x: number, y: number, preferZ = 0): WalkCell | null {
    let best: WalkCell | null = null;
    let bestGap = Infinity;
    for (const layer of this.layers) {
      const ix = Math.floor((x - layer.originX) / this.gridM);
      const iy = Math.floor((y - layer.originY) / this.gridM);
      if (ix < 0 || iy < 0 || ix >= layer.cols || iy >= layer.rows) continue;
      const position = iy * layer.cols + ix;
      const original = (layer.bits[position >> 3] & (1 << (position & 7))) !== 0;
      const patched = this.patchedCell(layer, ix, iy, original);
      const gap = Math.abs(layer.z - preferZ);
      if (best === null || gap < bestGap) {
        best = {
          hallKey: layer.key,
          ix,
          iy,
          x: layer.originX + (ix + 0.5) * this.gridM,
          y: layer.originY + (iy + 0.5) * this.gridM,
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
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const cell = this.cellAt(centre.x + dx * this.gridM, centre.y + dy * this.gridM, from.z);
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
        best = { z: layer.z, blocked: !walkable, hallKey: layer.key };
        bestGap = gap;
      }
    }
    return best ?? OPEN;
  }

  /**
   * Ein Startpunkt, an dem man wirklich stehen kann.
   *
   * Mitten in der Halle, nicht in der ersten Ecke: wer am Geländerand
   * aufwacht und erst einmal zweihundert Meter laufen muss, hält die Ansicht
   * für kaputt. Ohne Hallenangabe wird die größte genommen.
   */
  spawn(hallKey?: string): { x: number; y: number; z: number } | null {
    const layers = hallKey
      ? this.layers.filter((layer) => layer.key === hallKey)
      : [...this.layers].sort((a, b) => b.cols * b.rows - a.cols * a.rows);

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
        return {
          x: layer.originX + (best.ix + 0.5) * this.gridM,
          y: layer.originY + (best.iy + 0.5) * this.gridM,
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
