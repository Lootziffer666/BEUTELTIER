import { describe, expect, it } from 'vitest';

import { BAHNEN_JE_FELD, RASTER_M, bahnenImFeld, hallenlage, rasterAchsen } from './interior';
import site from '../../public/data/registered-site.json';

/**
 * Das Stützenraster ist ein Baumaß, keine Ableitung aus der Hallengröße.
 *
 * Die Zahlen hier sind die Vorgabe für Halle 10.2 und stammen nicht aus dem
 * Code: 12,00 m Achsmaß, 13 Achsen quer, 15 Reihen längs, 195 Rasterpunkte.
 * Wer am Raster dreht, muss diese Prüfung anfassen -- und dann erklären,
 * warum die Halle plötzlich anders gebaut ist.
 */
describe('Stützenraster', () => {
  it('misst zwölf Meter', () => {
    expect(RASTER_M).toBe(12);
  });

  it('legt für Halle 10.2 fünfzehn Achsen längs und dreizehn quer', () => {
    // Gemessen aus registered-site.json: 174,5 m lang, 145,5 m breit.
    const laengs = rasterAchsen(174.5);
    const quer = rasterAchsen(145.5);
    expect(laengs).toHaveLength(15);
    expect(quer).toHaveLength(13);
    expect(laengs.length * quer.length).toBe(195);
  });

  it('hält überall genau zwölf Meter Abstand', () => {
    const achsen = rasterAchsen(174.5);
    for (let i = 1; i < achsen.length; i += 1) {
      expect(achsen[i] - achsen[i - 1]).toBeCloseTo(12, 6);
    }
  });

  it('sitzt mittig, nicht an einer Wand', () => {
    const achsen = rasterAchsen(145.5);
    expect(achsen[0]).toBeCloseTo(-achsen[achsen.length - 1], 6);
  });

  it('trägt auch in einer kleinen Halle mindestens ein Feld', () => {
    expect(rasterAchsen(5)).toHaveLength(2);
  });
});

/**
 * Zwischen zwei Stützenreihen liegen drei Lichtleisten mit identischen
 * Abständen -- bei 12 m Achsmaß also auf 3, 6 und 9 m. „Identisch" heisst
 * dabei: der Abstand Stütze→Bahn ist derselbe wie Bahn→Bahn, die Ränder
 * werden nicht anders behandelt als die Mitte.
 */
/**
 * Dieselbe Vorgabe, aber am echten Grundriss statt an getippten Zahlen.
 *
 * Der Fehler, den diese Prüfung fangen soll, war genau hier: `hallenlage()`
 * maß Länge und Breite entlang einer an der x-Achse gespiegelten Achse --
 * dem Winkel für die *Szenendrehung*, nicht der Richtung im Grundriss. Bei
 * Halle 10.2 (längste Kante bei -60°) kamen dabei 194,8 x 197,1 m heraus
 * statt 174,5 x 145,5, also 17 x 17 = 289 Stützen in einer gegen die Halle
 * verdrehten Box. Die Zahlen oben stimmten trotzdem -- sie stammen aus einer
 * Rechnung von Hand. Erst diese Prüfung verbindet beide.
 */
describe('Halle 10.2 im Datensatz', () => {
  const halle = site.halls.find((h) => h.key === '10.2');

  it('liegt 174,5 m lang und 145,5 m breit', () => {
    const lage = hallenlage(halle!.footprint as [number, number][]);
    expect(lage).not.toBeNull();
    expect(lage!.laenge).toBeCloseTo(174.5, 0);
    expect(lage!.breite).toBeCloseTo(145.5, 0);
  });

  it('trägt damit 195 Rasterpunkte', () => {
    const lage = hallenlage(halle!.footprint as [number, number][])!;
    const laengs = rasterAchsen(lage.laenge);
    const quer = rasterAchsen(lage.breite);
    expect(laengs).toHaveLength(15);
    expect(quer).toHaveLength(13);
    expect(laengs.length * quer.length).toBe(195);
  });

  it('führt eine Längsachse, die senkrecht auf ihrer Querachse steht', () => {
    const lage = hallenlage(halle!.footprint as [number, number][])!;
    expect(lage.tx * lage.px + lage.ty * lage.py).toBeCloseTo(0, 9);
    expect(Math.hypot(lage.tx, lage.ty)).toBeCloseTo(1, 9);
  });
});

describe('Lichtleisten je Feld', () => {
  it('sind zu dritt', () => {
    expect(BAHNEN_JE_FELD).toBe(3);
    expect(bahnenImFeld()).toHaveLength(3);
  });

  it('liegen bei zwölf Metern auf 3, 6 und 9', () => {
    expect(bahnenImFeld()).toEqual([3, 6, 9]);
  });

  it('halten überall denselben Abstand, auch zu den Stützen', () => {
    const feld = RASTER_M;
    const bahnen = bahnenImFeld(feld);
    const abstaende = [
      bahnen[0] - 0,
      ...bahnen.slice(1).map((b, i) => b - bahnen[i]),
      feld - bahnen[bahnen.length - 1],
    ];
    for (const abstand of abstaende) expect(abstand).toBeCloseTo(3, 6);
  });
});
