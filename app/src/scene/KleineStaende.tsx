/**
 * Standwaende fuer die gewoehnlichen Staende einer fokussierten Halle.
 *
 * `Markenstaende` baut Fassaden nur fuer die Handvoll kuratierten Marken.
 * Fuer den Rest -- in Halle 10.1 allein 180+ Staende -- gab es bisher nichts:
 * `Stands` flacht die fokussierte Halle bewusst auf eine 4-cm-Bodenkontur ab,
 * damit ein massiver Platzhalterkoerper nicht die Inszenierung verdeckt. Das
 * Ergebnis auf Augenhoehe war eine fast leere Halle -- keine Waende, keine
 * Farbe, nur Bodenfarbe und vereinzelte Requisiten. Das amtliche Referenzfoto
 * einer echten Gamescom-Halle zeigt das Gegenteil: dicht an dicht farbige
 * Standwaende mit leuchtender Oberkante.
 *
 * Diese Datei baut genau das, nur ohne die Vollflaechen-Falle von vorhin:
 * jeder Stand bekommt drei Waende (drei Seiten geschlossen, die zur
 * Hallenmitte offen -- wie ein echter Messestand mit Gang davor), nicht vier.
 * Die Inszenierung bleibt sichtbar, weil sie im offenen Vorderbereich steht.
 *
 * Farbe kommt nicht aus echten Ausstellerdaten -- die gibt es fuer die
 * gewoehnlichen Staende nicht --, sondern deterministisch aus der Stand-ID:
 * derselbe Stand hat bei jedem Bildaufbau dieselbe Farbe, verschiedene
 * Staende in derselben Halle streuen ueber eine kraeftige Messestand-Palette.
 * Koerper und Leuchtband sind je ein zusammengefuehrtes Netz mit
 * Vertexfarbe -- zwei Zeichenaufrufe fuer eine ganze Halle, nicht 189 * 2.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Dataset } from '../data/load';
import { polygonCentre, toScene } from './geometry';
import { MARKEN_STAND_IDS } from './marken';
import { rechteck } from './Markenstaende';
import { konturHuelle, konturStaerke, stufenTextur } from './stil';

/** Deckt sich mit SiteScene.STAND_HEIGHT_M -- derselbe Massstab wie der
 * Sammelkoerper, den diese Waende in der fokussierten Halle ersetzen. */
const WAND_HOEHE_M = 2.6;
const WAND_DICKE_M = 0.12;
/** Abstand zur amtlichen Standgrenze -- der Gang zwischen zwei Nachbarn. */
const GANG_M = 0.35;
const BAND_HOEHE_M = 0.22;
/** Unter dieser Kantenlaenge lohnt keine Wand mehr (Splitterflaechen). */
const MIN_KANTE_M = 2.2;

/**
 * Kraeftige, klar unterscheidbare Messestand-Toene -- absichtlich gesaettigt,
 * keine Pastelltoene: auf dem Referenzfoto tragen auch kleine Staende volle
 * Farbe, nicht nur die grossen Marken.
 */
const PALETTE = [
  '#c2185b', '#8e24aa', '#5e35b1', '#1e88e5', '#00897b',
  '#43a047', '#f4511e', '#fb8c00', '#3949ab', '#00acc1',
  '#d81b60', '#6d4c41', '#546e7a', '#e53935', '#7b1fa2',
  '#0277bd', '#2e7d32', '#ef6c00',
] as const;

function hashString(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
  return h;
}

function standFarbe(standId: string): THREE.Color {
  return new THREE.Color(PALETTE[hashString(standId) % PALETTE.length]);
}

interface WandSpec {
  /** Lokale Position (u, hoch, v) relativ zur Standmitte. */
  position: [number, number, number];
  /** Ausdehnung entlang (u, hoch, v). */
  groesse: [number, number, number];
}

/**
 * Die drei geschlossenen Seiten eines Standrechtecks -- die vierte, zur
 * Hallenmitte zeigende, bleibt als Gang/Eingang offen.
 */
function wandSpecs(
  breite: number,
  tiefe: number,
  hoehe: number,
  offenerAnteil: 'u+' | 'u-' | 'v+' | 'v-',
): WandSpec[] {
  const halbBreite = breite / 2 - GANG_M - WAND_DICKE_M / 2;
  const halbTiefe = tiefe / 2 - GANG_M - WAND_DICKE_M / 2;
  const spec: Record<'u+' | 'u-' | 'v+' | 'v-', WandSpec> = {
    'u+': { position: [halbBreite, hoehe / 2, 0], groesse: [WAND_DICKE_M, hoehe, tiefe - 2 * GANG_M] },
    'u-': { position: [-halbBreite, hoehe / 2, 0], groesse: [WAND_DICKE_M, hoehe, tiefe - 2 * GANG_M] },
    'v+': { position: [0, hoehe / 2, halbTiefe], groesse: [breite - 2 * GANG_M, hoehe, WAND_DICKE_M] },
    'v-': { position: [0, hoehe / 2, -halbTiefe], groesse: [breite - 2 * GANG_M, hoehe, WAND_DICKE_M] },
  };
  return (Object.keys(spec) as (typeof offenerAnteil)[])
    .filter((seite) => seite !== offenerAnteil)
    .map((seite) => spec[seite]);
}

function box(groesse: [number, number, number], position: [number, number, number]): THREE.BufferGeometry {
  const geometrie = new THREE.BoxGeometry(...groesse);
  geometrie.translate(...position);
  return geometrie;
}

function einfaerben(geometrie: THREE.BufferGeometry, farbe: THREE.Color): void {
  const anzahl = geometrie.attributes.position.count;
  const farben = new Float32Array(anzahl * 3);
  for (let i = 0; i < anzahl; i += 1) {
    farben[i * 3] = farbe.r;
    farben[i * 3 + 1] = farbe.g;
    farben[i * 3 + 2] = farbe.b;
  }
  geometrie.setAttribute('color', new THREE.BufferAttribute(farben, 3));
}

export function KleineStaende({
  data,
  centre,
  hallKey,
}: {
  data: Dataset;
  centre: [number, number];
  /** Nur diese Halle bekommt Waende -- Umkehrung der Sammelkoerper-Regel in
   * `Stands`, die genau diese Halle auf eine Bodenkontur reduziert. */
  hallKey: string | null;
}) {
  const netz = useMemo(() => {
    if (!hallKey) return { koerper: null, band: null };
    const hall = data.hallsByKey.get(hallKey);
    if (!hall) return { koerper: null, band: null };
    const [hx, hy] = polygonCentre(hall.footprint);

    const koerperTeile: THREE.BufferGeometry[] = [];
    const bandTeile: THREE.BufferGeometry[] = [];

    for (const stand of data.site.stands) {
      if (stand.hallKey !== hallKey) continue;
      if (MARKEN_STAND_IDS.has(stand.id)) continue;
      const r = rechteck(stand.polygon);
      if (!r) continue;
      if (r.breite < MIN_KANTE_M || r.tiefe < MIN_KANTE_M) continue;

      // Welche der vier Seiten zeigt zur Hallenmitte? Die bleibt offen --
      // derselbe Test wie bei der Bannerseite in Markenstaende, nur in
      // lokalen (u, v) statt Weltkoordinaten.
      const nachHalle: [number, number] = [hx - r.mx, hy - r.my];
      const du = nachHalle[0] * r.u[0] + nachHalle[1] * r.u[1];
      const dv = nachHalle[0] * r.v[0] + nachHalle[1] * r.v[1];
      const offen: 'u+' | 'u-' | 'v+' | 'v-' =
        Math.abs(du) > Math.abs(dv) ? (du > 0 ? 'u+' : 'u-') : dv > 0 ? 'v+' : 'v-';

      const farbe = standFarbe(stand.id);
      const specs = wandSpecs(r.breite, r.tiefe, WAND_HOEHE_M, offen);

      const standKoerper = specs.map((spec) => box(spec.groesse, spec.position));
      const standBand = specs.map((spec) => box(
        [spec.groesse[0], BAND_HOEHE_M, spec.groesse[2]],
        [spec.position[0], WAND_HOEHE_M - BAND_HOEHE_M / 2, spec.position[2]],
      ));

      const zusammenfuehren = (teile: THREE.BufferGeometry[]) => {
        const eins = teile.length === 1 ? teile[0] : mergeGeometries(teile, false);
        if (teile.length > 1) teile.forEach((teil) => teil.dispose());
        return eins;
      };
      const koerperGeom = zusammenfuehren(standKoerper);
      const bandGeom = zusammenfuehren(standBand);
      if (!koerperGeom || !bandGeom) continue;

      // Aus dem lokalen (u, hoch, v) Rahmen in die Szene: dieselbe Drehung
      // und Verschiebung wie beim Standkoerper in Markenstaende.
      koerperGeom.rotateY(r.winkel);
      bandGeom.rotateY(r.winkel);
      const welt = toScene(r.mx, r.my, stand.baseY, centre);
      koerperGeom.translate(welt.x, welt.y, welt.z);
      bandGeom.translate(welt.x, welt.y, welt.z);

      einfaerben(koerperGeom, farbe);
      // Das Leuchtband ist derselbe Ton, deutlich aufgehellt -- liest sich
      // als beleuchtete Standbeschriftung, ohne eine zweite Farbe zu lernen.
      einfaerben(bandGeom, farbe.clone().lerp(new THREE.Color('#ffffff'), 0.55));

      koerperTeile.push(koerperGeom);
      bandTeile.push(bandGeom);
    }

    const koerper = koerperTeile.length ? mergeGeometries(koerperTeile, false) : null;
    const band = bandTeile.length ? mergeGeometries(bandTeile, false) : null;
    koerperTeile.forEach((teil) => teil.dispose());
    bandTeile.forEach((teil) => teil.dispose());
    return { koerper, band };
  }, [data, centre, hallKey]);

  useEffect(() => () => {
    netz.koerper?.dispose();
    netz.band?.dispose();
  }, [netz]);

  const materialien = useMemo(() => ({
    koerper: new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: stufenTextur(2),
    }),
    band: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  }), []);

  useEffect(() => () => {
    materialien.koerper.dispose();
    materialien.band.dispose();
  }, [materialien]);

  const kontur = useMemo(() => {
    if (!netz.koerper) return null;
    const mesh = new THREE.Mesh(netz.koerper);
    return konturHuelle(mesh, konturStaerke('mittel'), '#181512');
  }, [netz.koerper]);

  if (!netz.koerper || !netz.band) return null;

  return (
    <group name="kleine-staende">
      <mesh geometry={netz.koerper} material={materialien.koerper} castShadow receiveShadow />
      <mesh geometry={netz.band} material={materialien.band} />
      {kontur && <primitive object={kontur} />}
    </group>
  );
}
