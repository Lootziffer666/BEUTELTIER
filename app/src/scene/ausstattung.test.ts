import { describe, expect, it } from 'vitest';

import {
  DECKE_ACHSE_M,
  DECKE_FUNKTIONSFELD_M,
  DECKE_TRAEGER_M,
  FASSADE_ACHSE_M,
  GELAENDER_HOEHE_M,
  NUMMER_Y_M,
  ZAUN_HOEHE_M,
  absperrung,
  deckenwerk,
  fassadenwerk,
  nummernschilder,
} from './ausstattung';

describe('Deckenwerk', () => {
  /**
   * Auf dem Referenzbild der leeren Halle ist die Decke die obere Bildhälfte.
   * Als flache Ebene mit aufgemaltem Raster fehlt genau das, was sie ausmacht:
   * die Tiefe zwischen Steg und Feld. Geprüft wird deshalb nicht "es gibt
   * Träger", sondern dass sie ein Raster ergeben und die Lichtbänder
   * darunterliegen.
   */
  it('legt Träger in beide Richtungen', () => {
    const werk = deckenwerk(60, 40, 9);
    const laengs = werk.traeger.filter((t) => t.groesse[0] > t.groesse[2]);
    const quer = werk.traeger.filter((t) => t.groesse[2] > t.groesse[0]);
    expect(laengs.length).toBeGreaterThan(2);
    expect(quer.length).toBeGreaterThan(2);
  });

  it('hält das Achsmaß ein', () => {
    const werk = deckenwerk(60, 40, 9);
    const laengs = werk.traeger
      .filter((t) => t.groesse[0] > t.groesse[2])
      .map((t) => t.position[2])
      .sort((a, b) => a - b);
    for (let i = 1; i < laengs.length; i += 1) {
      expect(laengs[i] - laengs[i - 1]).toBeCloseTo(DECKE_ACHSE_M, 1);
    }
  });

  it('spannt die Träger über die volle Halle', () => {
    const werk = deckenwerk(60, 40, 9);
    const laengs = werk.traeger.filter((t) => t.groesse[0] > t.groesse[2]);
    expect(laengs.every((t) => t.groesse[0] === 60)).toBe(true);
    const z = laengs.map((t) => t.position[2]);
    expect(Math.min(...z)).toBeCloseTo(-20, 6);
    expect(Math.max(...z)).toBeCloseTo(20, 6);
  });

  it('hängt die Träger unter die Deckenhöhe, nicht darüber', () => {
    // Ein Träger über der Decke ist unsichtbar, und die Halle bliebe glatt.
    const werk = deckenwerk(60, 40, 9);
    for (const t of werk.traeger) {
      expect(t.position[1] + t.groesse[1] / 2).toBeCloseTo(9, 6);
    }
  });

  it('legt die Lichtbänder zwischen die Funktionsfeldgrenzen, nicht auf sie', () => {
    // Die Lichtbänder hängen am groben Funktionsraster (DECKE_FUNKTIONSFELD_M),
    // nicht mehr am feinen sichtbaren Gitter (DECKE_ACHSE_M) -- ein Band alle
    // zwei Felder eines 0.6-m-Gitters wäre alle 1.2 m, kein Referenzfoto zeigt
    // das.
    const werk = deckenwerk(60, 40, 9);
    const anzahl = Math.max(2, Math.round(40 / DECKE_FUNKTIONSFELD_M));
    const grenzen: number[] = [];
    for (let i = 0; i <= anzahl; i += 1) grenzen.push(-20 + (i * 40) / anzahl);
    for (const band of werk.lichtbaender) {
      const naechste = Math.min(...grenzen.map((z) => Math.abs(z - band.position[2])));
      expect(naechste).toBeGreaterThan(DECKE_FUNKTIONSFELD_M / 4);
    }
  });

  it('lässt nicht jedes Funktionsfeld leuchten', () => {
    // Jedes Feld wäre zu hell und löschte die Gitterzeichnung aus.
    const werk = deckenwerk(60, 40, 9);
    const felder = Math.round(40 / DECKE_FUNKTIONSFELD_M);
    expect(werk.lichtbaender.length).toBeLessThanOrEqual(Math.ceil(felder / 2));
    expect(werk.lichtbaender.length).toBeGreaterThan(0);
  });

  it('setzt die Auslässe nicht in die Lichtbänder', () => {
    const werk = deckenwerk(60, 40, 9);
    for (const diffusor of werk.diffusoren) {
      for (const band of werk.lichtbaender) {
        expect(Math.abs(diffusor.position[2] - band.position[2]))
          .toBeGreaterThan(DECKE_FUNKTIONSFELD_M / 4);
      }
    }
  });

  it('hält das feine Gitter deutlich enger als das Funktionsfeld', () => {
    // Genau das war der gemeldete Fehler: Gitter und Funktionsraster teilten
    // sich dieselbe, zu grobe Zahl.
    expect(DECKE_ACHSE_M).toBeLessThan(DECKE_FUNKTIONSFELD_M / 4);
  });

  /**
   * An mehreren Referenzfotos nachgezählt: die Luftauslässe stehen als
   * gleichmässiges Netz, ein Auslass auf jedem zehnten Feld in beiden
   * Richtungen -- nicht das unregelmässige Muster, das vorher unbenutzt in
   * `deckenwerk()` lag (nie in `Ausstattung.tsx` gerendert).
   */
  it('setzt die Auslässe als gleichmässiges Zehner-Netz', () => {
    // Grosse Halle, damit mehrere Auslässe in beide Richtungen entstehen.
    const werk = deckenwerk(600, 400, 9);
    const querAnzahl = Math.round(400 / DECKE_FUNKTIONSFELD_M);
    const laengsAnzahl = Math.round(600 / DECKE_FUNKTIONSFELD_M);

    const zWerte = [...new Set(werk.diffusoren.map((d) => d.position[2]))].sort((a, b) => a - b);
    const xWerte = [...new Set(werk.diffusoren.map((d) => d.position[0]))].sort((a, b) => a - b);
    expect(zWerte.length).toBeGreaterThan(1);
    expect(xWerte.length).toBeGreaterThan(1);
    for (let i = 1; i < zWerte.length; i += 1) {
      expect(zWerte[i] - zWerte[i - 1]).toBeCloseTo((10 * 400) / querAnzahl, 1);
    }
    for (let i = 1; i < xWerte.length; i += 1) {
      expect(xWerte[i] - xWerte[i - 1]).toBeCloseTo((10 * 600) / laengsAnzahl, 1);
    }
    // Ein echtes Netz: jede Zeile trifft jede Spalte.
    expect(werk.diffusoren.length).toBe(zWerte.length * xWerte.length);
  });

  it('bleibt bei einer entarteten Halle leer, statt zu rechnen', () => {
    expect(deckenwerk(0, 40, 9).traeger).toEqual([]);
    expect(deckenwerk(60, -1, 9).traeger).toEqual([]);
  });

  it('bekommt bei jeder Hallengrösse mindestens ein Raster', () => {
    for (const [l, b] of [[12, 12], [220, 82], [40, 160]] as const) {
      const werk = deckenwerk(l, b, 9);
      expect(werk.traeger.length, `${l}x${b}`).toBeGreaterThanOrEqual(6);
      expect(werk.lichtbaender.length, `${l}x${b}`).toBeGreaterThan(0);
    }
  });

  it('lässt die Träger tief genug für einen Schattenwurf', () => {
    expect(DECKE_TRAEGER_M).toBeGreaterThan(0.2);
  });
});

describe('Fassadenwerk', () => {
  /**
   * Die amtlichen Körper sind aus Gebäudeumringen gerechnet: eine Halle ist
   * dort ein Quader. Selbst mit der besten Zeichnung darauf bleibt sie ein
   * Quader, weil die Silhouette flach ist und das Streiflicht nichts findet,
   * woran es brechen könnte.
   */
  it('setzt Stützen im Achsmaß und an beiden Ecken', () => {
    const werk = fassadenwerk(80, 12);
    const x = werk.stuetzen.map((s) => s.position[0]).sort((a, b) => a - b);
    expect(x[0]).toBeCloseTo(-40, 6);
    expect(x[x.length - 1]).toBeCloseTo(40, 6);
    for (let i = 1; i < x.length; i += 1) {
      expect(x[i] - x[i - 1]).toBeCloseTo(FASSADE_ACHSE_M, 1);
    }
  });

  it('endet nie mit einem halben Feld', () => {
    // Eine Fassade, die mit einem halben Feld aufhört, sieht abgeschnitten aus.
    for (const laenge of [17, 43.5, 91.2, 219.5]) {
      const werk = fassadenwerk(laenge, 12);
      const x = werk.stuetzen.map((s) => s.position[0]).sort((a, b) => a - b);
      const abstaende = x.slice(1).map((wert, i) => wert - x[i]);
      const erste = abstaende[0];
      for (const abstand of abstaende) expect(abstand).toBeCloseTo(erste, 6);
    }
  });

  it('lässt die Stützen aus der Wand treten', () => {
    // Ohne Vorsprung gibt es keine Silhouette und keinen Schattenwurf -- dann
    // ist die Stütze ein Streifen in der Textur, und genau das soll sie nicht
    // sein.
    const werk = fassadenwerk(80, 12);
    expect(werk.stuetzen.every((s) => s.groesse[2] > 0.15)).toBe(true);
  });

  it('stellt die Stützen auf die volle Höhe', () => {
    const werk = fassadenwerk(80, 12);
    for (const s of werk.stuetzen) {
      expect(s.groesse[1]).toBeCloseTo(12, 6);
      expect(s.position[1]).toBeCloseTo(6, 6);
    }
  });

  it('hängt das Fensterband oben und den Sockel unten', () => {
    const werk = fassadenwerk(80, 12);
    expect(werk.fensterband[0].position[1]).toBeGreaterThan(12 * 0.6);
    expect(werk.sockel[0].position[1]).toBeLessThan(2);
    expect(werk.attika[0].position[1]).toBeGreaterThan(12);
  });

  it('hält den Sockel niedriger als eine Tür', () => {
    // Sonst liest man ihn als Öffnung.
    const werk = fassadenwerk(80, 12);
    expect(werk.sockel[0].groesse[1]).toBeLessThan(2);
  });

  it('lässt das Fensterband auch bei niedrigen Hallen im Maß', () => {
    const niedrig = fassadenwerk(80, 5);
    expect(niedrig.fensterband[0].groesse[1]).toBeLessThan(5 * 0.5);
    expect(niedrig.fensterband[0].groesse[1]).toBeGreaterThan(0.5);
  });

  it('bleibt bei entarteten Massen leer', () => {
    expect(fassadenwerk(0, 12).stuetzen).toEqual([]);
    expect(fassadenwerk(80, 0).stuetzen).toEqual([]);
  });
});

describe('Absperrung', () => {
  const pfad: [number, number][] = [[0, 0], [20, 0], [20, 15]];

  it('setzt an jeder Ecke einen Pfosten', () => {
    // Der Fehler, den das verhindert: über den ganzen Zug gerechnet sitzt an
    // der Ecke keiner -- und genau dort sieht man ihn.
    const werk = absperrung(pfad);
    const anEcke = werk.pfosten.filter(
      (p) => Math.abs(p.position[0] - 20) < 1e-6 && Math.abs(p.position[2] - 0) < 1e-6);
    expect(anEcke.length).toBeGreaterThan(0);
  });

  it('setzt Pfosten an beiden Enden', () => {
    const werk = absperrung(pfad);
    const treffer = (x: number, z: number) => werk.pfosten.some(
      (p) => Math.abs(p.position[0] - x) < 1e-6 && Math.abs(p.position[2] - z) < 1e-6);
    expect(treffer(0, 0)).toBe(true);
    expect(treffer(20, 15)).toBe(true);
  });

  it('hält den Pfostenabstand ein', () => {
    const werk = absperrung([[0, 0], [20, 0]], GELAENDER_HOEHE_M, 2);
    const x = werk.pfosten.map((p) => p.position[0]).sort((a, b) => a - b);
    for (let i = 1; i < x.length; i += 1) expect(x[i] - x[i - 1]).toBeCloseTo(2, 6);
  });

  it('legt den Holm auf die Geländerhöhe', () => {
    const werk = absperrung(pfad, GELAENDER_HOEHE_M, 1.6, 3);
    for (const holm of werk.holme) expect(holm.position[1]).toBeCloseTo(3 + GELAENDER_HOEHE_M, 6);
  });

  it('gibt jedem Abschnitt genau ein Feld in voller Länge', () => {
    const werk = absperrung(pfad);
    expect(werk.felder).toHaveLength(2);
    expect(werk.felder[0].groesse[0]).toBeCloseTo(20, 6);
    expect(werk.felder[1].groesse[0]).toBeCloseTo(15, 6);
  });

  it('dreht jeden Abschnitt in seine eigene Richtung', () => {
    const werk = absperrung(pfad);
    expect(werk.holme[0].drehung).toBeCloseTo(0, 6);
    // Der zweite Abschnitt läuft nach Süden -- in Szenenkoordinaten nach +Z,
    // und dorthin zeigt +X nach einer Vierteldrehung im Uhrzeigersinn.
    expect(Math.abs(Math.sin(werk.holme[1].drehung))).toBeCloseTo(1, 6);
  });

  it('macht aus demselben Zug einen Zaun, nur höher und dicker', () => {
    const gelaender = absperrung(pfad, GELAENDER_HOEHE_M);
    const zaun = absperrung(pfad, ZAUN_HOEHE_M, 3.5);
    expect(zaun.pfosten[0].groesse[1]).toBeGreaterThan(gelaender.pfosten[0].groesse[1]);
    expect(zaun.pfosten[0].groesse[0]).toBeGreaterThan(gelaender.pfosten[0].groesse[0]);
    expect(zaun.pfosten.length).toBeLessThan(gelaender.pfosten.length);
  });

  it('überspringt Abschnitte der Länge null, statt durch sie zu teilen', () => {
    const werk = absperrung([[0, 0], [0, 0], [10, 0]]);
    expect(werk.holme).toHaveLength(1);
    expect(Number.isFinite(werk.holme[0].drehung)).toBe(true);
  });

  it('bleibt bei einem einzelnen Punkt leer', () => {
    expect(absperrung([[0, 0]]).pfosten).toEqual([]);
  });
});

describe('Hallennummern', () => {
  const halle = (key: string, hall: string, footprint: [number, number][]) =>
    ({ key, hall, footprint, baseY: 0 });

  it('hängt genau ein Schild je Gebäude, nicht je Ebene', () => {
    // Sonst hingen an Halle 10 zwei Nummern übereinander -- eine für 10.1,
    // eine für 10.2, an derselben Wand.
    const schilder = nummernschilder([
      halle('10.1', '10', [[0, 0], [60, 0], [60, 30], [0, 30]]),
      halle('10.2', '10', [[0, 0], [60, 0], [60, 30], [0, 30]]),
    ]);
    expect(schilder).toHaveLength(1);
    expect(schilder[0].text).toBe('10');
  });

  it('setzt das Schild auf die Mitte der längsten Kante', () => {
    const schilder = nummernschilder([
      halle('9.1', '9', [[0, 0], [60, 0], [60, 30], [0, 30]]),
    ]);
    expect(schilder[0].position[0]).toBeCloseTo(30, 6);
    expect(schilder[0].position[2]).toBeCloseTo(0, 6);
  });

  it('hängt es über Kopfhöhe', () => {
    const schilder = nummernschilder([
      halle('9.1', '9', [[0, 0], [60, 0], [60, 30], [0, 30]]),
    ]);
    expect(schilder[0].position[1]).toBeCloseTo(NUMMER_Y_M, 6);
    expect(NUMMER_Y_M).toBeGreaterThan(2.5);
  });

  it('lässt Freiflächen aus', () => {
    expect(nummernschilder([
      { ...halle('F8', 'F8', [[0, 0], [60, 0], [60, 30], [0, 30]]), outdoor: true },
    ])).toEqual([]);
  });

  it('überspringt entartete Grundrisse', () => {
    expect(nummernschilder([halle('x', 'x', [[0, 0], [1, 1]])])).toEqual([]);
  });
});
