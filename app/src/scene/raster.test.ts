import { describe, expect, it } from 'vitest';

import {
  BAHNEN_JE_FELD,
  PFEILERREIHEN_QUER,
  RASTER_M,
  bahnenImFeld,
  hallenlage,
  pfeilerreihenQuer,
  rasterAchsen,
} from './interior';
import site from '../../public/data/registered-site.json';

/**
 * Quer zur Halle wechseln sich Ausstellerbänder und Stützenreihen ab -- kein
 * gleichmäßiges Raster in beiden Richtungen.
 *
 * Ein Raster von 12 m auch quer (13 Achsen über Halle 10.2) stand hier
 * vorher und war falsch: bei 12 m Abstand bleibt zwischen zwei Reihen kein
 * Platz für einen Ausstellerblock, und genau dafür ist die Fläche da.
 */
describe('Stützenreihen quer', () => {
  it('sind zu fünft', () => {
    expect(PFEILERREIHEN_QUER).toBe(5);
    expect(pfeilerreihenQuer(145.5)).toHaveLength(5);
  });

  it('teilen die Breite in sechs gleiche Bänder', () => {
    const breite = 145.5;
    const reihen = pfeilerreihenQuer(breite);
    const band = breite / 6;
    // Wand -> erste Reihe, dann Reihe zu Reihe, dann letzte Reihe -> Wand.
    const abstaende = [
      reihen[0] - -breite / 2,
      ...reihen.slice(1).map((r, i) => r - reihen[i]),
      breite / 2 - reihen[reihen.length - 1],
    ];
    for (const abstand of abstaende) expect(abstand).toBeCloseTo(band, 6);
  });

  it('lassen an beiden Wänden ein ganzes Band frei', () => {
    const reihen = pfeilerreihenQuer(145.5);
    expect(reihen[0]).toBeCloseTo(-reihen[reihen.length - 1], 6);
    expect(Math.abs(reihen[0])).toBeLessThan(145.5 / 2);
  });
});

/** Längs der Halle stehen die Stützen einer Reihe im festen Abstand. */
describe('Stützen längs einer Reihe', () => {
  it('stehen zwölf Meter auseinander', () => {
    expect(RASTER_M).toBe(12);
    const achsen = rasterAchsen(174.5);
    for (let i = 1; i < achsen.length; i += 1) {
      expect(achsen[i] - achsen[i - 1]).toBeCloseTo(12, 6);
    }
  });

  it('sitzen mittig, nicht an einer Wand', () => {
    const achsen = rasterAchsen(145.5);
    expect(achsen[0]).toBeCloseTo(-achsen[achsen.length - 1], 6);
  });

  it('tragen auch in einer kleinen Halle mindestens ein Feld', () => {
    expect(rasterAchsen(5)).toHaveLength(2);
  });
});

/**
 * Am echten Grundriss statt an getippten Zahlen.
 *
 * Der Fehler, den diese Prüfung fangen soll: `hallenlage()` maß Länge und
 * Breite entlang einer an der x-Achse gespiegelten Achse -- dem Winkel für
 * die *Szenendrehung*, nicht der Richtung im Grundriss. Bei Halle 10.2
 * (längste Kante bei -60°) kamen dabei 194,8 x 197,1 m heraus statt
 * 174,5 x 145,5, und das ganze Stützenwerk lag als verdrehte Box über der
 * Halle.
 */
describe('Halle 10.2 im Datensatz', () => {
  const halle = site.halls.find((h) => h.key === '10.2');

  it('liegt 174,5 m lang und 145,5 m breit', () => {
    const lage = hallenlage(halle!.footprint as [number, number][]);
    expect(lage).not.toBeNull();
    expect(lage!.laenge).toBeCloseTo(174.5, 0);
    expect(lage!.breite).toBeCloseTo(145.5, 0);
  });

  it('trägt fünf Stützenreihen mit je fünfzehn Stützen', () => {
    const lage = hallenlage(halle!.footprint as [number, number][])!;
    const laengs = rasterAchsen(lage.laenge);
    const quer = pfeilerreihenQuer(lage.breite);
    expect(quer).toHaveLength(5);
    expect(laengs).toHaveLength(15);
    expect(laengs.length * quer.length).toBe(75);
  });

  it('lässt zwischen den Reihen rund 24 m für einen Ausstellerblock', () => {
    const lage = hallenlage(halle!.footprint as [number, number][])!;
    const quer = pfeilerreihenQuer(lage.breite);
    expect(quer[1] - quer[0]).toBeCloseTo(lage.breite / 6, 6);
    expect(quer[1] - quer[0]).toBeGreaterThan(20);
  });

  it('führt eine Längsachse, die senkrecht auf ihrer Querachse steht', () => {
    const lage = hallenlage(halle!.footprint as [number, number][])!;
    expect(lage.tx * lage.px + lage.ty * lage.py).toBeCloseTo(0, 9);
    expect(Math.hypot(lage.tx, lage.ty)).toBeCloseTo(1, 9);
  });
});

/**
 * Über jedem Ausstellerband liegen drei Lichtleisten mit identischen
 * Abständen: Stützenreihe → Bahn ist derselbe Abstand wie Bahn → Bahn.
 */
describe('Lichtleisten je Band', () => {
  it('sind zu dritt', () => {
    expect(BAHNEN_JE_FELD).toBe(3);
    expect(bahnenImFeld()).toHaveLength(3);
  });

  it('halten überall denselben Abstand, auch zu den Stützenreihen', () => {
    // Bandbreite von Halle 10.2: 145,5 m auf sechs Bänder.
    const band = 145.5 / 6;
    const bahnen = bahnenImFeld(band);
    const abstaende = [
      bahnen[0] - 0,
      ...bahnen.slice(1).map((b, i) => b - bahnen[i]),
      band - bahnen[bahnen.length - 1],
    ];
    for (const abstand of abstaende) expect(abstand).toBeCloseTo(band / 4, 6);
  });
});
