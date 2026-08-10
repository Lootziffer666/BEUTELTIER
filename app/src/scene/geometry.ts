/**
 * Aus Grundrissen werden Körper.
 *
 * Alle Polygone liegen in Geländemetern in der XY-Ebene. Three.js rechnet mit
 * Y nach oben, deshalb wird beim Extrudieren getauscht: Karten-X bleibt X,
 * die Höhe wandert auf Y, und Karten-Y wird zu Z.
 *
 * Das Vorzeichen dabei ist dasselbe wie in `toScene`, und es muss dasselbe
 * sein: `rotateX(-PI/2)` bildet die lokale Y-Achse auf **-Z** ab. Wer die
 * Form also mit `y - centre[1]` aufbaut, bekommt Z nach Norden -- und damit
 * ein Spiegelbild, obwohl `toScene` daneben richtig rechnet. Genau so lagen
 * Hallen und Stände gespiegelt in einer sonst korrekten Welt: die belegten
 * Stände gehören in den Süden, gezeichnet wurden sie im Norden.
 *
 * Deshalb wird hier gegengespiegelt aufgebaut. `geometry.test.ts` prüft das
 * am fertigen Körper und nicht an der Formel.
 */

import * as THREE from 'three';
import type { Placement2D } from '../data/types';

/** Nach unten gedrehte Extrusion: Grundriss in XZ, Höhe in Y. */
export function extrudePolygon(
  points: Placement2D[],
  height: number,
  centre: [number, number],
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    const px = x - centre[0];
    // Gegengespiegelt: die Drehung unten legt lokales Y auf -Z.
    const py = centre[1] - y;
    if (index === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(height, 0.01),
    bevelEnabled: false,
    curveSegments: 1,
  });
  // Aus der XY-Ebene in die XZ-Ebene kippen.
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Legt Texturkoordinaten auf eine Geometrie, die keine hat.
 *
 * Das amtliche Weltmodell bringt Positionen und Normalen mit, aber keine UVs —
 * es ist aus Gebäudeumringen gerechnet, nicht modelliert. Ohne UVs tastet
 * jeder Punkt denselben Texel ab, und dann bleibt auch die beste Karte eine
 * Farbfläche. Genau daran lag es, dass die Halle von innen wie eine graue
 * Kiste aussah.
 *
 * Projiziert wird nach der dominanten Normalenrichtung, in Metern: eine
 * Kachel ist überall gleich gross, egal wie gross die Fläche ist.
 */
export function projiziereUV(geometry: THREE.BufferGeometry, tileM: number): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return;

  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const px = position.getX(i);
    const py = position.getY(i);
    const pz = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));

    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = px / tileM;
      v = pz / tileM;
    } else if (nx >= nz) {
      u = pz / tileM;
      v = py / tileM;
    } else {
      u = px / tileM;
      v = py / tileM;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

export function polygonCentre(points: Placement2D[]): [number, number] {
  const sum = points.reduce<[number, number]>(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
    [0, 0],
  );
  return [sum[0] / points.length, sum[1] / points.length];
}

/**
 * Geländemeter nach Three.js. **Die einzige Stelle, an der das passieren darf.**
 *
 * Die Geländemeter sind ein gespiegeltes System: `ins_gelaende()` in der
 * Pipeline rechnet `y = -(nord - ursprung)`, y waechst also nach Sueden. Die
 * Szene uebernimmt das unveraendert -- X nach Osten, Y nach oben, Z nach
 * Sueden. Das ist rechtshaendig und deckt sich mit dem, was
 * `world-origin.json` als verbindliche Achsenordnung fuehrt und was in den
 * amtlichen GLB-Paketen steht.
 *
 * Hier stand lange `-(y - centre[1])`, also Z nach **Norden**. Zusammen mit X
 * nach Osten und Y nach oben ist das linkshaendig, und die ganze Messe wurde
 * spiegelverkehrt gezeichnet: Halle 1 stand oestlich von Halle 9 statt
 * westlich. Aufgefallen ist es lange nicht, weil die Formel fuer den alten,
 * ungespiegelten Datensatz richtig war -- und beide Datensaetze durch dieselbe
 * Zeile liefen.
 *
 * Wer hier ein Vorzeichen aendert, spiegelt das Gelaende. `geometry.test.ts`
 * haelt mit Himmelsrichtungen dagegen.
 */
export function toScene(
  x: number,
  y: number,
  z: number,
  centre: [number, number],
): THREE.Vector3 {
  return new THREE.Vector3(x - centre[0], z, y - centre[1]);
}

/**
 * Dasselbe fuer die Faelle, in denen ein Tripel statt eines Vektors gebraucht
 * wird -- Positionen von React-Knoten, Punktlisten fuer Puffergeometrien.
 *
 * Es gibt sie, damit niemand die Umrechnung noch einmal von Hand hinschreibt.
 * Genau daran lag der Spiegelungsfehler so lange unentdeckt: die Formel stand
 * siebenundzwanzigmal ausgeschrieben in vier Dateien.
 */
export function nachSzene(
  x: number,
  y: number,
  hoehe: number,
  centre: [number, number],
): [number, number, number] {
  return [x - centre[0], hoehe, y - centre[1]];
}

/**
 * Y-Drehung, die die lokale **+X**-Achse auf eine Geländemeter-Richtung legt.
 *
 * Der dritte Ort, an dem die Spiegelung steckte. `toScene` und
 * `extrudePolygon` legen Punkte richtig ab -- aber eine Drehung ist kein
 * Punkt. `rotateY(phi)` bildet +X auf `(cos phi, 0, -sin phi)` ab, und Z zeigt
 * nach Sueden. Damit +X auf `(dx, dy)` zeigt, muss also `-dy` in den Sinus.
 *
 * Vorher stand an elf Stellen ein selbstgebauter `atan2` mit je eigener
 * Vorzeichenwahl, abgestimmt auf die damals gespiegelte Ebene. Nach deren
 * Korrektur war jeder einzelne davon um sein Vorzeichen daneben -- und weil
 * es Drehungen **um die eigene Mitte** sind, stand jeder Stand an der
 * richtigen Stelle und trotzdem schief.
 */
export function drehungNachX(dx: number, dy: number): number {
  return Math.atan2(-dy, dx);
}

/**
 * Dasselbe für Objekte, die nach **-Z** blicken -- die Vorgabe von Three.js
 * für Kameras und für alles, was mit der Front nach vorn gebaut ist.
 */
export function drehungNachZ(dx: number, dy: number): number {
  return Math.atan2(-dx, -dy);
}

/**
 * Fasst viele Grundrisse zu einer Geometrie zusammen.
 *
 * Tausend Standflächen als tausend Meshes wären tausend Zeichenaufrufe je
 * Bild; als ein zusammengeführtes Netz ist es einer. Die Zuordnung zurück auf
 * den einzelnen Stand läuft über die Vertex-Bereiche.
 */
export interface MergedPolygons {
  geometry: THREE.BufferGeometry;
  ranges: { id: string; start: number; count: number }[];
}

/**
 * Kantenlänge einer Texturkachel auf zusammengeführten Körpern, in Metern.
 *
 * Feste Meter und nicht „einmal über die Fläche": eine Standwand von 3 m und
 * eine von 30 m sollen dieselbe Körnung haben, sonst verrät der Maßstab, dass
 * es dieselbe Textur ist.
 */
const TILE_M = 4;

export function mergePolygons(
  items: { id: string; polygon: Placement2D[]; baseY: number; height: number }[],
  centre: [number, number],
): MergedPolygons {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const ranges: MergedPolygons['ranges'] = [];

  for (const item of items) {
    const geometry = extrudePolygon(item.polygon, item.height, centre);
    geometry.translate(0, item.baseY, 0);

    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const start = positions.length / 3;

    for (let i = 0; i < position.count; i += 1) {
      const px = position.getX(i);
      const py = position.getY(i);
      const pz = position.getZ(i);
      const nx = Math.abs(normal.getX(i));
      const ny = Math.abs(normal.getY(i));
      const nz = Math.abs(normal.getZ(i));

      positions.push(px, py, pz);
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));

      // Würfelprojektion nach der dominanten Normalenrichtung. Ohne UVs tastet
      // jeder Punkt denselben Texel ab -- dann ist auch die beste Textur nur
      // eine Farbe. Genau daran krankten vorher schon die Hallenwände.
      if (ny >= nx && ny >= nz) uvs.push(px / TILE_M, pz / TILE_M);
      else if (nx >= nz) uvs.push(pz / TILE_M, py / TILE_M);
      else uvs.push(px / TILE_M, py / TILE_M);
    }
    ranges.push({ id: item.id, start, count: position.count });
    geometry.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return { geometry: merged, ranges };
}
