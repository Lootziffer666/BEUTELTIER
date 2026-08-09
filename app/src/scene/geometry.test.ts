import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import registeredSite from '../../public/data/registered-site.json';
import { nachSzene, toScene } from './geometry';

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
