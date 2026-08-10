/**
 * Einzelne Flächen eines Quaders auf einen Ausschnitt einer Textur legen.
 *
 * Der Fall, für den es das braucht: ein Stand ist ein Quader, aber seine
 * Vorderseite trägt eine Marke, die Seitenwände tragen Blech, und oben liegt
 * ein Deckel. Ohne diese Zuordnung bekommt der ganze Quader dieselbe Kachel,
 * und das Logo klebt auch auf der Rückwand.
 *
 * Warum es nicht trivial ist: `BoxGeometry` ist indiziert. Eine Fläche ist
 * eine `group` -- ein Bereich im *Indexpuffer*, nicht eine Liste von
 * Eckpunkten. Wer stumpf `attribute.setXY(i, ...)` über den Bereich schreibt,
 * verschiebt die falschen Punkte. Hier wird deshalb erst über den Index
 * aufgelöst, welche Eckpunkte die Fläche wirklich benutzt.
 */

import * as THREE from 'three';

/** Ausschnitt einer Textur: `[u0, v0, u1, v1]` in 0..1. */
export type Ausschnitt = readonly [number, number, number, number];

export type Quaderflaeche = 'rechts' | 'links' | 'oben' | 'unten' | 'vorn' | 'hinten';

/**
 * Die Reihenfolge, in der `BoxGeometry` ihre Flächen anlegt.
 *
 * Sie steht so in Three.js und ist nicht verhandelbar; die deutschen Namen
 * hier sind nur die Brücke dorthin.
 */
const GRUPPE: Record<Quaderflaeche, number> = {
  rechts: 0,
  links: 1,
  oben: 2,
  unten: 3,
  vorn: 4,
  hinten: 5,
};

const ECKEN: readonly (readonly [number, number])[] = [
  [0, 0], [1, 0], [1, 1], [0, 1],
];

/**
 * Legt eine Quaderfläche auf einen Ausschnitt.
 *
 * Jeder Eckpunkt der Fläche wird auf die Ecke des Ausschnitts geschoben, der
 * seine bisherige UV am nächsten liegt. Das hält die Ausrichtung: was oben
 * links lag, liegt danach oben links im Ausschnitt, und das Bild steht nicht
 * plötzlich auf dem Kopf.
 */
export function setzeQuaderflaeche(
  geometrie: THREE.BoxGeometry,
  flaeche: Quaderflaeche,
  ausschnitt: Ausschnitt,
): void {
  const gruppe = geometrie.groups[GRUPPE[flaeche]];
  const index = geometrie.getIndex();
  const uv = geometrie.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!gruppe || !index || !uv) {
    throw new Error('BoxGeometry braucht Indexgruppen und ein uv-Attribut');
  }

  const [u0, v0, u1, v1] = ausschnitt;
  const ziel: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const erledigt = new Set<number>();

  for (let i = 0; i < gruppe.count; i += 1) {
    const punkt = index.getX(gruppe.start + i);
    if (erledigt.has(punkt)) continue;
    erledigt.add(punkt);

    const altU = uv.getX(punkt);
    const altV = uv.getY(punkt);
    let beste = 0;
    let abstand = Infinity;
    ECKEN.forEach(([x, y], ecke) => {
      const d = (altU - x) ** 2 + (altV - y) ** 2;
      if (d < abstand) {
        abstand = d;
        beste = ecke;
      }
    });
    uv.setXY(punkt, ziel[beste][0], ziel[beste][1]);
  }
  uv.needsUpdate = true;
}

/**
 * Eine einzelne Tafel für genau einen Ausschnitt.
 *
 * Für alles, was keine sechs Seiten braucht: ein Schild, eine Rückwand, ein
 * Fassadenfeld. Billiger als ein Quader und ohne die Frage, was auf den
 * anderen fünf Seiten steht.
 */
export function tafelGeometrie(
  breite: number,
  hoehe: number,
  ausschnitt: Ausschnitt,
): THREE.PlaneGeometry {
  const geometrie = new THREE.PlaneGeometry(breite, hoehe, 1, 1);
  const uv = geometrie.getAttribute('uv') as THREE.BufferAttribute;
  const [u0, v0, u1, v1] = ausschnitt;
  // Die Punktfolge von PlaneGeometry ist oben-links, oben-rechts,
  // unten-links, unten-rechts -- v läuft dabei von 1 nach 0.
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
  return geometrie;
}

/**
 * Teilt eine Textur in ein gleichmässiges Gitter und gibt einen Ausschnitt.
 *
 * Damit Atlanten nicht als Zahlenkolonnen im Code stehen: `ausschnitt(4, 2, 1)`
 * ist Feld 1 eines Atlas aus 4 mal 2 Feldern, von links oben gezählt.
 */
export function ausschnitt(spalten: number, zeilen: number, feld: number): Ausschnitt {
  const x = feld % spalten;
  const y = Math.floor(feld / spalten);
  return [x / spalten, 1 - (y + 1) / zeilen, (x + 1) / spalten, 1 - y / zeilen];
}
