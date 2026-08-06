/**
 * Kollision gegen dasselbe Gitter, auf dem geroutet wird.
 *
 * Geprueft wird das, was in der Ego-Perspektive schiefgehen kann: durch einen
 * Stand laufen, in einer Ecke kleben bleiben, oder beim Ebenenwechsel auf die
 * falsche Etage fallen.
 */
import { describe, expect, it } from 'vitest';

import { WalkGrid } from './walk';
import { PrioritySurfaceProvider } from './surfaces';
import type { CompactGraph } from '../routing/graph';

/** Baut ein Gitter aus einer Zeichnung: '.' begehbar, '#' gesperrt. */
function grid(key: string, z: number, level: number, rows: string[]) {
  const cols = rows[0].length;
  const bits = new Uint8Array(Math.ceil((cols * rows.length) / 8));
  rows.forEach((row, iy) => {
    [...row].forEach((cell, ix) => {
      if (cell !== '.') return;
      const position = iy * cols + ix;
      bits[position >> 3] |= 1 << (position & 7);
    });
  });
  let binary = '';
  bits.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return {
    key,
    origin: [0, 0] as [number, number],
    z,
    level,
    cols,
    rows: rows.length,
    walkable: btoa(binary),
  };
}

/** 5x5 Felder a 2 m, mit einem Stand in der Mitte. */
const HALLE = [
  '.....',
  '.....',
  '..#..',
  '.....',
  '.....',
];

function build(...grids: ReturnType<typeof grid>[]): WalkGrid {
  return WalkGrid.fromCompact({ gridM: 2, grids, standLinks: [], connectors: [], schema: 'test' } as unknown as CompactGraph);
}

describe('WalkGrid', () => {
  const walk = build(grid('1.1', 0, 1, HALLE));

  it('kennt den Boden unter dem Fuss', () => {
    const footing = walk.footingAt(1, 1);
    expect(footing.hallKey).toBe('1.1');
    expect(footing.blocked).toBe(false);
    expect(footing.z).toBe(0);
  });

  it('sperrt den Stand', () => {
    expect(walk.footingAt(5, 5).blocked).toBe(true);
  });



  it('kann eine falsch erkannte Wand lokal oeffnen', () => {
    const patch = walk.patchAt(5, 5, 0, 'open');
    const corrected = walk.withLayoutPatches([patch!]);
    expect(corrected.footingAt(5, 5).blocked).toBe(false);
    expect(corrected.cellAt(5, 5)?.patched?.state).toBe('open');
  });

  it('kann eine fehlende Wand lokal sperren', () => {
    const patch = walk.patchAt(1, 1, 0, 'blocked');
    const corrected = walk.withLayoutPatches([patch!]);
    expect(corrected.footingAt(1, 1).blocked).toBe(true);
  });



  it('zeichnet eine gemessene Strecke als begehbaren Korridor ein', () => {
    const patch = walk.patchesAlong({ x: 1, y: 5, z: 0 }, { x: 9, y: 5, z: 0 }, 2.4, 'open', 'Messstrecke');
    const corrected = walk.withLayoutPatches(patch);
    expect(corrected.footingAt(5, 5).blocked).toBe(false);
  });

  it('laesst draussen durch, statt festzuhalten', () => {
    // Ohne Gitter gibt es keine Wand -- der Boulevard ist begehbar, auch
    // wenn ihn niemand kartiert hat.
    const outside = walk.footingAt(500, 500);
    expect(outside.hallKey).toBeNull();
    expect(outside.blocked).toBe(false);
    expect(outside.surfaceId).toBe('legacy-open-outside');
  });

  it('kann den unsicheren Außenfallback bereits vollständig sperren', () => {
    const secure = WalkGrid.fromCompact({
      gridM: 2,
      grids: [grid('1.1', 0, 1, HALLE)],
      standLinks: [],
      connectors: [],
      schema: 'test',
    } as unknown as CompactGraph, new PrioritySurfaceProvider([]));
    expect(secure.footingAt(500, 500)).toEqual({
      z: 0, blocked: true, hallKey: null, surfaceId: null,
    });
    expect(secure.footingAt(1, 1).blocked).toBe(false);
  });

  it('fragt ein gedrehtes amtliches WalkGrid in dessen Zellbasis ab', () => {
    const rotated = grid('amtlich', 4.5, 1, ['..', '.#']);
    const affine = WalkGrid.fromCompact({
      gridM: 2,
      grids: [{ ...rotated, origin: [100, 200], cellBasisX: [0, 2], cellBasisY: [-2, 0] }],
      standLinks: [], connectors: [], schema: 'registered',
    } as unknown as CompactGraph);
    expect(affine.footingAt(99, 201, 4).blocked).toBe(false);
    expect(affine.footingAt(97, 203, 4).blocked).toBe(true);
    expect(affine.spawn('amtlich')).toEqual({ x: 99, y: 201, z: 4.5 });
  });

  it('haelt vor dem Stand an', () => {
    const from = { x: 5, y: 1, z: 0 };
    const to = walk.move(from, 0, 4);
    expect(to.y).toBeLessThan(5);
  });

  it('gleitet an der Ecke entlang, statt zu kleben', () => {
    // Schraeg gegen den Stand: die Bewegung quer dazu muss erhalten bleiben.
    const from = { x: 3, y: 3, z: 0 };
    const to = walk.move(from, 2, 2);
    expect(to.x !== from.x || to.y !== from.y).toBe(true);
  });

  it('findet einen Startpunkt, auf dem man stehen kann', () => {
    const spot = walk.spawn();
    expect(spot).not.toBeNull();
    expect(walk.footingAt(spot!.x, spot!.y).blocked).toBe(false);
  });

  it('bleibt beim Ebenenwechsel auf der gewaehlten Etage', () => {
    const stacked = build(
      grid('10.1', 0, 1, HALLE),
      grid('10.2', 7.45, 2, HALLE),
    );
    expect(stacked.footingAt(1, 1, 0).z).toBe(0);
    expect(stacked.footingAt(1, 1, 7.45).z).toBe(7.45);
  });

  it('nimmt die begehbare Ebene, wenn die andere dort gesperrt ist', () => {
    // Oben Gang, unten Stand: wer oben laeuft, darf nicht unten anstossen.
    const stacked = build(
      grid('10.1', 0, 1, HALLE),
      grid('10.2', 0.2, 2, ['.....', '.....', '.....', '.....', '.....']),
    );
    expect(stacked.footingAt(5, 5, 0).blocked).toBe(false);
  });
});
