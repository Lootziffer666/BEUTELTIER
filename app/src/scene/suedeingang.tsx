/**
 * Das Vordach und die Freitreppe am Eingang Sued.
 *
 * Im Wegegraph steht die Stelle laengst -- ein Knoten mit Label "Eingang
 * Sued", angebunden an den OSM-Fussweg und an die Piazza. Nur stand dort nie
 * etwas: wer von Sueden kommt, lief auf einen leeren Rasenstreifen mit einem
 * Hallenschild zu. Das Referenzfoto zeigt ein auskragendes, weisses
 * Flachdach auf zwei Rundstuetzen ueber einer Glasfront, davor eine breite,
 * gestufte Freitreppe -- ein Gebaeudetyp, kein Einzelmass. Genau das wird
 * hier gebaut.
 *
 * Zwei Zahlen sind amtlich, keine erfunden:
 * - Die Bodenhoehe an der Treppe kommt aus dem echten DGM1 (`terrainHeight`).
 * - Die Steighoehe bis zur Bauwerksebene ist die registrierte Piazza-Hoehe
 *   aus `boulevard.json` (`knoten.piazzaHoeheM`) -- derselbe Bezug, den auch
 *   der begehbare Boulevardboden benutzt.
 *
 * Breite und Vordach-Tiefe dagegen sind Schaetzungen aus dem Referenzfoto:
 * dafuer liegt keine amtliche Angabe im Repository. Sie stehen deshalb als
 * eigene Konstanten, klar benannt, und nicht als stille Annahme im Code.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Dataset } from '../data/load';
import { drehungNachX } from './geometry';
import { FAMILIEN, familienMaterial, konturMaterial } from './stil';

const STEP_RISE_M = 0.175;
const STEP_RUN_M = 0.29;

/** Geschaetzt aus dem Referenzfoto -- keine amtliche Breitenangabe im Repo. */
const TREPPE_BREITE_M = 26;
/** Fallback, falls die Piazza-Hoehe (noch) nicht geladen ist. */
const STEIGHOEHE_FALLBACK_M = 3.3;

const VORDACH_TIEFE_M = 13;
const VORDACH_UEBERSTAND_M = 5;
const VORDACH_DICKE_M = 0.55;
const VORDACH_HOEHE_UEBER_BODEN_M = 5.2;
const SAEULE_RADIUS_M = 0.34;
const GLAS_HOEHE_M = 4.6;

/** Massive Stufenkontur, wie vor Ort gegossener Beton -- keine einzelnen Tritte. */
function buildStairsGeometry(riseM: number, breiteM: number): THREE.BufferGeometry {
  const steps = Math.max(2, Math.round(riseM / STEP_RISE_M));
  const riser = riseM / steps;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < steps; i += 1) {
    const height = riser * (i + 1);
    const geometry = new THREE.BoxGeometry(STEP_RUN_M, height, breiteM);
    geometry.translate(i * STEP_RUN_M + STEP_RUN_M / 2, height / 2, 0);
    parts.push(geometry);
  }
  const merged = mergeGeometries(parts) ?? new THREE.BufferGeometry();
  parts.forEach((part) => part.dispose());
  merged.computeVertexNormals();
  return merged;
}

function handlaufMaterial(): THREE.MeshBasicMaterial {
  const material = konturMaterial('#15171b').clone();
  material.side = THREE.FrontSide;
  material.depthWrite = true;
  return material;
}

export function Suedeingang({
  data,
  centre,
  terrainHeight,
}: {
  data: Dataset;
  centre: [number, number];
  terrainHeight: (x: number, y: number) => number | null;
}) {
  const anchor = useMemo(() => {
    for (const node of data.graph.nodes.values()) {
      if (node.label === 'Eingang Sued') return node;
    }
    return null;
  }, [data.graph]);

  const treppenMaterial = useMemo(() => familienMaterial(FAMILIEN.M05), []);
  const glasMaterial = useMemo(
    () => familienMaterial(FAMILIEN.M07, undefined, { transparent: true, opacity: 0.55 }),
    [],
  );
  const saeuleMaterial = useMemo(() => familienMaterial(FAMILIEN.M05), []);
  const geländerMaterial = useMemo(() => handlaufMaterial(), []);

  const boden = anchor ? terrainHeight(anchor.x, anchor.y) ?? anchor.z : 0;
  const steigM = data.boulevard?.knoten?.piazzaHoeheM
    ? Math.max(1.5, data.boulevard.knoten.piazzaHoeheM - boden)
    : STEIGHOEHE_FALLBACK_M;

  const geometry = useMemo(
    () => buildStairsGeometry(steigM, TREPPE_BREITE_M),
    [steigM],
  );

  useEffect(() => () => {
    geometry.dispose();
    treppenMaterial.dispose();
    glasMaterial.dispose();
    saeuleMaterial.dispose();
    geländerMaterial.dispose();
  }, [geometry, treppenMaterial, glasMaterial, saeuleMaterial, geländerMaterial]);

  if (!anchor) return null;

  // Von der Treppe hinauf zeigt lokal +X -- dieselbe Richtung, in der
  // `drehungNachX` sonst die Laufrichtung eines Ganges dreht. Der Eingang
  // liegt noerdlich der Treppe (Richtung sinkendes y), darum (0, -1).
  const yaw = drehungNachX(0, -1);
  const laenge = Math.max(2, Math.round(steigM / STEP_RISE_M)) * STEP_RUN_M;
  const dachY = steigM + VORDACH_HOEHE_UEBER_BODEN_M;

  return (
    <group
      position={[anchor.x - centre[0], boden, anchor.y - centre[1]]}
      rotation={[0, yaw, 0]}
    >
      <mesh geometry={geometry} material={treppenMaterial} castShadow receiveShadow />

      {/* Die Freiflaeche oben, auf der die Glasfront und das Vordach stehen. */}
      <mesh position={[laenge + 4, steigM, 0]} receiveShadow>
        <boxGeometry args={[8, 0.1, TREPPE_BREITE_M]} />
        <primitive object={treppenMaterial} attach="material" />
      </mesh>

      {/* Die Glasfront am Kopf der Treppe. */}
      <mesh position={[laenge + 0.15, steigM + GLAS_HOEHE_M / 2, 0]} castShadow>
        <boxGeometry args={[0.3, GLAS_HOEHE_M, TREPPE_BREITE_M - 4]} />
        <primitive object={glasMaterial} attach="material" />
      </mesh>

      {/* Die beiden Rundstuetzen, wie auf dem Referenzfoto vorgelagert. */}
      {[-1, 1].map((seite) => (
        <mesh
          key={seite}
          position={[laenge - VORDACH_TIEFE_M * 0.55, dachY / 2, (seite * TREPPE_BREITE_M) / 3]}
          castShadow
        >
          <cylinderGeometry args={[SAEULE_RADIUS_M, SAEULE_RADIUS_M, dachY, 16]} />
          <primitive object={saeuleMaterial} attach="material" />
        </mesh>
      ))}

      {/* Das auskragende Flachdach. */}
      <mesh
        position={[
          laenge - VORDACH_TIEFE_M / 2 + VORDACH_UEBERSTAND_M,
          dachY + VORDACH_DICKE_M / 2,
          0,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[VORDACH_TIEFE_M + VORDACH_UEBERSTAND_M, VORDACH_DICKE_M, TREPPE_BREITE_M + 2]}
        />
        <primitive object={treppenMaterial} attach="material" />
      </mesh>

      {/* Handlaeufe: die Linie, die den Aufgang erklaert. */}
      {[-1, -0.34, 0.34, 1].map((seite) => (
        <mesh
          key={seite}
          position={[laenge / 2, steigM / 2 + 0.9, (seite * TREPPE_BREITE_M) / 2]}
          rotation={[0, 0, Math.atan2(steigM, laenge)]}
          castShadow
        >
          <boxGeometry args={[Math.hypot(laenge, steigM), 0.06, 0.06]} />
          <primitive object={geländerMaterial} attach="material" />
        </mesh>
      ))}
    </group>
  );
}
