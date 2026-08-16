import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { ausschnitt, setzeQuaderflaeche, tafelGeometrie } from './flaechenUV';

/**
 * UVs liegen als `Float32Array` in der Geometrie -- 0,1 kommt als
 * 0,10000000149 zurück. Verglichen wird deshalb gerundet.
 */
function gerundet(punkte: [number, number][]): string[] {
  return punkte.map(([u, v]) => `${u.toFixed(4)},${v.toFixed(4)}`).sort();
}

/** Alle UV-Paare, die eine Quaderfläche wirklich benutzt. */
function uvsDerFlaeche(geometrie: THREE.BoxGeometry, gruppe: number): [number, number][] {
  const index = geometrie.getIndex()!;
  const uv = geometrie.getAttribute('uv') as THREE.BufferAttribute;
  const bereich = geometrie.groups[gruppe];
  const punkte = new Set<number>();
  for (let i = 0; i < bereich.count; i += 1) punkte.add(index.getX(bereich.start + i));
  return [...punkte].map((p) => [uv.getX(p), uv.getY(p)]);
}

describe('Ausschnitte eines Atlas', () => {
  it('teilt gleichmässig auf', () => {
    expect(ausschnitt(2, 2, 0)).toEqual([0, 0.5, 0.5, 1]);
    expect(ausschnitt(2, 2, 3)).toEqual([0.5, 0, 1, 0.5]);
  });

  it('zählt von links oben', () => {
    // Feld 0 muss oben links liegen -- so liest man einen Atlas, und so ist
    // er auch im Bildbearbeitungsprogramm angelegt.
    const [, v0, , v1] = ausschnitt(4, 2, 0);
    expect(v1).toBe(1);
    expect(v0).toBe(0.5);
  });

  it('deckt zusammen die ganze Textur ab', () => {
    let flaeche = 0;
    for (let feld = 0; feld < 6; feld += 1) {
      const [u0, v0, u1, v1] = ausschnitt(3, 2, feld);
      flaeche += (u1 - u0) * (v1 - v0);
    }
    expect(flaeche).toBeCloseTo(1, 9);
  });
});

describe('Eine Quaderfläche auf einen Ausschnitt legen', () => {
  it('bewegt nur die gemeinte Fläche', () => {
    // Der Fehler, den das verhindert: `BoxGeometry` ist indiziert, eine
    // Gruppe zeigt in den *Indexpuffer* und nicht auf Eckpunkte. Wer stumpf
    // über den Bereich schreibt, verschiebt die UVs fremder Flächen.
    const geometrie = new THREE.BoxGeometry(1, 1, 1);
    const vorher = gerundet(uvsDerFlaeche(geometrie, 0));
    setzeQuaderflaeche(geometrie, 'vorn', [0.25, 0.25, 0.5, 0.5]);
    expect(gerundet(uvsDerFlaeche(geometrie, 0))).toEqual(vorher);
    geometrie.dispose();
  });

  it('legt genau die vier Ecken des Ausschnitts an', () => {
    const geometrie = new THREE.BoxGeometry(2, 3, 4);
    setzeQuaderflaeche(geometrie, 'oben', [0.1, 0.2, 0.6, 0.8]);
    expect(gerundet(uvsDerFlaeche(geometrie, 2)))
      .toEqual(['0.1000,0.2000', '0.1000,0.8000', '0.6000,0.2000', '0.6000,0.8000']);
    geometrie.dispose();
  });

  it('behält die Ausrichtung, statt das Bild zu drehen', () => {
    // Was vorher oben links lag, muss danach oben links im Ausschnitt liegen.
    const geometrie = new THREE.BoxGeometry(1, 1, 1);
    const uv = geometrie.getAttribute('uv') as THREE.BufferAttribute;
    const index = geometrie.getIndex()!;
    const bereich = geometrie.groups[4];
    const punkte = new Set<number>();
    for (let i = 0; i < bereich.count; i += 1) punkte.add(index.getX(bereich.start + i));
    const vorher = new Map([...punkte].map((p) => [p, [uv.getX(p), uv.getY(p)]]));

    setzeQuaderflaeche(geometrie, 'vorn', [0.2, 0.4, 0.8, 0.6]);
    for (const [punkt, [altU, altV]] of vorher) {
      const neuU = uv.getX(punkt);
      const neuV = uv.getY(punkt);
      // links bleibt links, unten bleibt unten
      expect(neuU < 0.5, `u ${altU} -> ${neuU}`).toBe(altU < 0.5);
      expect(neuV < 0.5, `v ${altV} -> ${neuV}`).toBe(altV < 0.5);
    }
    geometrie.dispose();
  });

  it('kann jede der sechs Flächen einzeln setzen', () => {
    const geometrie = new THREE.BoxGeometry(1, 1, 1);
    const flaechen = ['rechts', 'links', 'oben', 'unten', 'vorn', 'hinten'] as const;
    flaechen.forEach((flaeche, i) => {
      setzeQuaderflaeche(geometrie, flaeche, ausschnitt(3, 2, i));
    });
    // Sechs Flächen, sechs verschiedene Ausschnitte -- keine darf eine andere
    // überschrieben haben.
    const mitten = geometrie.groups.map((_, i) => {
      const punkte = uvsDerFlaeche(geometrie, i);
      const u = punkte.reduce((s, p) => s + p[0], 0) / punkte.length;
      const v = punkte.reduce((s, p) => s + p[1], 0) / punkte.length;
      return `${u.toFixed(3)},${v.toFixed(3)}`;
    });
    expect(new Set(mitten).size).toBe(6);
    geometrie.dispose();
  });

  it('meldet eine Geometrie ohne UVs, statt still nichts zu tun', () => {
    const nackt = new THREE.BoxGeometry(1, 1, 1);
    nackt.deleteAttribute('uv');
    expect(() => setzeQuaderflaeche(nackt, 'vorn', [0, 0, 1, 1])).toThrow(/uv/);
    nackt.dispose();
  });
});

describe('Einzelne Tafel', () => {
  it('trägt genau den verlangten Ausschnitt', () => {
    const geometrie = tafelGeometrie(2, 1, [0.25, 0, 0.5, 0.5]);
    const uv = geometrie.getAttribute('uv') as THREE.BufferAttribute;
    const alle: [number, number][] = [];
    for (let i = 0; i < uv.count; i += 1) alle.push([uv.getX(i), uv.getY(i)]);
    expect(gerundet(alle))
      .toEqual(['0.2500,0.0000', '0.2500,0.5000', '0.5000,0.0000', '0.5000,0.5000']);
    geometrie.dispose();
  });

  it('stellt das Bild aufrecht und nicht auf den Kopf', () => {
    const geometrie = tafelGeometrie(1, 1, [0, 0, 1, 1]);
    const position = geometrie.getAttribute('position');
    const uv = geometrie.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 1) {
      // Oben in der Geometrie (+y) muss oben in der Textur (v = 1) sein.
      expect(uv.getY(i)).toBe(position.getY(i) > 0 ? 1 : 0);
    }
    geometrie.dispose();
  });

  it('behält die verlangten Masse', () => {
    const geometrie = tafelGeometrie(4, 2.5, [0, 0, 1, 1]);
    geometrie.computeBoundingBox();
    const box = geometrie.boundingBox!;
    expect(box.max.x - box.min.x).toBeCloseTo(4, 6);
    expect(box.max.y - box.min.y).toBeCloseTo(2.5, 6);
    geometrie.dispose();
  });
});
