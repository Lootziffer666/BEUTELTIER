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
import { FAMILIEN, toonMaterial } from './stil';
import { planErlaubt } from './fernsteuerung';

/** Draufsicht ohne Decke -- siehe `planErlaubt`. Einmal beim Laden entschieden. */
const PLAN_ANSICHT =
  typeof window !== 'undefined' && planErlaubt(window.location.search);

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
 * Der Pfeiler: schmal, mit einem kleinen Sockel oben und unten.
 *
 * Die Sockel sind nicht Zierat. Ein Quader, der ohne Übergang aus dem Boden
 * kommt und ohne Übergang in der Decke endet, sieht aus, als wäre er in die
 * Szene gesetzt statt in ihr gebaut -- er hat keinen Kontakt zu den Flächen,
 * die er berührt. Ein leicht breiterer Absatz an beiden Enden stellt genau
 * diesen Kontakt her; auf dem Referenzfoto ist er unten und oben zu sehen.
 */
const SAEULEN_BREITE_M = 0.46;
const SAEULEN_TIEFE_M = 0.58;
/** Wie weit der Sockel über den Schaft steht, je Seite. */
const SOCKEL_KRAGEN_M = 0.07;
/** Höhe des Sockels, oben wie unten. */
const SOCKEL_HOEHE_M = 0.22;

/**
 * Wie eine Messehalle wirklich aufgeteilt ist -- **kein** gleichmäßiges
 * Raster in beiden Richtungen.
 *
 * Hier stand vorher 12,00 m längs *und* quer, also 13 Stützenachsen über die
 * Breite von Halle 10.2. Das ist falsch und macht die Halle unbrauchbar: bei
 * 12 m Abstand quer bleibt zwischen zwei Reihen kein Platz für einen
 * Ausstellerblock, und genau dafür ist die Fläche da.
 *
 * Gebaut ist es andersherum. Quer zur Halle wechseln sich breite
 * Ausstellerbänder und schmale Stützenreihen ab:
 *
 *     WAND
 *     A  Aussteller
 *     ●   ●   ●   ●     Pfeilerreihe 1
 *     B  Aussteller
 *     ●   ●   ●   ●     Pfeilerreihe 2
 *     …
 *     ●   ●   ●   ●     Pfeilerreihe 5
 *     G  Aussteller
 *     WAND
 *
 * Fünf Reihen quer, sechs Bänder dazwischen und an den Wänden. Die Reihen
 * teilen die Breite also in sechs gleiche Teile -- bei Halle 10.2 rund 24 m
 * je Band. Deshalb sieht man aus einem Band immer **zwei** Reihen, die es
 * flankieren, und nicht dreizehn.
 */
export const PFEILERREIHEN_QUER = 5;
/**
 * Abstand der Stützen **innerhalb** einer Reihe, längs der Halle.
 *
 * Angenommen, nicht gemessen: 12 m ist das Mass, mit dem vier Pfeiler auf die
 * rund 48 m fallen, die man von einem Standpunkt aus in die Flucht sieht.
 * Sollte das am Bau anders sein, gehört die Zahl hierher und nirgends sonst.
 */
export const RASTER_M = 12;
/** Wie viele Leuchtenbahnen zwischen zwei Stützenreihen liegen. */
export const BAHNEN_JE_FELD = 3;

/**
 * Die Lage der Bahnen in einem Feld, gemessen von der linken Stützenachse.
 *
 * Bei 12 m Achsmaß und drei Bahnen sind das 3, 6 und 9 m: der Abstand Stütze
 * zu Bahn ist derselbe wie Bahn zu Bahn. Deshalb `b / (n + 1)` und keine
 * Aufteilung, die die Ränder anders behandelt als die Mitte.
 */
export function bahnenImFeld(feldbreite = RASTER_M): number[] {
  const out: number[] = [];
  for (let b = 1; b <= BAHNEN_JE_FELD; b += 1) {
    out.push((b / (BAHNEN_JE_FELD + 1)) * feldbreite);
  }
  return out;
}

/**
 * Die Lage der Stützenreihen quer zur Halle, gemessen von der Hallenmitte.
 *
 * Fünf Reihen teilen die Breite in sechs gleiche Bänder; die Reihe `i` sitzt
 * damit auf `(i + 1) / 6` der Breite. An beiden Wänden bleibt ein ganzes
 * Band -- dort steht die äusserste Ausstellerreihe, keine Stütze.
 */
export function pfeilerreihenQuer(breite: number): number[] {
  const baender = PFEILERREIHEN_QUER + 1;
  const out: number[] = [];
  for (let i = 1; i <= PFEILERREIHEN_QUER; i += 1) {
    out.push((i / baender - 0.5) * breite);
  }
  return out;
}
/**
 * Wie weit um eine feste Einbaute herum keine Stütze steht.
 *
 * Treppenhäuser, Rolltreppen und Atrien unterbrechen das Raster -- dort steht
 * keine Stütze, weil dort der Durchbruch ist. Der Radius ist grosszügig: die
 * Vertikalknoten sind eingemessene Punkte, nicht die Umrisse der Einbaute.
 */
const AUSSPARUNG_RADIUS_M = 9;

interface Lage {
  mx: number;
  my: number;
  laenge: number;
  breite: number;
  /** Drehung für die Szene (Y-Achse), **nicht** für Rechnungen im Grundriss. */
  winkel: number;
  /** Längsachse der Halle in Geländemetern. */
  tx: number;
  ty: number;
  /** Querachse dazu, ebenfalls in Geländemetern. */
  px: number;
  py: number;
}

/**
 * Die Achsabstände eines Rasters über eine Strecke, mittig eingepasst.
 *
 * `floor(laenge / 12) + 1` Achsen: so viele volle 12-m-Felder, wie die Halle
 * hergibt, plus die Achse am Anfang. Was übrig bleibt, verteilt sich zu
 * gleichen Teilen auf beide Ränder -- das Raster sitzt mittig, nicht an einer
 * Wand ausgerichtet.
 */
export function rasterAchsen(laenge: number): number[] {
  const felder = Math.max(1, Math.floor(laenge / RASTER_M));
  const spanne = felder * RASTER_M;
  const achsen: number[] = [];
  for (let i = 0; i <= felder; i += 1) achsen.push(i * RASTER_M - spanne / 2);
  return achsen;
}

/**
 * Das Stützenraster einer Halle, mit den Aussparungen für feste Einbauten.
 *
 * Geteilt zwischen `Hallenstuetzen` und `Deckenleuchten` -- die Bahnen liegen
 * **zwischen** den Querachsen, und beide müssen deshalb von derselben
 * Rechnung ausgehen. Wer das Raster an einer Stelle ändert und an der anderen
 * nicht, bekommt Leuchten, die in Stützen stehen.
 *
 * `aussparungen` sind Weltpunkte (Treppen, Rolltreppen, Aufzüge); Rasterpunkte
 * in ihrer Nähe fallen weg.
 */
function saeulenraster(lage: Lage, aussparungen: { x: number; y: number }[] = []) {
  // Die Achsen kommen aus `hallenlage` und werden hier **nicht** aus `winkel`
  // neu gerechnet: `winkel` ist die Drehung für die Szene und trägt dafür
  // einen Vorzeichenwechsel, der im Grundriss nichts zu suchen hat.
  const { tx, ty, px, py } = lage;

  // Längs im Stützenmass, quer in Reihen mit Ausstellerbändern dazwischen --
  // die beiden Richtungen sind nicht dasselbe.
  const laengsAchsen = rasterAchsen(lage.laenge);
  const querAchsen = pfeilerreihenQuer(lage.breite);
  const bandbreite = lage.breite / (PFEILERREIHEN_QUER + 1);

  const positionen: { x: number; y: number }[] = [];
  for (const laengs of laengsAchsen) {
    for (const quer of querAchsen) {
      const x = lage.mx + tx * laengs + px * quer;
      const y = lage.my + ty * laengs + py * quer;
      const verdeckt = aussparungen.some(
        (a) => Math.hypot(a.x - x, a.y - y) < AUSSPARUNG_RADIUS_M,
      );
      if (!verdeckt) positionen.push({ x, y });
    }
  }
  return { positionen, laengsAchsen, querAchsen, reihenAbstand: bandbreite, tx, ty, px, py };
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
  /** Richtung der längsten Kante **in Geländemetern**. */
  let richtung = 0;
  for (let i = 0; i < footprint.length; i += 1) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > laengste) {
      laengste = d;
      richtung = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  if (laengste < 1) return null;

  /**
   * Zwei Winkel, nicht einer -- und das war der Fehler.
   *
   * Vorher stand hier nur `drehungNachX()`, also der Winkel für die **Drehung
   * eines Objekts in der Szene**: `atan2(-dy, dx)`, mit dem Vorzeichenwechsel,
   * den Three.js für eine Drehung um die Y-Achse braucht. Gemessen und
   * gerechnet wurde dann aber mit `(cos, sin)` **dieses** Winkels -- also
   * entlang einer an der x-Achse gespiegelten Richtung.
   *
   * Bei einer achsparallelen Halle fällt das nicht auf. Bei einer um 45°
   * gedrehten steht die gespiegelte Achse **senkrecht** auf der echten: Länge
   * und Breite wurden quer gemessen, und das ganze Stützenraster lag um den
   * doppelten Hallenwinkel verdreht im Grundriss. In der Perspektive sah das
   * nach "irgendwie verteilten" Pfeilern aus; erst die Draufsicht
   * (`plan-check.mjs`) zeigte, dass die Reihen gar nicht zur Halle gehören.
   *
   * `tx/ty` ist die Längsachse in Geländemetern, `px/py` die Querachse dazu.
   * Wer eine Lage im Grundriss rechnet, nimmt diese beiden. `winkel` bleibt
   * ausschliesslich das, was es immer war: die Drehung für die Szene.
   */
  const tx = Math.cos(richtung);
  const ty = Math.sin(richtung);
  const px = -ty;
  const py = tx;

  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, y] of footprint) {
    const u = x * tx + y * ty;
    const v = x * px + y * py;
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  const uM = (uMin + uMax) / 2;
  const vM = (vMin + vMax) / 2;
  return {
    // Zurück in Geländemeter: Mitte entlang beider Achsen.
    mx: uM * tx + vM * px,
    my: uM * ty + vM * py,
    laenge: uMax - uMin,
    breite: vMax - vMin,
    winkel: drehungNachX(tx, ty),
    tx, ty, px, py,
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
  /**
   * Boden und Decke folgen dem **Hallenumriss**, nicht seiner Hüllbox.
   *
   * Vorher stand hier eine `planeGeometry(laenge, breite)`, also das
   * umschliessende Rechteck. Halle 10.2 hat aber fünfzehn Ecken. Wo der
   * Umriss einspringt, schob sich die gerade Kante des Rechtecks vor die
   * Wand -- im Bild eine schräge Linie quer durch die Halle, an der die
   * Decke abbricht, und Stützen, die scheinbar vor dem Nichts enden. Nichts
   * daran war schief: es war die falsche Fläche.
   *
   * Gebaut wird direkt in Szenenkoordinaten und ohne Drehung. Der Umweg über
   * Euler-Winkel war die Quelle mehrerer Vorzeichenfehler in dieser Datei
   * (gespiegelte Texturflucht, gespiegelter Bodenschein); eine waagerechte
   * Fläche braucht ihn nicht.
   */
  const flaechen = useMemo(() => {
    const out: {
      key: string;
      geometry: THREE.BufferGeometry;
      art: 'boden' | 'decke';
    }[] = [];

    for (const hall of data.site.halls) {
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;
      const hoehe = hall.height?.clearHeightM ?? 8;

      // Umriss in Hallenkoordinaten: u längs, v quer, Ursprung in der Mitte.
      const lokal = hall.footprint.map(([x, y]) => {
        const dx = x - lage.mx;
        const dy = y - lage.my;
        return new THREE.Vector2(
          dx * lage.tx + dy * lage.ty,
          dx * lage.px + dy * lage.py,
        );
      });
      const dreiecke = THREE.ShapeUtils.triangulateShape(lokal, []);
      if (!dreiecke.length) continue;

      for (const art of (PLAN_ANSICHT ? ['boden'] : ['boden', 'decke']) as
        readonly ('boden' | 'decke')[]) {
        const y = hall.baseY + (art === 'boden' ? 0.02 : hoehe);
        const positions: number[] = [];
        const uvs: number[] = [];
        const normals: number[] = [];
        // Die Decke schaut nach unten; ihre Dreiecke laufen deshalb andersherum.
        const reihenfolge = art === 'boden' ? [0, 1, 2] : [0, 2, 1];
        const kachelM = art === 'boden' ? RASTER_M : WELT_KACHEL_M.decke;

        for (const dreieck of dreiecke) {
          for (const index of reihenfolge) {
            const p = lokal[dreieck[index]];
            // Zurück in Geländemeter, dann in die Szene.
            const gx = lage.mx + p.x * lage.tx + p.y * lage.px;
            const gy = lage.my + p.x * lage.ty + p.y * lage.py;
            positions.push(gx - centre[0], y, gy - centre[1]);
            // UV in Kachelmassen -- die Textur hängt damit an den Metern der
            // Halle und nicht an ihrer Ausdehnung, und das Fugenraster sitzt
            // in jeder Halle gleich.
            uvs.push(p.x / kachelM, p.y / kachelM);
            normals.push(0, art === 'boden' ? 1 : -1, 0);
          }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        out.push({ key: `${hall.key}-${art}`, geometry, art });
      }
    }
    return out;
  }, [data, centre]);

  useEffect(() => () => {
    flaechen.forEach((f) => f.geometry.dispose());
  }, [flaechen]);

  const surfaces = useMemo(
    () => ({ boden: hallenbodenSurface(), decke: hallendeckeSurface() }),
    [],
  );
  useEffect(() => () => {
    disposeSurface(surfaces.boden);
    disposeSurface(surfaces.decke);
  }, [surfaces]);

  if (!visible || !flaechen.length) return null;

  return (
    <group>
      {flaechen.map((flaeche) => {
        const surface = surfaces[flaeche.art];
        return (
          <mesh
            key={flaeche.key}
            geometry={flaeche.geometry}
            receiveShadow={flaeche.art === 'boden'}
            material={hallenMaterial(flaeche.art, surface)}
          />
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

/**
 * Ein Material je Art, nicht je Fläche.
 *
 * Die Wiederholung steckt jetzt in den UVs der Geometrie (in Kachelmassen
 * gerechnet, siehe `Hallenhuelle`) und nicht mehr in `repeat`/`offset` der
 * Textur. Damit brauchen alle Hallen dasselbe Material, und das Fugenraster
 * sitzt in jeder gleich -- vorher hing es an der Ausdehnung der einzelnen
 * Halle und lief deshalb in jeder anders an.
 */
function hallenMaterial(art: 'boden' | 'decke', surface: Surface): THREE.Material {
  const schluessel = `${art}|${surface.map.uuid}`;
  const fertig = hallenMaterialCache.get(schluessel);
  if (fertig) return fertig;

  if (art === 'boden') {
    const material = new THREE.MeshStandardMaterial({
      map: kachel(surface.map),
      normalMap: kachel(surface.normalMap),
      roughnessMap: kachel(surface.roughnessMap),
      roughness: 0.34,
      metalness: 0.22,
      // Zurückgenommen von 1,5: die Umgebung ist eine gleichmäßig helle
      // Kugel, kein Bild der Leuchten. Bei voller Stärke hob sie den ganzen
      // Boden auf dieselbe Helligkeit an -- der Belag war dann trotz dunkler
      // Grundfarbe fast weiss, und die Bahnen darauf gingen unter.
      envMapIntensity: 0.5,
    });
    hallenMaterialCache.set(schluessel, material);
    return material;
  }

  // Keine gemalten Leuchtfelder mehr in der `emissiveMap` -- die Decke trug
  // bisher ihr eigenes, generisches Raster, unabhängig von den tatsächlichen
  // Reihen dieser Halle, die `Deckenleuchten` als echte Geometrie setzt. Zwei
  // Lichtquellen an derselben Stelle, die nicht zueinander passten, waren der
  // Grund, warum die Decke nach nichts Bestimmtem aussah.
  const map = kachel(surface.map);
  const material = toonMaterial(FAMILIEN.M02, {
    map,
    normalMap: kachel(surface.normalMap),
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
function kachel(quelle: THREE.Texture | undefined) {
  if (!quelle) return null;
  let fertig = kachelCache.get(quelle.uuid);
  if (!fertig) {
    fertig = quelle.clone();
    fertig.wrapS = THREE.RepeatWrapping;
    fertig.wrapT = THREE.RepeatWrapping;
    // Wiederholung 1:1 -- die UVs kommen bereits in Kachelmassen aus der
    // Geometrie und laufen über die ganze Halle durch.
    fertig.repeat.set(1, 1);
    fertig.needsUpdate = true;
    kachelCache.set(quelle.uuid, fertig);
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
  /**
   * Wo feste Einbauten das Raster unterbrechen.
   *
   * Treppenhäuser, Rolltreppen und Aufzüge stehen im Wegenetz als
   * Vertikalknoten mit eingemessener Lage -- dieselbe Quelle, aus der
   * `Vertikalverbindungen` die Läufe baut. Eine eigene Liste dafür wäre eine
   * zweite Wahrheit, die beim ersten Datenlauf auseinanderfiele.
   */
  const aussparungen = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (const node of data.graph.nodes.values()) {
      if (node.kind !== 'vertical') continue;
      out.push({ x: node.x, y: node.y });
    }
    return out;
  }, [data]);

  const { schaefte, sockel } = useMemo(() => {
    const schaefte: THREE.Matrix4[] = [];
    const sockel: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    for (const hall of data.site.halls) {
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;
      const hoehe = hall.height?.clearHeightM ?? 8;
      const { positionen } = saeulenraster(lage, aussparungen);
      const boden = hall.baseY;
      const decke = hall.baseY + hoehe;

      for (const p of positionen) {
        const sx = p.x - centre[0];
        const sz = p.y - centre[1];
        // `+winkel`: ein Quader dreht sich um die Y-Achse der Szene, und
        // `winkel` ist genau dafür gerechnet (siehe `hallenlage`).
        dummy.rotation.set(0, lage.winkel, 0);

        // Der Schaft läuft zwischen den Sockeln, nicht durch sie hindurch.
        const schafthoehe = hoehe - 2 * SOCKEL_HOEHE_M;
        dummy.position.set(sx, boden + hoehe / 2, sz);
        dummy.scale.set(SAEULEN_BREITE_M, schafthoehe, SAEULEN_TIEFE_M);
        dummy.updateMatrix();
        schaefte.push(dummy.matrix.clone());

        for (const y of [boden + SOCKEL_HOEHE_M / 2, decke - SOCKEL_HOEHE_M / 2]) {
          dummy.position.set(sx, y, sz);
          dummy.scale.set(
            SAEULEN_BREITE_M + 2 * SOCKEL_KRAGEN_M,
            SOCKEL_HOEHE_M,
            SAEULEN_TIEFE_M + 2 * SOCKEL_KRAGEN_M,
          );
          dummy.updateMatrix();
          sockel.push(dummy.matrix.clone());
        }
      }
    }
    return { schaefte, sockel };
  }, [data, centre, aussparungen]);

  /**
   * Die Stütze liest sich als Körper, nicht als Silhouette.
   *
   * Mit der reinen Familie M02 (Grundton #2b2e33, zwei Stufen) fiel jede der
   * vier senkrechten Flächen in dieselbe dunkelste Stufe -- das Ergebnis war
   * eine schwarze Fläche ohne erkennbare Kanten, in der man den Quader nicht
   * mehr als Quader sah. Drei Stufen statt zwei und ein etwas hellerer
   * Grundton geben den Seitenflächen wieder eigene Werte; die dunkle Wirkung
   * der Familie bleibt, die Form kommt zurück.
   */
  const material = useMemo(
    () => toonMaterial({ ...FAMILIEN.M02, grundton: '#3c4048', stufen: 3 }),
    [],
  );
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
  const setzeMatrizen = (mesh: THREE.InstancedMesh | null, quelle: THREE.Matrix4[]) => {
    if (!mesh) return;
    quelle.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  if (!visible || !schaefte.length) return null;

  /*
   * Keine Konturhülle an der Stütze.
   *
   * Die Hülle ist ein um die Konturstärke aufgeblasener Quader mit
   * `THREE.BackSide` -- man sieht also seine *inneren* Flächen. Bei einem
   * flachen Bauteil fällt das nicht auf, bei einer 15 m hohen Stütze dicht
   * vor der Kamera schon: dort steht die innere Bodenfläche der Hülle als
   * schwarzes Viereck rings um den Fuss, breiter als die Stütze und schräg
   * angeschnitten. Die Stütze schien nicht mehr auf dem Boden zu stehen.
   *
   * Eine Kontur, die genau an dem Bauteil versagt, das sie erklären soll,
   * ist keine. Die Stütze trägt ihre Form jetzt über die eigenen
   * Flächenwerte (drei Stufen, siehe oben) gegen den hellen Boden.
   */
  return (
    <group>
      <instancedMesh
        ref={(mesh) => setzeMatrizen(mesh, schaefte)}
        args={[undefined, undefined, schaefte.length]}
        material={material}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      {/* Sockel oben und unten: der Übergang zu Boden und Decke. Ohne ihn
          steht der Schaft ohne Kontakt in der Fläche -- er wirkt gesetzt,
          nicht gebaut. */}
      <instancedMesh
        ref={(mesh) => setzeMatrizen(mesh, sockel)}
        args={[undefined, undefined, sockel.length]}
        material={material}
        castShadow
        receiveShadow
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
        // Nie über die Decke: `LICHT_HOEHE_M` ist ein Richtwert für hohe
        // Hallen, aber Halle 10.2 misst nur 5,7 m licht. Dort hingen die
        // Lichter bislang knapp drei Meter *über* der Decke und leuchteten
        // durch sie hindurch auf den Boden -- die Punktlichter werfen keinen
        // Schatten, also hielt sie nichts auf. Der Boden war dadurch flächig
        // hell, ohne dass eine sichtbare Quelle dafür im Raum stand.
        const lichtHoehe = Math.min(LICHT_HOEHE_M, (hall.height?.clearHeightM ?? 8) - 1);
        out.push([x - centre[0], hall.baseY + lichtHoehe, y - centre[1]]);
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
            // Schwach: dieses Licht ist für den Schattenwurf da, nicht für die
            // Helligkeit. Bei 2,4 flutete es den Boden flächig und hob ihn
            // trotz dunkler Grundfarbe auf Weiss -- eine Halle hat aber keine
            // Sonne, sie hat Leuchtenreihen.
            intensity={0.55}
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
          intensity={38}
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
 * Wo die Leuchtenbahnen liegen -- geteilt zwischen den Leuchten selbst und
 * dem Bodenschein darunter (`Lichtspiegel`), damit beide exakt zueinander
 * stehen und nicht nur ungefähr.
 *
 * Drei Bahnen über jedem Ausstellerband, mit **identischen Abständen**: der
 * Abstand Stützenreihe zu Bahn ist derselbe wie Bahn zu Bahn -- deshalb
 * `b / (BAHNEN + 1)` und keine Aufteilung, die die Ränder anders behandelt
 * als die Mitte.
 *
 * Beleuchtet werden **alle sechs** Bänder, auch die beiden an den Wänden.
 * Dort steht die äusserste Ausstellerreihe; ein unbeleuchtetes Band wäre eine
 * dunkle Zone entlang der ganzen Hallenwand.
 */
function leuchtenreihen(lage: Lage) {
  const { querAchsen, reihenAbstand, px, py } = saeulenraster(lage);
  const laenge = lage.laenge * 0.94;
  // Bandgrenzen: Wand, dann jede Stützenreihe, dann die andere Wand.
  const grenzen = [-lage.breite / 2, ...querAchsen, lage.breite / 2];
  const bahnen: { quer: number; laenge: number; px: number; py: number }[] = [];
  for (let feld = 0; feld < grenzen.length - 1; feld += 1) {
    const von = grenzen[feld];
    for (const versatz of bahnenImFeld(reihenAbstand)) {
      bahnen.push({ quer: von + versatz, laenge, px, py });
    }
  }
  return bahnen;
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
        // Querversatz in Geländemetern, Drehung in Szenenwinkeln -- die
        // beiden sind nicht dasselbe, siehe `hallenlage`.
        const x = lage.mx + reihe.px * reihe.quer;
        const y = lage.my + reihe.py * reihe.quer;

        // Durchgehend, nicht gestückelt: die Stützen im gleichen Rastermaß
        // geben dem Auge jetzt den Anhaltspunkt für die Länge, den vorher
        // die Lücken liefern mussten.
        dummy.position.set(x - centre[0], lichtY, y - centre[1]);
        dummy.rotation.set(0, lage.winkel, 0);
        dummy.scale.set(reihe.laenge, STRIP_THICKNESS_M, STRIP_WIDTH_M);
        dummy.updateMatrix();
        strips.push(dummy.matrix.clone());

        // Die Fassung: ein dunkler Kanal zwischen Decke und Leuchte, damit
        // die Leuchte in etwas hängt und nicht als eigener Körper mitten im
        // Luftraum schwebt.
        //
        // Sie sitzt **über** der Leuchte, nicht um sie herum. Vorher lag ihre
        // Unterkante genau auf der Unterkante der Leuchte und sie war doppelt
        // so breit -- von unten, also aus jeder Augenhöhe, verdeckte der
        // dunkle Kasten damit das Leuchtband vollständig. Sichtbar blieb nur
        // die eine Bahn, an der die Perspektive zufällig daran vorbeisah.
        const fassungHoehe = DROP_M - STRIP_THICKNESS_M;
        dummy.position.set(
          x - centre[0],
          lichtY + STRIP_THICKNESS_M / 2 + fassungHoehe / 2,
          y - centre[1],
        );
        dummy.scale.set(reihe.laenge * 1.01, fassungHoehe, STRIP_WIDTH_M * 1.5);
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
        const x = lage.mx + reihe.px * reihe.quer;
        const y = lage.my + reihe.py * reihe.quer;
        out.push({
          key: `${hall.key}-schein${index}`,
          position: [x - centre[0], hall.baseY + 0.03, y - centre[1]],
          // Eine Ebene mit Euler [-90°, 0, θ] richtet ihre Längsachse nach
          // (cos θ, 0, -sin θ) aus -- dieselbe Richtung, die ein Quader mit
          // Ry(θ) bekommt. Beide nehmen deshalb denselben Szenenwinkel.
          drehung: lage.winkel,
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
