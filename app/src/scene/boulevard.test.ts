import { describe, expect, it } from 'vitest';

import {
  glasfelder,
  TUER_BREITE_M,
  TUER_PROFIL_M,
  TUER_VERSATZ_M,
} from './boulevard';

/** Die lichte Oeffnung, so wie die Suedwand sie rechnet. */
const OEFFNUNG_HALB = TUER_BREITE_M / 2 + TUER_PROFIL_M / 2;

describe('glasfelder', () => {
  it('laesst zwischen zwei Tueren drei Felder stehen', () => {
    const felder = glasfelder(45.26, [-TUER_VERSATZ_M, TUER_VERSATZ_M], OEFFNUNG_HALB);
    expect(felder).toHaveLength(3);
  });

  it('setzt die Feldkanten genau an die Tueroeffnungen', () => {
    const felder = glasfelder(45.26, [-TUER_VERSATZ_M, TUER_VERSATZ_M], OEFFNUNG_HALB);
    const [links, mitte, rechts] = felder;
    expect(links[1]).toBeCloseTo(-TUER_VERSATZ_M - OEFFNUNG_HALB, 6);
    expect(mitte[0]).toBeCloseTo(-TUER_VERSATZ_M + OEFFNUNG_HALB, 6);
    expect(mitte[1]).toBeCloseTo(TUER_VERSATZ_M - OEFFNUNG_HALB, 6);
    expect(rechts[0]).toBeCloseTo(TUER_VERSATZ_M + OEFFNUNG_HALB, 6);
  });

  it('reicht von Wandkante zu Wandkante', () => {
    const breite = 45.26;
    const felder = glasfelder(breite, [-TUER_VERSATZ_M, TUER_VERSATZ_M], OEFFNUNG_HALB);
    expect(felder[0][0]).toBeCloseTo(-breite / 2, 6);
    expect(felder[felder.length - 1][1]).toBeCloseTo(breite / 2, 6);
  });

  it('laesst kein Feld mit negativer Breite entstehen', () => {
    // Tueren so dicht nebeneinander, dass sich die Oeffnungen ueberschneiden.
    const felder = glasfelder(20, [-0.5, 0.5], OEFFNUNG_HALB);
    for (const [von, bis] of felder) expect(bis).toBeGreaterThan(von);
    expect(felder).toHaveLength(2);
  });

  it('deckt zusammen mit den Oeffnungen die ganze Breite ab', () => {
    const breite = 45.26;
    const versatze = [-TUER_VERSATZ_M, TUER_VERSATZ_M];
    const felder = glasfelder(breite, versatze, OEFFNUNG_HALB);
    const glas = felder.reduce((summe, [von, bis]) => summe + (bis - von), 0);
    expect(glas + versatze.length * 2 * OEFFNUNG_HALB).toBeCloseTo(breite, 6);
  });
});
