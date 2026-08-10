import { describe, expect, it } from 'vitest';

import { BAHNEN_JE_FELD, RASTER_M, bahnenImFeld, rasterAchsen } from './interior';

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
