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
import { drehungNachX } from './geometry';
import {
  disposeSurface,
  hallenbodenSurface,
  hallendeckeSurface,
  WELT_KACHEL_M,
  type Surface,
} from './materials';
import { FAMILIEN, konturMaterial, konturStaerke, toonMaterial } from './stil';

/**
 * Wie weit unter der Decke die Bänder hängen.
 *
 * Nicht dicht unter dem Dach: die Deckenhöhe im Weltmodell ist nicht überall
 * die lichte Höhe aus der Hallentabelle, und ein Band knapp darunter
 * verschwindet dann hinter der Decke. Knapp darunter reicht -- weit genug,
 * um in jeder Halle sichtbar zu sein, knapp genug, dass die Leuchte an der
 * Decke hängt und nicht als eigener Körper mitten im Raum schwebt.
 */
const DROP_M = 0.3;
const STRIP_WIDTH_M = 0.42;
const STRIP_THICKNESS_M = 0.12;

/**
 * Wo die Stützen einer Halle stehen -- zwei Reihen an den Längswänden, im
 * Rastermaß, das auch die Leuchtenreihen und die Traversen bestimmt.
 *
 * Ohne sie war die Halle ein Raum ohne Tragwerk: Boden, Decke, Wände, aber
 * nichts dazwischen. Genau das tragen Stützen auf jedem Referenzfoto als
 * erstes zur Lesbarkeit bei -- sie geben dem Auge den Rhythmus, an dem es
 * Tiefe abliest.
 */
const SAEULEN_RAND_M = 2.4;
const SAEULEN_ABSTAND_M = 10;
const SAEULEN_BREITE_M = 0.7;
const SAEULEN_TIEFE_M = 0.9;
/**
 * Wie weit die beiden Stützenreihen von der Mittelachse stehen.
 *
 * Kein Bezug zur Hallenbreite: auf dem Referenzfoto stehen die Reihen nah
 * genug, dass man ihren Rhythmus im Bild sieht, während man geradeaus die
 * Halle hinunterblickt. In einer 80 m weiten Halle läge die "echte"
 * Aussenwand-Stütze weit ausserhalb dessen, was der Blick erfasst.
 */
const SAEULEN_HALBSPANNE_ZIEL_M = 9;

interface Lage {
  mx: number;
  my: number;
  laenge: number;
  breite: number;
  winkel: number;
}

/**
 * Zwei Stützenreihen und der freie Abstand dazwischen -- geteilt zwischen
 * `Hallenstuetzen` und `Deckenleuchten`. Die Leuchtenreihen stehen **im**
 * lichten Feld zwischen den Stützen, nicht daneben oder gar in der Wand;
 * beide müssen deshalb von derselben Rechnung ausgehen.
 */
function saeulenraster(lage: Lage) {
  const ux = Math.cos(lage.winkel);
  const uy = Math.sin(lage.winkel);
  const vx = -uy;
  const vy = ux;
  // Fester Zielwert statt "Breite minus Rand": in einer 80 m weiten Halle
  // stünden die Reihen sonst 35 m von der Mittelachse entfernt -- viel zu
  // weit, um beim Blick geradeaus noch im Bild zu stehen. Nur in schmalen
  // Hallen (z.B. F-Hallen) schlägt der Rand als engere Grenze durch.
  const halbeSpanne = Math.min(
    SAEULEN_HALBSPANNE_ZIEL_M,
    Math.max(1, lage.breite / 2 - SAEULEN_RAND_M),
  );
  const anzahl = Math.max(2, Math.round(lage.laenge / SAEULEN_ABSTAND_M));
  const positionen: { x: number; y: number }[] = [];
  for (let i = 0; i <= anzahl; i += 1) {
    const laengs = (i / anzahl - 0.5) * lage.laenge * 0.94;
    for (const quer of [-halbeSpanne, halbeSpanne]) {
      positionen.push({
        x: lage.mx + ux * laengs + vx * quer,
        y: lage.my + uy * laengs + vy * quer,
      });
    }
  }
  return { positionen, halbeSpanne, ux, uy, vx, vy };
}

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
      winkel = drehungNachX(b[0] - a[0], b[1] - a[1]);
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
            lage.my - centre[1],
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
            material={hallenMaterial(flaeche.art, surface, ru, rv)}
          >
            <planeGeometry args={[flaeche.groesse[0], flaeche.groesse[1]]} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Boden und Decke -- und warum sie nicht dasselbe Material teilen.
 *
 * Der naheliegende Schritt war, beide auf `MeshToonMaterial` umzustellen.
 * Gegengeprüft an einer echten Aufnahme (siehe `docs/bildziele.md`, Runde 2)
 * war das für den Boden ein Rückschritt: `MeshToonMaterial` kennt in dieser
 * Three.js-Fassung kein `envMap` (nachgesehen in
 * `node_modules/three/src/renderers/shaders/ShaderLib/meshtoon.glsl.js` --
 * kein `envmap_pars_fragment` im Include). Die Spiegelung der Leuchtenbänder
 * im Boden -- das auffälligste Merkmal auf jedem der fünf Referenzbilder --
 * kommt ausschliesslich aus `scene.environment` (siehe `lighting.tsx`,
 * `HALL_FRAGMENT`). Toon-Material hätte sie ersatzlos gestrichen, ohne echten
 * Ersatz: die Punktlichter aus `Hallenlicht` allein reichen nicht annähernd.
 *
 * Deshalb bleibt der Boden bei `MeshStandardMaterial` -- dieselbe begründete
 * Ausnahme wie das Glas in `boulevard.tsx`, wo Transmission ebenfalls etwas
 * leistet, das Toon nicht kann. Die Decke dagegen verliert nichts: ihr Bild
 * kommt ohnehin von der `emissiveMap`, nicht von einer Spiegelung, und trägt
 * jetzt echtes Stufenlicht und die Materialfamilie M02 aus der Stilbibel.
 */
const hallenMaterialCache = new Map<string, THREE.Material>();

function hallenMaterial(
  art: 'boden' | 'decke',
  surface: Surface,
  ru: number,
  rv: number,
): THREE.Material {
  const schluessel = `${art}|${surface.map.uuid}|${ru.toFixed(2)}|${rv.toFixed(2)}`;
  const fertig = hallenMaterialCache.get(schluessel);
  if (fertig) return fertig;

  if (art === 'boden') {
    const material = new THREE.MeshStandardMaterial({
      map: kachel(surface.map, ru, rv),
      normalMap: kachel(surface.normalMap, ru, rv),
      roughnessMap: kachel(surface.roughnessMap, ru, rv),
      roughness: 0.34,
      metalness: 0.22,
      envMapIntensity: 1.5,
    });
    hallenMaterialCache.set(schluessel, material);
    return material;
  }

  // Keine gemalten Leuchtfelder mehr in der `emissiveMap` -- die Decke trug
  // bisher ihr eigenes, generisches Raster, unabhängig von den tatsächlichen
  // Reihen dieser Halle, die `Deckenleuchten` als echte Geometrie setzt. Zwei
  // Lichtquellen an derselben Stelle, die nicht zueinander passten, waren der
  // Grund, warum die Decke nach nichts Bestimmtem aussah.
  const map = kachel(surface.map, ru, rv);
  const material = toonMaterial(FAMILIEN.M02, {
    map,
    normalMap: kachel(surface.normalMap, ru, rv),
  }, { side: THREE.DoubleSide });
  // Die Decke bekommt kaum direktes Licht ab -- sie liegt über den
  // Punktlichtern, nicht darunter, und das gedämpfte Umgebungslicht reicht
  // nicht bis dorthin. Ohne Weiteres fällt die Fläche komplett in die
  // dunkelste Stufe von M02s zweistufigem Grauverlauf, und das Kassetten-
  // raster -- eigentlich in der Farbtextur gezeichnet -- verschwindet darin
  // vollständig. Die eigene Textur noch einmal schwach als Emission macht
  // die Fläche unabhängig vom Lichteinfall lesbar: kein zusätzliches Licht,
  // sondern dieselbe Zeichnung, die sonst ungesehen bliebe.
  material.emissiveMap = map;
  material.emissive = new THREE.Color('#ffffff');
  material.emissiveIntensity = 0.5;
  hallenMaterialCache.set(schluessel, material);
  return material;
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
 * Die Stützen -- Instanzen statt einzelner Meshes, dieselbe Begründung wie
 * bei `Deckenleuchten`: eine grosse Halle trägt an die vierzig Stück, mehrere
 * Hallen gleichzeitig ein Vielfaches davon, und alle sind derselbe Quader.
 * Die Kontur ist eine zweite, größere Instanz -- dieselbe Bauart wie bei den
 * Treppenstufen: eine Box hat nur sechs Normalenrichtungen, ihre Hülle ist
 * also keine eigene Geometrie, sondern derselbe Quader, gleichmässig
 * aufgeblasen.
 */
export function Hallenstuetzen({
  data,
  centre,
  visible,
}: {
  data: Dataset;
  centre: [number, number];
  visible: boolean;
}) {
  const saeulen = useMemo(() => {
    const out: { matrix: THREE.Matrix4; huelleMatrix: THREE.Matrix4 }[] = [];
    const dummy = new THREE.Object3D();
    const auf = konturStaerke('stark') * 2;

    for (const hall of data.site.halls) {
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;
      const hoehe = hall.height?.clearHeightM ?? 8;
      const { positionen } = saeulenraster(lage);

      for (const p of positionen) {
        dummy.position.set(p.x - centre[0], hall.baseY + hoehe / 2, p.y - centre[1]);
        dummy.rotation.set(0, -lage.winkel, 0);
        dummy.scale.set(SAEULEN_BREITE_M, hoehe, SAEULEN_TIEFE_M);
        dummy.updateMatrix();
        const matrix = dummy.matrix.clone();

        dummy.scale.set(SAEULEN_BREITE_M + auf, hoehe + auf, SAEULEN_TIEFE_M + auf);
        dummy.updateMatrix();
        out.push({ matrix, huelleMatrix: dummy.matrix.clone() });
      }
    }
    return out;
  }, [data, centre]);

  const material = useMemo(() => toonMaterial(FAMILIEN.M02), []);
  const huelleMaterial = useMemo(() => konturMaterial().clone(), []);
  useEffect(() => () => huelleMaterial.dispose(), [huelleMaterial]);

  /**
   * Callback-Refs statt `useRef` + `useEffect`.
   *
   * Mit einem `useEffect([saeulen])` lief die Instanzmatrix leer: der Effekt
   * feuerte einmal, bevor R3F die Refs überhaupt gesetzt hatte, und danach
   * nie wieder, weil sich die Abhängigkeit nicht mehr änderte -- gefangen
   * mit einem Log direkt im Effekt. Eine frische `InstancedMesh` füllt ihre
   * Matrizen mit Nullen, nicht mit der Einheitsmatrix; ungesetzt bedeutet
   * damit nicht "am Ursprung", sondern ein Objekt ohne jede Ausdehnung --
   * unsichtbar, ohne Fehlermeldung. Ein Callback-Ref feuert garantiert erst,
   * wenn das Objekt existiert, und genau dafür ist er hier.
   */
  const setzeMatrizen = (mesh: THREE.InstancedMesh | null, key: 'matrix' | 'huelleMatrix') => {
    if (!mesh) return;
    saeulen.forEach((s, index) => mesh.setMatrixAt(index, s[key]));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  if (!visible || !saeulen.length) return null;

  return (
    <group>
      <instancedMesh
        ref={(mesh) => setzeMatrizen(mesh, 'matrix')}
        args={[undefined, undefined, saeulen.length]}
        material={material}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={(mesh) => setzeMatrizen(mesh, 'huelleMatrix')}
        args={[undefined, undefined, saeulen.length]}
        material={huelleMaterial}
        renderOrder={-1}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    </group>
  );
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
        out.push([x - centre[0], hall.baseY + LICHT_HOEHE_M, y - centre[1]]);
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
      lage.my - centre[1],
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

/**
 * Wie eine Halle ihre drei Leuchtenreihen legt -- geteilt zwischen den
 * Leuchten selbst und dem Bodenschein darunter (`Lichtspiegel`), damit beide
 * exakt zueinander stehen und nicht nur ungefähr.
 *
 * Drei Reihen, nicht ein Raster im festen Meterabstand: das Referenzfoto
 * zeigt zwischen zwei Stützenreihen genau drei durchlaufende Bahnen, nicht
 * eine von der Hallenbreite abhängige Zahl. Sie liegen im lichten Feld
 * zwischen den Stützen (`saeulenraster`), zu Dritteln verteilt -- die
 * äusseren beiden bleiben so weit von den Stützen entfernt wie von der
 * mittleren Reihe.
 */
function leuchtenreihen(lage: Lage) {
  const { halbeSpanne, ux, uy, vx, vy } = saeulenraster(lage);
  const laenge = lage.laenge * 0.94;
  return [-1, 0, 1].map((drittel) => ({
    quer: drittel * halbeSpanne * 0.62,
    laenge,
    ux,
    uy,
    vx,
    vy,
  }));
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
  const { strips, gehaeuse } = useMemo(() => {
    const strips: THREE.Matrix4[] = [];
    const gehaeuse: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    for (const hall of data.site.halls) {
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;

      const hoehe = hall.height?.clearHeightM ?? 8;
      const deckenY = hall.baseY + hoehe;
      const lichtY = deckenY - DROP_M;

      for (const reihe of leuchtenreihen(lage)) {
        const x = lage.mx + reihe.vx * reihe.quer;
        const y = lage.my + reihe.vy * reihe.quer;
        const winkel = Math.atan2(reihe.uy, reihe.ux);

        // Durchgehend, nicht gestückelt: die Stützen im gleichen Rastermaß
        // geben dem Auge jetzt den Anhaltspunkt für die Länge, den vorher
        // die Lücken liefern mussten.
        dummy.position.set(x - centre[0], lichtY, y - centre[1]);
        dummy.rotation.set(0, winkel, 0);
        dummy.scale.set(reihe.laenge, STRIP_THICKNESS_M, STRIP_WIDTH_M);
        dummy.updateMatrix();
        strips.push(dummy.matrix.clone());

        // Die Fassung: ein dunkler Kanal von der Decke bis zur Leuchte, damit
        // die Leuchte in etwas hängt und nicht als eigener Körper mitten im
        // Luftraum schwebt.
        dummy.position.set(x - centre[0], deckenY - DROP_M / 2, y - centre[1]);
        dummy.scale.set(reihe.laenge * 1.01, DROP_M * 1.4, STRIP_WIDTH_M * 1.8);
        dummy.updateMatrix();
        gehaeuse.push(dummy.matrix.clone());
      }
    }
    return { strips, gehaeuse };
  }, [data, centre]);

  const gehaeuseMaterial = useMemo(() => toonMaterial(FAMILIEN.M02), []);

  // Callback-Refs, nicht `useRef` + `useEffect` -- siehe die ausführliche
  // Begründung bei `Hallenstuetzen.setzeMatrizen`. Derselbe Fehler hätte
  // hier dieselbe Folge: eine Instanzmatrix voller Nullen, unsichtbar.
  const setzeMatrizen = (mesh: THREE.InstancedMesh | null, quelle: THREE.Matrix4[]) => {
    if (!mesh) return;
    quelle.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  if (!strips.length) return null;

  return (
    <group visible={visible}>
      <instancedMesh ref={(mesh) => setzeMatrizen(mesh, gehaeuse)}
        args={[undefined, undefined, gehaeuse.length]}
        material={gehaeuseMaterial} castShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={(mesh) => setzeMatrizen(mesh, strips)}
        args={[undefined, undefined, strips.length]} frustumCulled={false}>
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
    </group>
  );
}

/**
 * Der Bodenschein -- was die Leuchten unten zurückwerfen.
 *
 * `Hallenhuelle`s Bodenmaterial spiegelt bereits `scene.environment`, aber
 * diese Umgebung ist eine generische Kugel für *jede* Halle und kennt die
 * tatsächlichen Reihen nicht -- die Spiegelung stand an einer Stelle, die mit
 * keiner echten Leuchte übereinstimmte, und das sah man ihr an. Dieser Schein
 * steht stattdessen exakt unter jeder der drei echten Reihen aus
 * `leuchtenreihen()`: gleiche Länge, gleiche Lage, gleiche Drehung.
 *
 * Additiv, weich und mit unregelmässigem Rand statt einer sauberen Kante --
 * ein geschliffener Estrich wirft kein Bild zurück wie ein Spiegel, sondern
 * einen aufgebrochenen, diffusen Schimmer. Die Unregelmässigkeit kommt aus
 * einer eigenen Textur und nicht aus der Normalenkarte des Bodens: eine
 * Textur lässt sich gestalten, ein Shader-Abgriff auf eine fremde Karte an
 * dieser Stelle wäre der teurere Weg für dasselbe Ergebnis.
 */
let scheinTexturCache: THREE.CanvasTexture | null = null;

function scheinTextur(): THREE.CanvasTexture {
  if (scheinTexturCache) return scheinTexturCache;
  const size = 256;
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  const ctx = element.getContext('2d')!;
  const mitte = size / 2;
  const verlauf = ctx.createLinearGradient(0, mitte - size * 0.4, 0, mitte + size * 0.4);
  verlauf.addColorStop(0, 'rgba(0,0,0,0)');
  verlauf.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  verlauf.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = verlauf;
  ctx.fillRect(0, 0, size, size);
  // Unregelmässiger Rand: der Boden bricht den Schein auf, kein sauberes Oval.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 220; i += 1) {
    const x = Math.random() * size;
    const y = mitte + (Math.random() - 0.5) * size * 0.9;
    const distanzZurMitte = Math.abs(y - mitte) / (size * 0.4);
    if (Math.random() > distanzZurMitte * 0.9) continue;
    ctx.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.35})`;
    ctx.beginPath();
    ctx.arc(x, y, 3 + Math.random() * 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  scheinTexturCache = new THREE.CanvasTexture(element);
  return scheinTexturCache;
}

export function Lichtspiegel({
  data,
  centre,
  visible,
}: {
  data: Dataset;
  centre: [number, number];
  visible: boolean;
}) {
  const flaechen = useMemo(() => {
    const out: { key: string; position: [number, number, number]; drehung: number; laenge: number }[] = [];
    for (const hall of data.site.halls) {
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;
      leuchtenreihen(lage).forEach((reihe, index) => {
        const x = lage.mx + reihe.vx * reihe.quer;
        const y = lage.my + reihe.vy * reihe.quer;
        out.push({
          key: `${hall.key}-schein${index}`,
          position: [x - centre[0], hall.baseY + 0.03, y - centre[1]],
          drehung: -Math.atan2(reihe.uy, reihe.ux),
          laenge: reihe.laenge,
        });
      });
    }
    return out;
  }, [data, centre]);

  const material = useMemo(() => new THREE.MeshBasicMaterial({
    map: scheinTextur(),
    color: '#ffdfa8',
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  if (!visible || !flaechen.length) return null;

  return (
    <group>
      {flaechen.map((f) => (
        <mesh
          key={f.key}
          position={f.position}
          rotation={[-Math.PI / 2, 0, f.drehung]}
          material={material}
          renderOrder={1}
        >
          <planeGeometry args={[f.laenge, STRIP_WIDTH_M * 7]} />
        </mesh>
      ))}
    </group>
  );
}
