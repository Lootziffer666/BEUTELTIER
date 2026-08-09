/**
 * Geprueft wird gegen die **echte** `boulevard.json` und nicht gegen einen
 * erfundenen Plan: der Gang ist gemessene Geometrie, und ein Test auf
 * ausgedachten Zahlen sagt nichts darueber, ob man dort laufen kann.
 */
import { describe, expect, it } from 'vitest';

import gemessen from '../../public/data/boulevard.json';
import type { BoulevardPlan } from '../data/load';
import {
  boulevardAchse,
  BODEN_Y,
  durchgangsbereiche,
  ohneDurchgaenge,
  TUER_VERSATZ_M,
} from './boulevard';
import { BoulevardSurfaces } from './boulevardSurfaces';
import { LEGACY_OPEN_OUTSIDE, WalkGrid } from './walk';
import {
  FlatSurfaceProvider,
  PrioritySurfaceProvider,
  TriangleSurfaceProvider,
  type TriangleSurface,
} from './surfaces';

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

describe('Aussengelaende', () => {
  const hoefe = plan.aussen ?? [];

  it('nennt bei P8 seine Nutzung waehrend der Messe', () => {
    const p8 = (plan.plaetze ?? []).find((platz) => platz.name === 'P8');
    expect(p8).toBeDefined();
    expect(p8!.art).toBe('parkplatz');
    expect(p8!.nutzung).toContain('F8');
  });

  it('kennt die beiden Hoefe zwischen den Hallen', () => {
    expect(hoefe.map((h) => h.id).sort()).toEqual(['hof-7_1-6_1', 'hof-8_1-7_1']);
  });

  it('fuehrt hinter Halle 8 kein eigenes Rechteck mehr', () => {
    // Der Aussenbereich dort ist die Freiflaeche F8 -- gemessen aus dem
    // amtlichen Ausstellerplan, mit zehn Ecken und einundzwanzig Staenden.
    // Ein daneben gerechnetes Rechteck hat ihr nur widersprochen.
    expect(hoefe.some((h) => h.id.startsWith('hinter-'))).toBe(false);
  });

  it('gibt jedem Hof einen Boden', () => {
    for (const hof of hoefe) {
      const s = (hof.vonM + hof.bisM) / 2;
      // Weit genug von der Wand weg, dass die Huelle nicht mehr greift.
      const q = (hof.qVonM + hof.qBisM) / 2;
      const fuss = fussAuf(s, q);
      expect(fuss.surfaceId).toBe(hof.id);
      expect(fuss.blocked).toBe(false);
      expect(fuss.z).toBe(0);
    }
  });

  it('liegt jeder Hof dort, wo der Gang Aussenflaeche meldet', () => {
    for (const hof of hoefe.filter((h) => h.seite === 'west')) {
      const mitte = (hof.vonM + hof.bisM) / 2;
      const abschnitt = plan.seiten.west.find((a) => a.von <= mitte && mitte <= a.bis);
      expect(abschnitt?.art).toBe('glas');
    }
  });

  it('laesst die Glaswand zwischen Gang und Hof trotzdem stehen', () => {
    const hof = hoefe.find((h) => h.id === 'hof-7_1-6_1')!;
    const s = (hof.vonM + hof.bisM) / 2;
    // Im Gang begehbar, unmittelbar dahinter Wand, weiter draussen der Hof.
    expect(fussAuf(s, plan.seitenQ.west - 0.5).surfaceId).toBe('boulevard:nord');
    expect(fussAuf(s, plan.seitenQ.west + 0.5).blocked).toBe(true);
    expect(fussAuf(s, plan.seitenQ.west + 20).surfaceId).toBe(hof.id);
  });

  it('sagt bei jeder Flaeche, ob die Tiefe gemessen oder vorgegeben ist', () => {
    for (const hof of hoefe) {
      expect(typeof hof.gekappt).toBe('boolean');
      expect(hof.endetAn.length).toBeGreaterThan(0);
      // Seit der Aussenbereich hinter Halle 8 ueber die Freiflaeche F8 laeuft,
      // endet jede hier gefuehrte Flaeche an Gebautem. Keine Vorgabe mehr.
      expect(hof.gekappt).toBe(false);
    }
  });
});

describe('Hallenzugaenge', () => {
  const tore = plan.durchgaenge ?? [];

  it('gibt jeder Halle am Gang mindestens einen Zugang', () => {
    const hallen = new Set(
      [...plan.seiten.ost, ...plan.seiten.west]
        .filter((a) => a.art === 'wand' && a.hallKey)
        .map((a) => a.hallKey!),
    );
    for (const halle of hallen) {
      expect(tore.some((tor) => tor.hallKey === halle)).toBe(true);
    }
  });

  it('laesst durch jeden Zugang hindurch', () => {
    for (const tor of tore) {
      const q = tor.seite === 'west' ? plan.seitenQ.west + 1 : plan.seitenQ.ost - 1;
      expect(fussAuf(tor.stationM, q).blocked).toBe(false);
    }
  });

  it('sperrt unmittelbar neben jedem Zugang', () => {
    for (const tor of tore) {
      const q = tor.seite === 'west' ? plan.seitenQ.west + 1 : plan.seitenQ.ost - 1;
      const daneben = tor.breiteM / 2 + 1;
      expect(fussAuf(tor.stationM + daneben, q).blocked).toBe(true);
      expect(fussAuf(tor.stationM - daneben, q).blocked).toBe(true);
    }
  });

  it('oeffnet nur die eigene Seite', () => {
    for (const tor of tore) {
      // Auf der Gegenseite derselben Station muss die Wand stehen bleiben.
      const gegen = tor.seite === 'west' ? plan.seitenQ.ost - 1 : plan.seitenQ.west + 1;
      const offen = tore.some((anderes) =>
        anderes.seite !== tor.seite
        && Math.abs(anderes.stationM - tor.stationM) < (anderes.breiteM + tor.breiteM) / 2);
      if (!offen) expect(fussAuf(tor.stationM, gegen).blocked).toBe(true);
    }
  });

  it('liegt jeder Zugang in der Fassade, aus der er abgeleitet ist', () => {
    for (const tor of tore) {
      expect(tor.stationM - tor.breiteM / 2).toBeGreaterThanOrEqual(tor.abschnittVonM);
      expect(tor.stationM + tor.breiteM / 2).toBeLessThanOrEqual(tor.abschnittBisM);
    }
  });

  it('gibt die Hallenzugaenge als abgeleitet zu erkennen', () => {
    const hallentore = tore.filter((tor) => tor.hallKey !== null);
    expect(hallentore.length).toBeGreaterThan(0);
    for (const tor of hallentore) expect(tor.gemessen).toBe(false);
  });

  it('fuehrt den Uebergang in den Knick dagegen als gemessen', () => {
    // Seine Breite steht im amtlichen Umriss -- es ist die Fuge, an der der
    // Baukoerper die Ostwand beruehrt. Nur die lichte Hoehe ist Vorgabe.
    const knick = tore.find((tor) => tor.id === 'tor-ost-nordknoten');
    expect(knick).toBeDefined();
    expect(knick!.gemessen).toBe(true);
    expect(knick!.hallKey).toBeNull();
    expect(knick!.breiteM).toBeGreaterThan(20);
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

/**
 * Wand und Kollision muessen dieselben Loecher haben.
 *
 * Beide lesen `plan.durchgaenge`, aber ueber verschiedene Wege: die Wand ueber
 * `durchgangsbereiche` + `ohneDurchgaenge`, die Kollision ueber die Huelle.
 * Laufen die auseinander, sieht man ein Tor und laeuft gegen Glas -- oder
 * umgekehrt.
 */
describe('Wandausschnitt und Kollision stimmen ueberein', () => {
  for (const seite of ['ost', 'west'] as const) {
    it(`deckt sich auf der ${seite}lichen Seite`, () => {
      const bereiche = durchgangsbereiche(plan, seite);
      const wand = ohneDurchgaenge(
        plan.seiten[seite]
          .filter((a) => a.art === 'wand')
          .map((a): [number, number] => [a.von, a.bis]),
        bereiche,
      );
      const q = seite === 'west' ? plan.seitenQ.west + 1 : plan.seitenQ.ost - 1;
      // Wo die gezeichnete Wand steht, muss die Kollision sperren.
      for (const [von, bis] of wand) {
        const mitte = (von + bis) / 2;
        expect(fussAuf(mitte, q).blocked).toBe(true);
      }
      // Und wo sie fehlt, muss man hindurchkommen.
      for (const [von, bis] of bereiche) {
        expect(fussAuf((von + bis) / 2, q).blocked).toBe(false);
      }
    });
  }
});

/**
 * Der Uebergang in den Knick am Nordende.
 *
 * Geprueft wird mit derselben Kette, die `load.ts` zusammensteckt -- der
 * Boulevard zuerst, dahinter die Flaechen. Nur so zeigt sich, ob die
 * Anschlussfuge wirklich durchlaessig ist: die Huelle des Gangs liegt genau
 * dort, und ohne die Oeffnung waere sie eine Wand.
 */
describe('Nordknoten', () => {
  const knoten = plan.nordknoten!;
  const kette = new PrioritySurfaceProvider([
    flaechen,
    new FlatSurfaceProvider([{
      id: knoten.id,
      polygon: knoten.polygon,
      z: knoten.bodenM,
      blocked: false,
      priority: 1,
    }]),
    LEGACY_OPEN_OUTSIDE,
  ]);
  const walk = new WalkGrid(2, [], [], kette);

  it('behaelt seine gerundete Fassade zum Messeplatz', () => {
    expect(knoten.polygon.length).toBeGreaterThan(20);
  });

  it('traegt einen Fussboden auf Gangniveau', () => {
    const [x, y] = ort(8, -20);
    const fuss = kette.footingAt(x, y, 0);
    expect(fuss.surfaceId).toBe(knoten.id);
    expect(fuss.blocked).toBe(false);
    expect(fuss.z).toBeCloseTo(knoten.bodenM, 6);
  });

  it('laesst einen aus dem Gang hinuebergehen', () => {
    const tor = (plan.durchgaenge ?? []).find((t) => t.id === 'tor-ost-nordknoten')!;
    const [x, y] = ort(tor.stationM, 0);
    // Nach Osten, also in Richtung fallender Quermasse.
    const richtung: [number, number] = [-achse.quer[0], -achse.quer[1]];
    let stand = { x, y, z: BODEN_Y };
    for (let i = 0; i < 150; i += 1) {
      stand = walk.move(stand, richtung[0] * 0.2, richtung[1] * 0.2);
    }
    const [, q] = flaechen.stationUndQuer(stand.x, stand.y);
    expect(q).toBeLessThan(plan.seitenQ.ost - 5);
  });

  it('haelt einen dort auf, wo keine Fuge ist', () => {
    // Weit suedlich der Anschlussfuge steht die Ostwand des Gangs.
    const [x, y] = ort(140, 0);
    const richtung: [number, number] = [-achse.quer[0], -achse.quer[1]];
    let stand = { x, y, z: BODEN_Y };
    for (let i = 0; i < 150; i += 1) {
      stand = walk.move(stand, richtung[0] * 0.2, richtung[1] * 0.2);
    }
    const [, q] = flaechen.stationUndQuer(stand.x, stand.y);
    expect(q).toBeGreaterThanOrEqual(plan.seitenQ.ost - 1e-6);
  });
});

/**
 * Das Aussengelaende zwischen Halle 9 und Halle 10.
 *
 * Drei Flaechen, aber eine Oberflaeche: Ebene 1 -> Schraege -> Ebene 0. Der
 * entscheidende Test ist nicht, ob jede fuer sich stimmt, sondern ob man ohne
 * Absatz und ohne Loch von der oberen auf die untere kommt.
 */
describe('Aussengelaende 9/10', () => {
  const aussen = plan.aussen9_10!;
  const kette = new PrioritySurfaceProvider([
    new TriangleSurfaceProvider(aussen.schraege.dreiecke.map((dreieck, index) => ({
      id: `${aussen.schraege.id}:${index}`,
      triangle: dreieck as unknown as TriangleSurface['triangle'],
      blocked: false,
    }))),
    new FlatSurfaceProvider([aussen.ebene1, aussen.ebene0].map((ebene) => ({
      id: ebene.id,
      polygon: ebene.polygon,
      z: ebene.hoeheM,
      blocked: false,
    }))),
  ]);
  const auf = (s: number, q: number) => {
    const [x, y] = ort(s, q);
    return kette.footingAt(x, y, 0);
  };

  it('legt die obere Ebene auf den Fussboden von Halle 10.2', () => {
    expect(aussen.ebene1.hoeheM).toBeCloseTo(7.45, 2);
    expect(auf(400, -120).z).toBeCloseTo(7.45, 2);
  });

  it('legt die untere Ebene auf Hallenniveau', () => {
    expect(aussen.ebene0.hoeheM).toBe(0);
    expect(auf(195, -180).z).toBeCloseTo(0, 6);
  });

  it('behaelt die vor Ort gemessene Hoehe als Zahl, auch wenn sie nicht gilt', () => {
    // Gemessen 8,33 m, gebaut 7,45 m nach den amtlichen Hallenboeden. Die
    // Abweichung darf nicht stillschweigend verschwinden.
    expect(aussen.schraege.hoeheGemessenM).toBeCloseTo(8.33, 2);
    expect(aussen.schraege.obenM - aussen.schraege.untenM).toBeCloseTo(7.45, 2);
  });

  it('faellt ueber die Schraege gleichmaessig ab', () => {
    const grenze = aussen.grenzeM;
    const lauf = aussen.schraege.laufM;
    const hoehen = [0, 0.25, 0.5, 0.75, 1].map(
      (teil) => auf(grenze - lauf * teil, -120).z,
    );
    for (let i = 1; i < hoehen.length; i += 1) {
      expect(hoehen[i]).toBeLessThan(hoehen[i - 1] + 1e-6);
    }
    expect(hoehen[0]).toBeCloseTo(7.45, 1);
    expect(hoehen[hoehen.length - 1]).toBeCloseTo(0, 1);
  });

  it('traegt zwischen oberer Ebene und unterer keinen Absatz und kein Loch', () => {
    // Von Sueden nach Norden durchgehen und auf Spruenge achten.
    let vorher: number | null = null;
    for (let s = aussen.ebene1.bisM - 1; s > aussen.ebene0.vonM + 1; s -= 1) {
      const fuss = auf(s, -120);
      expect(fuss.surfaceId).not.toBeNull();
      if (vorher !== null) expect(Math.abs(fuss.z - vorher)).toBeLessThan(0.2);
      vorher = fuss.z;
    }
  });

  it('schiebt die Platten unter die Hallenkanten', () => {
    expect(aussen.ueberlappM).toBeGreaterThan(0);
    // Ein Meter innerhalb der Grenze traegt die obere Ebene noch.
    expect(auf(aussen.grenzeM + 1, -120).z).toBeCloseTo(7.45, 2);
  });
});
