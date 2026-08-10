/**
 * Die grossen Stände als Körper mit Gesicht.
 *
 * Ein Sammelkörper aus 2,60 m hohen Platten sagt, *dass* dort ein Stand ist.
 * Er sagt nicht, in welcher Halle man steht. Dafür braucht es drei Dinge, und
 * zwar genau diese drei:
 *
 * 1. **Höhe.** Messestände der grossen Aussteller sind Bauten von sieben bis
 *    acht Metern, keine Tische. Erst dadurch entsteht der Gang dazwischen.
 * 2. **Hausfarbe und Schriftzug** auf der ganzen Fassade -- nicht als Schild,
 *    sondern als Fläche, die man aus dreissig Metern liest.
 * 3. **Leuchtband und Hängebanner.** In einer Halle mit 11 m lichter Höhe ist
 *    das Leuchtende das, was zuerst ins Auge fällt.
 *
 * Bewusst nicht enthalten: Innenräume, Möblierung, Spielstationen. Die kosten
 * viel und tragen zur Wiedererkennung nichts bei.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

import type { Dataset, Gelaende } from '../data/load';
import type { Placement2D } from '../data/types';
import { drehungNachX, drehungNachZ, polygonCentre, toScene } from './geometry';
import { MARKEN, MARKENFLAECHEN, type Marke } from './marken';

const FONT = '"Arial Black", "Helvetica Neue", Helvetica, Arial, sans-serif';
const W = 2048;
const H = 512;
/** Höhe des Leuchtbands oben, in Texel. */
const BAND = 54;
const SKIRT = 44;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = W;
  element.height = H;
  const context = element.getContext('2d');
  if (!context) throw new Error('Canvas ohne 2D-Kontext');
  return [element, context];
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

/** Schriftgrad, der in die vorgegebene Fläche passt -- ohne Zeilenumbruch. */
function fit(context: CanvasRenderingContext2D, text: string, maxW: number, maxH: number): number {
  context.font = `900 ${maxH}px ${FONT}`;
  const width = context.measureText(text).width;
  return width > maxW ? Math.floor((maxH * maxW) / width) : maxH;
}

/**
 * Malt eine Fassade.
 *
 * `leucht` erzeugt dieselbe Fassade als Emissionskarte: schwarz, ausser dem
 * Leuchtband und dem Schriftzug. Ohne sie bleibt jede Marke in der Halle so
 * dunkel wie die Wand dahinter, mit ihr leuchtet sie wie gebaut.
 */
function fassade(marke: Marke, leucht: boolean): HTMLCanvasElement {
  const [element, context] = canvas();

  context.fillStyle = leucht ? '#000000' : marke.wand;
  context.fillRect(0, 0, W, H);

  // Leuchtband oben und dunkler Sockel unten geben dem Körper einen Massstab.
  context.fillStyle = marke.band;
  context.fillRect(0, 0, W, BAND);
  if (!leucht) {
    context.fillStyle = 'rgba(0,0,0,0.32)';
    context.fillRect(0, H - SKIRT, W, SKIRT);
  }

  const cx = W / 2;
  // Der Schriftzug sitzt im oberen Drittel: wer vier Meter vor einer acht Meter
  // hohen Wand steht, sieht nach oben und nicht auf Bauchhöhe.
  const cy = H * 0.42;
  const boxW = W * 0.66;
  const hasSub = Boolean(marke.sub);
  const capH = hasSub ? 150 : 190;

  context.textAlign = 'center';
  context.textBaseline = 'middle';

  if (marke.schriftbild === 'pille') {
    const size = fit(context, marke.label, boxW * 0.8, capH);
    context.font = `900 ${size}px ${FONT}`;
    const textW = context.measureText(marke.label).width;
    const padX = size * 0.55;
    const pillW = textW + padX * 2;
    const pillH = size * 1.7;
    context.fillStyle = marke.platte;
    roundRect(context, cx - pillW / 2, cy - pillH / 2, pillW, pillH, pillH / 2);
    context.fill();
    context.fillStyle = marke.schrift;
    context.fillText(marke.label, cx, cy);
  } else if (marke.schriftbild === 'kachel') {
    const size = fit(context, marke.label, boxW * 0.78, capH);
    context.font = `900 ${size}px ${FONT}`;
    const textW = context.measureText(marke.label).width;
    const plateW = textW + size * 0.9;
    const plateH = size * 1.75;
    context.fillStyle = marke.platte;
    roundRect(context, cx - plateW / 2, cy - plateH / 2, plateW, plateH, size * 0.16);
    context.fill();
    if (marke.kontur) {
      context.lineWidth = size * 0.13;
      context.strokeStyle = marke.kontur;
      context.lineJoin = 'round';
      context.strokeText(marke.label, cx, cy);
    }
    context.fillStyle = marke.schrift;
    context.fillText(marke.label, cx, cy);
  } else if (marke.schriftbild === 'wappen') {
    const size = fit(context, marke.label, boxW * 0.8, capH);
    context.font = `900 ${size}px ${FONT}`;
    const textW = context.measureText(marke.label).width;
    context.fillStyle = marke.band;
    context.fillRect(cx - textW / 2, cy - size * 0.92, textW, size * 0.12);
    context.fillStyle = marke.schrift;
    context.fillText(marke.label, cx, cy - (hasSub ? size * 0.1 : 0));
    if (marke.sub) {
      const subSize = size * 0.34;
      context.font = `700 ${subSize}px ${FONT}`;
      context.fillStyle = marke.schrift;
      context.fillText(marke.sub, cx, cy + size * 0.72);
    }
  } else {
    const size = fit(context, marke.label, boxW, capH);
    context.font = `900 ${size}px ${FONT}`;
    context.fillStyle = marke.schrift;
    context.fillText(marke.label, cx, cy - (hasSub ? size * 0.42 : 0));
    if (marke.sub) {
      const subSize = size * 0.52;
      context.font = `500 ${subSize}px ${FONT}`;
      context.fillText(marke.sub, cx, cy + size * 0.62);
    }
  }

  return element;
}

interface Fassadensatz {
  seite: THREE.MeshStandardMaterial;
  dach: THREE.MeshStandardMaterial;
  banner: THREE.MeshStandardMaterial;
  entsorgen: () => void;
}

/**
 * Wie oft der Schriftzug auf eine Wand passt.
 *
 * Ein einziges Logo über 24 m Wand heißt: wer davorsteht, sieht einen
 * Buchstaben. Gebaut wird es andersherum -- der Schriftzug wiederholt sich
 * etwa alle zwölf Meter, und damit ist er aus jeder Entfernung ganz zu sehen.
 */
const LOGO_ABSTAND_M = 9;

function fassadensatz(marke: Marke, wiederholungen: number): Fassadensatz {
  const farbe = new THREE.CanvasTexture(fassade(marke, false));
  farbe.colorSpace = THREE.SRGBColorSpace;
  farbe.anisotropy = 8;
  farbe.wrapS = THREE.RepeatWrapping;
  farbe.repeat.set(wiederholungen, 1);
  const leucht = new THREE.CanvasTexture(fassade(marke, true));
  leucht.colorSpace = THREE.SRGBColorSpace;
  leucht.anisotropy = 8;
  leucht.wrapS = THREE.RepeatWrapping;
  leucht.repeat.set(wiederholungen, 1);

  const seite = new THREE.MeshStandardMaterial({
    map: farbe,
    emissiveMap: leucht,
    emissive: new THREE.Color('#ffffff'),
    // Zurückhaltend: seit die Halle eigene Lichtquellen hat, ist das
    // Selbstleuchten nur noch für Leuchtband und Schriftzug zuständig und
    // nicht mehr der Ersatz für fehlendes Licht.
    emissiveIntensity: 0.3,
    roughness: 0.55,
    metalness: 0.05,
  });
  const dach = new THREE.MeshStandardMaterial({
    color: new THREE.Color(marke.wand).multiplyScalar(0.42),
    roughness: 0.9,
  });
  // Das Hängebanner trägt den Schriftzug genau einmal.
  const bannerFarbe = farbe.clone();
  bannerFarbe.repeat.set(1, 1);
  bannerFarbe.needsUpdate = true;
  const bannerLeucht = leucht.clone();
  bannerLeucht.repeat.set(1, 1);
  bannerLeucht.needsUpdate = true;

  const banner = new THREE.MeshStandardMaterial({
    map: bannerFarbe,
    emissiveMap: bannerLeucht,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.7,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  return {
    seite,
    dach,
    banner,
    entsorgen: () => {
      farbe.dispose();
      leucht.dispose();
      bannerFarbe.dispose();
      bannerLeucht.dispose();
      seite.dispose();
      dach.dispose();
      banner.dispose();
    },
  };
}


/**
 * Das gedrehte Rechteck hinter einem Standpolygon.
 *
 * Die Hallen liegen im Datensatz **eingemessen**, also so gedreht, wie sie auf
 * dem Gelände stehen -- Halle 9 um rund 31°. Eine achsparallele Hüllbox wäre
 * damit 37 % zu groß und stünde schief im Gang. Gerechnet wird deshalb in den
 * Kanten des Polygons selbst: eine Kante ist die Front, die andere die Tiefe.
 */
interface Rechteck {
  mx: number;
  my: number;
  /** Länge entlang der ersten Kante. */
  breite: number;
  /** Länge entlang der zweiten Kante. */
  tiefe: number;
  /** Richtung der ersten Kante in Kartenkoordinaten. */
  winkel: number;
  /** Einheitsvektoren der beiden Kanten, für Bannerplatzierung. */
  u: [number, number];
  v: [number, number];
}

export function rechteck(polygon: Placement2D[]): Rechteck | null {
  if (polygon.length < 4) return null;
  const [p0, p1, p2] = polygon;
  const e1: [number, number] = [p1[0] - p0[0], p1[1] - p0[1]];
  const e2: [number, number] = [p2[0] - p1[0], p2[1] - p1[1]];
  const breite = Math.hypot(e1[0], e1[1]);
  const tiefe = Math.hypot(e2[0], e2[1]);
  if (breite < 0.5 || tiefe < 0.5) return null;
  const mitte = polygonCentre(polygon.slice(0, 4));
  return {
    mx: mitte[0],
    my: mitte[1],
    breite,
    tiefe,
    winkel: drehungNachX(e1[0], e1[1]),
    u: [e1[0] / breite, e1[1] / breite],
    v: [e2[0] / tiefe, e2[1] / tiefe],
  };
}

export interface Koerper {
  standId: string;
  marke: Marke;
  /** Materialsatz: Marke plus Anzahl der Schriftzüge auf der Wand. */
  satzKey: string;
  wiederholungen: number;
  /** Mittelpunkt in Szenenkoordinaten, auf halber Höhe. */
  position: THREE.Vector3;
  breite: number;
  tiefe: number;
  hoehe: number;
  /** Drehung um die Hochachse, aus der Lage der Halle. */
  drehung: number;
  banner: { position: THREE.Vector3; breite: number; drehung: number } | null;
}

/** Höhe der Bannerunterkante über dem Hallenboden. */
const BANNER_Y = 8.4;
const BANNER_H = 3.6;

/**
 * Die Standkörper als reine Rechnung.
 *
 * Getrennt von der Darstellung, weil derselbe Körper zweimal gebraucht wird:
 * einmal als Mesh in der Szene und einmal als Quader im Blockeditor. Was
 * gebaut ist, soll dort auch dann noch stimmen, wenn hier etwas nachgezogen
 * wird -- also wird es an einer Stelle gerechnet und nicht an zweien.
 */
export function markenkoerper(data: Gelaende, centre: [number, number]): Koerper[] {
  const stands = new Map(data.site.stands.map((stand) => [stand.id, stand]));
  const out: Koerper[] = [];

  for (const flaeche of MARKENFLAECHEN) {
    const stand = stands.get(flaeche.standId);
    const marke = MARKEN[flaeche.marke];
    if (!stand || !marke) continue;
    const hall = data.hallsByKey.get(stand.hallKey);

    const voll = rechteck(stand.polygon);
    if (!voll) continue;

    // Geteilte Stände: der lange Block ganz rechts trägt im Referenzplan zwei
    // Marken. Geteilt wird entlang der langen Kante, und welche Hälfte welcher
    // Marke gehört, entscheidet die Nachbarschaft -- nicht die Himmelsrichtung,
    // die bei einer eingemessenen Halle nichts mehr über den Plan aussagt.
    let breite = voll.breite;
    let tiefe = voll.tiefe;
    let mx = voll.mx;
    let my = voll.my;
    if (flaeche.naheAn) {
      const nachbar = stands.get(flaeche.naheAn);
      if (!nachbar) continue;
      const ziel = polygonCentre(nachbar.polygon);
      const laengs = voll.tiefe >= voll.breite;
      const achse = laengs ? voll.v : voll.u;
      const halb = (laengs ? voll.tiefe : voll.breite) / 4;
      const richtung =
        (ziel[0] - voll.mx) * achse[0] + (ziel[1] - voll.my) * achse[1] >= 0 ? 1 : -1;
      mx = voll.mx + achse[0] * halb * richtung;
      my = voll.my + achse[1] * halb * richtung;
      if (laengs) tiefe = voll.tiefe / 2;
      else breite = voll.breite / 2;
    }
    if (breite < 2 || tiefe < 2) continue;

    // Wo liegt der Gang? Von den vier Seiten die, die zur Hallenmitte zeigt.
    let banner: Koerper['banner'] = null;
    if (marke.banner && hall) {
      const [hx, hy] = polygonCentre(hall.footprint);
      const nach: [number, number] = [hx - mx, hy - my];
      const seiten: { richtung: [number, number]; abstand: number; laenge: number }[] = [
        { richtung: voll.u, abstand: breite / 2, laenge: tiefe },
        { richtung: [-voll.u[0], -voll.u[1]], abstand: breite / 2, laenge: tiefe },
        { richtung: voll.v, abstand: tiefe / 2, laenge: breite },
        { richtung: [-voll.v[0], -voll.v[1]], abstand: tiefe / 2, laenge: breite },
      ];
      let beste = seiten[0];
      let bester = -Infinity;
      for (const seite of seiten) {
        const wert = nach[0] * seite.richtung[0] + nach[1] * seite.richtung[1];
        if (wert > bester) {
          bester = wert;
          beste = seite;
        }
      }
      const bx = mx + beste.richtung[0] * (beste.abstand + 1.6);
      const by = my + beste.richtung[1] * (beste.abstand + 1.6);
      banner = {
        position: toScene(bx, by, BANNER_Y, centre),
        breite: Math.min(beste.laenge * 0.72, 18),
        // Die Bannerfläche zeigt mit ihrer Vorderseite nach aussen in den Gang.
        drehung: drehungNachZ(beste.richtung[0], beste.richtung[1]),
      };
    }

    const wiederholungen = Math.max(
      1,
      Math.round((breite + tiefe) / 2 / LOGO_ABSTAND_M),
    );
    out.push({
      standId: stand.id,
      marke,
      satzKey: `${marke.key}:${wiederholungen}`,
      wiederholungen,
      position: toScene(mx, my, stand.baseY + marke.hoeheM / 2 + 0.05, centre),
      breite,
      tiefe,
      hoehe: marke.hoeheM,
      drehung: voll.winkel,
      banner,
    });
  }
  return out;
}

export function Markenstaende({
  data,
  centre,
  onSelectStand,
}: {
  data: Dataset;
  centre: [number, number];
  onSelectStand: (standId: string | null) => void;
}) {
  const koerper = useMemo<Koerper[]>(() => markenkoerper(data, centre), [data, centre]);

  const saetze = useMemo(() => {
    const map = new Map<string, Fassadensatz>();
    for (const k of koerper) {
      if (!map.has(k.satzKey)) map.set(k.satzKey, fassadensatz(k.marke, k.wiederholungen));
    }
    return map;
  }, [koerper]);

  useEffect(() => () => saetze.forEach((satz) => satz.entsorgen()), [saetze]);

  const bannerGeometrie = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  useEffect(() => () => bannerGeometrie.dispose(), [bannerGeometrie]);

  return (
    <group>
      {koerper.map((k, index) => {
        const satz = saetze.get(k.satzKey);
        if (!satz) return null;
        // Reihenfolge der Materialien am Würfel: +X, -X, oben, unten, +Z, -Z.
        const materials = [satz.seite, satz.seite, satz.dach, satz.dach, satz.seite, satz.seite];
        return (
          <group key={`${k.standId}-${index}`}>
            <mesh
              position={k.position}
              rotation={[0, k.drehung, 0]}
              material={materials}
              castShadow
              receiveShadow
              onClick={(event) => {
                event.stopPropagation();
                onSelectStand(k.standId);
              }}
            >
              <boxGeometry args={[k.breite, k.hoehe, k.tiefe]} />
            </mesh>
            {k.banner && (
              <mesh
                geometry={bannerGeometrie}
                material={satz.banner}
                position={k.banner.position}
                rotation={[0, k.banner.drehung, 0]}
                scale={[k.banner.breite, BANNER_H, 1]}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
