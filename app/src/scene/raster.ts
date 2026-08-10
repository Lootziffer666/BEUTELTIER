/**
 * Ein Pixelbild, auf dem gezeichnet wird -- ohne Canvas.
 *
 * Warum nicht `document.createElement('canvas')`, wie es die Vorlage tut: die
 * Testumgebung hat kein DOM. Alles, was auf einem Canvas entsteht, ist damit
 * ungeprüft, und genau bei prozeduralen Texturen ist "sieht falsch aus" der
 * teuerste Fehler -- man merkt ihn erst im fertigen Bild. Hier ist jede
 * Zeichenoperation eine gewöhnliche Funktion über einem `Uint8ClampedArray`
 * und lässt sich Pixel für Pixel prüfen.
 *
 * Der zweite Grund wiegt schwerer: **dieses Raster ist rundum geschlossen.**
 * Jede Koordinate wird modulo Breite und Höhe genommen, ein Kratzer über den
 * rechten Rand läuft links weiter, eine Fuge am oberen Rand trifft die am
 * unteren. Auf einem Canvas endet der Strich am Bildrand, und eine gekachelte
 * Fläche zeigt dann ein sichtbares Gitter aus abgeschnittenen Linien -- der
 * Grund, warum prozedurale Flächen so oft nach Tapete aussehen und nicht nach
 * Material.
 */

import * as THREE from 'three';

/**
 * Zufall mit Gedächtnis.
 *
 * Derselbe Startwert ergibt dieselbe Fläche -- bei jedem Start, auf jedem
 * Gerät. Ohne das wäre jede Sitzung ein anderes Gelände, und kein Screenshot
 * liesse sich mit einem zweiten vergleichen.
 */
export function mulberry32(startwert: number): () => number {
  let zustand = startwert >>> 0;
  return () => {
    zustand += 0x6d2b79f5;
    let wert = zustand;
    wert = Math.imul(wert ^ (wert >>> 15), wert | 1);
    wert ^= wert + Math.imul(wert ^ (wert >>> 7), wert | 61);
    return ((wert ^ (wert >>> 14)) >>> 0) / 4294967296;
  };
}

export type Farbe = readonly [number, number, number];

/**
 * HSL nach RGB, in 0..255.
 *
 * Die Vorlagen sind in HSL geschrieben, weil man darin sagen kann "derselbe
 * Ton, zwei Prozent heller" -- und genau diese kleinen Abweichungen von Kachel
 * zu Kachel machen den Unterschied zwischen einem Boden und einer Farbfläche.
 */
export function hsl(h: number, s: number, l: number): Farbe {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hs = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hs % 2) - 1));
  const [r, g, b] = hs < 1 ? [c, x, 0] : hs < 2 ? [x, c, 0] : hs < 3 ? [0, c, x]
    : hs < 4 ? [0, x, c] : hs < 5 ? [x, 0, c] : [c, 0, x];
  const m = lN - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** `#rrggbb` nach RGB. */
export function farbe(hex: string): Farbe {
  const wert = parseInt(hex.replace('#', ''), 16);
  return [(wert >> 16) & 255, (wert >> 8) & 255, wert & 255];
}

/** Ein Grauwert als Farbe -- für Höhen- und Rauheitskarten. */
export function grau(wert: number): Farbe {
  return [wert, wert, wert];
}

export class Raster {
  readonly breite: number;
  readonly hoehe: number;
  readonly daten: Uint8ClampedArray;

  constructor(breite: number, hoehe = breite, fuellung: Farbe = [0, 0, 0]) {
    this.breite = breite;
    this.hoehe = hoehe;
    this.daten = new Uint8ClampedArray(breite * hoehe * 4);
    this.fuellen(fuellung);
  }

  private stelle(x: number, y: number): number {
    const ix = ((Math.floor(x) % this.breite) + this.breite) % this.breite;
    const iy = ((Math.floor(y) % this.hoehe) + this.hoehe) % this.hoehe;
    return (iy * this.breite + ix) * 4;
  }

  lesen(x: number, y: number): Farbe {
    const i = this.stelle(x, y);
    return [this.daten[i], this.daten[i + 1], this.daten[i + 2]];
  }

  /** Setzt einen Punkt; `deckkraft` mischt mit dem, was schon da ist. */
  punkt(x: number, y: number, ton: Farbe, deckkraft = 1): void {
    const i = this.stelle(x, y);
    if (deckkraft >= 1) {
      this.daten[i] = ton[0];
      this.daten[i + 1] = ton[1];
      this.daten[i + 2] = ton[2];
    } else {
      this.daten[i] += (ton[0] - this.daten[i]) * deckkraft;
      this.daten[i + 1] += (ton[1] - this.daten[i + 1]) * deckkraft;
      this.daten[i + 2] += (ton[2] - this.daten[i + 2]) * deckkraft;
    }
    this.daten[i + 3] = 255;
  }

  fuellen(ton: Farbe): void {
    for (let i = 0; i < this.daten.length; i += 4) {
      this.daten[i] = ton[0];
      this.daten[i + 1] = ton[1];
      this.daten[i + 2] = ton[2];
      this.daten[i + 3] = 255;
    }
  }

  rechteck(x: number, y: number, breite: number, hoehe: number,
           ton: Farbe, deckkraft = 1): void {
    for (let dy = 0; dy < hoehe; dy += 1) {
      for (let dx = 0; dx < breite; dx += 1) {
        this.punkt(x + dx, y + dy, ton, deckkraft);
      }
    }
  }

  /**
   * Eine Linie beliebiger Richtung mit Dicke.
   *
   * Abgetastet und nicht gerastert: für jeden Schritt entlang der Linie wird
   * quer dazu aufgetragen. Das ist langsamer als Bresenham und dafür sind die
   * Kanten nicht treppig -- bei einer Fuge von anderthalb Pixeln sieht man
   * jede Treppe.
   */
  linie(x0: number, y0: number, x1: number, y1: number,
        dicke: number, ton: Farbe, deckkraft = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const laenge = Math.hypot(dx, dy);
    if (laenge < 1e-6) return;
    const nx = -dy / laenge;
    const ny = dx / laenge;
    const schritte = Math.ceil(laenge * 2);
    const quer = Math.max(1, Math.ceil(dicke * 2));
    for (let i = 0; i <= schritte; i += 1) {
      const t = i / schritte;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      for (let j = -quer; j <= quer; j += 1) {
        const abstand = (j / 2);
        if (Math.abs(abstand) > dicke / 2) continue;
        // Zu den Rändern hin ausblenden -- das ist die Kantenglättung.
        const rand = Math.min(1, (dicke / 2 - Math.abs(abstand)) * 2);
        this.punkt(px + nx * abstand, py + ny * abstand, ton, deckkraft * rand);
      }
    }
  }

  /**
   * Feinkörnige Unruhe über die ganze Fläche.
   *
   * Als *soft light* und nicht als Deckfarbe: die Körnung soll das Material
   * aufrauen, nicht überdecken. Aufgetragen wird sie deshalb relativ zu dem,
   * was schon da ist -- ein heller Boden wird körnig hell, ein dunkler
   * körnig dunkel, und die Zeichnung darunter bleibt lesbar.
   */
  koernung(startwert: number, staerke: number): void {
    const zufall = mulberry32(startwert);
    for (let i = 0; i < this.daten.length; i += 4) {
      const stoerung = (zufall() - 0.5) * 2 * staerke * 255;
      this.daten[i] += stoerung;
      this.daten[i + 1] += stoerung;
      this.daten[i + 2] += stoerung;
    }
  }

  /**
   * Gebrauchsspuren: kurze, flache Kratzer in zufälliger Richtung.
   *
   * Der eine Zug, der eine ebene Fläche von einer benutzten unterscheidet.
   * Sie laufen über den Rand hinaus und links wieder herein -- deshalb bleibt
   * die Kachel nahtlos.
   */
  kratzer(startwert: number, anzahl: number, ton: Farbe,
          laengeMin = 8, laengeMax = 72): void {
    const zufall = mulberry32(startwert);
    for (let i = 0; i < anzahl; i += 1) {
      const x = zufall() * this.breite;
      const y = zufall() * this.hoehe;
      const laenge = laengeMin + zufall() * (laengeMax - laengeMin);
      const winkel = (zufall() - 0.5) * Math.PI;
      this.linie(x, y, x + Math.cos(winkel) * laenge, y + Math.sin(winkel) * laenge,
                 0.4 + zufall() * 0.9, ton, 0.03 + zufall() * 0.11);
    }
  }

  /** Multipliziert die ganze Fläche mit einem Ton -- zum Abdunkeln und Einfärben. */
  einfaerben(ton: Farbe): void {
    for (let i = 0; i < this.daten.length; i += 4) {
      this.daten[i] = (this.daten[i] * ton[0]) / 255;
      this.daten[i + 1] = (this.daten[i + 1] * ton[1]) / 255;
      this.daten[i + 2] = (this.daten[i + 2] * ton[2]) / 255;
    }
  }

  textur(farbraum = false): THREE.DataTexture {
    const textur = new THREE.DataTexture(
      new Uint8Array(this.daten.buffer.slice(0)), this.breite, this.hoehe, THREE.RGBAFormat);
    textur.wrapS = THREE.RepeatWrapping;
    textur.wrapT = THREE.RepeatWrapping;
    textur.magFilter = THREE.LinearFilter;
    textur.minFilter = THREE.LinearMipmapLinearFilter;
    textur.generateMipmaps = true;
    textur.anisotropy = 8;
    if (farbraum) textur.colorSpace = THREE.SRGBColorSpace;
    textur.needsUpdate = true;
    return textur;
  }
}

/**
 * Macht aus einer Höhenkarte eine Normalenkarte.
 *
 * Sobel über die Helligkeit: die Steigung in x und y wird zur Neigung der
 * Fläche. Das ist der Unterschied zwischen einer Fuge, die aufgemalt ist, und
 * einer, an der sich Licht bricht -- und bei gestuftem Licht ist es sogar der
 * grössere Unterschied, weil die Stufe an der Kante umspringt.
 *
 * Liest wie alles hier umlaufend, damit auch die Normalen nahtlos kacheln.
 */
export function normalenkarte(hoehe: Raster, staerke = 2.2): Raster {
  const ziel = new Raster(hoehe.breite, hoehe.hoehe);
  const bei = (x: number, y: number) => hoehe.lesen(x, y)[0] / 255;
  for (let y = 0; y < hoehe.hoehe; y += 1) {
    for (let x = 0; x < hoehe.breite; x += 1) {
      const dx = bei(x - 1, y - 1) + 2 * bei(x - 1, y) + bei(x - 1, y + 1)
        - (bei(x + 1, y - 1) + 2 * bei(x + 1, y) + bei(x + 1, y + 1));
      const dy = bei(x - 1, y - 1) + 2 * bei(x, y - 1) + bei(x + 1, y - 1)
        - (bei(x - 1, y + 1) + 2 * bei(x, y + 1) + bei(x + 1, y + 1));
      const nx = dx * staerke;
      const ny = dy * staerke;
      const laenge = Math.sqrt(nx * nx + ny * ny + 1);
      ziel.punkt(x, y, [
        ((nx / laenge) * 0.5 + 0.5) * 255,
        ((ny / laenge) * 0.5 + 0.5) * 255,
        ((1 / laenge) * 0.5 + 0.5) * 255,
      ]);
    }
  }
  return ziel;
}
