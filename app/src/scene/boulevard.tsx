/**
 * Der Nordboulevard.
 *
 * Er ist keine Halle, sondern der Gang, der sie erschliesst: 235 m lang,
 * 16 m breit, 11 m hoch, im Wesentlichen Nord-Sued. Die Hallen 5, 6, 7, 9
 * und 10 docken mit ihrer **kurzen** Seite seitlich an -- ihre Tiefe laeuft
 * vom Boulevard weg. Halle 8 ist die Ausnahme: sie liegt am Ende und stellt
 * sich mit ihrer **langen** Seite quer davor, ein T-Abschluss.
 *
 * Die Masse sind Vorgabe, nicht Messung: `walkable-surfaces.json` fuehrt den
 * Boulevard ausdruecklich als Luecke (`boulevard-not-surveyed`), es gibt kein
 * amtliches Polygon. Verankert wird er deshalb an dem, was eingemessen ist --
 * an der Achse der Hallenzeile, an der Luecke zwischen den beiden Zeilen und
 * an der Stirnseite von Halle 8. Verschieben sich die Hallen, geht der
 * Boulevard mit.
 *
 * Halle 5 und Halle 10 liegen jenseits der 235 m und gehoeren damit zur
 * Fortsetzung, die hier noch nicht gebaut ist.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import type { Dataset } from '../data/load';
import type { Placement2D } from '../data/types';
import {
  ceilingSurface,
  disposeSurface,
  facadeSurface,
  hallenbodenSurface,
  WELT_KACHEL_M,
} from './materials';
import { hallenlage } from './interior';

/** Gibt die Achsrichtung der Hallenzeile vor. */
const LEITHALLE = '9.1';
/** Die Zeile gegenueber -- sie schliesst die Luecke auf der anderen Seite. */
const GEGENUEBER = '6.1';
/** Die Halle, die sich quer vor das Ende stellt. */
const ABSCHLUSS = '8.1';

const BREITE_M = 16;
const LAENGE_M = 235;
const HOEHE_M = 11;

/**
 * Fussbodenhoehe.
 *
 * Der Boulevard hat kein eigenes Wegenetz; draussen laeuft die Kollision auf
 * Hoehe null. Laege sein Boden auf Hallenniveau, stuende der Besucher einen
 * halben Meter darin. Der halbe Meter Versatz zur Halle faellt weniger auf
 * als eine Augenhoehe von 1,20 m.
 */
const BODEN_Y = 0.02;

/** Breite des Oberlichtbands in der Mitte. */
const OBERLICHT_BREITE_M = 6.4;

interface Achse {
  /** Ursprung: Südende der Mittelachse, in Geländemetern. */
  x0: number;
  y0: number;
  /** Einheitsvektor der Länge (nach Norden) und der Breite. */
  laengs: [number, number];
  quer: [number, number];
}

function spanne(footprint: Placement2D[], winkel: number) {
  const ux = Math.cos(winkel);
  const uy = Math.sin(winkel);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, y] of footprint) {
    const u = x * ux + y * uy;
    const v = -x * uy + y * ux;
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  return { uMin, uMax, vMin, vMax };
}

/**
 * Wo der Boulevard liegt, abgeleitet aus Halle 9.
 *
 * Die Querachse der Halle zeigt nach Süden, wenn v wächst -- das ergibt sich
 * aus der Drehung des Geländes und wird hier einmal festgehalten, statt an
 * jeder Stelle neu überlegt zu werden.
 */
export function boulevardAchse(data: Dataset): Achse | null {
  const halle = data.hallsByKey.get(LEITHALLE);
  const gegen = data.hallsByKey.get(GEGENUEBER);
  const abschluss = data.hallsByKey.get(ABSCHLUSS);
  if (!halle || !gegen || !abschluss) return null;
  const lage = hallenlage(halle.footprint);
  if (!lage) return null;

  const ux = Math.cos(lage.winkel);
  const uy = Math.sin(lage.winkel);
  const eigen = spanne(halle.footprint, lage.winkel);
  const drueben = spanne(gegen.footprint, lage.winkel);
  const quer = spanne(abschluss.footprint, lage.winkel);

  // Quer zur Zeile: mittig in die Luecke zwischen den beiden Hallenreihen.
  const uMitte = (eigen.uMax + drueben.uMin) / 2;

  // Laengs: an der Stirnseite von Halle 8 beginnen und von ihr weglaufen.
  // Welche der beiden Kanten von Halle 8 die Stirnseite ist, sagt die Lage
  // der Zeile -- der Boulevard laeuft immer auf sie zu.
  const vorne = Math.abs(quer.vMin - eigen.vMax) < Math.abs(quer.vMax - eigen.vMax)
    ? quer.vMin
    : quer.vMax;
  const richtung = Math.sign(((eigen.vMin + eigen.vMax) / 2) - vorne) || -1;

  const laengs: [number, number] = [-uy * richtung, ux * richtung];
  return {
    x0: uMitte * ux - vorne * uy,
    y0: uMitte * uy + vorne * ux,
    laengs,
    quer: [ux, uy],
  };
}

/** Lichte Hoehe -- gleichbleibend über die ganze Laenge. */
function hoeheBei(): number {
  return HOEHE_M;
}

/** Stationen entlang der Laenge. Zwei genuegen, solange die Hoehe konstant ist. */
const STATIONEN = [0, LAENGE_M];

/**
 * Ein Band aus Vierecken entlang des Boulevards.
 *
 * Dach, Oberlicht und beide Wände sind dasselbe Bauteil in vier Ausprägungen:
 * eine Folge von Stationen, an jeder zwei Punkte. Direkt in Szenenkoordinaten
 * gerechnet -- eine Drehung als Euler-Winkel wäre bei geneigtem Dach die
 * Fehlerquelle, die man hinterher nicht mehr findet.
 */
function band(
  achse: Achse,
  centre: [number, number],
  punkte: (s: number) => [[number, number], [number, number]],
  kachelM: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];

  const ort = (s: number, q: number, h: number): [number, number, number] => {
    const x = achse.x0 + achse.laengs[0] * s + achse.quer[0] * q;
    const y = achse.y0 + achse.laengs[1] * s + achse.quer[1] * q;
    return [x - centre[0], h, -(y - centre[1])];
  };

  for (let i = 1; i < STATIONEN.length; i += 1) {
    const s0 = STATIONEN[i - 1];
    const s1 = STATIONEN[i];
    const [a0, a1] = punkte(s0);
    const [b0, b1] = punkte(s1);
    const ecken = [
      { p: ort(s0, a0[0], a0[1]), uv: [s0 / kachelM, a0[0] / kachelM] },
      { p: ort(s0, a1[0], a1[1]), uv: [s0 / kachelM, a1[0] / kachelM] },
      { p: ort(s1, b1[0], b1[1]), uv: [s1 / kachelM, b1[0] / kachelM] },
      { p: ort(s1, b0[0], b0[1]), uv: [s1 / kachelM, b0[0] / kachelM] },
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      positions.push(...ecken[index].p);
      uvs.push(ecken[index].uv[0], ecken[index].uv[1]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function kachel(quelle: THREE.Texture | undefined, wiederholung = 1) {
  if (!quelle) return null;
  const kopie = quelle.clone();
  kopie.wrapS = THREE.RepeatWrapping;
  kopie.wrapT = THREE.RepeatWrapping;
  kopie.repeat.set(wiederholung, wiederholung);
  kopie.needsUpdate = true;
  return kopie;
}

export function Boulevard({
  data,
  centre,
  visible,
}: {
  data: Dataset;
  centre: [number, number];
  visible: boolean;
}) {
  const achse = useMemo(() => boulevardAchse(data), [data]);

  const flaechen = useMemo(() => {
    if (!achse) return null;
    const halb = BREITE_M / 2;
    const lichtHalb = OBERLICHT_BREITE_M / 2;

    return {
      boden: band(achse, centre,
        () => [[-halb, BODEN_Y], [halb, BODEN_Y]], WELT_KACHEL_M.boden),
      // Das Dach folgt dem Höhenverlauf, das Oberlicht liegt knapp darunter.
      dach: band(achse, centre,
        () => [[-halb, hoeheBei()], [halb, hoeheBei()]], WELT_KACHEL_M.decke),
      oberlicht: band(achse, centre,
        () => [[-lichtHalb, hoeheBei() - 0.06], [lichtHalb, hoeheBei() - 0.06]],
        WELT_KACHEL_M.decke),
      wandWest: band(achse, centre,
        () => [[-halb, BODEN_Y], [-halb, hoeheBei()]], WELT_KACHEL_M.wand),
      wandOst: band(achse, centre,
        () => [[halb, hoeheBei()], [halb, BODEN_Y]], WELT_KACHEL_M.wand),
    };
  }, [achse, centre]);

  const surfaces = useMemo(
    () => ({
      boden: hallenbodenSurface(),
      dach: ceilingSurface(),
      wand: facadeSurface(true),
    }),
    [],
  );

  const material = useMemo(() => ({
    boden: new THREE.MeshStandardMaterial({
      map: kachel(surfaces.boden.map),
      normalMap: kachel(surfaces.boden.normalMap),
      roughnessMap: kachel(surfaces.boden.roughnessMap),
      // Heller als der Hallenboden: der Boulevard hat Tageslicht von oben.
      color: new THREE.Color('#cfd2d6'),
      roughness: 0.3,
      metalness: 0.2,
      envMapIntensity: 1.5,
      // Beidseitig: die Bänder werden aus Stationen gebaut, nicht modelliert.
      // Welche Seite dabei vorn liegt, hängt an der Drehrichtung des Geländes
      // -- und ein Boden, den man von oben nicht sieht, ist der Fehler, den
      // man am längsten sucht.
      side: THREE.DoubleSide,
    }),
    dach: new THREE.MeshStandardMaterial({
      map: kachel(surfaces.dach.map),
      normalMap: kachel(surfaces.dach.normalMap),
      roughnessMap: kachel(surfaces.dach.roughnessMap),
      color: new THREE.Color('#5a5d64'),
      roughness: 0.85,
      side: THREE.DoubleSide,
    }),
    oberlicht: new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e8f0ff'),
      emissive: new THREE.Color('#dfeaff'),
      emissiveIntensity: 2.1,
      roughness: 0.25,
      side: THREE.DoubleSide,
    }),
    wand: new THREE.MeshStandardMaterial({
      map: kachel(surfaces.wand.map),
      normalMap: kachel(surfaces.wand.normalMap),
      roughnessMap: kachel(surfaces.wand.roughnessMap),
      emissiveMap: kachel(surfaces.wand.emissiveMap),
      emissive: new THREE.Color('#8fb4d8'),
      emissiveIntensity: 0.5,
      roughness: 0.6,
      metalness: 0.15,
      side: THREE.DoubleSide,
    }),
  }), [surfaces]);

  useEffect(() => () => {
    Object.values(material).forEach((eintrag) => eintrag.dispose());
    disposeSurface(surfaces.boden);
    disposeSurface(surfaces.dach);
    disposeSurface(surfaces.wand);
  }, [material, surfaces]);

  useEffect(() => () => {
    if (!flaechen) return;
    Object.values(flaechen).forEach((geometry) => geometry.dispose());
  }, [flaechen]);

  /** Tageslicht von oben, in Abständen entlang des Bands. */
  const lampen = useMemo(() => {
    if (!achse) return [];
    const out: [number, number, number][] = [];
    const anzahl = 6;
    for (let i = 0; i < anzahl; i += 1) {
      const s = ((i + 0.5) / anzahl) * LAENGE_M;
      const x = achse.x0 + achse.laengs[0] * s;
      const y = achse.y0 + achse.laengs[1] * s;
      out.push([x - centre[0], HOEHE_M - 1.2, -(y - centre[1])]);
    }
    return out;
  }, [achse, centre]);

  if (!visible || !flaechen) return null;

  return (
    <group>
      <mesh geometry={flaechen.boden} material={material.boden} receiveShadow />
      <mesh geometry={flaechen.dach} material={material.dach} />
      <mesh geometry={flaechen.oberlicht} material={material.oberlicht} />
      <mesh geometry={flaechen.wandWest} material={material.wand} receiveShadow />
      <mesh geometry={flaechen.wandOst} material={material.wand} receiveShadow />
      {lampen.map((position, index) => (
        <pointLight
          key={index}
          position={position}
          color="#eaf1ff"
          intensity={150}
          distance={0}
          decay={2}
        />
      ))}
    </group>
  );
}
