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
  boulevarddeckeSurface,
  disposeSurface,
  glasfassadeSurface,
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

/**
 * Die abgehängten Wegweiser -- das Erkennungszeichen des Boulevards.
 *
 * Auf dem Referenzfoto ist nicht die Decke und nicht der Boden das, was den
 * Nordboulevard unverwechselbar macht, sondern die Reihe weisser Tafeln über
 * dem Gang: oben ein grünes Feld mit dem Fernziel, darunter die Hallen mit
 * grünem Pfeil. Wer den Gang betritt, liest sie, bevor er irgendetwas
 * anderes wahrnimmt.
 *
 * Angeschrieben wird, was tatsächlich dort abgeht -- die Halle links und die
 * Halle rechts, an der Stelle, an der man vor ihrem Eingang steht.
 */
interface Wegweiser {
  /** Meter vom Anfang (Stirnseite Halle 8). */
  station: number;
  kopf: string;
  kopfKlein: string;
  zeilen: { text: string; pfeil: 'links' | 'rechts' | 'geradeaus' }[];
}

const WEGWEISER: Wegweiser[] = [
  { station: 30, kopf: '7 – 8', kopfKlein: 'Congress-Centrum Nord\nAusgang Nord',
    zeilen: [{ text: '8', pfeil: 'geradeaus' }, { text: '7', pfeil: 'rechts' }] },
  { station: 95, kopf: '7', kopfKlein: 'Service Center Nord',
    zeilen: [{ text: '7', pfeil: 'rechts' }, { text: '6', pfeil: 'links' }] },
  { station: 175, kopf: '6 – 9', kopfKlein: 'Congress-Centrum Nord\nAusgang Nord',
    zeilen: [{ text: '6', pfeil: 'rechts' }, { text: '9', pfeil: 'links' }] },
  { station: 220, kopf: '9', kopfKlein: 'Ausgang Nord',
    zeilen: [{ text: '9', pfeil: 'links' }, { text: '5 – 10', pfeil: 'geradeaus' }] },
];

const SCHILD_BREITE_M = 2.6;
const SCHILD_HOEHE_M = 3.4;
/** Unterkante über dem Boden -- hoch genug, dass niemand dagegenläuft. */
const SCHILD_Y = 4.4;
const GRUEN = '#3aa935';

function pfeilZeichnen(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, groesse: number,
  richtung: 'links' | 'rechts' | 'geradeaus',
): void {
  ctx.save();
  ctx.translate(x, y);
  if (richtung === 'links') ctx.rotate(Math.PI / 2);
  if (richtung === 'rechts') ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = GRUEN;
  const h = groesse * 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -groesse * 0.5);
  ctx.lineTo(h, 0);
  ctx.lineTo(h * 0.42, 0);
  ctx.lineTo(h * 0.42, groesse * 0.5);
  ctx.lineTo(-h * 0.42, groesse * 0.5);
  ctx.lineTo(-h * 0.42, 0);
  ctx.lineTo(-h, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function schildTextur(schild: Wegweiser): THREE.CanvasTexture {
  const B = 512;
  const H = 668;
  const element = document.createElement('canvas');
  element.width = B;
  element.height = H;
  const ctx = element.getContext('2d');
  if (!ctx) throw new Error('Canvas ohne 2D-Kontext');
  const schrift = '"Helvetica Neue", Helvetica, Arial, sans-serif';

  ctx.fillStyle = '#f4f5f6';
  ctx.fillRect(0, 0, B, H);

  // Kopffeld: grüne Fläche mit der Nummer, darunter das Fernziel klein.
  const kopfH = H * 0.3;
  ctx.fillStyle = GRUEN;
  ctx.fillRect(0, 0, B, kopfH);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${kopfH * 0.52}px ${schrift}`;
  ctx.textAlign = 'left';
  ctx.fillText(schild.kopf, 24, kopfH * 0.34);
  ctx.font = `400 ${kopfH * 0.15}px ${schrift}`;
  schild.kopfKlein.split('\n').forEach((zeile, i) => {
    ctx.fillText(zeile, 24, kopfH * 0.66 + i * kopfH * 0.18);
  });

  // Zeilen: Hallennummer links, Pfeil rechts, dünne Trennlinie dazwischen.
  const rest = H - kopfH;
  const zeilenH = rest / Math.max(schild.zeilen.length, 2);
  schild.zeilen.forEach((zeile, i) => {
    const y = kopfH + i * zeilenH;
    ctx.strokeStyle = '#c8ccd0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, y);
    ctx.lineTo(B - 16, y);
    ctx.stroke();
    ctx.fillStyle = '#17181c';
    ctx.font = `700 ${zeilenH * 0.62}px ${schrift}`;
    ctx.textAlign = 'left';
    ctx.fillText(zeile.text, 28, y + zeilenH * 0.5);
    pfeilZeichnen(ctx, B - 74, y + zeilenH * 0.5, zeilenH * 0.56, zeile.pfeil);
  });

  const textur = new THREE.CanvasTexture(element);
  textur.colorSpace = THREE.SRGBColorSpace;
  textur.anisotropy = 8;
  return textur;
}

/**
 * Die Treppenanlage am Suedende.
 *
 * Auf dem Referenzfoto ist sie das, was das Ende des Boulevards ueberhaupt
 * zu einem Ort macht: eine breite Freitreppe in drei Laeufen zu je fuenfzehn
 * Stufen, links und rechts von je einer Rolltreppe begleitet, hinauf auf die
 * obere Ebene. 45 Stufen zu 16,56 cm sind 7,45 m -- das ist kein Absatz,
 * das ist ein Geschoss.
 */
const LAEUFE = 3;
const STUFEN_JE_LAUF = 15;
const STEIGUNG_M = 0.1656;
const AUFTRITT_M = 0.30;
const PODEST_M = 2.2;
const TREPPE_BREITE_M = 7;
const ROLLTREPPE_BREITE_M = 1.4;
/** Gesamter Lauf in der Laenge und die Gesamthoehe. */
const TREPPE_LAUF_M = LAEUFE * STUFEN_JE_LAUF * AUFTRITT_M + (LAEUFE - 1) * PODEST_M;
const TREPPE_HOEHE_M = LAEUFE * STUFEN_JE_LAUF * STEIGUNG_M;

interface Bauteil {
  position: [number, number, number];
  groesse: [number, number, number];
  neigung?: number;
}

function treppenteile(achse: Achse, centre: [number, number]): {
  stufen: Bauteil[];
  rolltreppen: Bauteil[];
  drehung: number;
} {
  const ort = (s: number, q: number, h: number): [number, number, number] => {
    const x = achse.x0 + achse.laengs[0] * s + achse.quer[0] * q;
    const y = achse.y0 + achse.laengs[1] * s + achse.quer[1] * q;
    return [x - centre[0], h, -(y - centre[1])];
  };
  const drehung = Math.atan2(achse.laengs[0], -achse.laengs[1]);

  // Die Anlage sitzt am Ende des Bands und steigt darauf zu.
  const anfang = LAENGE_M - TREPPE_LAUF_M;
  const stufen: Bauteil[] = [];
  let s = anfang;
  let h = BODEN_Y;
  for (let lauf = 0; lauf < LAEUFE; lauf += 1) {
    for (let i = 0; i < STUFEN_JE_LAUF; i += 1) {
      h += STEIGUNG_M;
      // Jede Stufe steht als Block auf dem Boden -- von unten sieht man
      // ohnehin nur die Vorderkante, und eine massive Treppe wirft den
      // Schatten, den eine Folge schwebender Platten nicht wirft.
      stufen.push({
        position: ort(s + AUFTRITT_M / 2, 0, h / 2),
        groesse: [TREPPE_BREITE_M, h, AUFTRITT_M],
      });
      s += AUFTRITT_M;
    }
    if (lauf < LAEUFE - 1) {
      stufen.push({
        position: ort(s + PODEST_M / 2, 0, h / 2),
        groesse: [TREPPE_BREITE_M, h, PODEST_M],
      });
      s += PODEST_M;
    }
  }

  // Rolltreppen: je ein geneigter Koerper ueber die ganze Strecke.
  const laenge = Math.hypot(TREPPE_LAUF_M, TREPPE_HOEHE_M);
  // Negativ: eine Drehung um +X kippt die lokale Z-Achse nach unten. Die
  // Rolltreppe soll aber in dieselbe Richtung steigen wie die Treppe daneben.
  const neigung = -Math.atan2(TREPPE_HOEHE_M, TREPPE_LAUF_M);
  const rolltreppen: Bauteil[] = [-1, 1].map((seite) => ({
    position: ort(
      anfang + TREPPE_LAUF_M / 2,
      seite * (TREPPE_BREITE_M / 2 + ROLLTREPPE_BREITE_M / 2 + 0.35),
      BODEN_Y + TREPPE_HOEHE_M / 2,
    ),
    groesse: [ROLLTREPPE_BREITE_M, 0.9, laenge],
    neigung,
  }));

  return { stufen, rolltreppen, drehung };
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
      dach: boulevarddeckeSurface(),
      wand: glasfassadeSurface(),
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
      color: new THREE.Color('#ffffff'),
      roughness: 0.8,
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
      // Draussen ist Tag: das Glas trägt das Licht in den Gang, nicht die
      // Lampen. Deshalb leuchtet es kräftig und ist fast spiegelglatt.
      emissive: new THREE.Color('#cfe2f2'),
      emissiveIntensity: 1.5,
      roughness: 0.18,
      metalness: 0.1,
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

  /** Pendelleuchten in zwei Reihen, wie auf dem Foto. */
  const pendel = useMemo(() => {
    if (!achse) return [];
    const out: [number, number, number][] = [];
    const abstand = 9;
    for (let s = abstand; s < LAENGE_M; s += abstand) {
      for (const q of [-4.2, 4.2]) {
        const x = achse.x0 + achse.laengs[0] * s + achse.quer[0] * q;
        const y = achse.y0 + achse.laengs[1] * s + achse.quer[1] * q;
        out.push([x - centre[0], HOEHE_M - 1.5, -(y - centre[1])]);
      }
    }
    return out;
  }, [achse, centre]);

  const schilder = useMemo(() => {
    if (!achse) return [];
    // Die Tafel steht quer im Gang und schaut dem Ankommenden entgegen.
    const drehung = Math.atan2(-achse.laengs[0], achse.laengs[1]);
    return WEGWEISER.map((schild) => {
      const x = achse.x0 + achse.laengs[0] * schild.station + achse.quer[0] * 3.4;
      const y = achse.y0 + achse.laengs[1] * schild.station + achse.quer[1] * 3.4;
      return {
        schild,
        position: [x - centre[0], SCHILD_Y + SCHILD_HOEHE_M / 2, -(y - centre[1])] as
          [number, number, number],
        drehung,
        textur: schildTextur(schild),
      };
    });
  }, [achse, centre]);

  useEffect(() => () => schilder.forEach(({ textur }) => textur.dispose()), [schilder]);

  const treppe = useMemo(() => (achse ? treppenteile(achse, centre) : null), [achse, centre]);

  if (!visible || !flaechen) return null;

  return (
    <group>
      <mesh geometry={flaechen.boden} material={material.boden} receiveShadow />
      <mesh geometry={flaechen.dach} material={material.dach} />
      <mesh geometry={flaechen.oberlicht} material={material.oberlicht} />
      <mesh geometry={flaechen.wandWest} material={material.wand} receiveShadow />
      <mesh geometry={flaechen.wandOst} material={material.wand} receiveShadow />
      {pendel.map((position, index) => (
        <mesh key={`p${index}`} position={position}>
          <cylinderGeometry args={[0.62, 0.34, 0.42, 12]} />
          <meshStandardMaterial
            color="#f4f2ec"
            emissive="#fff4e0"
            emissiveIntensity={1.6}
            roughness={0.4}
          />
        </mesh>
      ))}
      {schilder.map(({ schild, position, drehung, textur }) => (
        <mesh key={schild.station} position={position} rotation={[0, drehung, 0]}>
          <planeGeometry args={[SCHILD_BREITE_M, SCHILD_HOEHE_M]} />
          <meshStandardMaterial
            map={textur}
            emissiveMap={textur}
            emissive="#ffffff"
            emissiveIntensity={0.45}
            roughness={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {treppe && (
        <group>
          {treppe.stufen.map((teil, index) => (
            <mesh
              key={`t${index}`}
              position={teil.position}
              rotation={[0, treppe.drehung, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={teil.groesse} />
              <meshStandardMaterial color="#d9dade" roughness={0.55} metalness={0.1} />
            </mesh>
          ))}
          {/* Erst um die Hochachse in die Boulevardrichtung, dann in einer
              zweiten Gruppe kippen. Beides in einem Euler-Winkel wäre von der
              Reihenfolge abhängig -- und genau daran kippt die Rolltreppe
              hinterher in die falsche Ebene. */}
          {treppe.rolltreppen.map((teil, index) => (
            <group key={`r${index}`} position={teil.position} rotation={[0, treppe.drehung, 0]}>
              <group rotation={[teil.neigung ?? 0, 0, 0]}>
                <mesh castShadow>
                  <boxGeometry args={teil.groesse} />
                  <meshStandardMaterial color="#9aa0a8" roughness={0.32} metalness={0.65} />
                </mesh>
              </group>
            </group>
          ))}
        </group>
      )}
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
