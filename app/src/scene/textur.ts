/**
 * Die Zeichnung der zehn Materialfamilien.
 *
 * `stil.ts` sagt, *wie* eine Fläche beleuchtet und umrandet wird -- mit wie
 * vielen Lichtstufen, wie dick die Kontur ist. Hier steht, *was* auf ihr zu
 * sehen ist: Fugen, Plattenstösse, Bretter, Kratzer, Körnung.
 *
 * Warum das zusammengehört und trotzdem getrennt ist: die Stilbibel fordert
 * ausdrücklich beides -- "Cel Shading mit gestuften Lichtwerten" **und**
 * "sichtbare Materialzeichnung". Eine gestufte Beleuchtung auf einer leeren
 * Farbfläche ergibt keinen Comic, sondern eine Pappschachtel. Erst die
 * Zeichnung darunter macht daraus Beton, Holz oder Blech.
 *
 * Die Bauart ist von der Vorlage übernommen und in drei Punkten weitergeführt:
 *
 * * **Kein Canvas.** Gezeichnet wird auf einem `Raster` -- prüfbar ohne DOM
 *   und damit überhaupt erst prüfbar (siehe `textur.test.ts`).
 * * **Umlaufend.** Jeder Strich, der rechts hinausläuft, läuft links wieder
 *   herein. Auf einem Canvas endet er am Rand, und die gekachelte Fläche zeigt
 *   ein Gitter aus abgeschnittenen Linien.
 * * **Eine Familie, eine Zeichnung.** Die Vorlage kennt fünf freie Varianten;
 *   hier hängt jede an einer der zehn Familien der Stilbibel. Wer eine elfte
 *   Zeichnung braucht, hat meistens eine der zehn nicht gefunden.
 */

import * as THREE from 'three';

import { Raster, farbe, grau, hsl, mulberry32, normalenkarte, type Farbe } from './raster';
import type { Familie } from './stil';

/**
 * Kantenlänge einer Textur in Pixeln.
 *
 * 512 und nicht 1024: die Karten werden in Metern gekachelt und nicht über
 * eine ganze Wand gestreckt, eine Kachel deckt also 2 bis 8 m ab. Bei
 * 512 sind das rund 10 cm je Pixel -- genug für eine Fuge, und ein Viertel
 * des Speichers. Auf dem Telefon zählt das.
 */
export const KACHEL_PX = 512;

/** Farbe, Normale und Höhe einer Fläche. */
export interface Zeichnung {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
}

/**
 * Wie gross eine Kachel in der Welt ist, je Familie, in Metern.
 *
 * Feste Meter und nicht "einmal über die Fläche": eine Standwand von 3 m und
 * eine Hallenwand von 30 m sollen dieselbe Körnung haben. Sonst verrät der
 * Maßstab, dass es dieselbe Textur ist.
 */
export const KACHEL_M: Record<string, number> = {
  M01: 6, M02: 4, M03: 8, M04: 6, M05: 10,
  M06: 4, M07: 6, M08: 2, M09: 3, M10: 2,
};

// ---------------------------------------------------------------------------
// Bausteine, die sich mehrere Zeichnungen teilen
// ---------------------------------------------------------------------------

/**
 * Ein Plattenraster mit Fuge -- die Grundform jedes Bodens.
 *
 * Jede Platte bekommt ihren eigenen Ton, ein bis zwei Prozent neben dem
 * Nachbarn. Das ist der ganze Trick: ein Boden aus lauter identischen Platten
 * liest sich als Muster, ein Boden mit Streuung als Material.
 */
function platten(bild: Raster, hoehe: Raster, kanten: number, fugePx: number,
                 startwert: number, ton: { h: number; s: number; l: number },
                 streuung: number, fugenfarbe: string): void {
  const zufall = mulberry32(startwert);
  const zelle = bild.breite / kanten;
  for (let y = 0; y < kanten; y += 1) {
    for (let x = 0; x < kanten; x += 1) {
      bild.rechteck(x * zelle, y * zelle, zelle, zelle,
                    hsl(ton.h + (zufall() - 0.5) * 8,
                        ton.s,
                        ton.l + (zufall() - 0.5) * streuung));
    }
  }
  const fuge = farbe(fugenfarbe);
  for (let i = 0; i < kanten; i += 1) {
    bild.rechteck(i * zelle - fugePx / 2, 0, fugePx, bild.hoehe, fuge);
    bild.rechteck(0, i * zelle - fugePx / 2, bild.breite, fugePx, fuge);
    hoehe.rechteck(i * zelle - fugePx / 2, 0, fugePx, hoehe.hoehe, grau(40));
    hoehe.rechteck(0, i * zelle - fugePx / 2, hoehe.breite, fugePx, grau(40));
  }
}

/**
 * Senkrechte Bretter mit Schattenfuge -- Holzdeck und Blechfassade zugleich.
 *
 * Dieselbe Form, zwei Materialien: der Unterschied liegt nur im Farbton und
 * in der Breite. Das ist Absicht -- beide sind gefügte, gerichtete Flächen,
 * und sie sollen sich in der Silhouette gleich verhalten.
 */
function bretter(bild: Raster, hoehe: Raster, breitePx: number, fugePx: number,
                 startwert: number, ton: { h: number; hSpanne: number; s: number;
                                            l: number; lSpanne: number },
                 fugenfarbe: string): void {
  const zufall = mulberry32(startwert);
  const fuge = farbe(fugenfarbe);
  for (let x = 0; x < bild.breite; x += breitePx) {
    bild.rechteck(x + fugePx, 0, breitePx - fugePx, bild.hoehe,
                  hsl(ton.h + zufall() * ton.hSpanne, ton.s,
                      ton.l + zufall() * ton.lSpanne));
    bild.rechteck(x, 0, fugePx, bild.hoehe, fuge);
    hoehe.rechteck(x, 0, fugePx + 1, hoehe.hoehe, grau(36));
    // Die Maserung: lange, sehr schwache Striche in Brettrichtung.
    for (let i = 0; i < 6; i += 1) {
      const px = x + fugePx + zufall() * (breitePx - fugePx);
      bild.linie(px, 0, px + (zufall() - 0.5) * 6, bild.hoehe,
                 0.8 + zufall(), farbe(fugenfarbe), 0.05 + zufall() * 0.08);
    }
  }
}

/** Ein Stoss, wie ihn Fassadentafeln und Trockenbauwände haben. */
function tafelstoesse(bild: Raster, hoehe: Raster, abstandPx: number,
                      ton: string, quer = 0): void {
  const linie = farbe(ton);
  for (let x = 0; x < bild.breite; x += abstandPx) {
    bild.linie(x, 0, x, bild.hoehe, 2.4, linie, 0.4);
    hoehe.linie(x, 0, x, hoehe.hoehe, 3.2, grau(30), 1);
  }
  if (quer > 0) {
    for (let y = quer / 2; y < bild.hoehe; y += quer) {
      bild.linie(0, y, bild.breite, y, 1.4, linie, 0.22);
      hoehe.linie(0, y, hoehe.breite, y, 2, grau(60), 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Die zehn Zeichnungen
// ---------------------------------------------------------------------------

type Bauplan = (startwert: number) => { bild: Raster; hoehe: Raster };

/** M04 -- heller Foyerboden: Terrazzoplatten, geschliffen, mit Laufspuren. */
function foyerboden(startwert: number) {
  const bild = new Raster(KACHEL_PX, KACHEL_PX, farbe('#b7ad9e'));
  const hoehe = new Raster(KACHEL_PX, KACHEL_PX, grau(170));
  platten(bild, hoehe, 4, 5, startwert, { h: 36, s: 14, l: 70 }, 9, '#4a443b');
  bild.sprenkel(startwert + 7, 11000, farbe('#efe9dc'), farbe('#5d554a'));
  bild.flecken(startwert + 9, 22, 0.05, 110);
  bild.krakelee(startwert + 5, 26, farbe('#3a332b'), 130, 0.4);
  bild.kratzer(startwert + 2, 160, farbe('#3b322a'));
  bild.koernung(startwert + 1, 0.03);
  return { bild, hoehe };
}

/** M03 -- dunkler Hallenboden: derselbe Aufbau, eingefärbt und stärker benutzt. */
function hallenboden(startwert: number) {
  const bild = new Raster(KACHEL_PX, KACHEL_PX, farbe('#4b4e51'));
  const hoehe = new Raster(KACHEL_PX, KACHEL_PX, grau(170));
  platten(bild, hoehe, 3, 6, startwert, { h: 210, s: 4, l: 30 }, 8, '#0d0e10');
  // Laufspuren und blanke Stellen. Ein Hallenboden ist nie frisch verlegt.
  bild.flecken(startwert + 9, 34, 0.085, 130);
  bild.krakelee(startwert + 5, 42, farbe('#090b0d'), 150, 0.55);
  bild.sprenkel(startwert + 7, 5200, farbe('#949aa0'), farbe('#101315'));
  bild.kratzer(startwert + 3, 240, farbe('#0a0c0d'), 12, 120);
  bild.koernung(startwert + 1, 0.04);
  return { bild, hoehe };
}

/** M05 -- Aussenbeton: grosse Platten, breite Fuge, kaum Glanz. */
function aussenbeton(startwert: number) {
  const bild = new Raster(KACHEL_PX, KACHEL_PX, farbe('#cbc6bb'));
  const hoehe = new Raster(KACHEL_PX, KACHEL_PX, grau(170));
  platten(bild, hoehe, 2, 7, startwert, { h: 42, s: 8, l: 78 }, 6, '#7d786f');
  bild.flecken(startwert + 9, 18, 0.055, 150);
  bild.krakelee(startwert + 5, 30, farbe('#5a544b'), 170, 0.42);
  bild.sprenkel(startwert + 7, 7000, farbe('#efece4'), farbe('#7c766c'));
  bild.kratzer(startwert + 4, 90, farbe('#6c6459'), 20, 160);
  bild.koernung(startwert + 1, 0.04);
  return { bild, hoehe };
}

/** M01 -- helle Wand: Tafelstösse senkrecht, feine Querfuge, sonst ruhig. */
function wandtafel(startwert: number) {
  const bild = new Raster(KACHEL_PX, KACHEL_PX, farbe('#d6d2c7'));
  const hoehe = new Raster(KACHEL_PX, KACHEL_PX, grau(150));
  tafelstoesse(bild, hoehe, KACHEL_PX / 4, '#1b1814', KACHEL_PX / 2);
  // Die Wand am Rolltreppenblock ist auf dem Referenzbild von feinen dunklen
  // Zuegen durchzogen -- Schalspuren, Regenlaeufer, Stossstellen.
  bild.flecken(startwert + 9, 16, 0.04, 140);
  bild.krakelee(startwert + 5, 34, farbe('#4a423a'), 190, 0.34);
  bild.kratzer(startwert + 2, 60, farbe('#3c342b'), 6, 40);
  bild.koernung(startwert + 1, 0.02);
  return { bild, hoehe };
}

/** M02 -- dunkle Struktur: Stützen und Träger, gerichtet und hart. */
function struktur(startwert: number) {
  const bild = new Raster(KACHEL_PX, KACHEL_PX, farbe('#2b2e33'));
  const hoehe = new Raster(KACHEL_PX, KACHEL_PX, grau(150));
  tafelstoesse(bild, hoehe, KACHEL_PX / 8, '#08090a', KACHEL_PX / 4);
  bild.flecken(startwert + 9, 14, 0.06, 100);
  bild.krakelee(startwert + 6, 22, farbe('#0a0b0d'), 110, 0.5);
  bild.kratzer(startwert + 5, 120, farbe('#5b626b'), 8, 48);
  bild.koernung(startwert + 1, 0.028);
  return { bild, hoehe };
}

/** M06 -- Holzdeck: schmale Bretter, warme Streuung, sichtbare Maserung. */
function holzdeck(startwert: number) {
  const bild = new Raster(KACHEL_PX, KACHEL_PX, farbe('#8a5939'));
  const hoehe = new Raster(KACHEL_PX, KACHEL_PX, grau(150));
  bretter(bild, hoehe, KACHEL_PX / 8, 3, startwert,
          { h: 18, hSpanne: 10, s: 42, l: 33, lSpanne: 14 }, '#2c1a12');
  bild.flecken(startwert + 9, 20, 0.05, 80);
  bild.krakelee(startwert + 5, 18, farbe('#25130b'), 100, 0.35);
  bild.kratzer(startwert + 2, 150, farbe('#2b160d'), 10, 90);
  bild.koernung(startwert + 1, 0.035);
  return { bild, hoehe };
}

/**
 * M07 -- Glas: Pfosten-Riegel-Raster mit **scheibenweise** verschiedenem Ton.
 *
 * Der Punkt, an dem eine Glasfassade steht oder fällt. Auf dem Referenzbild
 * vom Boulevard ist keine Scheibe wie die andere: eine spiegelt hellen
 * Himmel, die daneben zeigt dunkel den Innenraum, die dritte fängt einen
 * Baum. Genau diese Unruhe liest man als Glas.
 *
 * Die erste Fassung legte einen gleichmässigen Schrägzug über die ganze
 * Fläche -- über die Pfosten hinweg, quer durch alles. Das las sich als
 * Folie über einer blauen Wand, nicht als verglaste Fassade: eine Spiegelung
 * endet am Rahmen, weil dahinter eine andere Scheibe in einem anderen Winkel
 * steht.
 */
function glasraster(startwert: number) {
  const bild = new Raster(KACHEL_PX, KACHEL_PX, farbe('#8fa9bd'));
  const hoehe = new Raster(KACHEL_PX, KACHEL_PX, grau(190));
  const zufall = mulberry32(startwert);
  const spalten = 4;
  const zeilen = 2;
  const breite = KACHEL_PX / spalten;
  const hoch = KACHEL_PX / zeilen;

  for (let zy = 0; zy < zeilen; zy += 1) {
    for (let zx = 0; zx < spalten; zx += 1) {
      const x = zx * breite;
      const y = zy * hoch;
      // Drei Zustände, wie sie eine Fassade tatsächlich zeigt: Himmel,
      // Innenraum, und das Übliche dazwischen.
      const wurf = zufall();
      const ton = wurf < 0.25 ? hsl(205, 30, 68 + zufall() * 10)
        : wurf < 0.45 ? hsl(210, 18, 26 + zufall() * 10)
          : hsl(203, 24, 44 + zufall() * 16);
      bild.rechteck(x, y, breite, hoch, ton);

      // Die Spiegelung bleibt in ihrer Scheibe -- sie endet am Rahmen.
      if (zufall() < 0.6) {
        const versatz = zufall() * breite;
        for (let s = 0; s < 2; s += 1) {
          const start = versatz + s * (12 + zufall() * 18);
          for (let dy = 0; dy < hoch; dy += 1) {
            const px = x + ((start + dy * 0.55) % breite);
            bild.rechteck(px, y + dy, 6 + zufall() * 10, 1,
                          farbe('#dbe8f4'), 0.1 + zufall() * 0.12);
          }
        }
      }
    }
  }

  // Rahmen zuletzt, damit er scharf bleibt: Pfosten kräftig, Riegel feiner.
  const rahmen = farbe('#2c343a');
  for (let zx = 0; zx <= spalten; zx += 1) {
    bild.rechteck(zx * breite - 4, 0, 8, KACHEL_PX, rahmen);
    hoehe.rechteck(zx * breite - 4, 0, 8, KACHEL_PX, grau(50));
    // Die Lichtkante des Profils -- ohne sie ist der Pfosten ein Strich.
    bild.rechteck(zx * breite + 4, 0, 2, KACHEL_PX, farbe('#9fb3c4'), 0.5);
  }
  for (let zy = 0; zy <= zeilen; zy += 1) {
    bild.rechteck(0, zy * hoch - 3, KACHEL_PX, 6, rahmen);
    hoehe.rechteck(0, zy * hoch - 3, KACHEL_PX, 6, grau(50));
  }
  bild.koernung(startwert + 1, 0.012);
  return { bild, hoehe };
}

/** M08 -- Metall: gebürstet, gerichtet, ohne Fuge. */
function metall(startwert: number) {
  const bild = new Raster(KACHEL_PX, KACHEL_PX, farbe('#a8adb4'));
  const hoehe = new Raster(KACHEL_PX, KACHEL_PX, grau(140));
  const zufall = mulberry32(startwert);
  for (let i = 0; i < 900; i += 1) {
    const y = zufall() * KACHEL_PX;
    const hell = zufall() > 0.5;
    bild.linie(0, y, KACHEL_PX, y + (zufall() - 0.5) * 3, 0.6 + zufall(),
               hell ? farbe('#d5dae0') : farbe('#6d747c'), 0.05 + zufall() * 0.12);
  }
  bild.koernung(startwert + 1, 0.02);
  return { bild, hoehe };
}

/**
 * M09 -- Laub: gelappte Büschel mit dunkler Trennung, nicht Blätter.
 *
 * Die Stilbibel sagt es ausdrücklich: Vegetation ist Landmarke, nicht
 * Botanik-Simulation -- markante Kronensilhouette, klare dunkle Außenkante,
 * innen flächig gestuft. Auf dem Referenzbild ist der Baum vor Halle 11 genau
 * das: erkennbare Büschel mit Tuschekante dazwischen.
 *
 * Erste Fassung streute einzelne Kreise. Das ergab Schaum -- lauter perfekte
 * Kugeln ohne Trennung. Jetzt besteht ein Büschel aus mehreren
 * ineinandergreifenden Keulen, und zwischen den Büscheln steht ein dunkler
 * Rand. Die Lappung ist der Unterschied zwischen Laub und Seifenblasen.
 */
function laub(startwert: number) {
  const bild = new Raster(KACHEL_PX, KACHEL_PX, farbe('#38502a'));
  const hoehe = new Raster(KACHEL_PX, KACHEL_PX, grau(96));
  const zufall = mulberry32(startwert);

  const keule = (x: number, y: number, r: number, ton: Farbe,
                 deckkraft: number, hoehenwert: number) => {
    for (let dy = -r; dy <= r; dy += 1) {
      const halb = Math.sqrt(Math.max(0, r * r - dy * dy));
      bild.rechteck(x - halb, y + dy, halb * 2, 1, ton, deckkraft);
      hoehe.rechteck(x - halb, y + dy, halb * 2, 1,
                     grau(hoehenwert + Math.round((1 - Math.abs(dy) / r) * 60)), 0.6);
    }
  };

  for (let i = 0; i < 190; i += 1) {
    const cx = zufall() * KACHEL_PX;
    const cy = zufall() * KACHEL_PX;
    const gross = 16 + zufall() * 26;
    const hell = hsl(78 + zufall() * 34, 30 + zufall() * 22, 26 + zufall() * 22);
    // Erst die dunkle Kante -- das Büschel etwas grösser und fast schwarz.
    keule(cx, cy, gross * 1.16, farbe('#1a2412'), 0.85, 70);
    // Dann die Lappen, die es ausfüllen.
    const lappen = 3 + Math.floor(zufall() * 4);
    for (let k = 0; k < lappen; k += 1) {
      const winkel = (k / lappen) * Math.PI * 2 + zufall();
      const weite = gross * (0.3 + zufall() * 0.35);
      keule(cx + Math.cos(winkel) * weite, cy + Math.sin(winkel) * weite,
            gross * (0.45 + zufall() * 0.3), hell, 0.95, 120);
    }
  }
  // Ein paar Lichtblitze auf den obersten Lappen -- der Sonnenstand der
  // Stilbibel: klare Tageslichtsituation mit definierten Schlagschatten.
  // Flach und schwach: runde, kräftige Punkte lesen sich als Regentropfen.
  for (let i = 0; i < 120; i += 1) {
    const x = zufall() * KACHEL_PX;
    const y = zufall() * KACHEL_PX;
    const laenge = 5 + zufall() * 11;
    bild.linie(x, y, x + laenge, y + laenge * (zufall() - 0.5), 2.5 + zufall() * 2,
               hsl(74 + zufall() * 20, 34, 50 + zufall() * 14), 0.3);
  }
  bild.koernung(startwert + 1, 0.045);
  return { bild, hoehe };
}

/** M10 -- Beschilderung: glatt. Die Zeichnung ist die Schrift, und die kommt als Objekt. */
function schild(startwert: number) {
  const bild = new Raster(KACHEL_PX, KACHEL_PX, farbe('#2f7d4f'));
  const hoehe = new Raster(KACHEL_PX, KACHEL_PX, grau(128));
  bild.koernung(startwert + 1, 0.012);
  return { bild, hoehe };
}

const BAUPLAENE: Record<string, Bauplan> = {
  M01: wandtafel,
  M02: struktur,
  M03: hallenboden,
  M04: foyerboden,
  M05: aussenbeton,
  M06: holzdeck,
  M07: glasraster,
  M08: metall,
  M09: laub,
  M10: schild,
};

/**
 * Ein fester Startwert je Familie.
 *
 * Nicht `Math.random()`: dieselbe Halle soll bei jedem Start gleich aussehen,
 * sonst lässt sich kein Screenshot mit einem zweiten vergleichen und keine
 * Abweichung als Fehler erkennen.
 */
const STARTWERT: Record<string, number> = {
  M01: 241, M02: 907, M03: 381, M04: 118, M05: 553,
  M06: 510, M07: 764, M08: 322, M09: 645, M10: 199,
};

const zeichnungen = new Map<string, Zeichnung>();

/**
 * Die Zeichnung einer Familie -- einmal gerechnet, überall geteilt.
 *
 * Geteilt und nicht je Fläche neu: eine Halle hat hundert Wände, und hundert
 * gleiche Texturen wären hundertmal derselbe Speicher. Wer eine andere
 * Kachelung braucht, setzt `repeat` an seinem Material -- dafür ist die
 * Textur `RepeatWrapping`.
 */
export function familienZeichnung(familie: Familie | string): Zeichnung {
  const id = typeof familie === 'string' ? familie : familie.id;
  const fertig = zeichnungen.get(id);
  if (fertig) return fertig;

  const bauplan = BAUPLAENE[id];
  if (!bauplan) throw new Error(`Keine Zeichnung für Familie ${id}`);
  const { bild, hoehe } = bauplan(STARTWERT[id] ?? 1);
  const zeichnung: Zeichnung = {
    map: bild.textur(true),
    normalMap: normalenkarte(hoehe, id === 'M07' || id === 'M08' ? 1.2 : 2.4).textur(),
  };
  zeichnungen.set(id, zeichnung);
  return zeichnung;
}

/**
 * Wie oft die Kachel auf eine Fläche gegebener Grösse passt.
 *
 * Der Umweg über Meter statt über eine Wiederholungszahl ist der Punkt: so
 * behält jede Fläche dieselbe Körnung, egal wie gross sie ist.
 */
export function kachelung(familie: Familie | string,
                          breiteM: number, hoeheM: number): [number, number] {
  const id = typeof familie === 'string' ? familie : familie.id;
  const kachel = KACHEL_M[id] ?? 4;
  return [Math.max(1, breiteM / kachel), Math.max(1, hoeheM / kachel)];
}

/** Gibt die geteilten Texturen frei. Nur für Tests und Szenenwechsel gedacht. */
export function texturenAufraeumen(): void {
  zeichnungen.forEach((zeichnung) => {
    zeichnung.map.dispose();
    zeichnung.normalMap.dispose();
  });
  zeichnungen.clear();
}

/** Alle Familien, die eine Zeichnung haben -- für Prüfungen und Übersichten. */
export function gezeichneteFamilien(): string[] {
  return Object.keys(BAUPLAENE);
}

/**
 * Die rohen Raster, bevor sie Texturen werden.
 *
 * Für Prüfungen und für `textur-vorschau.mjs`, das daraus PNGs schreibt.
 * Prozedurale Flächen kann man nicht durch Lesen beurteilen -- ein Test sagt
 * "die Fuge ist zwei Pixel breit", aber nicht, ob die Fläche nach Beton
 * aussieht. Dafür muss man sie ansehen können, und zwar ohne Browser.
 */
export function zeichnungsRaster(): Record<string, { bild: Raster; hoehe: Raster }> {
  const alle: Record<string, { bild: Raster; hoehe: Raster }> = {};
  for (const [id, bauplan] of Object.entries(BAUPLAENE)) {
    alle[id] = bauplan(STARTWERT[id] ?? 1);
  }
  return alle;
}
