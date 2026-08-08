/**
 * Der Boden und die Waende des Boulevards -- als Kollision.
 *
 * Bisher trug der Gang gar keine: `WalkGrid` kennt nur die Hallengitter, und
 * wo keines liegt, hat `LEGACY_OPEN_OUTSIDE` alles auf Hoehe null durchgelassen.
 * Man lief deshalb quer durch Glasfassaden, stand auf der oberen Ebene sieben
 * Meter unter dem Fussboden und ging die Treppe hinauf, ohne zu steigen.
 *
 * Gerechnet wird nicht in x/y, sondern in **Station und Quermass** -- denselben
 * beiden Zahlen, aus denen `boulevard.tsx` den Gang zeichnet. Der Boulevard ist
 * in diesen Koordinaten eine Folge von Rechtecken, und ein Rechteck laesst sich
 * mit zwei Vergleichen pruefen. Ein Polygonnetz waere hier der Umweg, auf dem
 * die Zahlen auseinanderlaufen: gezeichnet wird aus dem Plan, und geprueft
 * werden muss gegen dasselbe.
 *
 * Aufbau:
 *
 * - Innerhalb eines Abschnitts steht man auf dessen Fussboden.
 * - Dicht ausserhalb aller Abschnitte ist gesperrt -- das ist die Huelle:
 *   Laengswaende, die Stirn von Halle 8 im Norden, der Bauzaun im Sueden.
 * - Weiter draussen sagt dieser Geber nichts; dort gilt weiter, was bisher galt.
 *
 * Die Stirnwand am Uebergang Nord/Sued ist der einzige Sonderfall: sie steht
 * **zwischen** zwei begehbaren Abschnitten und braucht darum ihre beiden
 * Tueroeffnungen. Sie stammen aus denselben Konstanten wie die gezeichnete
 * Front.
 */

import type { BoulevardPlan } from '../data/load';
import {
  type Achse,
  BODEN_Y,
  TREPPE_BREITE_M,
  TUER_OEFFNUNG_HALB_M,
  TUER_VERSATZ_M,
} from './boulevard';
import { BLOCKED_FOOTING, type SurfaceFooting, type SurfaceProvider } from './surfaces';

/**
 * Wie dick die Aussenhuelle sperrt.
 *
 * Sie liegt ganz ausserhalb des begehbaren Bereichs und kostet darum keinen
 * Zentimeter Gang. Grosszuegig, weil `WalkGrid.move` den Weg nicht abtastet,
 * sondern nur das Ziel prueft: bei wenigen Bildern je Sekunde ist ein Schritt
 * schnell ueber einen Meter lang, und eine duenne Wand waere dann keine.
 */
const HUELLE_M = 2.5;

/** Die Stirnwand steht zwischen zwei Raeumen -- hier kostet Dicke Flaeche. */
const STIRNWAND_M = 0.6;

interface Abschnitt {
  id: string;
  vonM: number;
  bisM: number;
  qOst: number;
  qWest: number;
  /** Fussbodenhoehe an dieser Station -- fuer Rampen von der Station abhaengig. */
  hoehe: (s: number) => number;
}

interface Querwand {
  id: string;
  stationM: number;
  dickeM: number;
  qOst: number;
  qWest: number;
  /** Quermasse, an denen man hindurchgeht. */
  oeffnungen: [number, number][];
}

/** Lineare Rampe zwischen zwei Stationen. */
function rampe(vonM: number, bisM: number, unten: number, oben: number) {
  const lauf = Math.max(1e-6, bisM - vonM);
  return (s: number) => unten + (oben - unten) * Math.min(1, Math.max(0, (s - vonM) / lauf));
}

/**
 * Die Abschnitte des Boulevards, laengs aneinandergereiht.
 *
 * Sie ueberlappen sich bewusst nicht: jede Station gehoert genau einem
 * Abschnitt, und damit ist die Fussbodenhoehe an jeder Stelle eindeutig. Wo
 * der Plan zwei Angaben macht, die sich um einen halben Meter unterscheiden --
 * das Ende der Treppe und der Anfang des Suedteils --, wird die Luecke
 * geschlossen und nicht offen gelassen; ein Loch im Boden waere das Schlimmere.
 */
export function abschnitteAusPlan(plan: BoulevardPlan): Abschnitt[] {
  const out: Abschnitt[] = [];
  const qOstNord = plan.seitenQ.ost;
  const qWestNord = plan.seitenQ.west;

  out.push({
    id: 'boulevard:nord',
    vonM: 0,
    bisM: plan.laengeM,
    qOst: qOstNord,
    qWest: qWestNord,
    hoehe: () => BODEN_Y,
  });

  const sued = plan.sued;
  const treppe = plan.treppe;
  if (!treppe || !sued || sued.obenM === null) return out;
  const oben = sued.obenM;

  // Die Freitreppe: nur so breit wie gebaut. Neben ihr ist nichts, und nichts
  // heisst hier gesperrt und nicht "Hoehe null" -- sonst faellt man sieben
  // Meter tief in einen Schacht, den es gar nicht gibt.
  out.push({
    id: 'boulevard:treppe',
    vonM: treppe.vonM,
    bisM: treppe.bisM,
    qOst: -TREPPE_BREITE_M / 2,
    qWest: TREPPE_BREITE_M / 2,
    hoehe: rampe(treppe.vonM, treppe.bisM, treppe.untenM + BODEN_Y, oben),
  });

  const knoten = plan.knoten;
  // Ohne Knoten reicht der Suedteil so weit, wie ihn der Plan fuehrt.
  const suedBis = knoten ? knoten.riegel.vonM - knoten.treppeM : sued.bisM;
  out.push({
    id: 'boulevard:sued',
    vonM: treppe.bisM,
    bisM: suedBis,
    qOst: sued.seitenQ.ost,
    qWest: sued.seitenQ.west,
    hoehe: () => oben,
  });

  if (!knoten) return out;
  const riegel = knoten.riegel;
  out.push({
    id: 'boulevard:knoten-treppe',
    vonM: riegel.vonM - knoten.treppeM,
    bisM: riegel.vonM,
    qOst: sued.seitenQ.ost,
    qWest: sued.seitenQ.west,
    hoehe: rampe(riegel.vonM - knoten.treppeM, riegel.vonM, oben, riegel.hoeheM),
  });
  out.push({
    id: 'boulevard:riegel',
    vonM: riegel.vonM,
    bisM: riegel.bisM,
    qOst: sued.seitenQ.ost,
    qWest: sued.seitenQ.west,
    hoehe: () => riegel.hoeheM,
  });
  out.push({
    id: 'boulevard:passage',
    vonM: riegel.bisM,
    bisM: knoten.piazzaVonM,
    qOst: sued.seitenQ.ost,
    qWest: sued.seitenQ.west,
    hoehe: rampe(riegel.bisM, knoten.piazzaVonM, riegel.hoeheM, knoten.piazzaHoeheM),
  });
  return out;
}

/**
 * Die Querwaende mit ihren Oeffnungen.
 *
 * Bisher nur die verglaste Stirnwand am Kopf der Treppe. Ihre beiden
 * Doppeltueren sind dieselben, die auch gezeichnet werden -- die Konstanten
 * stehen in `boulevard.tsx` und werden hier nur eingesetzt.
 */
export function querwaendeAusPlan(plan: BoulevardPlan): Querwand[] {
  const sued = plan.sued;
  const treppe = plan.treppe;
  if (!treppe || !sued || sued.obenM === null) return [];
  return [{
    id: 'boulevard:stirnwand-sued',
    stationM: treppe.bisM,
    dickeM: STIRNWAND_M,
    qOst: sued.seitenQ.ost,
    qWest: sued.seitenQ.west,
    oeffnungen: [-TUER_VERSATZ_M, TUER_VERSATZ_M].map((mitte) =>
      [mitte - TUER_OEFFNUNG_HALB_M, mitte + TUER_OEFFNUNG_HALB_M] as [number, number]),
  }];
}

/**
 * Das Aussengelaende neben dem Gang.
 *
 * Dieselben Rechtecke wie die Abschnitte, aber eine Stufe spaeter gefragt:
 * die Hoefe stossen unmittelbar an die Laengswand, und wer sie zusammen mit
 * dem Gang abfragte, machte damit die Glasfassade begehbar. Erst Gang, dann
 * Huelle, dann Hof -- in dieser Reihenfolge bleibt die Wand eine Wand und der
 * Hof trotzdem ein Boden.
 */
export function aussenAusPlan(plan: BoulevardPlan): Abschnitt[] {
  return (plan.aussen ?? []).map((flaeche) => ({
    id: flaeche.id,
    vonM: flaeche.vonM,
    bisM: flaeche.bisM,
    qOst: Math.min(flaeche.qVonM, flaeche.qBisM),
    qWest: Math.max(flaeche.qVonM, flaeche.qBisM),
    // Gelaendehoehe. Draussen fuehrt das Projekt bislang keine Hoehen; null
    // ist dasselbe, was der alte Aussenraum liefert, und damit kein Bruch.
    hoehe: () => 0,
  }));
}

export class BoulevardSurfaces implements SurfaceProvider {
  private readonly achse: Achse;
  private readonly abschnitte: readonly Abschnitt[];
  private readonly querwaende: readonly Querwand[];
  private readonly aussen: readonly Abschnitt[];

  constructor(plan: BoulevardPlan, achse: Achse) {
    this.achse = achse;
    this.abschnitte = abschnitteAusPlan(plan);
    this.querwaende = querwaendeAusPlan(plan);
    this.aussen = aussenAusPlan(plan);
  }

  /**
   * Geländemeter -> Station und Quermass.
   *
   * `laengs` und `quer` stehen senkrecht aufeinander und sind Einheitsvektoren
   * -- die Umkehrung ist deshalb dasselbe Skalarprodukt und keine Matrix.
   */
  stationUndQuer(x: number, y: number): [number, number] {
    const dx = x - this.achse.x0;
    const dy = y - this.achse.y0;
    return [
      dx * this.achse.laengs[0] + dy * this.achse.laengs[1],
      dx * this.achse.quer[0] + dy * this.achse.quer[1],
    ];
  }

  footingAt(x: number, y: number, _preferZ: number): SurfaceFooting {
    const [s, q] = this.stationUndQuer(x, y);

    for (const teil of this.abschnitte) {
      if (s < teil.vonM || s > teil.bisM) continue;
      if (q < teil.qOst || q > teil.qWest) continue;
      // Eine Querwand steht im Weg, sofern man nicht gerade durch eine ihrer
      // Tueren geht.
      for (const wand of this.querwaende) {
        if (Math.abs(s - wand.stationM) > wand.dickeM / 2) continue;
        if (q < wand.qOst || q > wand.qWest) continue;
        const offen = wand.oeffnungen.some(([von, bis]) => q >= von && q <= bis);
        if (!offen) return { z: teil.hoehe(s), blocked: true, surfaceId: wand.id };
      }
      return { z: teil.hoehe(s), blocked: false, surfaceId: teil.id };
    }

    // Nicht drin, aber dicht daneben: das ist die Huelle.
    for (const teil of this.abschnitte) {
      if (s < teil.vonM - HUELLE_M || s > teil.bisM + HUELLE_M) continue;
      if (q < teil.qOst - HUELLE_M || q > teil.qWest + HUELLE_M) continue;
      return { ...BLOCKED_FOOTING, surfaceId: `${teil.id}:huelle` };
    }

    // Erst jenseits der Wand kommen die Hoefe.
    for (const hof of this.aussen) {
      if (s < hof.vonM || s > hof.bisM) continue;
      if (q < hof.qOst || q > hof.qWest) continue;
      return { z: hof.hoehe(s), blocked: false, surfaceId: hof.id };
    }

    // Weit weg vom Gang -- hier hat dieser Geber nichts zu sagen.
    return { z: 0, blocked: false, surfaceId: null };
  }
}
