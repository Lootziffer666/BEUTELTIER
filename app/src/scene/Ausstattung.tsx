/**
 * Die Ausstattung als Geometrie in der Szene.
 *
 * `ausstattung.ts` plant, diese Datei baut. Die Trennung hat einen handfesten
 * Grund: die Planung ist eine reine Funktion von Maßen auf Bauteillisten und
 * damit prüfbar; ein React-Baum ist es nicht. Hier steht deshalb nur, welches
 * Bauteil welche Materialfamilie bekommt und wie viele Meshes daraus werden.
 *
 * Zusammengeführt wird, was sich zusammenführen lässt. Eine Halle bringt gut
 * hundert Deckenträger mit; als hundert Meshes wären das hundert
 * Zeichenaufrufe je Bild und je Halle. Als ein Netz ist es einer.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Dataset } from '../data/load';
import type { Placement2D } from '../data/types';
import {
  ZAUN_FELD_M,
  ZAUN_HOEHE_M,
  absperrung,
  deckenwerk,
  fassadenwerk,
  nummernschilder,
  type Balken,
  type Tafel,
} from './ausstattung';
import { hallenlage } from './interior';
import { FAMILIEN, familienMaterial, konturHuelle, konturStaerke } from './stil';
import { KACHEL_M } from './textur';
import { projiziereUV } from './geometry';

/** Aus Balken wird ein Netz. `null`, wenn nichts zu bauen ist. */
function balkenNetz(balken: Balken[]): THREE.BufferGeometry | null {
  if (!balken.length) return null;
  const teile = balken.map((teil) => {
    const geometrie = new THREE.BoxGeometry(...teil.groesse);
    if (teil.drehung) geometrie.rotateY(teil.drehung);
    geometrie.translate(...teil.position);
    return geometrie;
  });
  const zusammen = mergeGeometries(teile, false);
  teile.forEach((teil) => teil.dispose());
  return zusammen;
}

/** Dasselbe für flache Tafeln -- Lichtbänder, Zaunfelder, Fensterbänder. */
function tafelNetz(tafeln: Tafel[], senkrecht: boolean): THREE.BufferGeometry | null {
  if (!tafeln.length) return null;
  const teile = tafeln.map((tafel) => {
    const geometrie = new THREE.PlaneGeometry(tafel.groesse[0], tafel.groesse[1]);
    // Waagerechte Tafeln blicken nach unten (Lichtband an der Decke),
    // senkrechte bleiben stehen und drehen sich in ihre Richtung.
    if (senkrecht) geometrie.rotateY(tafel.drehung);
    else geometrie.rotateX(Math.PI / 2);
    geometrie.translate(...tafel.position);
    return geometrie;
  });
  const zusammen = mergeGeometries(teile, false);
  teile.forEach((teil) => teil.dispose());
  return zusammen;
}

/**
 * Das Leuchtmaterial der Lichtbänder.
 *
 * Kein Toon-Material: ein Lichtband **ist** die Lichtquelle im Bild und darf
 * deshalb nicht selbst gestuft beleuchtet werden. Es leuchtet flach, und die
 * gestuften Flächen ringsum nehmen das Licht auf.
 */
function lichtMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#fff4d8'),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.name = 'lichtband';
  return material;
}

/**
 * Die Nummer als Bild.
 *
 * Hier ist Canvas richtig und nicht im Materialmodul: Schrift ist genau das,
 * was ein Pixelraster von Hand nicht kann, und ein Schild braucht keine
 * Kachelung, keine Naht und keinen Prüfpfad ohne DOM -- es braucht eine
 * lesbare Ziffer.
 */
function nummernTextur(text: string): THREE.CanvasTexture {
  const kante = 256;
  const flaeche = document.createElement('canvas');
  flaeche.width = kante;
  flaeche.height = kante;
  const stift = flaeche.getContext('2d')!;
  stift.fillStyle = FAMILIEN.M10.grundton;
  stift.fillRect(0, 0, kante, kante);
  stift.strokeStyle = '#12210f';
  stift.lineWidth = 10;
  stift.strokeRect(5, 5, kante - 10, kante - 10);
  stift.fillStyle = '#f4f7f2';
  stift.font = `bold ${text.length > 2 ? 110 : 150}px sans-serif`;
  stift.textAlign = 'center';
  stift.textBaseline = 'middle';
  stift.fillText(text, kante / 2, kante / 2 + 6);
  const textur = new THREE.CanvasTexture(flaeche);
  textur.colorSpace = THREE.SRGBColorSpace;
  textur.needsUpdate = true;
  return textur;
}

/** Die längste Kante eines Grundrisses -- dort sitzt die Hauptfassade. */
function laengsteKante(footprint: Placement2D[]) {
  let beste = { laenge: -1, mx: 0, my: 0, drehung: 0 };
  for (let i = 0; i < footprint.length; i += 1) {
    const [ax, ay] = footprint[i];
    const [bx, by] = footprint[(i + 1) % footprint.length];
    const laenge = Math.hypot(bx - ax, by - ay);
    if (laenge <= beste.laenge) continue;
    beste = {
      laenge,
      mx: (ax + bx) / 2,
      my: (ay + by) / 2,
      drehung: Math.atan2(-(by - ay), bx - ax),
    };
  }
  return beste;
}

export function Ausstattung({
  data,
  centre,
  drinnen,
}: {
  data: Dataset;
  centre: [number, number];
  /** Decke und Fassadeninnenseite lohnen nur, wo man tatsächlich läuft. */
  drinnen: boolean;
}) {
  const bauteile = useMemo(() => {
    const decken: THREE.BufferGeometry[] = [];
    const lichter: THREE.BufferGeometry[] = [];
    const stuetzen: THREE.BufferGeometry[] = [];
    const baender: THREE.BufferGeometry[] = [];

    for (const halle of data.site.halls) {
      if (halle.outdoor) continue;
      const lage = hallenlage(halle.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;
      const hoehe = halle.height?.clearHeightM ?? 8;

      // -- Decke -------------------------------------------------------
      const werk = deckenwerk(lage.laenge, lage.breite, hoehe);
      const versetzen = (geometrie: THREE.BufferGeometry | null) => {
        if (!geometrie) return null;
        geometrie.rotateY(-lage.winkel);
        geometrie.translate(lage.mx - centre[0], halle.baseY, lage.my - centre[1]);
        return geometrie;
      };
      const traeger = versetzen(balkenNetz(werk.traeger));
      if (traeger) decken.push(traeger);
      const band = versetzen(tafelNetz(werk.lichtbaender, false));
      if (band) lichter.push(band);

      // -- Fassade -----------------------------------------------------
      // Nur die Hauptfassade, nicht alle vier Seiten: die Rückseiten der
      // Hallen sind in der Stilbibel ausdrücklich Detailstufe C, und vier
      // gegliederte Seiten je Halle wären das Vierfache an Dreiecken für
      // etwas, das man beim Laufen nie sieht.
      const kante = laengsteKante(halle.footprint);
      if (kante.laenge > 20) {
        const fassade = fassadenwerk(kante.laenge, hoehe);
        const anlegen = (geometrie: THREE.BufferGeometry | null) => {
          if (!geometrie) return null;
          geometrie.rotateY(kante.drehung);
          geometrie.translate(kante.mx - centre[0], halle.baseY, kante.my - centre[1]);
          return geometrie;
        };
        const saeulen = anlegen(balkenNetz(fassade.stuetzen));
        if (saeulen) stuetzen.push(saeulen);
        const glas = anlegen(tafelNetz(fassade.fensterband, true));
        if (glas) baender.push(glas);
      }
    }

    // -- Zaun ----------------------------------------------------------
    // Die abgesperrte Flaeche hinter Halle 8 -- vor Ort gemessen und in
    // `boulevard.json` als Polygon geführt. Zur gamescom steht dort ein Zaun,
    // und ohne ihn läuft man in ein Nichts, das es nicht gibt.
    const zaunGeometrien: THREE.BufferGeometry[] = [];
    const sperrflaeche = (data.boulevard as { aussenHalle8?: { polygon?: Placement2D[] } })
      ?.aussenHalle8;
    if (sperrflaeche?.polygon && sperrflaeche.polygon.length >= 3) {
      const ring = sperrflaeche.polygon.map(
        ([x, y]) => [x - centre[0], y - centre[1]] as Placement2D);
      const werk = absperrung([...ring, ring[0]], ZAUN_HOEHE_M, ZAUN_FELD_M);
      const pfosten = balkenNetz(werk.pfosten);
      if (pfosten) zaunGeometrien.push(pfosten);
      const holme = balkenNetz(werk.holme);
      if (holme) zaunGeometrien.push(holme);
    }

    const zusammen = (teile: THREE.BufferGeometry[]) => {
      if (!teile.length) return null;
      const netz = teile.length === 1 ? teile[0] : mergeGeometries(teile, false);
      if (teile.length > 1) teile.forEach((teil) => teil.dispose());
      return netz;
    };

    return {
      decke: zusammen(decken),
      licht: zusammen(lichter),
      stuetzen: zusammen(stuetzen),
      fensterband: zusammen(baender),
      zaun: zusammen(zaunGeometrien),
      schilder: nummernschilder(data.site.halls as never),
    };
  }, [data, centre]);

  const materialien = useMemo(() => ({
    decke: familienMaterial(FAMILIEN.M02),
    licht: lichtMaterial(),
    stuetzen: familienMaterial(FAMILIEN.M01),
    fensterband: familienMaterial(FAMILIEN.M07, undefined, { side: THREE.DoubleSide }),
    zaun: familienMaterial(FAMILIEN.M08),
  }), []);

  const schildMaterialien = useMemo(
    () => new Map(bauteile.schilder.map((schild) => [
      schild.key,
      new THREE.MeshToonMaterial({
        map: nummernTextur(schild.text),
        gradientMap: materialien.zaun.gradientMap,
        side: THREE.DoubleSide,
      }),
    ])),
    [bauteile.schilder, materialien.zaun.gradientMap],
  );

  useEffect(() => () => {
    Object.values(materialien).forEach((material) => material.dispose());
    schildMaterialien.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
  }, [materialien, schildMaterialien]);

  // Die Träger und Stützen bekommen ihre Kachelung in Metern, sonst zeigte
  // ein 60-m-Träger dieselbe Kachel wie ein 3-m-Pfosten.
  useEffect(() => {
    if (bauteile.decke) projiziereUV(bauteile.decke, KACHEL_M.M02);
    if (bauteile.stuetzen) projiziereUV(bauteile.stuetzen, KACHEL_M.M01);
    if (bauteile.zaun) projiziereUV(bauteile.zaun, KACHEL_M.M08);
  }, [bauteile]);

  const linie = (geometrie: THREE.BufferGeometry | null, familie: typeof FAMILIEN.M02) => {
    if (!geometrie) return null;
    const traeger = new THREE.Mesh(geometrie);
    return konturHuelle(traeger, konturStaerke(familie.kontur));
  };

  return (
    <group>
      {drinnen && bauteile.decke && (
        <mesh geometry={bauteile.decke} material={materialien.decke} castShadow receiveShadow />
      )}
      {drinnen && bauteile.licht && (
        <mesh geometry={bauteile.licht} material={materialien.licht} />
      )}
      {bauteile.stuetzen && (
        <mesh geometry={bauteile.stuetzen} material={materialien.stuetzen}
              castShadow receiveShadow />
      )}
      {bauteile.fensterband && (
        <mesh geometry={bauteile.fensterband} material={materialien.fensterband} />
      )}
      {bauteile.zaun && (
        <mesh geometry={bauteile.zaun} material={materialien.zaun} castShadow />
      )}
      {/* Konturen: nur an den Bauteilen, die die Stilbibel als Stufe A führt. */}
      {[linie(bauteile.stuetzen, FAMILIEN.M01), linie(bauteile.zaun, FAMILIEN.M08)]
        .map((huelle, i) => huelle && (
          <primitive key={`kontur-${i}`} object={huelle} />
        ))}
      {bauteile.schilder.map((schild) => (
        <mesh
          key={schild.key}
          position={[schild.position[0] - centre[0], schild.position[1],
                     schild.position[2] - centre[1]]}
          rotation={[0, schild.drehung, 0]}
          material={schildMaterialien.get(schild.key)}
        >
          <planeGeometry args={[3.2, 3.2]} />
        </mesh>
      ))}
    </group>
  );
}
