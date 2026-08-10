import { afterEach, describe, expect, it } from 'vitest';

import { FAMILIEN } from './stil';
import {
  KACHEL_M,
  KACHEL_PX,
  familienZeichnung,
  gezeichneteFamilien,
  kachelung,
  texturenAufraeumen,
  zeichnungsRaster,
} from './textur';

afterEach(() => texturenAufraeumen());

/** Mittlere Helligkeit eines Rasters -- der gröbste Blick auf eine Fläche. */
function helligkeit(daten: Uint8ClampedArray): number {
  let summe = 0;
  for (let i = 0; i < daten.length; i += 4) {
    summe += (daten[i] + daten[i + 1] + daten[i + 2]) / 3;
  }
  return summe / (daten.length / 4);
}

/** Wie stark benachbarte Punkte voneinander abweichen -- ein Mass für Zeichnung. */
function unruhe(daten: Uint8ClampedArray, kante: number): number {
  let summe = 0;
  let zahl = 0;
  for (let y = 0; y < kante; y += 4) {
    for (let x = 0; x < kante - 1; x += 4) {
      const a = daten[(y * kante + x) * 4];
      const b = daten[(y * kante + x + 1) * 4];
      summe += Math.abs(a - b);
      zahl += 1;
    }
  }
  return summe / zahl;
}

describe('Jede Familie hat ihre Zeichnung', () => {
  it('deckt alle zehn Familien der Stilbibel ab', () => {
    expect(gezeichneteFamilien().sort()).toEqual(Object.keys(FAMILIEN).sort());
  });

  it('gibt für jede Familie eine Kachelgrösse in Metern an', () => {
    for (const id of Object.keys(FAMILIEN)) {
      expect(KACHEL_M[id], id).toBeGreaterThan(0);
      expect(KACHEL_M[id], id).toBeLessThanOrEqual(16);
    }
  });

  it('kennt keine Familie ohne Eintrag in der Stilbibel', () => {
    for (const id of gezeichneteFamilien()) {
      expect(FAMILIEN[id], id).toBeDefined();
    }
  });
});

describe('Die Zeichnungen zeigen etwas', () => {
  /**
   * Der Test, um den es eigentlich geht. Eine prozedurale Fläche, die keine
   * Zeichnung trägt, ist eine Farbfläche mit Rauschen -- und genau daran hat
   * die erste Fassung gekrankt. Gemessen wird deshalb, ob überhaupt Struktur
   * da ist, und zwar für jede Familie einzeln.
   */
  const raster = zeichnungsRaster();

  it.each(Object.keys(raster))('%s trägt sichtbare Zeichnung', (id) => {
    const wert = unruhe(raster[id].bild.daten, KACHEL_PX);
    expect(wert, `${id} ist zu glatt`).toBeGreaterThan(1.2);
  });

  it.each(Object.keys(raster).filter((id) => id !== 'M10'))(
    '%s bleibt lesbar und kippt nicht ins Schwarze oder Weisse', (id) => {
      const mittel = helligkeit(raster[id].bild.daten);
      expect(mittel, id).toBeGreaterThan(25);
      expect(mittel, id).toBeLessThan(235);
    });

  it('hält die dunklen Familien dunkler als die hellen', () => {
    // Sonst stimmt die Farbdramaturgie der Stilbibel nicht mehr: dunkle Böden,
    // helle Wände. Ein vertauschter Bauplan fiele sonst erst im Bild auf.
    const hell = helligkeit(raster.M04.bild.daten);
    const dunkel = helligkeit(raster.M03.bild.daten);
    expect(dunkel).toBeLessThan(hell - 40);
    expect(helligkeit(raster.M02.bild.daten))
      .toBeLessThan(helligkeit(raster.M01.bild.daten) - 40);
  });

  it('gibt jeder Bodenplatte einen eigenen Ton', () => {
    // Der ganze Unterschied zwischen Boden und Muster: ein Raster aus lauter
    // gleichen Platten liest sich als Tapete.
    const bild = raster.M04.bild;
    const zelle = KACHEL_PX / 4;
    const toene = new Set<number>();
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        toene.add(bild.lesen(x * zelle + zelle / 2, y * zelle + zelle / 2)[0]);
      }
    }
    expect(toene.size).toBeGreaterThanOrEqual(10);
  });

  it('gibt jeder Glasscheibe ihren eigenen Ton', () => {
    // Der Punkt, an dem eine Glasfassade steht oder fällt: auf dem
    // Referenzbild ist keine Scheibe wie die andere -- eine spiegelt hellen
    // Himmel, die daneben zeigt dunkel den Innenraum. Genau diese Unruhe
    // liest man als Glas. Eine gleichmässig blaue Fläche mit einem Raster
    // darüber liest man als Wand mit aufgemalten Fenstern.
    const bild = raster.M07.bild;
    const breite = KACHEL_PX / 4;
    const hoch = KACHEL_PX / 2;
    const toene: number[] = [];
    for (let zy = 0; zy < 2; zy += 1) {
      for (let zx = 0; zx < 4; zx += 1) {
        toene.push(bild.lesen(zx * breite + breite * 0.75, zy * hoch + hoch * 0.15)[0]);
      }
    }
    const spanne = Math.max(...toene) - Math.min(...toene);
    expect(spanne, `Scheibentöne: ${toene.join(', ')}`).toBeGreaterThan(40);
  });

  it('lässt die Spiegelung am Rahmen enden', () => {
    // Eine Spiegelung, die über den Pfosten hinwegläuft, verrät die Fläche
    // als Folie über einer blauen Wand. Hinter dem Rahmen steht eine andere
    // Scheibe in einem anderen Winkel.
    const bild = raster.M07.bild;
    const breite = KACHEL_PX / 4;
    for (let zx = 1; zx < 4; zx += 1) {
      // Im Pfosten selbst darf nichts Helles stehen.
      for (let y = 20; y < KACHEL_PX; y += 37) {
        expect(bild.lesen(zx * breite, y)[0], `Pfosten bei x=${zx * breite}`)
          .toBeLessThan(90);
      }
    }
  });

  it('zieht die Bretter des Holzdecks in eine Richtung', () => {
    // Senkrecht gefügt: über die Spalten hinweg wechselt der Ton von Brett zu
    // Brett, über die Zeilen hinweg bleibt er gleich.
    //
    // Gemessen an Spalten- und Zeilenmitteln und nicht an Nachbarpunkten: die
    // Körnung sitzt auf jedem Punkt und ist richtungslos, sie überdeckt einen
    // Punktvergleich vollständig. Der Mittelwert löscht sie heraus und lässt
    // die Fügung stehen.
    const bild = raster.M06.bild;
    const spalte: number[] = [];
    const zeile: number[] = [];
    for (let i = 0; i < KACHEL_PX; i += 1) {
      let sx = 0;
      let sy = 0;
      for (let j = 0; j < KACHEL_PX; j += 1) {
        sx += bild.lesen(i, j)[0];
        sy += bild.lesen(j, i)[0];
      }
      spalte.push(sx / KACHEL_PX);
      zeile.push(sy / KACHEL_PX);
    }
    const streuung = (werte: number[]) => {
      const mittel = werte.reduce((s, w) => s + w, 0) / werte.length;
      return Math.sqrt(werte.reduce((s, w) => s + (w - mittel) ** 2, 0) / werte.length);
    };
    expect(streuung(spalte)).toBeGreaterThan(streuung(zeile) * 4);
  });
});

describe('Höhenkarten', () => {
  it('setzt die Fugen tiefer als die Fläche', () => {
    // Ohne das bleibt jede Fuge ein aufgemalter Strich. Bei gestuftem Licht
    // fällt das besonders auf, weil die Stufe an einer echten Kante umspringt.
    const { hoehe } = zeichnungsRaster().M04;
    const zelle = KACHEL_PX / 4;
    const inDerFuge = hoehe.lesen(zelle, 60)[0];
    const aufDerPlatte = hoehe.lesen(zelle / 2, 60)[0];
    expect(inDerFuge).toBeLessThan(aufDerPlatte - 60);
  });
});

describe('Geteilte Texturen', () => {
  it('rechnet dieselbe Familie nur einmal', () => {
    const a = familienZeichnung(FAMILIEN.M01);
    const b = familienZeichnung('M01');
    expect(a.map).toBe(b.map);
    expect(a.normalMap).toBe(b.normalMap);
  });

  it('liefert die Karten im richtigen Farbraum', () => {
    const zeichnung = familienZeichnung(FAMILIEN.M04);
    // Farbe gehört nach sRGB, Normalen ausdrücklich nicht -- sonst rechnet
    // die Beleuchtung mit verbogenen Richtungen.
    expect(zeichnung.map.colorSpace).toBe('srgb');
    expect(zeichnung.normalMap.colorSpace).not.toBe('srgb');
  });

  it('meldet eine unbekannte Familie, statt still nichts zu zeichnen', () => {
    expect(() => familienZeichnung('M99')).toThrow(/M99/);
  });
});

describe('Kachelung in Metern', () => {
  it('gibt gleich grossen Flächen gleich viele Wiederholungen', () => {
    expect(kachelung('M01', 12, 12)).toEqual(kachelung('M01', 12, 12));
  });

  it('wiederholt auf der doppelten Fläche doppelt so oft', () => {
    const [x1] = kachelung('M01', 12, 6);
    const [x2] = kachelung('M01', 24, 6);
    expect(x2).toBeCloseTo(x1 * 2, 6);
  });

  it('lässt eine kleine Fläche nicht unter eine ganze Kachel fallen', () => {
    // Sonst würde ein 1-m-Pfosten einen Ausschnitt der Textur zeigen und
    // damit eine andere Körnung als die Wand daneben.
    expect(kachelung('M01', 0.5, 0.5)).toEqual([1, 1]);
  });

  it('richtet sich nach der Kachelgrösse der Familie', () => {
    // M08 (Metall, 2 m) muss auf derselben Fläche öfter wiederholen als
    // M05 (Aussenbeton, 10 m).
    expect(kachelung('M08', 20, 20)[0]).toBeGreaterThan(kachelung('M05', 20, 20)[0]);
  });
});
