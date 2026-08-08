/**
 * Der Nordboulevard.
 *
 * Er ist keine Halle, sondern der Gang, der sie erschliesst: knapp 15 m breit,
 * 11 m hoch, im Wesentlichen Nord-Sued. Die Hallen 5, 6, 7, 9 und 10 docken
 * mit ihrer **kurzen** Seite seitlich an -- ihre Tiefe laeuft vom Boulevard
 * weg. Halle 8 ist die Ausnahme: sie liegt am Ende und stellt sich mit ihrer
 * **langen** Seite quer davor, ein T-Abschluss.
 *
 * Wo er genau liegt, wird hier **nicht** gerechnet. Es steht in
 * `boulevard.json`, gemessen von `tools/build_boulevard.py` aus den amtlichen
 * Gebaeudeumrissen des LoD2-Modells: Achse, Breite, und je Seite die Folge
 * der Abschnitte mit der Angabe, ob dort eine Wand steht oder Glas.
 *
 * Der Umweg ueber die Messung hat einen Grund. Abgeleitet aus
 * `registered-site.json` kam der Gang falsch heraus -- diese Datei fuehrt die
 * **belegte** Hallenflaeche und nicht den Gebaeudeumriss, und die beiden
 * Gebaeude zwischen Halle 9 und Halle 8 fehlen dort ganz, weil in ihnen keine
 * Messestaende liegen.
 *
 * Halle 5 und Halle 10 liegen jenseits der gebauten Laenge und gehoeren damit
 * zur Fortsetzung, die hier noch nicht gebaut ist.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import type { BoulevardAbschnitt, BoulevardPlan, Dataset } from '../data/load';
import {
  boulevarddeckeSurface,
  disposeSurface,
  facadeSurface,
  glasfassadeSurface,
  hallenbodenSurface,
  WELT_KACHEL_M,
} from './materials';
import { ArchitectureGenerator } from '../procedural/generators/ArchitectureGenerator';

/**
 * Fussbodenhoehe.
 *
 * Der Boulevard hat kein eigenes Wegenetz; draussen laeuft die Kollision auf
 * Hoehe null. Laege sein Boden auf Hallenniveau, stuende der Besucher einen
 * halben Meter darin. Der halbe Meter Versatz zur Halle faellt weniger auf
 * als eine Augenhoehe von 1,20 m.
 */
export const BODEN_Y = 0.02;

/** Breite des Oberlichtbands in der Mitte. */
const OBERLICHT_BREITE_M = 6.4;

/**
 * Wo der Boulevard liegt.
 *
 * Nichts davon wird hier gerechnet -- `tools/build_boulevard.py` misst es aus
 * den amtlichen Gebaeudeumrissen und legt es als `boulevard.json` ab. Diese
 * Datei ist die einzige Quelle; fehlt sie, wird kein Boulevard gebaut.
 */
export interface Achse {
  /** Station 0 auf der Mittelachse, in Geländemetern. */
  x0: number;
  y0: number;
  /** Einheitsvektoren laengs (wachsende Station) und quer. */
  laengs: [number, number];
  quer: [number, number];
}

export function boulevardAchse(data: Pick<Dataset, 'boulevard'>): Achse | null {
  const plan = data.boulevard;
  if (!plan) return null;
  return {
    x0: plan.achse.x0,
    y0: plan.achse.y0,
    laengs: plan.achse.laengs,
    quer: plan.achse.quer,
  };
}

/** Die Wandabschnitte einer Seite, getrennt nach massiv und verglast. */
export function abschnitte(
  seite: BoulevardAbschnitt[],
): { massiv: [number, number][]; glas: [number, number][] } {
  return {
    massiv: seite.filter((s) => s.art === 'wand').map((s) => [s.von, s.bis]),
    glas: seite.filter((s) => s.art === 'glas').map((s) => [s.von, s.bis]),
  };
}

/**
 * Ein Band aus Vierecken entlang des Boulevards.
 *
 * Dach, Oberlicht und beide Wände sind dasselbe Bauteil in vier Ausprägungen:
 * eine Folge von Stationen, an jeder zwei Punkte. Direkt in Szenenkoordinaten
 * gerechnet -- eine Drehung als Euler-Winkel wäre bei geneigtem Dach die
 * Fehlerquelle, die man hinterher nicht mehr findet.
 */
function band(
  achse: Achse,
  centre: [number, number],
  punkte: (s: number) => [[number, number], [number, number]],
  kachelM: number,
  stuecke: [number, number][],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];

  const ort = (s: number, q: number, h: number): [number, number, number] => {
    const x = achse.x0 + achse.laengs[0] * s + achse.quer[0] * q;
    const y = achse.y0 + achse.laengs[1] * s + achse.quer[1] * q;
    return [x - centre[0], h, -(y - centre[1])];
  };

  for (const [s0, s1] of stuecke) {
    const [a0, a1] = punkte(s0);
    const [b0, b1] = punkte(s1);
    const ecken = [
      { p: ort(s0, a0[0], a0[1]), uv: [s0 / kachelM, a0[0] / kachelM] },
      { p: ort(s0, a1[0], a1[1]), uv: [s0 / kachelM, a1[0] / kachelM] },
      { p: ort(s1, b1[0], b1[1]), uv: [s1 / kachelM, b1[0] / kachelM] },
      { p: ort(s1, b0[0], b0[1]), uv: [s1 / kachelM, b0[0] / kachelM] },
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      positions.push(...ecken[index].p);
      uvs.push(ecken[index].uv[0], ecken[index].uv[1]);
    }
  }
  if (!positions.length) return new THREE.BufferGeometry();

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function kachel(quelle: THREE.Texture | undefined, wiederholung = 1) {
  if (!quelle) return null;
  const kopie = quelle.clone();
  kopie.wrapS = THREE.RepeatWrapping;
  kopie.wrapT = THREE.RepeatWrapping;
  kopie.repeat.set(wiederholung, wiederholung);
  kopie.needsUpdate = true;
  return kopie;
}

/**
 * Die abgehängten Wegweiser -- das Erkennungszeichen des Boulevards.
 *
 * Auf dem Referenzfoto ist nicht die Decke und nicht der Boden das, was den
 * Nordboulevard unverwechselbar macht, sondern die Reihe weisser Tafeln über
 * dem Gang: oben ein grünes Feld mit dem Fernziel, darunter die Hallen mit
 * grünem Pfeil. Wer den Gang betritt, liest sie, bevor er irgendetwas
 * anderes wahrnimmt.
 *
 * Angeschrieben wird, was tatsächlich dort abgeht -- und zwar **gerechnet**,
 * nicht eingetragen: welche Halle an welcher Station links und welche rechts
 * liegt, steht gemessen in `boulevard.json`. Ein von Hand beschriftetes Schild
 * widerspricht der Geometrie frueher oder spaeter; dieses kann es nicht.
 *
 * Jede Tafel hat zwei Gesichter. Links und rechts hängen an der Gehrichtung,
 * also zeigt die eine Seite etwas anderes als die andere -- eine Tafel mit
 * demselben Bild auf beiden Seiten ist für eine der beiden Richtungen falsch.
 */
export interface Wegweiser {
  /** Meter vom Anfang (Stirnseite Halle 8). */
  station: number;
  kopf: string;
  kopfKlein: string;
  zeilen: { text: string; pfeil: 'links' | 'rechts' | 'geradeaus' }[];
  /** +1 = die Tafel schaut dem entgegen, der Richtung Süden geht. */
  blick: 1 | -1;
}

/**
 * Liegt die Ostseite links, wenn man Richtung Süden geht?
 *
 * Wird ausgerechnet und nicht angenommen: Die Geländedaten liegen in einer
 * gespiegelten Ebene, und in einer gespiegelten Ebene vertauschen sich links
 * und rechts. Wer das im Kopf macht, vertauscht es.
 */
function ostLiegtLinks(achse: Achse): boolean {
  // Vorwärts (wachsende Station) in Szenenkoordinaten.
  const vx = achse.laengs[0];
  const vz = -achse.laengs[1];
  // Links = Hochachse × vorwärts.
  const lx = vz;
  const lz = -vx;
  // Die Ostseite liegt bei negativem q.
  const ox = -achse.quer[0];
  const oz = achse.quer[1];
  return lx * ox + lz * oz > 0;
}

/** Die nächste Halle auf einer Seite, von einer Station aus gesehen. */
function naechsteHalle(
  seite: BoulevardAbschnitt[],
  station: number,
  vor: 1 | -1,
): string | null {
  const voraus = seite
    .filter((s) => s.hallKey && (vor > 0 ? s.bis > station : s.von < station))
    .sort((a, b) => (vor > 0 ? a.von - b.von : b.von - a.von));
  return voraus.length ? voraus[0].hallKey!.split('.')[0] : null;
}

/**
 * Die Tafeln, aus dem gemessenen Plan abgeleitet.
 *
 * Drei Standorte über die Länge verteilt, jeder mit zwei Gesichtern. Oben das
 * Fernziel in Gehrichtung -- im Norden Halle 8, im Süden das, was dort andockt
 * --, darunter die nächste Halle links und die nächste rechts.
 */
export function wegweiser(plan: BoulevardPlan, achse: Achse): Wegweiser[] {
  const ostLinks = ostLiegtLinks(achse);
  const out: Wegweiser[] = [];
  for (const anteil of [0.12, 0.45, 0.82]) {
    const station = Math.round(plan.laengeM * anteil);
    for (const blick of [1, -1] as const) {
      const ziel = blick > 0 ? plan.enden.sued : plan.enden.nord;
      const linkeSeite = (blick > 0) === ostLinks ? plan.seiten.ost : plan.seiten.west;
      const rechteSeite = (blick > 0) === ostLinks ? plan.seiten.west : plan.seiten.ost;
      const links = naechsteHalle(linkeSeite, station, blick);
      const rechts = naechsteHalle(rechteSeite, station, blick);
      const zeilen: Wegweiser['zeilen'] = [];
      if (links) zeilen.push({ text: links, pfeil: 'links' });
      if (rechts) zeilen.push({ text: rechts, pfeil: 'rechts' });
      if (!zeilen.length && ziel.length) {
        zeilen.push({ text: ziel.join(' – '), pfeil: 'geradeaus' });
      }
      out.push({
        station,
        blick,
        kopf: ziel.length ? ziel.join(' – ') : '',
        kopfKlein: blick > 0 ? 'Ausgang Süd' : 'Congress-Centrum Nord\nAusgang Nord',
        zeilen,
      });
    }
  }
  return out;
}

export const SCHILD_BREITE_M = 2.6;
export const SCHILD_HOEHE_M = 3.4;
/** Unterkante über dem Boden -- hoch genug, dass niemand dagegenläuft. */
export const SCHILD_Y = 4.4;
const GRUEN = '#3aa935';

function pfeilZeichnen(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, groesse: number,
  richtung: 'links' | 'rechts' | 'geradeaus',
): void {
  ctx.save();
  ctx.translate(x, y);
  // Die Spitze zeigt in der Vorlage nach oben, also nach -Y. Auf einer
  // Leinwand laeuft Y nach unten: eine Drehung um +90 Grad dreht damit im
  // Uhrzeigersinn, und aus "links" wuerde ein Pfeil nach rechts.
  if (richtung === 'links') ctx.rotate(-Math.PI / 2);
  if (richtung === 'rechts') ctx.rotate(Math.PI / 2);
  ctx.fillStyle = GRUEN;
  const h = groesse * 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -groesse * 0.5);
  ctx.lineTo(h, 0);
  ctx.lineTo(h * 0.42, 0);
  ctx.lineTo(h * 0.42, groesse * 0.5);
  ctx.lineTo(-h * 0.42, groesse * 0.5);
  ctx.lineTo(-h * 0.42, 0);
  ctx.lineTo(-h, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function schildTextur(schild: Wegweiser): THREE.CanvasTexture {
  const B = 512;
  const H = 668;
  const element = document.createElement('canvas');
  element.width = B;
  element.height = H;
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('Canvas ohne 2D-Kontext');
  const schrift = '"Helvetica Neue", Helvetica, Arial, sans-serif';

  ctx.fillStyle = '#f4f5f6';
  ctx.fillRect(0, 0, B, H);

  // Kopffeld: grüne Fläche mit der Nummer, darunter das Fernziel klein.
  const kopfH = H * 0.3;
  ctx.fillStyle = GRUEN;
  ctx.fillRect(0, 0, B, kopfH);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${kopfH * 0.52}px ${schrift}`;
  ctx.textAlign = 'left';
  ctx.fillText(schild.kopf, 24, kopfH * 0.34);
  ctx.font = `400 ${kopfH * 0.15}px ${schrift}`;
  schild.kopfKlein.split('\n').forEach((zeile, i) => {
    ctx.fillText(zeile, 24, kopfH * 0.66 + i * kopfH * 0.18);
  });

  // Zeilen: Hallennummer links, Pfeil rechts, dünne Trennlinie dazwischen.
  const rest = H - kopfH;
  const zeilenH = rest / Math.max(schild.zeilen.length, 2);
  schild.zeilen.forEach((zeile, i) => {
    const y = kopfH + i * zeilenH;
    ctx.strokeStyle = '#c8ccd0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(B - 16, y);
    ctx.stroke();
    ctx.fillStyle = '#17181c';
    ctx.font = `700 ${zeilenH * 0.62}px ${schrift}`;
    ctx.textAlign = 'left';
    ctx.fillText(zeile.text, 28, y + zeilenH * 0.5);
    pfeilZeichnen(ctx, B - 74, y + zeilenH * 0.5, zeilenH * 0.56, zeile.pfeil);
  });

  const textur = new THREE.CanvasTexture(element);
  textur.colorSpace = THREE.SRGBColorSpace;
  textur.anisotropy = 8;
  return textur;
}

/**
 * Die Treppenanlage am Suedende.
 *
 * Auf dem Referenzfoto ist sie das, was das Ende des Boulevards ueberhaupt
 * zu einem Ort macht: eine breite Freitreppe in drei Laeufen zu je fuenfzehn
 * Stufen, links und rechts von je einer Rolltreppe begleitet, hinauf auf die
 * obere Ebene. 45 Stufen zu 16,56 cm sind 7,45 m -- das ist kein Absatz,
 * das ist ein Geschoss.
 */
export const LAEUFE = 3;
export const STUFEN_JE_LAUF = 15;
export const STEIGUNG_M = 0.1656;
export const AUFTRITT_M = 0.30;
export const PODEST_M = 2.2;
export const TREPPE_BREITE_M = 7;
export const ROLLTREPPE_BREITE_M = 1.4;
/** Gesamter Lauf in der Laenge und die Gesamthoehe. */
export const TREPPE_LAUF_M = LAEUFE * STUFEN_JE_LAUF * AUFTRITT_M + (LAEUFE - 1) * PODEST_M;
export const TREPPE_HOEHE_M = LAEUFE * STUFEN_JE_LAUF * STEIGUNG_M;

export interface Bauteil {
  position: [number, number, number];
  groesse: [number, number, number];
  neigung?: number;
}

export function treppenteile(achse: Achse, centre: [number, number], anfang: number): {
  stufen: Bauteil[];
  rolltreppen: Bauteil[];
  drehung: number;
} {
  const ort = (s: number, q: number, h: number): [number, number, number] => {
    const x = achse.x0 + achse.laengs[0] * s + achse.quer[0] * q;
    const y = achse.y0 + achse.laengs[1] * s + achse.quer[1] * q;
    return [x - centre[0], h, -(y - centre[1])];
  };
  const drehung = Math.atan2(achse.laengs[0], -achse.laengs[1]);

  // Wo die Anlage sitzt, ist gemessen und wird uebergeben: sie beginnt am
  // Ende des Gangs und endet dort, wo Halle 5 und Halle 10 anfangen.
  const stufen: Bauteil[] = [];
  let s = anfang;
  let h = BODEN_Y;
  for (let lauf = 0; lauf < LAEUFE; lauf += 1) {
    for (let i = 0; i < STUFEN_JE_LAUF; i += 1) {
      h += STEIGUNG_M;
      // Jede Stufe steht als Block auf dem Boden -- von unten sieht man
      // ohnehin nur die Vorderkante, und eine massive Treppe wirft den
      // Schatten, den eine Folge schwebender Platten nicht wirft.
      stufen.push({
        position: ort(s + AUFTRITT_M / 2, 0, h / 2),
        groesse: [TREPPE_BREITE_M, h, AUFTRITT_M],
      });
      s += AUFTRITT_M;
    }
    if (lauf < LAEUFE - 1) {
      stufen.push({
        position: ort(s + PODEST_M / 2, 0, h / 2),
        groesse: [TREPPE_BREITE_M, h, PODEST_M],
      });
      s += PODEST_M;
    }
  }

  // Rolltreppen: nur der Fusspunkt. Den Koerper baut der Generator, und zwar
  // am Fusspunkt beginnend und entlang der lokalen +Z-Achse steigend -- hier
  // bleibt damit nur die Drehung um die Hochachse.
  const rolltreppen: Bauteil[] = [-1, 1].map((seite) => ({
    position: ort(
      anfang,
      seite * (TREPPE_BREITE_M / 2 + ROLLTREPPE_BREITE_M / 2 + 0.35),
      BODEN_Y,
    ),
    groesse: [ROLLTREPPE_BREITE_M, 0, 0],
  }));

  return { stufen, rolltreppen, drehung };
}

/**
 * Zwei Glassorten, umschaltbar.
 *
 * Echtes Glas ist in three.js ein Transmissionsmaterial: der Renderer zeichnet
 * dafür je Bild ein eigenes Ziel und alles, was hinter der Scheibe liegt --
 * hier also die Halleninnenräume. Das sieht richtig aus und kostet
 * entsprechend. Die sparsame Sorte ist eine gewöhnliche helle Fläche ohne
 * Durchblick; sie kostet nichts und reicht, solange man die Szene nur
 * durchsehen will.
 *
 * Welche gilt, entscheidet der Betrachter im Betrieb und nicht der Übersetzer:
 * ob es ruckelt, hängt an der Maschine, auf der es läuft.
 */
function glasMaterial(
  previewSafe: boolean,
  flaeche: ReturnType<typeof glasfassadeSurface>,
): THREE.Material {
  const karten = {
    map: kachel(flaeche.map),
    normalMap: kachel(flaeche.normalMap),
    roughnessMap: kachel(flaeche.roughnessMap),
    side: THREE.DoubleSide,
  };
  if (previewSafe) {
    return new THREE.MeshStandardMaterial({
      ...karten,
      color: 0xeaf4f7,
      roughness: 0.18,
      metalness: 0.05,
    });
  }
  return new THREE.MeshPhysicalMaterial({
    ...karten,
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    transmission: 0.8,
    roughness: 0.12,
    thickness: 0.02,
    // Nur die Felder werden durchsichtig, Pfosten und Sockel bleiben stehen.
    alphaMap: kachel(flaeche.alphaMap),
    depthWrite: false,
  });
}

/**
 * Der Suedteil: derselbe Gang, eine Ebene hoeher und dreimal so breit.
 *
 * Suedlich von Halle 6 und Halle 9 hoert die enge Gasse auf. Zwischen Halle 5
 * und Halle 10 sind es ueber 45 m, und der Fussboden liegt auf der oberen
 * Ebene -- dort haengen die Hallen 5.2 und 10.2 an. Dazwischen liegt die
 * Treppe: sie beginnt am Ende der 285 m und endet dort, wo die beiden Hallen
 * anfangen. Dass diese Strecke 18,8 m misst und die Anlage aus 3x15 Stufen
 * 18 m Lauf hat, ist die Gegenprobe -- die Zahlen kommen aus verschiedenen
 * Quellen und treffen sich.
 */
interface Suedflaechen {
  knotenTreppe?: THREE.BufferGeometry;
  knotenBoden?: THREE.BufferGeometry;
  knotenDach?: THREE.BufferGeometry;
  knotenPassage?: THREE.BufferGeometry;
  suedBoden?: THREE.BufferGeometry;
  suedDach?: THREE.BufferGeometry;
  suedStirn?: THREE.BufferGeometry;
  suedWandOstMassiv?: THREE.BufferGeometry;
  suedWandOstGlas?: THREE.BufferGeometry;
  suedWandWestMassiv?: THREE.BufferGeometry;
  suedWandWestGlas?: THREE.BufferGeometry;
}

function suedteil(
  achse: Achse,
  centre: [number, number],
  plan: BoulevardPlan,
): Suedflaechen {
  const sued = plan.sued;
  if (!sued || sued.obenM === null) return {};
  const oben = sued.obenM;
  const dach = oben + plan.hoeheM;
  const qOst = sued.seitenQ.ost;
  const qWest = sued.seitenQ.west;
  const ganz: [number, number][] = [[sued.vonM, sued.bisM]];
  const ost = abschnitte(sued.seiten.ost);
  const west = abschnitte(sued.seiten.west);
  return {
    suedBoden: band(achse, centre,
      () => [[qOst, oben], [qWest, oben]], WELT_KACHEL_M.boden, ganz),
    suedDach: band(achse, centre,
      () => [[qOst, dach], [qWest, dach]], WELT_KACHEL_M.decke, ganz),
    suedWandOstMassiv: band(achse, centre,
      () => [[qOst, oben], [qOst, dach]], WELT_KACHEL_M.wand, ost.massiv),
    suedWandOstGlas: band(achse, centre,
      () => [[qOst, oben], [qOst, dach]], WELT_KACHEL_M.wand, ost.glas),
    suedWandWestMassiv: band(achse, centre,
      () => [[qWest, dach], [qWest, oben]], WELT_KACHEL_M.wand, west.massiv),
    suedWandWestGlas: band(achse, centre,
      () => [[qWest, dach], [qWest, oben]], WELT_KACHEL_M.wand, west.glas),
    // Die Stirnseite ueber der Treppe: unter dem oberen Fussboden ist die
    // Halle offen, darueber steht die Wand, an der im Foto die Banner haengen.
    suedStirn: band(achse, centre,
      () => [[qOst, oben], [qWest, oben]], WELT_KACHEL_M.wand,
      [[sued.vonM - 0.4, sued.vonM]]),
    ...suedknoten(achse, centre, plan, oben, qOst, qWest),
  };
}

/**
 * Der Suedknoten: Querriegel, Treppe hinunter und Passage zur Piazza.
 *
 * Alle Hoehen sind belegt und keine geschaetzt. Der Suedteil liegt auf
 * 7,60 m (amtliche Geschosshoehe), von dort fuehren zwanzig gezaehlte Stufen
 * hinunter auf den Querriegel, weitere sechsundzwanzig hinunter zu Halle 10.1
 * auf null. Die Piazza liegt zwanzig Stufen ueber Halle 11, die ebenerdig
 * ist -- also auf 3,31 m. Die Passage dazwischen faellt entsprechend um
 * knapp einen Meter; man geht von der Piazza sanft hinauf zum Boulevard.
 *
 * Treppen sind hier geneigte Baender und keine Stufenfolgen. Aus zwei Metern
 * Entfernung ist das derselbe Anblick, und der Suedknoten soll zuerst einmal
 * begehbar dastehen.
 */
function suedknoten(
  achse: Achse,
  centre: [number, number],
  plan: BoulevardPlan,
  oben: number,
  qOst: number,
  qWest: number,
): Suedflaechen {
  const knoten = plan.knoten;
  if (!knoten) return {};
  const riegel = knoten.riegel;
  const lauf = knoten.treppeM;
  return {
    // Die Treppe vom Suedteil auf den Querriegel.
    knotenTreppe: band(achse, centre,
      (s) => {
        const teil = (s - (riegel.vonM - lauf)) / lauf;
        const hoehe = oben + (riegel.hoeheM - oben) * Math.min(1, Math.max(0, teil));
        return [[qOst, hoehe], [qWest, hoehe]];
      },
      WELT_KACHEL_M.boden, [[riegel.vonM - lauf, riegel.vonM]]),
    knotenBoden: band(achse, centre,
      () => [[qOst, riegel.hoeheM], [qWest, riegel.hoeheM]],
      WELT_KACHEL_M.boden, [[riegel.vonM, riegel.bisM]]),
    knotenDach: band(achse, centre,
      () => [[qOst, riegel.hoeheM + plan.hoeheM], [qWest, riegel.hoeheM + plan.hoeheM]],
      WELT_KACHEL_M.decke, [[riegel.vonM, riegel.bisM]]),
    // Die Passage nach Sueden faellt sanft zur Piazza ab.
    knotenPassage: band(achse, centre,
      (s) => {
        const teil = (s - riegel.bisM) / Math.max(1, knoten.piazzaVonM - riegel.bisM);
        const hoehe = riegel.hoeheM
          + (knoten.piazzaHoeheM - riegel.hoeheM) * Math.min(1, Math.max(0, teil));
        return [[qOst, hoehe], [qWest, hoehe]];
      },
      WELT_KACHEL_M.boden, [[riegel.bisM, knoten.piazzaVonM]]),
  };
}

export function Boulevard({
  data,
  centre,
  visible,
  previewSafe = true,
}: {
  data: Dataset;
  centre: [number, number];
  visible: boolean;
  /** Sparsames Glas ohne Durchblick -- siehe `glasMaterial`. */
  previewSafe?: boolean;
}) {
  const plan = data.boulevard;
  const achse = useMemo(() => boulevardAchse(data), [data]);

  const flaechen = useMemo(() => {
    if (!achse || !plan) return null;
    const laenge = plan.laengeM;
    const hoehe = plan.hoeheM;
    const ganz: [number, number][] = [[0, laenge]];
    const lichtHalb = OBERLICHT_BREITE_M / 2;
    const ost = abschnitte(plan.seiten.ost);
    const west = abschnitte(plan.seiten.west);
    // Auf welcher Seite der Achse die beiden Wandlinien liegen, sagt der Plan.
    const qOst = plan.seitenQ.ost;
    const qWest = plan.seitenQ.west;

    return {
      boden: band(achse, centre,
        () => [[qOst, BODEN_Y], [qWest, BODEN_Y]], WELT_KACHEL_M.boden, ganz),
      dach: band(achse, centre,
        () => [[qOst, hoehe], [qWest, hoehe]], WELT_KACHEL_M.decke, ganz),
      oberlicht: band(achse, centre,
        () => [[-lichtHalb, hoehe - 0.06], [lichtHalb, hoehe - 0.06]],
        WELT_KACHEL_M.decke, ganz),
      wandOstMassiv: band(achse, centre,
        () => [[qOst, BODEN_Y], [qOst, hoehe]], WELT_KACHEL_M.wand, ost.massiv),
      wandOstGlas: band(achse, centre,
        () => [[qOst, BODEN_Y], [qOst, hoehe]], WELT_KACHEL_M.wand, ost.glas),
      wandWestMassiv: band(achse, centre,
        () => [[qWest, hoehe], [qWest, BODEN_Y]], WELT_KACHEL_M.wand, west.massiv),
      wandWestGlas: band(achse, centre,
        () => [[qWest, hoehe], [qWest, BODEN_Y]], WELT_KACHEL_M.wand, west.glas),
      ...suedteil(achse, centre, plan),
    };
  }, [achse, centre, plan]);

  const surfaces = useMemo(
    () => ({
      boden: hallenbodenSurface(),
      dach: boulevarddeckeSurface(),
      wand: glasfassadeSurface(),
      massiv: facadeSurface(true),
    }),
    [],
  );

  const material = useMemo(() => ({
    boden: new THREE.MeshStandardMaterial({
      map: kachel(surfaces.boden.map),
      normalMap: kachel(surfaces.boden.normalMap),
      roughnessMap: kachel(surfaces.boden.roughnessMap),
      // Heller als der Hallenboden: der Boulevard hat Tageslicht von oben.
      color: new THREE.Color('#cfd2d6'),
      roughness: 0.3,
      metalness: 0.2,
      envMapIntensity: 1.5,
      // Beidseitig: die Bänder werden aus Stationen gebaut, nicht modelliert.
      // Welche Seite dabei vorn liegt, hängt an der Drehrichtung des Geländes
      // -- und ein Boden, den man von oben nicht sieht, ist der Fehler, den
      // man am längsten sucht.
      side: THREE.DoubleSide,
    }),
    dach: new THREE.MeshStandardMaterial({
      map: kachel(surfaces.dach.map),
      normalMap: kachel(surfaces.dach.normalMap),
      roughnessMap: kachel(surfaces.dach.roughnessMap),
      color: new THREE.Color('#ffffff'),
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
    oberlicht: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e8f0ff'),
      emissive: new THREE.Color('#dfeaff'),
      emissiveIntensity: 2.1,
      roughness: 0.25,
      side: THREE.DoubleSide,
    }),
    wandMassiv: new THREE.MeshStandardMaterial({
      map: kachel(surfaces.massiv.map),
      normalMap: kachel(surfaces.massiv.normalMap),
      roughnessMap: kachel(surfaces.massiv.roughnessMap),
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
    wand: glasMaterial(previewSafe, surfaces.wand),
  }), [surfaces, previewSafe]);

  useEffect(() => () => {
    Object.values(material).forEach((eintrag) => eintrag.dispose());
    disposeSurface(surfaces.boden);
    disposeSurface(surfaces.dach);
    disposeSurface(surfaces.wand);
    disposeSurface(surfaces.massiv);
  }, [material, surfaces]);

  useEffect(() => () => {
    if (!flaechen) return;
    Object.values(flaechen).forEach((geometry) => geometry.dispose());
  }, [flaechen]);

  /** Tageslicht von oben, in Abständen entlang des Bands. */
  const lampen = useMemo(() => {
    if (!achse || !plan) return [];
    const out: [number, number, number][] = [];
    const anzahl = Math.max(4, Math.round(plan.laengeM / 40));
    for (let i = 0; i < anzahl; i += 1) {
      const s = ((i + 0.5) / anzahl) * plan.laengeM;
      const x = achse.x0 + achse.laengs[0] * s;
      const y = achse.y0 + achse.laengs[1] * s;
      out.push([x - centre[0], plan.hoeheM - 1.2, -(y - centre[1])]);
    }
    return out;
  }, [achse, centre, plan]);

  /** Pendelleuchten in zwei Reihen, wie auf dem Foto. */
  const pendel = useMemo(() => {
    if (!achse || !plan) return [];
    const out: [number, number, number][] = [];
    const abstand = 9;
    for (let s = abstand; s < plan.laengeM; s += abstand) {
      for (const q of [-4.2, 4.2]) {
        const x = achse.x0 + achse.laengs[0] * s + achse.quer[0] * q;
        const y = achse.y0 + achse.laengs[1] * s + achse.quer[1] * q;
        out.push([x - centre[0], plan.hoeheM - 1.5, -(y - centre[1])]);
      }
    }
    return out;
  }, [achse, centre, plan]);

  const schilder = useMemo(() => {
    if (!achse || !plan) return [];
    // Die Tafel haengt mittig im Gang und schaut dem Ankommenden entgegen --
    // je Gehrichtung ein Gesicht, um 180 Grad gedreht.
    return wegweiser(plan, achse).map((schild, index) => {
      const x = achse.x0 + achse.laengs[0] * schild.station;
      const y = achse.y0 + achse.laengs[1] * schild.station;
      const drehung = schild.blick > 0
        ? Math.atan2(-achse.laengs[0], achse.laengs[1])
        : Math.atan2(achse.laengs[0], -achse.laengs[1]);
      return {
        schluessel: `${schild.station}-${schild.blick}-${index}`,
        schild,
        position: [
          x - centre[0],
          SCHILD_Y + SCHILD_HOEHE_M / 2,
          -(y - centre[1]),
        ] as [number, number, number],
        drehung,
        textur: schildTextur(schild),
      };
    });
  }, [achse, centre, plan]);

  useEffect(() => () => schilder.forEach(({ textur }) => textur.dispose()), [schilder]);

  const treppe = useMemo(
    () => (achse && plan?.treppe ? treppenteile(achse, centre, plan.treppe.vonM) : null),
    [achse, centre, plan],
  );

  /**
   * Die Stirnwand am Suedende: ebenfalls Glas, mit zwei Doppeltueren.
   *
   * Sie steht quer am Ende des Bands. Die Tueren sitzen mittig nebeneinander
   * auf Fussbodenhoehe -- dort, wo man von draussen hereinkommt.
   */
  const suedwand = useMemo(() => {
    if (!achse || !plan) return null;
    const s = plan.laengeM;
    const x = achse.x0 + achse.laengs[0] * s;
    const y = achse.y0 + achse.laengs[1] * s;
    const drehung = Math.atan2(achse.laengs[0], -achse.laengs[1]);
    return {
      position: [x - centre[0], BODEN_Y + plan.hoeheM / 2, -(y - centre[1])] as
        [number, number, number],
      drehung,
      tueren: [-1, 1].map((seite) => ({
        versatz: seite * 1.9,
        gruppe: ArchitectureGenerator.createDoubleGlassDoor(3.2, 2.6),
      })),
    };
  }, [achse, centre, plan]);

  useEffect(() => () => (suedwand?.tueren ?? []).forEach(({ gruppe }) => {
    gruppe.traverse((knoten) => {
      const netz = knoten as THREE.Mesh;
      if (netz.isMesh) netz.geometry.dispose();
    });
  }), [suedwand]);

  /** Je Seite eine gebaute Rolltreppe -- der Generator liefert eine Gruppe. */
  const rolltreppen = useMemo(() => (treppe?.rolltreppen ?? []).map((teil) => ({
    position: teil.position,
    gruppe: ArchitectureGenerator.createEscalator(
      TREPPE_LAUF_M, TREPPE_HOEHE_M, ROLLTREPPE_BREITE_M,
    ),
  })), [treppe]);

  useEffect(() => () => rolltreppen.forEach(({ gruppe }) => {
    // Nur die Geometrien: die Materialien kommen aus dem gemeinsamen Katalog
    // und werden anderswo weiterbenutzt.
    gruppe.traverse((knoten) => {
      const netz = knoten as THREE.Mesh;
      if (netz.isMesh) netz.geometry.dispose();
    });
  }), [rolltreppen]);

  if (!visible || !flaechen) return null;

  return (
    <group>
      <mesh geometry={flaechen.boden} material={material.boden} receiveShadow />
      <mesh geometry={flaechen.dach} material={material.dach} />
      <mesh geometry={flaechen.oberlicht} material={material.oberlicht} />
      <mesh geometry={flaechen.wandWestMassiv} material={material.wandMassiv} receiveShadow />
      <mesh geometry={flaechen.wandOstMassiv} material={material.wandMassiv} receiveShadow />
      <mesh geometry={flaechen.wandWestGlas} material={material.wand} />
      <mesh geometry={flaechen.wandOstGlas} material={material.wand} />
      {/* Der Suedteil, eine Ebene hoeher. */}
      {flaechen.suedBoden && (
        <mesh geometry={flaechen.suedBoden} material={material.boden} receiveShadow />
      )}
      {flaechen.suedDach && <mesh geometry={flaechen.suedDach} material={material.dach} />}
      {flaechen.suedStirn && (
        <mesh geometry={flaechen.suedStirn} material={material.wandMassiv} />
      )}
      {flaechen.suedWandOstMassiv && (
        <mesh geometry={flaechen.suedWandOstMassiv} material={material.wandMassiv} receiveShadow />
      )}
      {flaechen.suedWandWestMassiv && (
        <mesh geometry={flaechen.suedWandWestMassiv} material={material.wandMassiv} receiveShadow />
      )}
      {flaechen.suedWandOstGlas && (
        <mesh geometry={flaechen.suedWandOstGlas} material={material.wand} />
      )}
      {flaechen.suedWandWestGlas && (
        <mesh geometry={flaechen.suedWandWestGlas} material={material.wand} />
      )}
      {/* Suedknoten: Treppe, Querriegel und Passage zur Piazza. */}
      {flaechen.knotenTreppe && (
        <mesh geometry={flaechen.knotenTreppe} material={material.boden} receiveShadow />
      )}
      {flaechen.knotenBoden && (
        <mesh geometry={flaechen.knotenBoden} material={material.boden} receiveShadow />
      )}
      {flaechen.knotenDach && <mesh geometry={flaechen.knotenDach} material={material.dach} />}
      {flaechen.knotenPassage && (
        <mesh geometry={flaechen.knotenPassage} material={material.boden} receiveShadow />
      )}
      {pendel.map((position, index) => (
        <mesh key={`p${index}`} position={position}>
          <cylinderGeometry args={[0.62, 0.34, 0.42, 12]} />
          <meshStandardMaterial
            color="#f4f2ec"
            emissive="#fff4e0"
            emissiveIntensity={1.6}
            roughness={0.4}
          />
        </mesh>
      ))}
      {schilder.map(({ schluessel, position, drehung, textur }) => (
        <mesh key={schluessel} position={position} rotation={[0, drehung, 0]}>
          <planeGeometry args={[SCHILD_BREITE_M, SCHILD_HOEHE_M]} />
          <meshStandardMaterial
            map={textur}
            emissiveMap={textur}
            emissive="#ffffff"
            emissiveIntensity={0.45}
            roughness={0.55}
            // Einseitig: die Rueckseite ist das Gesicht der Gegenrichtung und
            // zeigt etwas anderes.
            side={THREE.FrontSide}
          />
        </mesh>
      ))}
      {suedwand && plan && (
        <group position={suedwand.position} rotation={[0, suedwand.drehung, 0]}>
          <mesh material={material.wand}>
            <planeGeometry args={[plan.breiteM, plan.hoeheM]} />
          </mesh>
          {suedwand.tueren.map(({ versatz, gruppe }, index) => (
            <primitive
              key={`d${index}`}
              object={gruppe}
              position={[versatz, -plan.hoeheM / 2, 0.12]}
            />
          ))}
        </group>
      )}
      {treppe && (
        <group>
          {treppe.stufen.map((teil, index) => (
            <mesh
              key={`t${index}`}
              position={teil.position}
              rotation={[0, treppe.drehung, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={teil.groesse} />
              <meshStandardMaterial color="#d9dade" roughness={0.55} metalness={0.1} />
            </mesh>
          ))}
          {/* Stufenband, Glasbalustrade und Handlauf kommen aus dem
              vorhandenen ArchitectureGenerator -- dieselben Materialien wie
              der Rest des prozeduralen Messebaus. */}
          {rolltreppen.map(({ position, gruppe }, index) => (
            <group key={`r${index}`} position={position} rotation={[0, treppe.drehung, 0]}>
              <primitive object={gruppe} />
            </group>
          ))}
        </group>
      )}
      {lampen.map((position, index) => (
        <pointLight
          key={index}
          position={position}
          color="#eaf1ff"
          intensity={150}
          distance={0}
          decay={2}
        />
      ))}
    </group>
  );
}
