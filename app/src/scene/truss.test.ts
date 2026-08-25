import { describe, expect, it } from 'vitest';

import {
  generateBoxTruss,
  generateTrussGraph,
  trussTubeMatrix,
} from './truss';

describe('generateBoxTruss', () => {
  it('baut genau vier parallele Längsrohre', () => {
    const truss = generateBoxTruss([0, 0, 0], [6, 0, 0]);
    const chords = truss.tubes.filter((tube) => tube.kind === 'chord');
    expect(chords).toHaveLength(4);
    for (const chord of chords) {
      expect(chord.end[0] - chord.start[0]).toBeCloseTo(6, 6);
      expect(chord.end[1] - chord.start[1]).toBeCloseTo(0, 6);
      expect(chord.end[2] - chord.start[2]).toBeCloseTo(0, 6);
    }
  });

  it('schweißt auf jeder Seite pro Feld ein X', () => {
    const truss = generateBoxTruss([0, 0, 0], [3.2, 0, 0], {
      bayLength: 0.32,
      endFrames: false,
      bracing: 'x',
    });
    expect(truss.bays).toBe(10);
    // 4 Seiten × 2 Diagonalen × 10 Felder.
    expect(truss.tubes.filter((tube) => tube.kind === 'brace')).toHaveLength(80);
  });

  it('passt das Raster an, statt am Ende ein halbes Feld anzukleben', () => {
    const truss = generateBoxTruss([0, 0, 0], [5, 0, 0], { bayLength: 0.32 });
    expect(truss.bays).toBe(Math.ceil(5 / 0.32));
    expect(truss.length).toBeCloseTo(5, 6);

    const allX = truss.tubes.flatMap((tube) => [tube.start[0], tube.end[0]]);
    expect(Math.min(...allX)).toBeGreaterThanOrEqual(-0.001);
    expect(Math.max(...allX)).toBeLessThanOrEqual(5.001);
  });

  it('funktioniert auch frei im 3D-Raum statt nur achsparallel', () => {
    const truss = generateBoxTruss([1, 2, 3], [4, 6, 9]);
    expect(truss.length).toBeCloseTo(Math.sqrt(61), 6);
    expect(truss.tubes.filter((tube) => tube.kind === 'chord')).toHaveLength(4);
  });

  it('liefert bei Null-Länge keine kaputte Geometrie', () => {
    expect(generateBoxTruss([1, 1, 1], [1, 1, 1]).tubes).toEqual([]);
  });
});

describe('generateTrussGraph', () => {
  it('baut aus Punkten und Kanten ohne Sondermodelle ein Rechteck-Rig', () => {
    const tubes = generateTrussGraph({
      nodes: {
        a: [0, 5, 0],
        b: [8, 5, 0],
        c: [8, 5, 5],
        d: [0, 5, 5],
      },
      edges: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']],
    });
    expect(tubes.filter((tube) => tube.kind === 'chord')).toHaveLength(16);
    expect(tubes.length).toBeGreaterThan(16);
  });

  it('ignoriert eine Kante mit unbekanntem Knoten sauber', () => {
    expect(generateTrussGraph({ nodes: { a: [0, 0, 0] }, edges: [['a', 'missing']] }))
      .toEqual([]);
  });
});

describe('trussTubeMatrix', () => {
  it('skaliert einen Einheitszylinder auf Rohrdurchmesser und Länge', () => {
    const matrix = trussTubeMatrix({
      start: [0, 0, 0],
      end: [0, 4, 0],
      radius: 0.025,
      kind: 'chord',
    });
    const elements = matrix.elements;
    // Y-achsiger Spezialfall: die Skalierung steht direkt auf der Diagonale.
    expect(elements[0]).toBeCloseTo(0.025, 6);
    expect(elements[5]).toBeCloseTo(4, 6);
    expect(elements[10]).toBeCloseTo(0.025, 6);
    expect(elements[13]).toBeCloseTo(2, 6);
  });
});
