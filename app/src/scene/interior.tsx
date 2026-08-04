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

/** Abstand der Leuchtenreihen quer zur Halle. */
const ROW_SPACING_M = 14;
/** Wie weit unter der Decke die Bänder hängen. */
const DROP_M = 0.8;
const STRIP_WIDTH_M = 0.34;
const STRIP_THICKNESS_M = 0.14;

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
      const xs = hall.footprint.map((point) => point[0]);
      const ys = hall.footprint.map((point) => point[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = maxX - minX;
      const depth = maxY - minY;
      if (width < 20 || depth < 20) continue;

      const ceiling = hall.baseY + (hall.height?.clearHeightM ?? 8) - DROP_M;
      // Die Bänder laufen längs der langen Seite, wie in der Halle gebaut.
      const alongX = width >= depth;
      const rows = Math.max(2, Math.floor((alongX ? depth : width) / ROW_SPACING_M));
      const length = (alongX ? width : depth) * 0.86;

      for (let row = 1; row <= rows; row += 1) {
        const t = row / (rows + 1);
        const cx = alongX ? (minX + maxX) / 2 : minX + width * t;
        const cy = alongX ? minY + depth * t : (minY + maxY) / 2;

        dummy.position.set(cx - centre[0], ceiling, -(cy - centre[1]));
        dummy.rotation.set(0, alongX ? 0 : Math.PI / 2, 0);
        dummy.scale.set(length, STRIP_THICKNESS_M, STRIP_WIDTH_M);
        dummy.updateMatrix();
        out.push({ matrix: dummy.matrix.clone() });
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
        color="#ffffff"
        emissive="#fff6e2"
        emissiveIntensity={1.5}
        roughness={0.4}
        toneMapped
      />
    </instancedMesh>
  );
}
