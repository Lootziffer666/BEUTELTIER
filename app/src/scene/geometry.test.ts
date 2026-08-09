import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import registeredSite from '../../public/data/registered-site.json';
import { drehungNachX, drehungNachZ, extrudePolygon, nachSzene, toScene } from './geometry';

/**
 * Die Achsenordnung der Szene, gegen Himmelsrichtungen geprüft.
 *
 * Ein Vorzeichentest allein hätte den Spiegelungsfehler nicht gefunden -- er
 * bestand ja darin, dass das Vorzeichen konsequent falsch war. Deshalb prüft
 * das hier nicht die Formel, sondern das Ergebnis: liegt Halle 8 im Bild
 * nördlich von Halle 10, und Halle 1 westlich von Halle 9? Das sind Tatsachen
 * über das Gelände und keine über den Code.
 *
 * Geländemeter: x wächst nach Osten, y wächst nach **Süden** (die Pipeline
 * rechnet `y = -(nord - ursprung)`). Szene: X nach Osten, Y nach oben, Z nach
 * Süden -- wie `world-origin.json` es als verbindlich führt.
 */

const MITTE: [number, number] = [0, 0];

function hallenMitte(name: string): [number, number] {
  const halle = registeredSite.halls.find((eintrag) => eintrag.name === name);
  if (!halle) throw new Error(`${name} fehlt in registered-site.json`);
  const punkte = halle.footprint as [number, number][];
  return [
    punkte.reduce((summe, p) => summe + p[0], 0) / punkte.length,
    punkte.reduce((summe, p) => summe + p[1], 0) / punkte.length,
  ];
}

describe('Achsenordnung', () => {
  it('legt Osten auf +X', () => {
    const westlich = toScene(0, 0, 0, MITTE);
    const oestlich = toScene(100, 0, 0, MITTE);
    expect(oestlich.x).toBeGreaterThan(westlich.x);
  });

  it('legt Süden auf +Z', () => {
    // Grösseres y ist in Geländemetern weiter südlich.
    const noerdlich = toScene(0, 0, 0, MITTE);
    const suedlich = toScene(0, 100, 0, MITTE);
    expect(suedlich.z).toBeGreaterThan(noerdlich.z);
  });

  it('legt oben auf +Y', () => {
    expect(toScene(0, 0, 12, MITTE).y).toBe(12);
  });

  it('ist rechtshändig', () => {
    // Ost × Oben muss Sueden ergeben. Ist es Norden, ist das Gelände
    // gespiegelt -- und zwar unabhängig davon, welche Formel dahintersteht.
    const ost = new THREE.Vector3(1, 0, 0);
    const oben = new THREE.Vector3(0, 1, 0);
    const sueden = toScene(0, 1, 0, MITTE).sub(toScene(0, 0, 0, MITTE)).normalize();
    expect(ost.cross(oben).dot(sueden)).toBeCloseTo(1, 9);
  });

  it('verschiebt um die Mitte, ohne zu spiegeln', () => {
    const mitte: [number, number] = [50, -30];
    const punkt = toScene(70, -10, 3, mitte);
    expect(punkt.x).toBe(20);
    expect(punkt.z).toBe(20);
  });

  it('rechnet nachSzene genauso wie toScene', () => {
    // Zwei Fassungen derselben Abbildung -- sie dürfen nie auseinanderlaufen.
    const mitte: [number, number] = [12, -4];
    const vektor = toScene(33, 21, 7, mitte);
    expect(nachSzene(33, 21, 7, mitte)).toEqual([vektor.x, vektor.y, vektor.z]);
  });
});

describe('Das Gelände liegt richtig herum', () => {
  it('stellt Halle 8 nördlich von Halle 10', () => {
    const acht = hallenMitte('Halle 8.1');
    const zehn = hallenMitte('Halle 10.1');
    expect(toScene(...acht, 0, MITTE).z).toBeLessThan(toScene(...zehn, 0, MITTE).z);
  });

  it('stellt Halle 1 westlich von Halle 9', () => {
    const eins = hallenMitte('Halle 1.2');
    const neun = hallenMitte('Halle 9.1');
    expect(toScene(...eins, 0, MITTE).x).toBeLessThan(toScene(...neun, 0, MITTE).x);
  });

  it('stellt Halle 2 nordwestlich von Halle 3', () => {
    // Eine schräge Beziehung, damit nicht nur je eine Achse geprüft ist.
    const zwei = toScene(...hallenMitte('Halle 2.2'), 0, MITTE);
    const drei = toScene(...hallenMitte('Halle 3.2'), 0, MITTE);
    expect(zwei.x).toBeLessThan(drei.x);
    expect(zwei.z).toBeLessThan(drei.z);
  });

  it('hält die Reihenfolge der Nordhallen 8, 7, 6 ein', () => {
    // Von Norden nach Süden -- die Reihe am Nordboulevard.
    const z = (name: string) => toScene(...hallenMitte(name), 0, MITTE).z;
    expect(z('Halle 8.1')).toBeLessThan(z('Halle 7.1'));
    expect(z('Halle 7.1')).toBeLessThan(z('Halle 6.1'));
  });
});

describe('Körper landen dort, wo ihr Grundriss liegt', () => {
  /**
   * Der Fehler, den diese Prüfungen fangen: `toScene` rechnete richtig,
   * `extrudePolygon` aber baute die Form mit dem umgekehrten Vorzeichen auf.
   * Hallen und Stände lagen deshalb gespiegelt in einer sonst korrekten Welt
   * -- die belegten Stände gehören in den Süden und wurden im Norden
   * gezeichnet. Ein Test auf `toScene` allein sieht das nicht.
   */
  function mittlerZ(geometry: THREE.BufferGeometry): number {
    const position = geometry.getAttribute('position');
    let summe = 0;
    for (let i = 0; i < position.count; i += 1) summe += position.getZ(i);
    return summe / position.count;
  }

  const quadrat = (x: number, y: number): [number, number][] => [
    [x - 10, y - 10], [x + 10, y - 10], [x + 10, y + 10], [x - 10, y + 10],
  ];

  it('legt einen nördlichen Grundriss nach -Z', () => {
    const nord = extrudePolygon(quadrat(0, -100), 5, MITTE);
    const sued = extrudePolygon(quadrat(0, 100), 5, MITTE);
    expect(mittlerZ(nord)).toBeLessThan(mittlerZ(sued));
    nord.dispose();
    sued.dispose();
  });

  it('setzt den Körper genau auf sein Quermaß', () => {
    const geometry = extrudePolygon(quadrat(0, 250), 5, MITTE);
    // Die Mitte des Quadrats liegt bei y = 250, also bei Szenen-Z = 250.
    expect(mittlerZ(geometry)).toBeCloseTo(250, 6);
    geometry.dispose();
  });

  it('stimmt mit toScene überein', () => {
    // Beide Wege müssen denselben Punkt liefern -- sonst driften Körper und
    // Beschriftung auseinander, und genau das war der Fehler.
    const mitte: [number, number] = [-40, 90];
    const geometry = extrudePolygon(quadrat(120, -60), 5, mitte);
    expect(mittlerZ(geometry)).toBeCloseTo(toScene(120, -60, 0, mitte).z, 6);
    geometry.dispose();
  });

  it('extrudiert nach oben und nicht nach unten', () => {
    const geometry = extrudePolygon(quadrat(0, 0), 12, MITTE);
    const position = geometry.getAttribute('position');
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      min = Math.min(min, position.getY(i));
      max = Math.max(max, position.getY(i));
    }
    expect(min).toBeCloseTo(0, 6);
    expect(max).toBeCloseTo(12, 6);
    geometry.dispose();
  });

  it('stellt die belegten Stände in den Süden', () => {
    // Die Tatsachenprüfung: zur gamescom liegen die belegten Flächen im Süden
    // (Halle 10, 3, 2, 5), nicht im Norden. Was die Daten sagen, muss auch im
    // Körper stehen.
    const belegt = registeredSite.halls.filter((h) => ['10.1', '10.2', '3.2', '2.1']
      .includes(h.key));
    const nord = registeredSite.halls.filter((h) => ['8.1', '7.1'].includes(h.key));
    const z = (halls: typeof belegt) => halls
      .map((h) => extrudePolygon(h.footprint as [number, number][], 5, MITTE))
      .reduce((summe, g) => {
        const wert = mittlerZ(g);
        g.dispose();
        return summe + wert;
      }, 0) / halls.length;
    expect(z(belegt)).toBeGreaterThan(z(nord));
  });
});

describe('Drehungen zeigen in die gemeinte Richtung', () => {
  /**
   * Die dritte Schicht derselben Spiegelung. Punkte lagen richtig, Drehungen
   * nicht: jeder Stand stand an seinem Platz und war trotzdem in sich
   * verdreht. Geprüft wird deshalb, wohin eine Drehung eine Achse tatsächlich
   * legt -- nicht, welche Formel dahintersteht.
   */
  function gedreht(achse: THREE.Vector3, winkel: number): THREE.Vector3 {
    return achse.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), winkel);
  }

  const richtungen: [string, number, number][] = [
    ['Osten', 1, 0],
    ['Sueden', 0, 1],
    ['Westen', -1, 0],
    ['Norden', 0, -1],
    ['Suedosten', 0.7071067811865476, 0.7071067811865476],
  ];

  it.each(richtungen)('legt +X nach %s', (_name, dx, dy) => {
    const gedrehteX = gedreht(new THREE.Vector3(1, 0, 0), drehungNachX(dx, dy));
    expect(gedrehteX.x).toBeCloseTo(dx, 9);
    expect(gedrehteX.z).toBeCloseTo(dy, 9);
  });

  it.each(richtungen)('legt -Z nach %s', (_name, dx, dy) => {
    const gedrehteZ = gedreht(new THREE.Vector3(0, 0, -1), drehungNachZ(dx, dy));
    expect(gedrehteZ.x).toBeCloseTo(dx, 9);
    expect(gedrehteZ.z).toBeCloseTo(dy, 9);
  });

  it('dreht eine Standkante auf ihre eigene Richtung', () => {
    // Der Fall aus der Messe: eine Standkante laeuft in Gelaendemetern von a
    // nach b, und der Koerper darauf muss genau so liegen -- sonst steht er
    // an der richtigen Stelle und trotzdem schief.
    const a: [number, number] = [-120, 40];
    const b: [number, number] = [-100, 52];
    const laenge = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const richtung = gedreht(new THREE.Vector3(1, 0, 0), drehungNachX(b[0] - a[0], b[1] - a[1]));
    const ziel = toScene(b[0], b[1], 0, [0, 0]).sub(toScene(a[0], a[1], 0, [0, 0]));
    expect(richtung.x).toBeCloseTo(ziel.x / laenge, 9);
    expect(richtung.z).toBeCloseTo(ziel.z / laenge, 9);
  });

  it('unterscheidet sich um eine Vierteldrehung von der -Z-Fassung', () => {
    // Beide Fassungen beschreiben dieselbe Richtung, nur fuer eine andere
    // lokale Achse. Waeren sie gleich, waere eine davon falsch benutzt.
    const differenz = drehungNachZ(1, 0) - drehungNachX(1, 0);
    expect(Math.abs(Math.sin(differenz))).toBeCloseTo(1, 9);
  });
});
