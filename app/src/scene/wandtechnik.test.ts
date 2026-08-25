import { describe, expect, it } from 'vitest';

import { WANDTECHNIK_DEFAULT, wandtechnik } from './wandtechnik';

describe('wandtechnik', () => {
  it('ist deterministisch: derselbe Seed ergibt dieselbe Wand', () => {
    const a = wandtechnik(12, 4, { seed: 7 });
    const b = wandtechnik(12, 4, { seed: 7 });
    expect(a).toEqual(b);
  });

  it('ein anderer Seed ergibt eine andere Wand', () => {
    const a = wandtechnik(12, 4, { seed: 7 });
    const b = wandtechnik(12, 4, { seed: 8 });
    expect(a).not.toEqual(b);
  });

  it('bleibt bei einer entarteten Waenden leer statt zu rechnen', () => {
    expect(wandtechnik(0, 4).panels).toEqual([]);
    expect(wandtechnik(12, -1).panels).toEqual([]);
  });

  it('haelt jedes Panel innerhalb der Wandflaeche', () => {
    const { panels } = wandtechnik(12, 4, { seed: 3, panelDensity: 0.6 });
    expect(panels.length).toBeGreaterThan(0);
    for (const p of panels) {
      expect(p.u - p.breiteU / 2).toBeGreaterThanOrEqual(-1e-9);
      expect(p.u + p.breiteU / 2).toBeLessThanOrEqual(12 + 1e-9);
      expect(p.v - p.breiteV / 2).toBeGreaterThanOrEqual(-1e-9);
      expect(p.v + p.breiteV / 2).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it('mehr Dichte ergibt mehr Panelflaeche', () => {
    const wenig = wandtechnik(20, 5, { seed: 4, panelDensity: 0.15 });
    const viel = wandtechnik(20, 5, { seed: 4, panelDensity: 0.75 });
    const flaeche = (w: typeof wenig) =>
      w.panels.reduce((sum, p) => sum + p.breiteU * p.breiteV, 0);
    expect(flaeche(viel)).toBeGreaterThan(flaeche(wenig));
  });

  it('verschmilzt gelegentlich zwei Zellen zu einem breiteren Panel', () => {
    // Bei voller Dichte und vielen Spalten muss mindestens ein Panel breiter
    // als eine einzelne Rasterzelle sein -- sonst waere die Verschmelzung
    // nie aktiv.
    let gefunden = false;
    for (let seed = 0; seed < 20 && !gefunden; seed += 1) {
      const { panels } = wandtechnik(30, 5, { seed, panelDensity: 1 });
      gefunden = panels.some((p) => p.breiteU > WANDTECHNIK_DEFAULT.panelGridX * 1.3);
    }
    expect(gefunden).toBe(true);
  });

  it('lässt Panels nicht bis an die obere/untere Kante reichen', () => {
    const { panels } = wandtechnik(12, 4, { seed: 5, panelDensity: 0.9 });
    for (const p of panels) {
      expect(p.v - p.breiteV / 2).toBeGreaterThan(0);
      expect(p.v + p.breiteV / 2).toBeLessThan(4);
    }
  });

  it('null Dichte ergibt keine Panels, keine Kabel, keine Boxen', () => {
    const w = wandtechnik(12, 4, {
      seed: 1, panelDensity: 0, cableDensity: 0, techDensity: 0,
    });
    expect(w.panels).toEqual([]);
    expect(w.kabel).toEqual([]);
    expect(w.boxen).toEqual([]);
  });

  it('jedes Kabel hat mindestens zwei Punkte und bleibt in der Wandflaeche', () => {
    const { kabel } = wandtechnik(20, 6, { seed: 9, cableDensity: 1 });
    expect(kabel.length).toBeGreaterThan(0);
    for (const k of kabel) {
      expect(k.punkte.length).toBeGreaterThanOrEqual(2);
      for (const [u, v] of k.punkte) {
        expect(u).toBeGreaterThanOrEqual(-1e-9);
        expect(u).toBeLessThanOrEqual(20 + 1e-9);
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(6 + 1e-9);
      }
      expect(k.dicke).toBeGreaterThan(0);
    }
  });

  it('mehr Kabel-Dichte ergibt nie weniger Kabel', () => {
    const wenig = wandtechnik(20, 6, { seed: 2, cableDensity: 0.1 });
    const viel = wandtechnik(20, 6, { seed: 2, cableDensity: 0.9 });
    expect(viel.kabel.length).toBeGreaterThanOrEqual(wenig.kabel.length);
  });

  it('Technikboxen bleiben selten -- nie mehr als ein Bruchteil der Panels', () => {
    const { panels, boxen } = wandtechnik(20, 6, { seed: 6, panelDensity: 0.5, techDensity: 1 });
    expect(boxen.length).toBeLessThan(Math.max(4, panels.length));
    expect(boxen.length).toBeLessThanOrEqual(4);
  });

  it('vergisst keine Zelle doppelt -- verschmolzene Nachbarn erscheinen nicht als eigenes Panel', () => {
    // Gesamtflaeche aller Panels darf die Rasterflaeche nie uebersteigen.
    for (let seed = 0; seed < 10; seed += 1) {
      const breiteU = 24;
      const hoeheV = 5;
      const { panels } = wandtechnik(breiteU, hoeheV, { seed, panelDensity: 1 });
      const flaeche = panels.reduce((sum, p) => sum + p.breiteU * p.breiteV, 0);
      expect(flaeche).toBeLessThanOrEqual(breiteU * hoeheV);
    }
  });
});
