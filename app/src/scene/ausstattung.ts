/**
 * Die Ausstattung: was eine Halle von einer Kiste unterscheidet.
 *
 * Die Stilbibel führt eine Detailhierarchie, und ihre oberste Stufe ist
 * ausdrücklich keine Fassadentextur: *Eingänge, Türen, Rolltreppen, Treppen,
 * Beschilderung, Geländer, Zäune, Hallennummern*. Das sind Bauteile, keine
 * Oberflächen -- man erkennt sie an ihrer Silhouette, und eine Silhouette
 * entsteht nur aus Geometrie.
 *
 * Genau hier klaffte die Lücke: die zehn Materialfamilien standen bereit,
 * aber M02 (Struktur), M08 (Metall) und M10 (Beschilderung) hatten in der
 * ganzen Welt fast keinen Träger. Ein Deckenraster war eine Ebene mit einer
 * Textur darauf, ein Geländer gab es nur am Boulevard, einen Zaun nirgends.
 *
 * **Warum die Planung hier steht und nicht in der Komponente.** Alles in
 * dieser Datei ist eine reine Funktion von Maßen auf Bauteillisten: keine
 * React-Knoten, kein `three`, keine Texturen. Das macht sie prüfbar --
 * "wie viele Träger auf 60 m", "liegt das Lichtband unter dem Träger",
 * "schließt der Zaun an seiner Ecke" sind Fragen an Zahlen und nicht an ein
 * Bild. `Ausstattung.tsx` macht daraus Meshes und sonst nichts.
 */

import type { Placement2D } from '../data/types';

/** Ein Quader in der Welt: Mitte, Maße, Drehung um die Hochachse. */
export interface Balken {
  position: [number, number, number];
  groesse: [number, number, number];
  drehung: number;
}

/** Eine waagerechte Fläche mit Ausrichtung -- Lichtband, Zaunfeld, Schild. */
export interface Tafel {
  position: [number, number, number];
  groesse: [number, number];
  drehung: number;
}

// ---------------------------------------------------------------------------
// Decke
// ---------------------------------------------------------------------------

/**
 * Achsmaß des sichtbaren Deckengitters in Metern.
 *
 * War 5 m -- eine Schätzung ("grosszügiges Quadratraster, kein Bürorraster"),
 * nie nachgemessen. Nutzer-Korrektur gegen die echten Referenzfotos von
 * Halle 10.1: das sichtbare Gitter ist das engmaschige Trägerrost/Gitterrost
 * der Dachkonstruktion, keine grobe Kassettendecke -- rund 60 cm, nicht die
 * 5 (und schon gar nicht die daraus in der Perspektive wirkenden ~15) Meter,
 * die vorher standen. Bei dieser Feinheit ist das Gitter selbst die einzige
 * Zeichnung; es braucht kein zusätzliches Kassettenraster mehr obendrauf.
 */
export const DECKE_ACHSE_M = 0.6;

/**
 * Achsmaß des Funktionsfelds in Metern -- ordnet Lichtbänder und
 * Lüftungsauslässe, unabhängig vom feinen sichtbaren Gitter oben.
 *
 * Vor der Korrektur teilten sich Gitter und Funktionslayout dieselbe Zahl
 * (`DECKE_ACHSE_M`): unproblematisch bei 5 m Gitterachse, aber ein Band oder
 * ein Auslass alle 1,2 m (das wäre `2 * 0.6`) hat mit keinem Referenzfoto
 * mehr etwas zu tun. Fünf Meter bleibt der real bebilderte Rhythmus für
 * Lichtbänder und Auslässe -- unverändert seit dem Auszählen der Fotos,
 * jetzt nur vom Gitter entkoppelt statt zufällig an ihm dranzuhängen.
 */
export const DECKE_FUNKTIONSFELD_M = 5;

/** Wie tief die Gitterstäbe unter die Deckenfläche reichen. */
export const DECKE_TRAEGER_M = 0.45;

/**
 * Breite eines Gitterstabs.
 *
 * War 0.22 m, bemessen für eine 5-m-Achse -- an einer 0.6-m-Achse würde das
 * über ein Drittel der Fläche verdecken und aus einem offenen Gitterrost eine
 * fast geschlossene Platte machen. Schlank genug, dass die Referenzfotos'
 * "fast schwarzes Metallgitter vor fast schwarzer Decke" als Linien statt als
 * Fläche lesbar bleibt.
 */
export const DECKE_STEG_M = 0.05;

/** Breite eines Lichtbands. */
export const LICHTBAND_M = 0.5;

export interface Deckenwerk {
  traeger: Balken[];
  lichtbaender: Tafel[];
  diffusoren: { position: [number, number, number]; radius: number }[];
}

/**
 * Das Deckenraster einer Halle: Träger, Lichtbänder, Auslässe.
 *
 * Auf dem Referenzbild der leeren Halle ist die Decke die obere Bildhälfte --
 * ein feines dunkles Gitterrost, dazwischen lange helle Lichtbänder, dazu
 * runde Luftauslässe. Als flache Ebene mit aufgemaltem Raster fehlt genau
 * das, was sie ausmacht: die Tiefe zwischen Steg und Feld.
 *
 * Zwei Raster, zwei Zwecke, absichtlich unterschiedlich fein: `achse` (siehe
 * `DECKE_ACHSE_M`) ist das feine sichtbare Gitter selbst -- was man von unten
 * als Zeichnung sieht. `funktionsfeld` (siehe `DECKE_FUNKTIONSFELD_M`) ist der
 * viel gröbere Rhythmus, in dem Lichtbänder und Lüftung stehen. Beide an
 * derselben Zahl aufzuhängen war der Fehler, den die Nutzer-Korrektur an der
 * Gitterachse aufgedeckt hat: ein Band alle zwei Gitterfelder ergibt bei
 * einem feinen Gitter ein Band alle 1,2 m -- kein Referenzfoto zeigt das.
 *
 * Die Lichtbänder laufen **längs** und nicht in beide Richtungen. So ist es
 * gebaut, und es hat einen Zweck über die Treue hinaus: ein durchgehendes
 * Band in Laufrichtung erklärt dem Besucher die Achse der Halle.
 */
export function deckenwerk(
  laenge: number,
  breite: number,
  hoehe: number,
  achse = DECKE_ACHSE_M,
  funktionsfeld = DECKE_FUNKTIONSFELD_M,
): Deckenwerk {
  const traeger: Balken[] = [];
  const lichtbaender: Tafel[] = [];
  const diffusoren: Deckenwerk['diffusoren'] = [];
  if (laenge <= 0 || breite <= 0) return { traeger, lichtbaender, diffusoren };

  const unterkante = hoehe - DECKE_TRAEGER_M / 2;

  // Feines Gitter, Richtung 1 -- über die ganze Länge, im Achsmaß über die
  // Breite verteilt.
  const querAnzahl = Math.max(2, Math.round(breite / achse));
  for (let i = 0; i <= querAnzahl; i += 1) {
    const z = -breite / 2 + (i * breite) / querAnzahl;
    traeger.push({
      position: [0, unterkante, z],
      groesse: [laenge, DECKE_TRAEGER_M, DECKE_STEG_M],
      drehung: 0,
    });
  }

  // Feines Gitter, Richtung 2 -- dieselbe Ordnung, um neunzig Grad gedreht.
  const laengsAnzahl = Math.max(2, Math.round(laenge / achse));
  for (let i = 0; i <= laengsAnzahl; i += 1) {
    const x = -laenge / 2 + (i * laenge) / laengsAnzahl;
    traeger.push({
      position: [x, unterkante, 0],
      groesse: [DECKE_STEG_M, DECKE_TRAEGER_M, breite],
      drehung: 0,
    });
  }

  // Ab hier das grobe Funktionsfeld -- eigene Feldzahl, nichts mehr von
  // querAnzahl/laengsAnzahl oben wiederverwendet.
  const funktionsQuerAnzahl = Math.max(2, Math.round(breite / funktionsfeld));
  const funktionsLaengsAnzahl = Math.max(2, Math.round(laenge / funktionsfeld));

  // Lichtbänder: in jedem zweiten Funktionsfeld, mittig zwischen zwei
  // Feldgrenzen. Jedes Feld wäre zu hell und würde die Gitterzeichnung
  // auslöschen.
  for (let i = 0; i < funktionsQuerAnzahl; i += 2) {
    const z = -breite / 2 + ((i + 0.5) * breite) / funktionsQuerAnzahl;
    lichtbaender.push({
      position: [0, hoehe - DECKE_TRAEGER_M - 0.02, z],
      groesse: [laenge * 0.94, LICHTBAND_M],
      drehung: 0,
    });
  }

  // Luftauslässe: ein gleichmässiges Netz, jedes zehnte Funktionsfeld in
  // beiden Richtungen -- nachgezählt an mehreren Referenzfotos, nicht
  // geschätzt. Die Zeilen starten bei Feld 1 (nicht 0), damit sie nicht auf
  // dieselbe Achse wie die Lichtbänder (gerade Feldindizes) fallen -- ein
  // Auslass sitzt im Feld, nicht im Band.
  for (let i = 1; i < funktionsQuerAnzahl; i += 10) {
    const z = -breite / 2 + ((i + 0.5) * breite) / funktionsQuerAnzahl;
    for (let k = 0; k < funktionsLaengsAnzahl; k += 10) {
      const x = -laenge / 2 + ((k + 0.5) * laenge) / funktionsLaengsAnzahl;
      diffusoren.push({ position: [x, hoehe - DECKE_TRAEGER_M - 0.05, z], radius: 0.55 });
    }
  }

  return { traeger, lichtbaender, diffusoren };
}

// ---------------------------------------------------------------------------
// Fassade
// ---------------------------------------------------------------------------

/** Achsmaß der Fassadenstützen in Metern. */
export const FASSADE_ACHSE_M = 8;

/** Wie weit eine Stütze aus der Wand tritt. */
export const FASSADE_VORSPRUNG_M = 0.35;

export interface Fassadenwerk {
  stuetzen: Balken[];
  fensterband: Tafel[];
  sockel: Tafel[];
  attika: Tafel[];
}

/**
 * Die Gliederung einer Fassadenseite: Stützen, Fensterband, Sockel, Attika.
 *
 * Die Stilbibel sagt, woran man eine Halle erkennt: *Masse, Fassade,
 * Fensterbänder, Eingänge, Rampen, Vordächer* -- "nicht an tausend
 * Texturdetails". Die amtlichen Körper sind aus Gebäudeumringen gerechnet und
 * haben davon nichts: eine Halle ist dort ein Quader. Selbst mit der besten
 * Zeichnung darauf bleibt sie ein Quader, weil die Silhouette flach ist und
 * das Streiflicht nichts findet, woran es brechen könnte.
 *
 * Vier Bauteile genügen dafür, und alle vier stehen im Referenzbild von
 * Halle 11: der Rhythmus der Stützen, das umlaufende Fensterband unter der
 * Traufe, der abgesetzte Sockel, die vorstehende Attika.
 */
export function fassadenwerk(
  laenge: number,
  hoehe: number,
  achse = FASSADE_ACHSE_M,
): Fassadenwerk {
  const stuetzen: Balken[] = [];
  if (laenge <= 0 || hoehe <= 0) {
    return { stuetzen, fensterband: [], sockel: [], attika: [] };
  }

  // Die Stützen sitzen im Achsmaß und immer auch an den Ecken -- eine Fassade,
  // die mit einem halben Feld endet, sieht abgeschnitten aus.
  const felder = Math.max(1, Math.round(laenge / achse));
  for (let i = 0; i <= felder; i += 1) {
    const x = -laenge / 2 + (i * laenge) / felder;
    stuetzen.push({
      position: [x, hoehe / 2, FASSADE_VORSPRUNG_M / 2],
      groesse: [0.7, hoehe, FASSADE_VORSPRUNG_M],
      drehung: 0,
    });
  }

  // Das Fensterband liegt im oberen Drittel und läuft durch; der Sockel steht
  // unten und ist niedriger als eine Tür, damit er keine Öffnung vortäuscht.
  const bandhoehe = Math.min(2.6, hoehe * 0.22);
  const fensterband: Tafel[] = [{
    position: [0, hoehe - bandhoehe * 0.9, FASSADE_VORSPRUNG_M * 0.45],
    groesse: [laenge, bandhoehe],
    drehung: 0,
  }];
  const sockel: Tafel[] = [{
    position: [0, 0.55, FASSADE_VORSPRUNG_M * 0.5],
    groesse: [laenge, 1.1],
    drehung: 0,
  }];
  const attika: Tafel[] = [{
    position: [0, hoehe + 0.35, FASSADE_VORSPRUNG_M * 0.75],
    groesse: [laenge, 0.7],
    drehung: 0,
  }];

  return { stuetzen, fensterband, sockel, attika };
}

// ---------------------------------------------------------------------------
// Geländer und Zäune
// ---------------------------------------------------------------------------

export const GELAENDER_HOEHE_M = 1.1;
export const GELAENDER_PFOSTEN_M = 1.6;
export const ZAUN_HOEHE_M = 2.0;
export const ZAUN_FELD_M = 3.5;

export interface Absperrung {
  pfosten: Balken[];
  holme: Balken[];
  felder: Tafel[];
}

/**
 * Ein Geländer oder Zaun entlang eines Streckenzugs.
 *
 * Dieselbe Funktion für beides: der Unterschied zwischen einem Geländer am
 * Deck und einem Bauzaun am Geländerand ist die Höhe, der Pfostenabstand und
 * das Material -- nicht die Bauart. Beide sind eine Reihe Pfosten, ein Holm
 * oben und eine Füllung dazwischen.
 *
 * Die Pfosten werden **je Abschnitt** gesetzt und nicht über den ganzen Zug
 * gerechnet: sonst sitzt an einer Ecke keiner, und genau dort sieht man ihn.
 */
export function absperrung(
  pfad: Placement2D[],
  hoehe = GELAENDER_HOEHE_M,
  abstand = GELAENDER_PFOSTEN_M,
  y = 0,
): Absperrung {
  const pfosten: Balken[] = [];
  const holme: Balken[] = [];
  const felder: Tafel[] = [];
  if (pfad.length < 2) return { pfosten, holme, felder };

  const dick = hoehe > 1.5 ? 0.09 : 0.06;

  for (let i = 0; i < pfad.length - 1; i += 1) {
    const [ax, ay] = pfad[i];
    const [bx, by] = pfad[i + 1];
    const laenge = Math.hypot(bx - ax, by - ay);
    if (laenge < 1e-6) continue;
    // Geländemeter: y wächst nach Süden, Szenen-Z ebenso -- deshalb dieselbe
    // Drehung wie `drehungNachX` sie für Punkte liefert.
    const drehung = Math.atan2(-(by - ay), bx - ax);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;

    const anzahl = Math.max(1, Math.round(laenge / abstand));
    for (let k = 0; k <= anzahl; k += 1) {
      const t = k / anzahl;
      pfosten.push({
        position: [ax + (bx - ax) * t, y + hoehe / 2, ay + (by - ay) * t],
        groesse: [dick, hoehe, dick],
        drehung,
      });
    }

    holme.push({
      position: [mx, y + hoehe, my],
      groesse: [laenge, dick * 1.3, dick * 1.3],
      drehung,
    });
    felder.push({
      position: [mx, y + hoehe * 0.52, my],
      groesse: [laenge, hoehe * 0.86],
      drehung,
    });
  }

  return { pfosten, holme, felder };
}

// ---------------------------------------------------------------------------
// Hallennummern
// ---------------------------------------------------------------------------

/** Wie hoch eine Hallennummer über dem Boden hängt. */
export const NUMMER_Y_M = 6.5;

/** Kantenlänge des Schilds. */
export const NUMMER_GROESSE_M = 3.2;

export interface Nummernschild {
  key: string;
  text: string;
  position: [number, number, number];
  drehung: number;
}

/**
 * Hallennummern als Objekte in der Welt.
 *
 * Ausdrücklich als Objekt und nicht in der Textur -- die Stilbibel sagt es
 * wörtlich. Der Grund ist nicht Stiltreue, sondern Orientierung: eine Nummer,
 * die in der Fassadentextur steckt, wiederholt sich mit jeder Kachel und
 * steht an fünf Stellen derselben Wand. Eine Nummer, die ein Objekt ist,
 * hängt einmal da, wo der Eingang ist.
 *
 * Ein Schild je Hallenseite mit Blick nach aussen, gesetzt auf die Mitte der
 * längsten Kante -- dort ist bei den Kölner Hallen der Zugang.
 */
export function nummernschilder(
  hallen: { key: string; hall: string; footprint: Placement2D[]; baseY: number;
            outdoor?: boolean }[],
): Nummernschild[] {
  const schilder: Nummernschild[] = [];
  const gesehen = new Set<string>();

  for (const halle of hallen) {
    if (halle.outdoor || gesehen.has(halle.hall)) continue;
    const ecken = halle.footprint;
    if (ecken.length < 3) continue;

    let beste = { laenge: -1, mx: 0, my: 0, drehung: 0 };
    for (let i = 0; i < ecken.length; i += 1) {
      const [ax, ay] = ecken[i];
      const [bx, by] = ecken[(i + 1) % ecken.length];
      const laenge = Math.hypot(bx - ax, by - ay);
      if (laenge <= beste.laenge) continue;
      beste = {
        laenge,
        mx: (ax + bx) / 2,
        my: (ay + by) / 2,
        // Das Schild blickt aus der Wand heraus: quer zur Kante.
        drehung: Math.atan2(-(bx - ax), -(by - ay)) + Math.PI / 2,
      };
    }
    if (beste.laenge <= 0) continue;

    gesehen.add(halle.hall);
    schilder.push({
      key: halle.hall,
      text: halle.hall,
      position: [beste.mx, halle.baseY + NUMMER_Y_M, beste.my],
      drehung: beste.drehung,
    });
  }

  return schilder;
}
