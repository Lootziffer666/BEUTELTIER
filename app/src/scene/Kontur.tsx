/**
 * Die dunkle Linie um ein Bauteil.
 *
 * Umgestülpte Hülle: dieselbe Geometrie, um `staerke` Meter entlang ihrer
 * Normalen aufgeblasen, nur von innen sichtbar. Übrig bleibt ein Ring um die
 * Silhouette -- die Linie, die den Cel-Shading-Look ausmacht.
 *
 * Warum nicht als Bildschirmeffekt: ein Kanteneffekt über das fertige Bild
 * kennt keine Türen und keine Geländer, nur Pixel. Die Stilbibel verlangt aber
 * ausdrücklich verschiedene Linienstärken je Bauteil, und die gibt es nur, wenn
 * die Linie am Objekt hängt. Dazu kostet sie keinen zweiten Renderdurchgang,
 * was auf dem Telefon der Unterschied zwischen 60 und 30 Bildern ist.
 *
 * Die Geometrie wird geteilt und nicht kopiert: das Aufblasen geschieht im
 * Vertex-Shader über `normalScale`, nicht durch verschobene Punkte. Eine
 * zweite Kopie jeder Halle wäre der halbe Speicher für eine Linie.
 */

import { useMemo } from 'react';
import * as THREE from 'three';

import { konturMaterial } from './stil';

export function Kontur({
  geometry,
  staerke,
  farbe,
  position,
  rotation,
}: {
  geometry: THREE.BufferGeometry;
  /** Hüllenabstand in Metern. 0 zeichnet nichts. */
  staerke: number;
  farbe?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const material = useMemo(() => {
    const geteilt = konturMaterial(farbe);
    // Geteiltes Material, eigene Stärke: der Aufschlag steckt im Shader, und
    // dafür braucht jede Stärke ihre eigene Fassung. `clone` behält das
    // kompilierte Programm, kostet also nichts Nennenswertes.
    const eigen = geteilt.clone();
    // `normal` und nicht `objectNormal`: letzteres legt erst der
    // Beleuchtungs-Baustein an, und die Konturhuelle wird nicht beleuchtet.
    eigen.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         transformed += normalize(normal) * ${staerke.toFixed(4)};`,
      );
    };
    eigen.needsUpdate = true;
    return eigen;
  }, [farbe, staerke]);

  if (staerke <= 0) return null;
  if (!geometry.attributes.normal) return null;

  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={rotation}
      // Die Kontur ist Zeichnung, kein Baukörper: sie soll weder Schatten
      // werfen noch angeklickt werden können.
      castShadow={false}
      receiveShadow={false}
      raycast={() => null}
      renderOrder={-1}
    />
  );
}
