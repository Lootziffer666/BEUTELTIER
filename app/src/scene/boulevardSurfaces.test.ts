/**
 * Geprueft wird gegen die **echte** `boulevard.json` und nicht gegen einen
 * erfundenen Plan: der Gang ist gemessene Geometrie, und ein Test auf
 * ausgedachten Zahlen sagt nichts darueber, ob man dort laufen kann.
 */
import { describe, expect, it } from 'vitest';

import gemessen from '../../public/data/boulevard.json';
import type { BoulevardPlan } from '../data/load';
import { boulevardAchse, BODEN_Y, TUER_VERSATZ_M } from './boulevard';
import { BoulevardSurfaces } from './boulevardSurfaces';
import { LEGACY_OPEN_OUTSIDE, WalkGrid } from './walk';
import { PrioritySurfaceProvider } from './surfaces';

// Der JSON-Import kommt als weit gefasster Typ herein ("art" ist dort jeder
// String); dass die Datei wirklich zum Schema passt, prueft der Ladepfad.
const plan = gemessen as unknown as BoulevardPlan;
const achse = boulevardAchse({ boulevard: plan })!;
const flaechen = new BoulevardSurfaces(plan, achse);

/** Station und Quermass zurueck in Geländemeter -- die Umkehrung des Gebers. */
function ort(s: number, q: number): [number, number] {
  return [
    achse.x0 + achse.laengs[0] * s + achse.quer[0] * q,
    achse.y0 + achse.laengs[1] * s + achse.quer[1] * q,
  ];
}

function fussAuf(s: number, q: number, preferZ = 0) {
  const [x, y] = ort(s, q);
  return flaechen.footingAt(x, y, preferZ);
}

describe('Achsenrechnung', () => {
  it('kommt bei der Umkehrung wieder heraus, wo sie hergekommen ist', () => {
    for (const [s, q] of [[0, 0], [140, -5.5], [340, -20], [470, 3]] as const) {
      const [x, y] = ort(s, q);
      const [zurueck, quer] = flaechen.stationUndQuer(x, y);
      expect(zurueck).toBeCloseTo(s, 6);
      expect(quer).toBeCloseTo(q, 6);
    }
  });
});

describe('Nordgang', () => {
  it('traegt in der Mitte einen Fussboden', () => {
    const fuss = fussAuf(140, 0);
    expect(fuss.blocked).toBe(false);
    expect(fuss.z).toBeCloseTo(BODEN_Y, 6);
    expect(fuss.surfaceId).toBe('boulevard:nord');
  });

  it('laesst einen an beiden Laengswaenden nicht hinaus', () => {
    // Knapp innerhalb ist Gang, knapp ausserhalb ist Wand.
    expect(fussAuf(140, plan.seitenQ.west - 0.5).blocked).toBe(false);
    expect(fussAuf(140, plan.seitenQ.ost + 0.5).blocked).toBe(false);
    expect(fussAuf(140, plan.seitenQ.west + 0.5).blocked).toBe(true);
    expect(fussAuf(140, plan.seitenQ.ost - 0.5).blocked).toBe(true);
  });

  it('endet im Norden an der Stirn von Halle 8', () => {
    expect(fussAuf(1, 0).blocked).toBe(false);
    expect(fussAuf(-1, 0).blocked).toBe(true);
  });
});

describe('Freitreppe', () => {
  it('steigt von unten nach oben', () => {
    const treppe = plan.treppe!;
    const oben = plan.sued!.obenM!;
    const fuss = fussAuf(treppe.vonM + 0.5, 0);
    const kopf = fussAuf(treppe.bisM - 0.5, 0);
    expect(fuss.blocked).toBe(false);
    expect(kopf.blocked).toBe(false);
    expect(fuss.z).toBeLessThan(1);
    expect(kopf.z).toBeGreaterThan(oben - 1);
    expect(kopf.z).toBeLessThanOrEqual(oben + 1e-9);
  });

  it('steigt gleichmaessig und nicht in einem Satz', () => {
    const treppe = plan.treppe!;
    const mitte = fussAuf((treppe.vonM + treppe.bisM) / 2, 0);
    expect(mitte.z).toBeGreaterThan(2);
    expect(mitte.z).toBeLessThan(6);
  });

  it('traegt neben ihrem Lauf nichts -- dort ist gesperrt, nicht Hoehe null', () => {
    const treppe = plan.treppe!;
    const s = (treppe.vonM + treppe.bisM) / 2;
    expect(fussAuf(s, 6).blocked).toBe(true);
    expect(fussAuf(s, -6).blocked).toBe(true);
  });
});

describe('Stirnwand am Uebergang Nord/Sued', () => {
  const s = plan.treppe!.bisM;

  it('haelt an, wo Glas steht', () => {
    expect(fussAuf(s, 8).blocked).toBe(true);
    expect(fussAuf(s, -20).blocked).toBe(true);
  });

  it('laesst durch beide Tueren hindurch', () => {
    for (const mitte of [-TUER_VERSATZ_M, TUER_VERSATZ_M]) {
      expect(fussAuf(s, mitte).blocked).toBe(false);
    }
  });

  it('sperrt den Pfeiler zwischen den beiden Tueren', () => {
    expect(fussAuf(s, 0).blocked).toBe(true);
  });
});

describe('Suedteil und Suedknoten', () => {
  it('liegt eine Ebene hoeher', () => {
    const fuss = fussAuf(340, -20);
    expect(fuss.blocked).toBe(false);
    expect(fuss.z).toBeCloseTo(plan.sued!.obenM!, 6);
  });

  it('faellt ueber den Querriegel auf dessen gezaehlte Hoehe', () => {
    const riegel = plan.knoten!.riegel;
    const fuss = fussAuf((riegel.vonM + riegel.bisM) / 2, -10);
    expect(fuss.blocked).toBe(false);
    expect(fuss.z).toBeCloseTo(riegel.hoeheM, 6);
  });

  it('senkt sich ueber die Passage zur Piazza', () => {
    const knoten = plan.knoten!;
    const anfang = fussAuf(knoten.riegel.bisM + 1, -10);
    const ende = fussAuf(knoten.piazzaVonM - 1, -10);
    expect(anfang.z).toBeGreaterThan(ende.z);
    expect(ende.z).toBeCloseTo(knoten.piazzaHoeheM, 1);
  });

  it('endet am Bauzaun vor der Piazza', () => {
    const knoten = plan.knoten!;
    expect(fussAuf(knoten.piazzaVonM - 1, -10).blocked).toBe(false);
    expect(fussAuf(knoten.piazzaVonM + 1, -10).blocked).toBe(true);
  });

  it('laesst zwischen Treppe und Suedteil kein Loch im Boden', () => {
    // Der Plan nennt zwei Stationen, die sich um gut einen halben Meter
    // unterscheiden: das Ende der Treppe (303,8) und den Anfang des Suedteils
    // (304,47). Dazwischen darf kein Stueck ohne Boden liegen -- ueberall muss
    // ein Abschnitt zustaendig sein und eine Hoehe nennen.
    const treppe = plan.treppe!;
    const sued = plan.sued!;
    for (let s = treppe.bisM + 0.05; s < sued.vonM + 0.5; s += 0.1) {
      const fuss = fussAuf(s, -20);
      expect(fuss.surfaceId).not.toBeNull();
      expect(fuss.z).toBeCloseTo(sued.obenM!, 6);
    }
  });

  it('gibt hinter der Stirnwand den Suedteil frei', () => {
    // Direkt an der Wand haelt es an, einen Meter weiter geht es weiter.
    const s = plan.treppe!.bisM;
    expect(fussAuf(s + 1, -20).blocked).toBe(false);
    expect(fussAuf(s + 1, -20).surfaceId).toBe('boulevard:sued');
  });
});

/**
 * Der eigentliche Beweis.
 *
 * Die Abschnitte einzeln zu pruefen sagt noch nicht, ob der Besucher stehen
 * bleibt: Laufen geht ueber `WalkGrid.move`, und das gleitet an Hindernissen
 * entlang. Hier laeuft deshalb wirklich jemand -- ohne Hallengitter, damit
 * ausschliesslich der Boulevard antwortet.
 */
describe('Laufen', () => {
  const walk = new WalkGrid(
    2,
    [],
    [],
    new PrioritySurfaceProvider([flaechen, LEGACY_OPEN_OUTSIDE]),
  );

  /** Schrittweise laufen, wie es die Ego-Perspektive tut. */
  function laufen(von: { x: number; y: number; z: number },
                  richtung: [number, number], meter: number) {
    const schritte = Math.ceil(meter / 0.2);
    let stand = von;
    for (let i = 0; i < schritte; i += 1) {
      stand = walk.move(stand, richtung[0] * 0.2, richtung[1] * 0.2);
    }
    return stand;
  }

  /** Einheitsvektor quer zur Achse, in Richtung Westen. */
  const nachWesten: [number, number] = [achse.quer[0], achse.quer[1]];
  const nachSueden: [number, number] = [achse.laengs[0], achse.laengs[1]];

  it('bleibt an der Laengswand stehen statt hindurchzugehen', () => {
    const [x, y] = ort(140, 0);
    const ziel = laufen({ x, y, z: BODEN_Y }, nachWesten, 30);
    const [, q] = flaechen.stationUndQuer(ziel.x, ziel.y);
    expect(q).toBeLessThanOrEqual(plan.seitenQ.west + 1e-6);
  });

  it('geht den Gang entlang bis vor die Treppe', () => {
    const [x, y] = ort(10, 0);
    const ziel = laufen({ x, y, z: BODEN_Y }, nachSueden, 200);
    const [s] = flaechen.stationUndQuer(ziel.x, ziel.y);
    expect(s).toBeGreaterThan(200);
  });

  it('steigt ueber die Treppe auf die obere Ebene', () => {
    const treppe = plan.treppe!;
    const [x, y] = ort(treppe.vonM - 5, 0);
    const ziel = laufen({ x, y, z: BODEN_Y }, nachSueden, 24);
    expect(ziel.z).toBeGreaterThan(6);
  });

  it('kommt durch die Tuer in den Suedteil', () => {
    // Auf der Achse der linken Tuer die Treppe hinauf und hindurch.
    const treppe = plan.treppe!;
    const [x, y] = ort(treppe.vonM - 2, TUER_VERSATZ_M);
    const ziel = laufen({ x, y, z: BODEN_Y }, nachSueden, 30);
    const [s] = flaechen.stationUndQuer(ziel.x, ziel.y);
    expect(s).toBeGreaterThan(treppe.bisM + 1);
    expect(ziel.z).toBeCloseTo(plan.sued!.obenM!, 6);
  });

  it('kommt neben der Tuer nicht durch die Front', () => {
    const treppe = plan.treppe!;
    // Zwischen den beiden Tueren steht der Pfeiler.
    const [x, y] = ort(treppe.vonM - 2, 0);
    const ziel = laufen({ x, y, z: BODEN_Y }, nachSueden, 30);
    const [s] = flaechen.stationUndQuer(ziel.x, ziel.y);
    expect(s).toBeLessThan(treppe.bisM);
  });
});

describe('Zustaendigkeit', () => {
  it('sagt weit weg vom Gang nichts', () => {
    expect(fussAuf(140, 300).surfaceId).toBeNull();
    expect(fussAuf(-500, 0).surfaceId).toBeNull();
  });

  it('laesst das uebrige Gelaende begehbar wie bisher', () => {
    const aussen = new PrioritySurfaceProvider([flaechen, LEGACY_OPEN_OUTSIDE]);
    const [x, y] = ort(140, 300);
    const fuss = aussen.footingAt(x, y, 0);
    expect(fuss.blocked).toBe(false);
    expect(fuss.surfaceId).toBe('legacy-open-outside');
  });

  it('sperrt die Waende auch in der Kette mit dem alten Aussenraum', () => {
    const aussen = new PrioritySurfaceProvider([flaechen, LEGACY_OPEN_OUTSIDE]);
    const [x, y] = ort(140, plan.seitenQ.west + 0.5);
    expect(aussen.footingAt(x, y, 0).blocked).toBe(true);
  });
});
