import { describe, expect, it } from 'vitest';

import { Raster, farbe, grau, hsl, mulberry32, normalenkarte } from './raster';

describe('Zufall mit Gedächtnis', () => {
  it('liefert bei gleichem Startwert dieselbe Folge', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const folgeA = [a(), a(), a(), a()];
    const folgeB = [b(), b(), b(), b()];
    expect(folgeA).toEqual(folgeB);
  });

  it('liefert bei anderem Startwert eine andere Folge', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('bleibt zwischen null und eins', () => {
    const zufall = mulberry32(7);
    for (let i = 0; i < 500; i += 1) {
      const wert = zufall();
      expect(wert).toBeGreaterThanOrEqual(0);
      expect(wert).toBeLessThan(1);
    }
  });
});

describe('Farbrechnung', () => {
  it('rechnet HSL in RGB', () => {
    expect(hsl(0, 100, 50)).toEqual([255, 0, 0]);
    expect(hsl(120, 100, 50)).toEqual([0, 255, 0]);
    expect(hsl(240, 100, 50)).toEqual([0, 0, 255]);
    expect(hsl(0, 0, 100)).toEqual([255, 255, 255]);
    expect(hsl(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it('nimmt den Farbton umlaufend', () => {
    expect(hsl(360, 100, 50)).toEqual(hsl(0, 100, 50));
    expect(hsl(-120, 100, 50)).toEqual(hsl(240, 100, 50));
  });

  it('liest Hexfarben', () => {
    expect(farbe('#ff8000')).toEqual([255, 128, 0]);
    expect(farbe('102030')).toEqual([16, 32, 48]);
  });

  it('macht aus einem Grauwert eine Farbe', () => {
    expect(grau(77)).toEqual([77, 77, 77]);
  });
});

describe('Das Raster ist rundum geschlossen', () => {
  /**
   * Der Grund, warum es dieses Modul überhaupt gibt. Auf einem Canvas endet
   * ein Strich am Bildrand; die gekachelte Fläche zeigt dann ein Gitter aus
   * abgeschnittenen Linien, und genau das lässt prozedurale Flächen nach
   * Tapete aussehen statt nach Material.
   */
  it('schreibt jenseits des rechten Randes wieder links', () => {
    const bild = new Raster(8, 8, [0, 0, 0]);
    bild.punkt(9, 2, [255, 255, 255]);
    expect(bild.lesen(1, 2)).toEqual([255, 255, 255]);
  });

  it('schreibt bei negativen Koordinaten von hinten', () => {
    const bild = new Raster(8, 8, [0, 0, 0]);
    bild.punkt(-1, -1, [255, 255, 255]);
    expect(bild.lesen(7, 7)).toEqual([255, 255, 255]);
  });

  it('führt eine Linie über den Rand hinaus weiter', () => {
    const bild = new Raster(16, 16, [0, 0, 0]);
    bild.linie(12, 8, 20, 8, 2, [255, 255, 255]);
    // Der Teil hinter dem Rand muss links angekommen sein.
    expect(bild.lesen(2, 8)[0]).toBeGreaterThan(100);
  });

  it('lässt gegenüberliegende Ränder zusammenpassen', () => {
    // Eine Kachel, die neben sich selbst liegt: der Sprung von der letzten
    // Spalte zur ersten darf nicht grösser sein als ein Schritt im Inneren.
    const bild = new Raster(64, 64, [128, 128, 128]);
    bild.kratzer(3, 200, [20, 20, 20]);
    let ueberRand = 0;
    let innen = 0;
    for (let y = 0; y < 64; y += 1) {
      ueberRand += Math.abs(bild.lesen(63, y)[0] - bild.lesen(0, y)[0]);
      innen += Math.abs(bild.lesen(30, y)[0] - bild.lesen(31, y)[0]);
    }
    expect(ueberRand).toBeLessThanOrEqual(innen * 3 + 60);
  });
});

describe('Zeichnen', () => {
  it('füllt ein Rechteck genau in seinen Grenzen', () => {
    const bild = new Raster(16, 16, [0, 0, 0]);
    bild.rechteck(4, 4, 4, 4, [255, 0, 0]);
    expect(bild.lesen(4, 4)).toEqual([255, 0, 0]);
    expect(bild.lesen(7, 7)).toEqual([255, 0, 0]);
    expect(bild.lesen(3, 4)).toEqual([0, 0, 0]);
    expect(bild.lesen(8, 4)).toEqual([0, 0, 0]);
  });

  it('mischt bei Teildeckung, statt zu ersetzen', () => {
    const bild = new Raster(4, 4, [0, 0, 0]);
    bild.punkt(0, 0, [200, 200, 200], 0.5);
    expect(bild.lesen(0, 0)[0]).toBeGreaterThan(80);
    expect(bild.lesen(0, 0)[0]).toBeLessThan(120);
  });

  it('zieht eine schräge Linie ohne Lücken', () => {
    const bild = new Raster(32, 32, [0, 0, 0]);
    bild.linie(2, 2, 29, 20, 2, [255, 255, 255]);
    // Auf der Geraden zwischen den Enden muss überall etwas stehen.
    for (let t = 0.1; t < 0.9; t += 0.1) {
      const x = Math.round(2 + 27 * t);
      const y = Math.round(2 + 18 * t);
      const treffer = [-1, 0, 1].some((dy) => bild.lesen(x, y + dy)[0] > 60);
      expect(treffer, `Lücke bei t=${t.toFixed(1)}`).toBe(true);
    }
  });

  it('lässt die Körnung um den Grundton streuen, ohne ihn zu ersetzen', () => {
    const bild = new Raster(64, 64, [128, 128, 128]);
    bild.koernung(11, 0.05);
    let summe = 0;
    let extrem = 0;
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const wert = bild.lesen(x, y)[0];
        summe += wert;
        extrem = Math.max(extrem, Math.abs(wert - 128));
      }
    }
    expect(summe / 4096).toBeCloseTo(128, 0);
    expect(extrem).toBeLessThanOrEqual(Math.ceil(0.05 * 255));
    expect(extrem).toBeGreaterThan(2);
  });

  it('färbt multiplikativ ein und hellt nie auf', () => {
    const bild = new Raster(4, 4, [200, 200, 200]);
    bild.einfaerben([128, 255, 64]);
    const [r, g, b] = bild.lesen(0, 0);
    expect(r).toBeCloseTo(100, -1);
    expect(g).toBe(200);
    expect(b).toBeLessThan(60);
  });
});

describe('Krakelee', () => {
  /**
   * Das Rissnetz ist der Zug, der den Look trägt -- auf den Referenzbildern
   * liegt es über jeder Fläche. Geprüft wird deshalb, dass es (a) etwas
   * zeichnet, (b) zusammenhängende Linien ergibt und nicht Punkte, und
   * (c) **gerichtet** bleibt statt zu schwingen. Der letzte Punkt ist der,
   * an dem die erste Fassung scheiterte: mit zu grossem Drall wuchsen daraus
   * Zweige, und Zweige gehören nicht in eine Betonfläche.
   */
  function dunkelAnteil(bild: Raster, schwelle = 100): number {
    let zahl = 0;
    for (let y = 0; y < bild.hoehe; y += 1) {
      for (let x = 0; x < bild.breite; x += 1) {
        if (bild.lesen(x, y)[0] < schwelle) zahl += 1;
      }
    }
    return zahl / (bild.breite * bild.hoehe);
  }

  it('zeichnet überhaupt etwas', () => {
    const bild = new Raster(128, 128, [200, 200, 200]);
    bild.krakelee(5, 20, [10, 10, 10], 120, 0.9);
    expect(dunkelAnteil(bild)).toBeGreaterThan(0.005);
  });

  it('bleibt sparsam und deckt die Fläche nicht zu', () => {
    const bild = new Raster(128, 128, [200, 200, 200]);
    bild.krakelee(5, 20, [10, 10, 10], 120, 0.9);
    expect(dunkelAnteil(bild)).toBeLessThan(0.25);
  });

  it('wächst mit der Zahl der Keime', () => {
    const wenig = new Raster(128, 128, [200, 200, 200]);
    const viel = new Raster(128, 128, [200, 200, 200]);
    wenig.krakelee(5, 5, [10, 10, 10], 120, 0.9);
    viel.krakelee(5, 40, [10, 10, 10], 120, 0.9);
    expect(dunkelAnteil(viel)).toBeGreaterThan(dunkelAnteil(wenig));
  });

  it('läuft gerichtet und schwingt nicht', () => {
    // Ein Riss folgt der Spannung im Material: er knickt, statt zu schwingen.
    // Gemessen an der Ausdehnung eines einzelnen Risses -- ein gerichteter
    // Riss deckt eine lange Strecke ab, ein Zweig kringelt sich auf der
    // Stelle. Ohne diese Prüfung schleicht sich der alte Drall zurück.
    const bild = new Raster(256, 256, [200, 200, 200]);
    bild.krakelee(9, 1, [10, 10, 10], 200, 0.9);
    let minX = 999;
    let maxX = -999;
    let minY = 999;
    let maxY = -999;
    let treffer = 0;
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        if (bild.lesen(x, y)[0] < 150) {
          treffer += 1;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    expect(treffer).toBeGreaterThan(20);
    // Weite Ausdehnung bei wenigen getroffenen Punkten heisst: eine Linie,
    // kein Knäuel.
    const ausdehnung = Math.max(maxX - minX, maxY - minY);
    expect(ausdehnung).toBeGreaterThan(60);
  });

  it('endet, statt endlos zu verzweigen', () => {
    // Die Verzweigung ist gedeckelt; ohne Deckel liefe die Schleife weiter,
    // bis der Speicher voll ist.
    const bild = new Raster(64, 64, [200, 200, 200]);
    const start = Date.now();
    bild.krakelee(3, 30, [0, 0, 0], 200, 1);
    expect(Date.now() - start).toBeLessThan(4000);
  });
});

describe('Sprenkel', () => {
  it('setzt Einschlüsse in beiden Richtungen -- heller und dunkler', () => {
    const bild = new Raster(128, 128, [128, 128, 128]);
    bild.sprenkel(4, 3000, [250, 250, 250], [10, 10, 10]);
    let heller = 0;
    let dunkler = 0;
    for (let y = 0; y < 128; y += 1) {
      for (let x = 0; x < 128; x += 1) {
        const wert = bild.lesen(x, y)[0];
        if (wert > 160) heller += 1;
        if (wert < 96) dunkler += 1;
      }
    }
    expect(heller).toBeGreaterThan(50);
    expect(dunkler).toBeGreaterThan(50);
  });

  it('lässt den Grundton stehen, statt ihn zu ersetzen', () => {
    const bild = new Raster(128, 128, [128, 128, 128]);
    bild.sprenkel(4, 2000, [255, 255, 255], [0, 0, 0]);
    let summe = 0;
    for (let y = 0; y < 128; y += 1) {
      for (let x = 0; x < 128; x += 1) summe += bild.lesen(x, y)[0];
    }
    expect(summe / (128 * 128)).toBeCloseTo(128, -1);
  });
});

describe('Flecken', () => {
  it('macht die Fläche wolkig, ohne sie zu verschieben', () => {
    const bild = new Raster(128, 128, [128, 128, 128]);
    bild.flecken(6, 30, 0.1, 40);
    let summe = 0;
    let hell = 0;
    let dunkel = 0;
    for (let y = 0; y < 128; y += 1) {
      for (let x = 0; x < 128; x += 1) {
        const wert = bild.lesen(x, y)[0];
        summe += wert;
        if (wert > 133) hell += 1;
        if (wert < 123) dunkel += 1;
      }
    }
    // Beides muss vorkommen -- blanke Stellen und dunklere Ecken.
    expect(hell).toBeGreaterThan(100);
    expect(dunkel).toBeGreaterThan(100);
    // Und der Grundton bleibt im Mittel erhalten.
    expect(summe / (128 * 128)).toBeCloseTo(128, -1);
  });

  it('läuft weich aus und setzt keine Kanten', () => {
    // Ein Fleck mit harter Kante liest sich als Fleck; einer mit weichem
    // Rand als Abnutzung. Der Unterschied ist der ganze Zweck.
    const bild = new Raster(128, 128, [128, 128, 128]);
    bild.flecken(6, 1, 0.4, 40);
    let groessterSprung = 0;
    for (let y = 0; y < 128; y += 1) {
      for (let x = 0; x < 127; x += 1) {
        groessterSprung = Math.max(groessterSprung,
                                   Math.abs(bild.lesen(x, y)[0] - bild.lesen(x + 1, y)[0]));
      }
    }
    expect(groessterSprung).toBeLessThan(12);
  });
});

describe('Normalenkarte', () => {
  it('zeigt auf einer ebenen Fläche gerade nach oben', () => {
    const hoehe = new Raster(16, 16, [128, 128, 128]);
    const normalen = normalenkarte(hoehe);
    expect(normalen.lesen(8, 8)).toEqual([128, 128, 255]);
  });

  it('kippt an einer Kante zur Seite', () => {
    const hoehe = new Raster(32, 32, [255, 255, 255]);
    hoehe.rechteck(0, 0, 16, 32, [0, 0, 0]);
    const normalen = normalenkarte(hoehe);
    // Direkt an der Kante bei x = 16 muss die x-Komponente ausschlagen.
    const anDerKante = normalen.lesen(16, 8)[0];
    const inDerFlaeche = normalen.lesen(24, 8)[0];
    expect(Math.abs(anDerKante - 128)).toBeGreaterThan(40);
    expect(inDerFlaeche).toBe(128);
  });

  it('rechnet auch über den Rand hinweg', () => {
    // Eine Kante genau am Rand: ohne umlaufendes Lesen bliebe sie unsichtbar,
    // und die gekachelte Fläche bekäme dort eine flache Naht.
    const hoehe = new Raster(32, 32, [255, 255, 255]);
    hoehe.rechteck(0, 0, 8, 32, [0, 0, 0]);
    const normalen = normalenkarte(hoehe);
    expect(Math.abs(normalen.lesen(31, 8)[0] - 128)).toBeGreaterThan(40);
  });
});

describe('Textur', () => {
  it('kachelt in beide Richtungen und behält die Grösse', () => {
    const bild = new Raster(8, 8, [10, 20, 30]);
    const textur = bild.textur(true);
    expect(textur.image.width).toBe(8);
    expect(textur.image.height).toBe(8);
    expect(textur.wrapS).toBe(1000); // THREE.RepeatWrapping
    expect(textur.wrapT).toBe(1000);
    textur.dispose();
  });

  it('kopiert die Daten, statt sie zu teilen', () => {
    // Sonst änderte ein späterer Strich rückwirkend eine fertige Textur.
    const bild = new Raster(4, 4, [0, 0, 0]);
    const textur = bild.textur();
    const vorher = (textur.image.data as Uint8Array)[0];
    bild.fuellen([255, 255, 255]);
    expect((textur.image.data as Uint8Array)[0]).toBe(vorher);
    textur.dispose();
  });
});
