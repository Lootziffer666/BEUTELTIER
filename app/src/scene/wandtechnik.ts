/**
 * Die technische Wand: eine zweite, sehr billige Detailschicht über der
 * grossen Grundfläche -- Panelfelder, Kabellinien, Technikboxen.
 *
 * Die Grundwand (`Hallenwaende` in `interior.tsx`) bleibt eine einzelne
 * flache Fläche. Was eine Halle nach "benutztes Gebäude" statt "Kulisse"
 * aussehen lässt, ist nicht eine Textur darauf, sondern Geometrie davor:
 * ein paar leicht extrudierte Rechteckfelder, ein, zwei Kabellinien,
 * gelegentlich eine kleine Box. Das ist "Wand als prozedurale technische
 * Oberfläche" statt "Wand texturieren".
 *
 * **Unregelmässig regelmässig, nicht zufällig überall.** Die Felder sitzen
 * auf einem unsichtbaren Raster (`panelGridX` × `panelGridY`), aber nicht
 * jede Zelle wird gefüllt (`panelDensity`), benachbarte Zellen verschmelzen
 * gelegentlich zu einem grösseren Panel, und jede Kante bekommt einen
 * kleinen Versatz. Das Auge liest daraus "industrielle Modulwand" -- ein
 * Raster ohne Auslassung und Verschiebung liest sich als Kachelboden, ein
 * reiner Zufallsteppich als Rauschen.
 *
 * Reine Planung: Millimeter rein, Rechtecke und Polylinien raus, kein
 * `three`, kein React -- geprüft wird das hier, gebaut wird es in
 * `interior.tsx`.
 */

import { mulberry32 } from './raster';

export interface WandtechnikSpec {
  /** Rasterbreite einer Zelle entlang der Wand, in Metern. */
  panelGridX: number;
  /** Rasterhöhe einer Zelle, in Metern. */
  panelGridY: number;
  /** Anteil der Rasterzellen, die überhaupt ein Panel tragen (0..1). */
  panelDensity: number;
  /** Maximale Extrusionstiefe eines Panels, in Metern. */
  panelDepth: number;
  /** Wie viele Kabellinien je Rasterfläche entstehen (0..1). */
  cableDensity: number;
  /** Wie viele Technikboxen je Rasterfläche entstehen (0..1). */
  techDensity: number;
  /** Startwert -- derselbe Wert ergibt dieselbe Wand. */
  seed: number;
}

export const WANDTECHNIK_DEFAULT: WandtechnikSpec = {
  panelGridX: 1.2,
  panelGridY: 0.8,
  panelDensity: 0.35,
  panelDepth: 0.03,
  cableDensity: 0.4,
  techDensity: 0.15,
  seed: 1,
};

/** Ein leicht extrudiertes Rechteckfeld, in lokalen Wandkoordinaten (u=entlang, v=Höhe). */
export interface Panel {
  u: number;
  v: number;
  breiteU: number;
  breiteV: number;
  tiefe: number;
}

/** Eine Kabel-/Rohrlinie: ein Polygonzug mit gelegentlichem 90°-Knick. */
export interface Kabel {
  punkte: readonly (readonly [number, number])[];
  dicke: number;
}

/** Eine kleine Technikbox -- Lüftung, Anschlusskasten, Verteiler. */
export interface Technikbox {
  u: number;
  v: number;
  breite: number;
  hoehe: number;
  tiefe: number;
}

export interface Wandtechnik {
  panels: Panel[];
  kabel: Kabel[];
  boxen: Technikbox[];
}

/** Wie weit eine Zelle über ihr Rechteck hinaus verschoben werden darf -- der "Versatz". */
const KANTENVERSATZ = 0.5;
/** Rand, den keine Zelle an oberer/unterer Wandkante überschreitet. */
const RAND_V_M = 0.3;
/**
 * Dichteeinheit fuer Kabel-/Boxanzahl: von Hand so gewaehlt, dass
 * `cableDensity`/`techDensity` = 1.0 auf einer Standardwand eine plausible,
 * nicht ueberladene Anzahl ergibt -- kein aus dem Zellraster hergeleiteter
 * Wert, nur benannt statt als nackte Zahl im Ausdruck zu stehen.
 */
const ZELLEN_PRO_FLAECHENEINHEIT = 6;

/**
 * Baut Panels, Kabel und Technikboxen für eine Wandfläche `breiteU` × `hoeheV`
 * Meter.
 *
 * Alle drei Schichten laufen über dieselbe Rasterzahl (`cols`/`rows`), aber
 * unabhängig voneinander gewürfelt: eine Wand mit vielen Kabeln muss nicht
 * auch viele Panels haben, und umgekehrt.
 */
export function wandtechnik(
  breiteU: number,
  hoeheV: number,
  spec: Partial<WandtechnikSpec> = {},
): Wandtechnik {
  const s = { ...WANDTECHNIK_DEFAULT, ...spec };
  const panels: Panel[] = [];
  const kabel: Kabel[] = [];
  const boxen: Technikbox[] = [];
  // hoeheV <= 2*RAND_V_M wuerde zellV <= 0 ergeben und Panels seitlich
  // entgleisen lassen -- vor der Rasterberechnung abfangen, nicht danach:
  // Math.max(1, ...) unten kann rows nie unter 1 fallen lassen, ein
  // "if (rows < 1)" waere also totes Wachpersonal.
  if (breiteU <= 0 || hoeheV <= 2 * RAND_V_M) return { panels, kabel, boxen };

  const cols = Math.max(1, Math.round(breiteU / s.panelGridX));
  const rows = Math.max(1, Math.round((hoeheV - 2 * RAND_V_M) / s.panelGridY));
  const zellU = breiteU / cols;
  const zellV = (hoeheV - 2 * RAND_V_M) / rows;

  const zufall = mulberry32(s.seed >>> 0);

  // -- Panels: Raster wuerfeln, dann horizontale Nachbarn gelegentlich
  //    verschmelzen -- "zwei Zellen zu einem groesseren Panel".
  const belegt: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => zufall() < s.panelDensity));
  const verbraucht: boolean[][] = belegt.map((r) => r.map(() => false));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!belegt[row][col] || verbraucht[row][col]) continue;
      let breiteZellen = 1;
      // Verschmelzung nur nach rechts und nur EINMAL -- ein Panel aus mehr
      // als zwei Zellen faellt schon als "grosse Sonderflaeche" auf, nicht
      // mehr als "unregelmaessig regelmaessig".
      if (col + 1 < cols && belegt[row][col + 1] && !verbraucht[row][col + 1]
          && zufall() < 0.3) {
        breiteZellen = 2;
        verbraucht[row][col + 1] = true;
      }
      verbraucht[row][col] = true;

      const zellBreiteU = zellU * breiteZellen;
      const kanteU = (zufall() - 0.5) * 2 * Math.min(KANTENVERSATZ, zellU * 0.15);
      const kanteV = (zufall() - 0.5) * 2 * Math.min(KANTENVERSATZ, zellV * 0.15);
      const randU = zellBreiteU * (0.08 + zufall() * 0.06);
      const randV = zellV * (0.08 + zufall() * 0.06);
      const panelBreiteU = Math.max(0.1, zellBreiteU - 2 * randU);
      const panelBreiteV = Math.max(0.1, zellV - 2 * randV);

      // Der Kantenversatz darf ein Panel bis auf 15% der Zellbreite aus der
      // Zellmitte schieben -- bei Zelle 0 (oder der letzten Spalte) reicht
      // das, um die halbe Panelbreite ueber breiteU=0 (bzw. das Wandende)
      // hinauszuschieben. Die Zellgrenze schuetzt hier nicht, nur eine
      // Klammer auf die tatsaechliche Wandflaeche.
      const uRoh = col * zellU + zellBreiteU / 2 + kanteU;
      const u = Math.min(breiteU - panelBreiteU / 2,
        Math.max(panelBreiteU / 2, uRoh));
      const vRoh = RAND_V_M + row * zellV + zellV / 2 + kanteV;
      const v = Math.min(hoeheV - panelBreiteV / 2,
        Math.max(panelBreiteV / 2, vRoh));

      panels.push({
        u,
        v,
        breiteU: panelBreiteU,
        breiteV: panelBreiteV,
        tiefe: s.panelDepth * (0.4 + zufall() * 0.6),
      });
    }
  }

  // -- Kabel: wenige lange Linien, horizontal oder vertikal, mit hoechstens
  //    einem 90-Grad-Knick. Kein Kabelbaum -- ein Streifen mit Relief reicht.
  const flaeche = (cols * rows) / ZELLEN_PRO_FLAECHENEINHEIT;
  const kabelAnzahl = Math.min(6, Math.round(s.cableDensity * flaeche));
  for (let i = 0; i < kabelAnzahl; i += 1) {
    const dicke = 0.02 + zufall() * 0.02;
    const waagerecht = zufall() < 0.5;
    if (waagerecht) {
      const v = RAND_V_M + zufall() * (hoeheV - 2 * RAND_V_M);
      const u0 = zufall() * breiteU * 0.3;
      const u1 = breiteU * (0.7 + zufall() * 0.3);
      if (zufall() < 0.35) {
        // Ein Knick: waagerecht, dann ein kurzes Stueck senkrecht.
        const uKnick = u0 + (u1 - u0) * (0.3 + zufall() * 0.4);
        const vZiel = Math.min(hoeheV - RAND_V_M, Math.max(RAND_V_M,
          v + (zufall() - 0.5) * hoeheV * 0.4));
        kabel.push({ punkte: [[u0, v], [uKnick, v], [uKnick, vZiel]], dicke });
      } else {
        kabel.push({ punkte: [[u0, v], [u1, v]], dicke });
      }
    } else {
      const u = zufall() * breiteU;
      const v0 = RAND_V_M + zufall() * (hoeheV - 2 * RAND_V_M) * 0.3;
      const v1 = hoeheV - RAND_V_M * (0.5 + zufall() * 0.5);
      if (zufall() < 0.35) {
        const vKnick = v0 + (v1 - v0) * (0.3 + zufall() * 0.4);
        const uZiel = Math.min(breiteU * 0.95, Math.max(breiteU * 0.05,
          u + (zufall() - 0.5) * breiteU * 0.4));
        kabel.push({ punkte: [[u, v0], [u, vKnick], [uZiel, vKnick]], dicke });
      } else {
        kabel.push({ punkte: [[u, v0], [u, v1]], dicke });
      }
    }
  }

  // -- Technikboxen: selten, an zufaelligen Rasterpunkten.
  const boxAnzahl = Math.min(4, Math.round(s.techDensity * flaeche * 0.6));
  for (let i = 0; i < boxAnzahl; i += 1) {
    const col = Math.floor(zufall() * cols);
    const row = Math.floor(zufall() * rows);
    boxen.push({
      u: col * zellU + zellU / 2,
      v: RAND_V_M + row * zellV + zellV / 2,
      breite: 0.18 + zufall() * 0.22,
      hoehe: 0.18 + zufall() * 0.22,
      tiefe: 0.08 + zufall() * 0.06,
    });
  }

  return { panels, kabel, boxen };
}
