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
import {
  disposeSurface,
  hallenbodenSurface,
  hallendeckeSurface,
  WELT_KACHEL_M,
} from './materials';

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
export function hallenlage(footprint: Placement2D[]) {
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

/**
 * Boden und Decke einer Halle -- selbst gebaut, nicht aus dem Weltmodell.
 *
 * Das amtliche Modell bringt zwar Dach- und Bodenflächen mit, aber in seinem
 * eigenen Höhendatum: über Halle 9 liegt seine Bodenplatte auf rund sieben
 * Metern, während Stände, Wegenetz und Besucher auf null stehen. Wer darunter
 * läuft, steht in einem Kriechkeller mit einer Platte über dem Kopf statt in
 * einer Halle. Das ist keine Kleinigkeit, die man wegtexturiert.
 *
 * Deshalb kommen die beiden Flächen, auf die es innen ankommt, aus derselben
 * Quelle wie alles andere Begehbare: aus dem Hallenumriss und der lichten
 * Höhe. Damit liegen sie garantiert unter den Füssen und über dem Kopf --
 * und die Decke trägt die Leuchtenfelder, die den Raum überhaupt erst als
 * Halle lesbar machen.
 */
export function Hallenhuelle({
  data,
  centre,
  visible,
}: {
  data: Dataset;
  centre: [number, number];
  visible: boolean;
}) {
  const flaechen = useMemo(() => {
    const out: {
      key: string;
      position: [number, number, number];
      rotation: [number, number, number];
      groesse: [number, number];
      art: 'boden' | 'decke';
    }[] = [];

    for (const hall of data.site.halls) {
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;
      const hoehe = hall.height?.clearHeightM ?? 8;

      for (const art of ['boden', 'decke'] as const) {
        out.push({
          key: `${hall.key}-${art}`,
          position: [
            lage.mx - centre[0],
            hall.baseY + (art === 'boden' ? 0.02 : hoehe),
            -(lage.my - centre[1]),
          ],
          // Die Ebene liegt waagerecht; die Decke schaut nach unten.
          rotation: [art === 'boden' ? -Math.PI / 2 : Math.PI / 2, 0, -lage.winkel],
          groesse: [lage.laenge, lage.breite],
          art,
        });
      }
    }
    return out;
  }, [data, centre]);

  const surfaces = useMemo(
    () => ({ boden: hallenbodenSurface(), decke: hallendeckeSurface() }),
    [],
  );
  useEffect(() => () => {
    disposeSurface(surfaces.boden);
    disposeSurface(surfaces.decke);
  }, [surfaces]);

  // Eine Kachel misst so viele Meter -- die Ebenen bekommen ihre UVs aus der
  // Größe, damit Fugen und Leuchtenraster überall gleich groß bleiben.
  const kacheln = (art: 'boden' | 'decke', groesse: [number, number]) =>
    [groesse[0] / WELT_KACHEL_M[art], groesse[1] / WELT_KACHEL_M[art]] as [number, number];

  if (!visible || !flaechen.length) return null;

  return (
    <group>
      {flaechen.map((flaeche) => {
        const surface = surfaces[flaeche.art];
        const [ru, rv] = kacheln(flaeche.art, flaeche.groesse);
        return (
          <mesh
            key={flaeche.key}
            position={flaeche.position}
            rotation={flaeche.rotation}
            receiveShadow={flaeche.art === 'boden'}
          >
            <planeGeometry args={[flaeche.groesse[0], flaeche.groesse[1]]} />
            {flaeche.art === 'boden' ? (
              <meshStandardMaterial
                map={kachel(surface.map, ru, rv)}
                normalMap={kachel(surface.normalMap, ru, rv)}
                roughnessMap={kachel(surface.roughnessMap, ru, rv)}
                roughness={0.34}
                metalness={0.22}
                envMapIntensity={1.5}
              />
            ) : (
              <meshStandardMaterial
                map={kachel(surface.map, ru, rv)}
                normalMap={kachel(surface.normalMap, ru, rv)}
                roughnessMap={kachel(surface.roughnessMap, ru, rv)}
                emissiveMap={kachel(surface.emissiveMap, ru, rv)}
                emissive="#fff0d4"
                emissiveIntensity={1.6}
                metalness={0.3}
                envMapIntensity={0.35}
                side={THREE.DoubleSide}
              />
            )}
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Dieselbe Leinwandtextur, aber je Halle anders oft wiederholt.
 *
 * `clone()` teilt das Bild und hält nur die Wiederholung getrennt -- eine
 * Halle von 166 m und eine von 60 m sollen dieselbe Fugenteilung zeigen,
 * ohne dass die Textur zweimal im Speicher liegt.
 */
const kachelCache = new Map<string, THREE.Texture>();
function kachel(quelle: THREE.Texture | undefined, u: number, v: number) {
  if (!quelle) return null;
  const schluessel = `${quelle.uuid}|${u.toFixed(2)}|${v.toFixed(2)}`;
  let fertig = kachelCache.get(schluessel);
  if (!fertig) {
    fertig = quelle.clone();
    fertig.wrapS = THREE.RepeatWrapping;
    fertig.wrapT = THREE.RepeatWrapping;
    fertig.repeat.set(u, v);
    fertig.needsUpdate = true;
    kachelCache.set(schluessel, fertig);
  }
  return fertig;
}

/**
 * Das Licht *in* einer Halle -- mehrere Quellen statt einer.
 *
 * Eine Halbkugel und ein bisschen Umgebungslicht beleuchten alles gleich
 * stark; das ergibt ein Bild ohne Tiefe, in dem eine Wand in dreissig Metern
 * genauso hell ist wie die zwei Meter vor der Nase. Auf den Referenzfotos
 * trägt der Raum genau vom Gegenteil: Lichtinseln unter den Leuchtenfeldern,
 * dazwischen dunklere Zonen, und der Boden gibt beides zurück.
 *
 * Deshalb ein Raster echter Punktlichter unter der Decke -- nur in der Halle,
 * in der man gerade steht, und ohne Schattenwurf. Zwölf schattenwerfende
 * Lichter wären dieselbe Rechnung zwölfmal; die Schatten kommen weiterhin
 * aus der Umgebung.
 */
const LICHT_HOEHE_M = 8.6;
const LICHT_LAENGS = 4;
const LICHT_QUER = 3;

export function Hallenlicht({
  data,
  centre,
  hallKey,
  active,
}: {
  data: Dataset;
  centre: [number, number];
  hallKey: string | null;
  active: boolean;
}) {
  const lampen = useMemo(() => {
    if (!hallKey) return [];
    const hall = data.hallsByKey.get(hallKey);
    if (!hall || hall.outdoor) return [];
    const lage = hallenlage(hall.footprint);
    if (!lage) return [];

    const ux = Math.cos(lage.winkel);
    const uy = Math.sin(lage.winkel);
    const out: [number, number, number][] = [];
    for (let i = 0; i < LICHT_LAENGS; i += 1) {
      const laengs = ((i + 0.5) / LICHT_LAENGS - 0.5) * lage.laenge * 0.88;
      for (let k = 0; k < LICHT_QUER; k += 1) {
        const quer = ((k + 0.5) / LICHT_QUER - 0.5) * lage.breite * 0.82;
        const x = lage.mx + ux * laengs - uy * quer;
        const y = lage.my + uy * laengs + ux * quer;
        out.push([x - centre[0], hall.baseY + LICHT_HOEHE_M, -(y - centre[1])]);
      }
    }
    return out;
  }, [data, centre, hallKey]);

  /**
   * Der Schatten kommt aus einer einzigen Quelle, nicht aus zwölf.
   *
   * Zwölf schattenwerfende Punktlichter wären zwölf Würfelschattenkarten je
   * Bild -- und sähen falsch aus: unter jedem Stand lägen zwölf sich
   * kreuzende Schlagschatten. In einer Halle mit durchgehender Leuchtdecke
   * gibt es das nicht. Dort ist der Schatten fast senkrecht, weich und
   * kurz -- die Summe vieler Quellen. Genau das leistet ein einzelnes,
   * leicht geneigtes Licht von oben; die Punktlichter darunter machen
   * ausschliesslich die Helligkeitsverteilung.
   */
  const schatten = useMemo(() => {
    if (!hallKey) return null;
    const hall = data.hallsByKey.get(hallKey);
    if (!hall || hall.outdoor) return null;
    const lage = hallenlage(hall.footprint);
    if (!lage) return null;
    const mitte: [number, number, number] = [
      lage.mx - centre[0],
      hall.baseY,
      -(lage.my - centre[1]),
    ];
    return {
      mitte,
      // Leicht schräg, damit senkrechte Flächen nicht flach werden.
      position: [mitte[0] + 26, mitte[1] + 90, mitte[2] + 16] as [number, number, number],
      spanne: Math.max(lage.laenge, lage.breite) * 0.62,
    };
  }, [data, centre, hallKey]);

  const ziel = useMemo(() => new THREE.Object3D(), []);
  const sonne = useRef<THREE.DirectionalLight>(null);

  /**
   * Die Schattenkamera muss neu gerechnet werden, sonst bleibt sie klein.
   *
   * Ein gesetztes `shadow-camera-left` ändert nur das Feld; die
   * Projektionsmatrix entsteht daraus erst beim Aufruf. Ohne ihn behält die
   * Kamera ihre voreingestellten ±5 m — ein Fleck von zehn Metern mitten in
   * einer Halle von 166. Genau deshalb lagen überall sonst keine Schatten.
   */
  useEffect(() => {
    const licht = sonne.current;
    if (!licht || !schatten) return;
    const kamera = licht.shadow.camera;
    kamera.left = -schatten.spanne;
    kamera.right = schatten.spanne;
    kamera.top = schatten.spanne;
    kamera.bottom = -schatten.spanne;
    kamera.near = 1;
    kamera.far = 240;
    kamera.updateProjectionMatrix();
    licht.shadow.needsUpdate = true;
  }, [schatten, active]);

  if (!active || !lampen.length) return null;

  return (
    <group>
      {schatten && (
        <>
          <primitive object={ziel} position={schatten.mitte} />
          <directionalLight
            ref={sonne}
            castShadow
            position={schatten.position}
            target={ziel}
            intensity={2.4}
            color="#fff4e2"
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-schatten.spanne}
            shadow-camera-right={schatten.spanne}
            shadow-camera-top={schatten.spanne}
            shadow-camera-bottom={-schatten.spanne}
            shadow-camera-near={1}
            shadow-camera-far={240}
            shadow-bias={-0.0004}
            shadow-normalBias={0.45}
            shadow-radius={5}
          />
        </>
      )}
      {lampen.map((position, index) => (
        <pointLight
          key={index}
          position={position}
          color="#fff3dc"
          intensity={70}
          // Keine Reichweitengrenze: sie zog einen sichtbaren Kreisrand über
          // den Boden. Der Abfall kommt aus dem Abstandsquadrat, wie beim
          // echten Licht auch.
          distance={0}
          decay={2}
        />
      ))}
    </group>
  );
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
