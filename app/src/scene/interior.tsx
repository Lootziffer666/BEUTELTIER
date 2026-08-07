/**
 * Was eine Halle von innen zu einer Halle macht: die Leuchtbänder.
 *
 * Auf den Referenzfotos ist das prägende Element nicht die Wand und nicht die
 * Decke, sondern die Reihen durchlaufender Leuchtstoffbänder — und ihre
 * Spiegelung im versiegelten Boden. Ohne sie bleibt jeder Innenraum eine
 * gleichmäßig ausgeleuchtete Kiste.
 *
 * Deshalb sind sie **Geometrie und nicht Textur**: eine aufgemalte Lampe
 * spiegelt sich nicht. Ein `InstancedMesh` trägt alle Bänder aller Hallen in
 * einem Zeichenaufruf.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { Dataset } from '../data/load';
import type { Placement2D } from '../data/types';

/** Abstand der Leuchtenreihen quer zur Halle. */
const ROW_SPACING_M = 11;
/**
 * Wie weit unter der Decke die Bänder hängen.
 *
 * Nicht dicht unter dem Dach: die Deckenhöhe im Weltmodell ist nicht überall
 * die lichte Höhe aus der Hallentabelle, und ein Band knapp darunter
 * verschwindet dann hinter der Decke. Zwei Meter tiefer ist es in jeder Halle
 * sichtbar -- und entspricht der Traversenhöhe, in der die Leuchten hängen.
 */
const DROP_M = 2.0;
const STRIP_WIDTH_M = 0.42;
const STRIP_THICKNESS_M = 0.12;
/**
 * Eine Reihe ist keine durchgehende Stange.
 *
 * Ein einzelner 160 m langer Balken war der Grund, warum die Leuchten im
 * Vordergrund wie weiße Bretter über der Kamera lagen: kein Ende, keine Lücke,
 * kein Anhaltspunkt für die Entfernung. Echte Bänder bestehen aus Leuchten von
 * gut fünf Metern mit sichtbarem Spalt dazwischen — und genau diese Folge aus
 * Hell und Dunkel macht die Länge der Halle lesbar.
 */
const SEGMENT_M = 5.6;
const GAP_M = 1.1;

/**
 * Wie eine Halle liegt -- Mitte, Länge, Breite und Drehung.
 *
 * Die Hallen sind eingemessen, stehen also schief zu den Weltachsen. Eine
 * achsparallele Hüllbox legte die Leuchtenreihen quer durch die Wände; die
 * Halle blieb dunkel und wirkte wie ein Hof unter freiem Himmel. Gerechnet
 * wird deshalb in den Kanten des Umrisses selbst.
 */
function hallenlage(footprint: Placement2D[]) {
  if (footprint.length < 3) return null;
  let laengste = 0;
  let winkel = 0;
  for (let i = 0; i < footprint.length; i += 1) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > laengste) {
      laengste = d;
      winkel = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  if (laengste < 1) return null;

  const ux = Math.cos(winkel);
  const uy = Math.sin(winkel);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, y] of footprint) {
    const u = x * ux + y * uy;
    const v = -x * uy + y * ux;
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  const uM = (uMin + uMax) / 2;
  const vM = (vMin + vMax) / 2;
  return {
    mx: uM * ux - vM * uy,
    my: uM * uy + vM * ux,
    laenge: uMax - uMin,
    breite: vMax - vMin,
    winkel,
  };
}

export function Deckenleuchten({
  data,
  centre,
  visible,
}: {
  data: Dataset;
  centre: [number, number];
  visible: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const strips = useMemo(() => {
    const out: { matrix: THREE.Matrix4 }[] = [];
    const dummy = new THREE.Object3D();

    for (const hall of data.site.halls) {
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage) continue;
      const { mx, my, laenge, breite, winkel } = lage;
      if (laenge < 20 || breite < 20) continue;

      const ceiling = hall.baseY + (hall.height?.clearHeightM ?? 8) - DROP_M;
      // Die Bänder laufen längs der langen Seite, wie in der Halle gebaut.
      const rows = Math.max(2, Math.floor(breite / ROW_SPACING_M));
      const length = laenge * 0.86;

      const pitch = SEGMENT_M + GAP_M;
      const segments = Math.max(1, Math.floor(length / pitch));
      const run = segments * pitch - GAP_M;

      // Einheitsvektoren der Halle: u längs, v quer.
      const ux = Math.cos(winkel);
      const uy = Math.sin(winkel);
      const vx = -uy;
      const vy = ux;

      for (let row = 1; row <= rows; row += 1) {
        const quer = (row / (rows + 1) - 0.5) * breite;

        for (let segment = 0; segment < segments; segment += 1) {
          // Versatz entlang der Reihe, gemessen von ihrer Mitte.
          const offset = -run / 2 + SEGMENT_M / 2 + segment * pitch;
          const x = mx + ux * offset + vx * quer;
          const y = my + uy * offset + vy * quer;
          dummy.position.set(x - centre[0], ceiling, -(y - centre[1]));
          dummy.rotation.set(0, winkel, 0);
          dummy.scale.set(SEGMENT_M, STRIP_THICKNESS_M, STRIP_WIDTH_M);
          dummy.updateMatrix();
          out.push({ matrix: dummy.matrix.clone() });
        }
      }
    }
    return out;
  }, [data, centre]);

  useEffect(() => {
    if (!mesh.current) return;
    strips.forEach((strip, index) => mesh.current!.setMatrixAt(index, strip.matrix));
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [strips]);

  if (!strips.length) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, strips.length]}
      visible={visible}
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      {/* Emissiv und nicht beleuchtet: eine Leuchte wird nicht angestrahlt,
          sie strahlt selbst. Mit Tone Mapping bleibt sie hell, ohne den Rest
          des Bildes auszubrennen. */}
      <meshStandardMaterial
        color="#f6f3ec"
        emissive="#fff3d8"
        emissiveIntensity={1.9}
        roughness={0.35}
        toneMapped
      />
    </instancedMesh>
  );
}
