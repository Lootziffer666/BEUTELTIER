/**
 * Innenraum der Messehallen: Geometrie, Stützen, Leuchten und Bodenlook.
 *
 * Dieser Stand verbindet die Geometrie-/Rasterkorrekturen aus PR31 mit dem
 * letzten Opus-Look aus PR32. Die Hallenflächen tragen metrische UVs direkt in
 * der Geometrie; der dunkle M03-Boden und die Lichtspiegel aus PR32 bleiben
 * erhalten.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { Dataset } from '../data/load';
import type { Placement2D } from '../data/types';
import { drehungNachX } from './geometry';
import {
  FAMILIEN,
  familienMaterial,
  flachMaterial,
  konturStaerke,
  ROHBAU_PHASE,
  toonMaterial,
} from './stil';
import { Kontur } from './Kontur';
import {
  disposeSurface,
  facadeSurface,
  hallenbodenSurface,
  hallendeckeSurface,
  WELT_KACHEL_M,
} from './materials';
import { planErlaubt } from './fernsteuerung';
import { WANDTECHNIK_DEFAULT, wandtechnik, type WandtechnikSpec } from './wandtechnik';
import konstruktion from '../data/hallen-konstruktion.json';

const PLAN_ANSICHT =
  typeof window !== 'undefined' && planErlaubt(window.location.search);

const DROP_M = 0.3;
const STRIP_WIDTH_M = 0.42;
const STRIP_THICKNESS_M = 0.12;

const SAEULEN_BREITE_M = 0.46;
const SAEULEN_TIEFE_M = 0.58;
const SOCKEL_KRAGEN_M = 0.07;
const SOCKEL_HOEHE_M = 0.22;

export const PFEILERREIHEN_QUER = 5;
export const RASTER_M = 12;
export const BAHNEN_JE_FELD = 3;

export function bahnenImFeld(feldbreite = RASTER_M): number[] {
  const out: number[] = [];
  for (let b = 1; b <= BAHNEN_JE_FELD; b += 1) {
    out.push((b / (BAHNEN_JE_FELD + 1)) * feldbreite);
  }
  return out;
}

export function pfeilerreihenQuer(breite: number): number[] {
  const baender = PFEILERREIHEN_QUER + 1;
  const out: number[] = [];
  for (let i = 1; i <= PFEILERREIHEN_QUER; i += 1) {
    out.push((i / baender - 0.5) * breite);
  }
  return out;
}

const AUSSPARUNG_RADIUS_M = 9;

interface Lage {
  mx: number;
  my: number;
  laenge: number;
  breite: number;
  winkel: number;
  tx: number;
  ty: number;
  px: number;
  py: number;
}

export function rasterAchsen(laenge: number): number[] {
  const felder = Math.max(1, Math.floor(laenge / RASTER_M));
  const spanne = felder * RASTER_M;
  const achsen: number[] = [];
  for (let i = 0; i <= felder; i += 1) {
    achsen.push(i * RASTER_M - spanne / 2);
  }
  return achsen;
}

export function hallenAufbau(baseY: number, lichteHoehe: number) {
  const deckeY = baseY + lichteHoehe;
  const lichtY = deckeY - DROP_M;
  const fassungHoehe = DROP_M - STRIP_THICKNESS_M;
  return {
    bodenY: baseY + 0.02,
    deckeY,
    schaftVon: baseY + SOCKEL_HOEHE_M,
    schaftBis: deckeY - SOCKEL_HOEHE_M,
    sockelUnten: [baseY, baseY + SOCKEL_HOEHE_M] as [number, number],
    sockelOben: [deckeY - SOCKEL_HOEHE_M, deckeY] as [number, number],
    band: [
      lichtY - STRIP_THICKNESS_M / 2,
      lichtY + STRIP_THICKNESS_M / 2,
    ] as [number, number],
    fassung: [
      lichtY + STRIP_THICKNESS_M / 2,
      lichtY + STRIP_THICKNESS_M / 2 + fassungHoehe,
    ] as [number, number],
  };
}

interface StuetzenSpec {
  reihenQuer: number[];
  laengsStart: number;
  laengsAbstand: number;
  laengsAnzahl: number;
  profil: { breite: number; tiefe: number };
}

const KONSTRUKTION = konstruktion.hallen as Record<
  string,
  { stuetzen: StuetzenSpec }
>;

export function stuetzenSpec(hallKey: string): StuetzenSpec | null {
  return KONSTRUKTION[hallKey]?.stuetzen ?? null;
}

function saeulenraster(
  lage: Lage,
  aussparungen: { x: number; y: number }[] = [],
  spec: StuetzenSpec | null = null,
) {
  const { tx, ty, px, py } = lage;
  const laengsAchsen = spec
    ? Array.from(
        { length: spec.laengsAnzahl },
        (_, i) => spec.laengsStart + i * spec.laengsAbstand,
      )
    : rasterAchsen(lage.laenge);
  const querAchsen = spec ? spec.reihenQuer : pfeilerreihenQuer(lage.breite);
  const bandbreite =
    querAchsen.length > 1
      ? querAchsen[1] - querAchsen[0]
      : lage.breite / (PFEILERREIHEN_QUER + 1);

  const positionen: { x: number; y: number }[] = [];
  for (const laengs of laengsAchsen) {
    for (const quer of querAchsen) {
      const x = lage.mx + tx * laengs + px * quer;
      const y = lage.my + ty * laengs + py * quer;
      if (
        Math.abs(laengs) > lage.laenge / 2 ||
        Math.abs(quer) > lage.breite / 2
      ) {
        continue;
      }
      const verdeckt = aussparungen.some(
        (a) => Math.hypot(a.x - x, a.y - y) < AUSSPARUNG_RADIUS_M,
      );
      if (!verdeckt) positionen.push({ x, y });
    }
  }

  return {
    positionen,
    laengsAchsen,
    querAchsen,
    reihenAbstand: bandbreite,
    tx,
    ty,
    px,
    py,
  };
}

export function hallenlage(footprint: Placement2D[]) {
  if (footprint.length < 3) return null;

  let laengste = 0;
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

  const tx = Math.cos(richtung);
  const ty = Math.sin(richtung);
  const px = -ty;
  const py = tx;

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;

  for (const [x, y] of footprint) {
    const u = x * tx + y * ty;
    const v = x * px + y * py;
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }

  const uM = (uMin + uMax) / 2;
  const vM = (vMin + vMax) / 2;
  return {
    mx: uM * tx + vM * px,
    my: uM * ty + vM * py,
    laenge: uMax - uMin,
    breite: vMax - vMin,
    winkel: drehungNachX(tx, ty),
    tx,
    ty,
    px,
    py,
  };
}

const kachelCache = new Map<string, THREE.Texture>();

function kachel(quelle: THREE.Texture | undefined) {
  if (!quelle) return null;
  let fertig = kachelCache.get(quelle.uuid);
  if (!fertig) {
    fertig = quelle.clone();
    fertig.wrapS = THREE.RepeatWrapping;
    fertig.wrapT = THREE.RepeatWrapping;
    fertig.repeat.set(1, 1);
    fertig.needsUpdate = true;
    kachelCache.set(quelle.uuid, fertig);
  }
  return fertig;
}

export function Hallenhuelle({
  data,
  centre,
  hallKey,
  visible,
}: {
  data: Dataset;
  centre: [number, number];
  hallKey: string | null;
  visible: boolean;
}) {
  const flaechen = useMemo(() => {
    const out: {
      key: string;
      geometry: THREE.BufferGeometry;
      art: 'boden' | 'decke';
    }[] = [];

    for (const hall of data.site.halls) {
      if (hall.key !== hallKey) continue;
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;
      const hoehe = hall.height?.clearHeightM ?? 8;

      const hl = lage.laenge / 2;
      const hb = lage.breite / 2;
      const lokal = [
        new THREE.Vector2(-hl, -hb),
        new THREE.Vector2(hl, -hb),
        new THREE.Vector2(hl, hb),
        new THREE.Vector2(-hl, hb),
      ];
      const dreiecke = [
        [0, 1, 2],
        [0, 2, 3],
      ];

      for (const art of (
        PLAN_ANSICHT ? ['boden'] : ['boden', 'decke']
      ) as readonly ('boden' | 'decke')[]) {
        const y = hall.baseY + (art === 'boden' ? 0.02 : hoehe);
        const positions: number[] = [];
        const uvs: number[] = [];
        const normals: number[] = [];
        const reihenfolge = art === 'boden' ? [0, 1, 2] : [0, 2, 1];
        const kachelM =
          art === 'boden' ? WELT_KACHEL_M.boden : WELT_KACHEL_M.decke;

        for (const dreieck of dreiecke) {
          for (const index of reihenfolge) {
            const p = lokal[dreieck[index]];
            const gx = lage.mx + p.x * lage.tx + p.y * lage.px;
            const gy = lage.my + p.x * lage.ty + p.y * lage.py;
            positions.push(gx - centre[0], y, gy - centre[1]);
            uvs.push(p.x / kachelM, p.y / kachelM);
            normals.push(0, art === 'boden' ? 1 : -1, 0);
          }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute(
          'normal',
          new THREE.Float32BufferAttribute(normals, 3),
        );
        out.push({ key: `${hall.key}-${art}`, geometry, art });
      }
    }

    return out;
  }, [data, centre, hallKey]);

  useEffect(() => {
    const hall = hallKey ? data.site.halls.find((h) => h.key === hallKey) : undefined;
    (globalThis as { __HALLENHUELLE_DEBUG?: unknown }).__HALLENHUELLE_DEBUG = {
      hallKey,
      flaechenCount: flaechen.length,
      hallFound: Boolean(hall),
      hallOutdoor: hall?.outdoor,
      hallBaseY: hall?.baseY,
      lage: hall ? hallenlage(hall.footprint) : null,
      matchingHallCount: data.site.halls.filter((h) => h.key === hallKey).length,
    };
  }, [data, hallKey, flaechen]);

  useEffect(
    () => () => {
      flaechen.forEach((f) => f.geometry.dispose());
    },
    [flaechen],
  );

  const surfaces = useMemo(
    () => ({ boden: hallenbodenSurface(), decke: hallendeckeSurface() }),
    [],
  );
  useEffect(
    () => () => {
      disposeSurface(surfaces.boden);
      disposeSurface(surfaces.decke);
    },
    [surfaces],
  );

  const boden = useMemo(
    () => (ROHBAU_PHASE
      ? flachMaterial(FAMILIEN.M03.grundton)
      : familienMaterial(FAMILIEN.M03, undefined, { side: THREE.DoubleSide })),
    [],
  );
  useEffect(
    () => () => {
      // flachMaterial() ist geteilt (Cache in stil.ts), gehoert nicht dieser
      // Instanz -- nur die eigens gebaute familienMaterial()-Fassung wird
      // hier wieder freigegeben.
      if (boden instanceof THREE.MeshToonMaterial) {
        boden.map?.dispose();
        boden.normalMap?.dispose();
        boden.dispose();
      }
    },
    [boden],
  );
  // Rohbau-Phase: eine einzelne Deckenfarbe statt der texturierten Fassung.
  // War hellbeige (#c9c4b8) -- auf den Referenzfotos ist die Decke selbst
  // fast schwarz, das Gitter kaum dunkler als die Flaeche dahinter.
  const decke = useMemo(() => flachMaterial('#111214'), []);

  if (!visible || !flaechen.length) return null;

  return (
    <group>
      {flaechen.map((flaeche) => {
        const surface = surfaces[flaeche.art];
        if (flaeche.art === 'boden') {
          return (
            <mesh key={flaeche.key} geometry={flaeche.geometry} receiveShadow>
              <primitive object={boden} attach="material" />
            </mesh>
          );
        }
        return (
          <mesh key={flaeche.key} geometry={flaeche.geometry}>
            {ROHBAU_PHASE ? (
              <primitive object={decke} attach="material" />
            ) : (
              <meshStandardMaterial
                map={kachel(surface.map)}
                normalMap={kachel(surface.normalMap)}
                roughnessMap={kachel(surface.roughnessMap)}
                emissiveMap={kachel(surface.emissiveMap)}
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
 * Sicherheitsnetz-Wand: eine zweite, aus dem Hallenumriss gebaute Hülle,
 * knapp ausserhalb der amtlichen Aussenkante.
 *
 * Anlass: ein Raycast von der Hallenmitte aus traf in einer gemessenen
 * Blickrichtung nichts -- 1669 m weit, bis zum fernen Gelaende. Die
 * amtlichen LoD2-Pakete (`OfficialWorld`) sind fuer diese Halle auf dieser
 * Seite unvollstaendig: keine Wandflaeche, kein Tor, nichts. Dieselbe Halle
 * hatte auf einer anderen Seite eine korrekt sitzende Wand (Treffer bei
 * exakt der erwarteten Entfernung) -- das Problem ist also nicht das
 * Tiefenmodell oder ein transparentes Material, sondern eine Lücke im
 * amtlichen Datensatz selbst, Seite für Seite unterschiedlich.
 *
 * Diese Wand deckt genau das ab, ohne etwas wegzunehmen: sie steht ein paar
 * Zentimeter ausserhalb der Gebäudekante. Wo die amtliche Wand existiert,
 * liegt sie naeher an der Kamera und gewinnt den Tiefentest -- diese Hülle
 * bleibt unsichtbar dahinter. Nur dort, wo die amtliche Geometrie fehlt,
 * trifft der Blick stattdessen auf sie. Kein Verstecken von Welt, nur ein
 * zweiter Boden unter dem Seiltänzer.
 */
/** Wie weit die Wandflaeche (und alles, was auf ihr sitzt) vor die amtliche Kante tritt. */
const WAND_EPS_M = 0.1;

interface Hallenkante {
  ax: number; ay: number; bx: number; by: number;
  len: number;
  nx: number; ny: number;
  dirX: number; dirY: number;
  /** Rotation um Y, mit der eine Box ihre lokale X-Achse auf die Kantenrichtung legt. */
  drehung: number;
}

/**
 * Die Aussenkanten eines Hallenumrisses, je mit Laenge, nach aussen
 * zeigender Normale und der Y-Rotation, die eine Box entlang der Kante
 * ausrichtet.
 *
 * Gemeinsame Grundlage für `hallenwaendeGeometrie` (die Wandflaeche selbst)
 * und `hallenwandtechnikGeometrie` (die Panel-/Kabelschicht davor) --
 * dieselbe Kante darf nur einmal berechnet werden, sonst laufen beide
 * Schichten irgendwann auseinander.
 */
function hallenkanten(footprint: Placement2D[]): Hallenkante[] {
  if (footprint.length < 3) return [];
  let cx = 0;
  let cy = 0;
  for (const [x, y] of footprint) {
    cx += x;
    cy += y;
  }
  cx /= footprint.length;
  cy /= footprint.length;

  const kanten: Hallenkante[] = [];
  for (let i = 0; i < footprint.length; i += 1) {
    const [ax, ay] = footprint[i];
    const [bx, by] = footprint[(i + 1) % footprint.length];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;

    // Beide moeglichen Normalen einer Kante -- die vom Schwerpunkt weg
    // zeigende ist aussen, unabhaengig vom Umlaufsinn des Polygons.
    let nx = -dy / len;
    let ny = dx / len;
    const midX = (ax + bx) / 2;
    const midY = (ay + by) / 2;
    if ((midX - cx) * nx + (midY - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    kanten.push({
      ax, ay, bx, by, len, nx, ny,
      dirX: dx / len, dirY: dy / len,
      // Dieselbe Zuordnung wie `laengsteKante()` in Ausstattung.tsx: eine
      // Box, deren lokale X-Achse nach `rotateY(drehung)` entlang der
      // Kante zeigt.
      drehung: Math.atan2(-dy, dx),
    });
  }
  return kanten;
}

function hallenwaendeGeometrie(footprint: Placement2D[], baseY: number, hoehe: number) {
  const kanten = hallenkanten(footprint);
  if (!kanten.length) return null;

  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  let laenge = 0;

  for (const { ax, ay, bx, by, len, nx, ny } of kanten) {
    const a: [number, number] = [ax + nx * WAND_EPS_M, ay + ny * WAND_EPS_M];
    const b: [number, number] = [bx + nx * WAND_EPS_M, by + ny * WAND_EPS_M];
    const u0 = laenge;
    const u1 = laenge + len;
    laenge += len;

    // Zwei Dreiecke, Aussenseite nach aussen (Normale = (nx, 0, ny)).
    const quad: [number, number, number, number][] = [
      [a[0], baseY, a[1], u0],
      [b[0], baseY, b[1], u1],
      [b[0], baseY + hoehe, b[1], u1],
      [a[0], baseY + hoehe, a[1], u0],
    ];
    const reihenfolge = [0, 1, 2, 0, 2, 3];
    for (const index of reihenfolge) {
      const [px2, py2, pz2, u] = quad[index];
      positions.push(px2, py2, pz2);
      uvs.push(u / WELT_KACHEL_M.wand, py2 / WELT_KACHEL_M.wand);
      normals.push(nx, 0, ny);
    }
  }

  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

export function Hallenwaende({
  data,
  centre,
  hallKey,
  visible,
}: {
  data: Dataset;
  centre: [number, number];
  hallKey: string | null;
  visible: boolean;
}) {
  const geometry = useMemo(() => {
    const hall = hallKey ? data.hallsByKey.get(hallKey) : null;
    if (!hall || hall.outdoor) return null;
    const hoehe = hall.height?.clearHeightM ?? 8;
    const local = hallenwaendeGeometrie(hall.footprint, hall.baseY, hoehe);
    if (!local) return null;
    // In Szenenkoordinaten verschieben: dieselbe Mitte wie der Rest der Szene.
    const position = local.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      position.setX(i, position.getX(i) - centre[0]);
      position.setZ(i, position.getZ(i) - centre[1]);
    }
    return local;
  }, [data, centre, hallKey]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  const surface = useMemo(() => facadeSurface(true), []);
  useEffect(() => () => disposeSurface(surface), [surface]);

  if (!visible || !geometry) return null;

  return (
    <mesh geometry={geometry} receiveShadow>
      {ROHBAU_PHASE ? (
        // War '#eceae3' -- ein sauberes Creme, das eine reale, lichtschluckende
        // Halle nicht zeigt. `flachMaterial()` ist MeshBasicMaterial, unbeleuchtet:
        // die Waende koennen den "schmutzig grau"-Eindruck aus den Referenzfotos
        // in dieser Phase nicht aus Lichtverhalten gewinnen, nur aus dem Farbwert
        // selbst. FAMILIEN.M01 ist genau dieser Ton -- derselbe, den die Stuetzen
        // schon tragen, statt einer zweiten, unabhaengig gewaehlten Wandfarbe.
        <primitive object={flachMaterial(FAMILIEN.M01.grundton)} attach="material" />
      ) : (
        <meshStandardMaterial
          map={surface.map}
          normalMap={surface.normalMap}
          roughnessMap={surface.roughnessMap}
          color="#eceae3"
          metalness={0.12}
          roughness={0.85}
          // DoubleSide und nicht FrontSide: die Aussennormale einer Kante
          // eines nicht-konvexen Hallenumrisses laesst sich aus dem
          // Flaechenschwerpunkt allein nicht immer zuverlaessig bestimmen --
          // bei einer verwinkelten Kontur kann die Naeherung genau
          // umgekehrt liegen. Als reine Sicherheitswand zaehlt, dass sie
          // *ueberhaupt* blockiert, unabhaengig davon, von welcher Seite der
          // Blick kommt.
          side={THREE.DoubleSide}
        />
      )}
    </mesh>
  );
}

/** Wie tief eine Kabel-/Rohrbox vor die Wand tritt -- schmal, kaum mehr als Relief. */
const WANDTECHNIK_KABEL_TIEFE_M = 0.025;

/**
 * Panels, Kabel und Technikboxen für alle Kanten eines Hallenumrisses, zu
 * einer einzigen Geometrie zusammengeführt.
 *
 * Jede Kante bekommt einen eigenen, aus dem Basis-Seed abgeleiteten Seed --
 * dieselbe Wand wiederholt sich sonst an jeder geraden Hallenseite
 * identisch, und genau das soll "unregelmässig regelmässig" verhindern.
 */
function hallenwandtechnikGeometrie(
  footprint: Placement2D[],
  baseY: number,
  hoehe: number,
  spec: Partial<WandtechnikSpec>,
): THREE.BufferGeometry | null {
  const kanten = hallenkanten(footprint);
  if (!kanten.length) return null;
  const basisSeed = spec.seed ?? WANDTECHNIK_DEFAULT.seed;
  const teile: THREE.BufferGeometry[] = [];

  const box = (
    kante: Hallenkante, uMitte: number, vMitte: number,
    breiteU: number, breiteV: number, tiefe: number,
  ) => {
    const geometrie = new THREE.BoxGeometry(breiteU, breiteV, Math.max(tiefe, 0.005));
    geometrie.rotateY(kante.drehung);
    geometrie.translate(
      kante.ax + kante.dirX * uMitte + kante.nx * (WAND_EPS_M + tiefe / 2),
      baseY + vMitte,
      kante.ay + kante.dirY * uMitte + kante.ny * (WAND_EPS_M + tiefe / 2),
    );
    teile.push(geometrie);
  };

  kanten.forEach((kante, edgeIndex) => {
    const seed = (basisSeed * 97 + edgeIndex * 131) >>> 0;
    const { panels, kabel, boxen } = wandtechnik(kante.len, hoehe, { ...spec, seed });

    for (const p of panels) box(kante, p.u, p.v, p.breiteU, p.breiteV, p.tiefe);
    for (const b of boxen) box(kante, b.u, b.v, b.breite, b.hoehe, b.tiefe);
    for (const k of kabel) {
      for (let i = 0; i < k.punkte.length - 1; i += 1) {
        const [u0, v0] = k.punkte[i];
        const [u1, v1] = k.punkte[i + 1];
        box(
          kante, (u0 + u1) / 2, (v0 + v1) / 2,
          Math.max(Math.abs(u1 - u0), k.dicke), Math.max(Math.abs(v1 - v0), k.dicke),
          WANDTECHNIK_KABEL_TIEFE_M,
        );
      }
    }
  });

  if (!teile.length) return null;
  const geometry = mergeGeometries(teile, false);
  teile.forEach((teil) => teil.dispose());
  return geometry;
}

/**
 * Die technische Detailschicht vor der Hallenwand: Panelfelder, Kabel,
 * Technikboxen -- siehe `wandtechnik.ts` für die Planung dahinter.
 *
 * Bewusst kein `ROHBAU_PHASE`-Unterschied wie bei `Hallenwaende`: die
 * Stilbibel will die Wandtextur selbst langweilig halten und die Atmosphäre
 * aus Panel-Geometrie, Kontur, Kabeln und gebackenem Licht ziehen -- ein
 * `flachMaterial()` ist hier keine Verkürzung für die spätere Fassung,
 * sondern bereits die Zielausführung.
 */
export function Hallenwandtechnik({
  data,
  centre,
  hallKey,
  visible,
  spec,
}: {
  data: Dataset;
  centre: [number, number];
  hallKey: string | null;
  visible: boolean;
  spec?: Partial<WandtechnikSpec>;
}) {
  const geometry = useMemo(() => {
    const hall = hallKey ? data.hallsByKey.get(hallKey) : null;
    if (!hall || hall.outdoor) return null;
    const hoehe = hall.height?.clearHeightM ?? 8;
    const local = hallenwandtechnikGeometrie(hall.footprint, hall.baseY, hoehe, spec ?? {});
    if (!local) return null;
    const position = local.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      position.setX(i, position.getX(i) - centre[0]);
      position.setZ(i, position.getZ(i) - centre[1]);
    }
    return local;
  }, [data, centre, hallKey, spec]);

  useEffect(() => () => geometry?.dispose(), [geometry]);

  const material = useMemo(() => flachMaterial(FAMILIEN.M02.grundton), []);

  if (!visible || !geometry) return null;

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <primitive object={material} attach="material" />
      </mesh>
      <Kontur geometry={geometry} staerke={konturStaerke(FAMILIEN.M02.kontur)} />
    </group>
  );
}

function leuchtenreihen(lage: Lage) {
  const { querAchsen, reihenAbstand, px, py } = saeulenraster(lage);
  const laenge = lage.laenge * 0.94;
  const grenzen = [-lage.breite / 2, ...querAchsen, lage.breite / 2];
  const bahnen: {
    quer: number;
    laenge: number;
    px: number;
    py: number;
  }[] = [];

  for (let feld = 0; feld < grenzen.length - 1; feld += 1) {
    const von = grenzen[feld];
    for (const versatz of bahnenImFeld(reihenAbstand)) {
      bahnen.push({ quer: von + versatz, laenge, px, py });
    }
  }
  return bahnen;
}

export function hallenGrundriss(
  data: Dataset,
  aussparungen: { x: number; y: number }[] = [],
) {
  const out: {
    key: string;
    umriss: [number, number][];
    saeulen: { x: number; y: number }[];
    reihen: number;
    baender: number;
    breite: number;
    querAchsen: number[];
    profil: { breite: number; kragen: number };
    aufbau: ReturnType<typeof hallenAufbau>;
    bahnen: number[];
  }[] = [];

  for (const hall of data.site.halls) {
    if (hall.outdoor) continue;
    const lage = hallenlage(hall.footprint);
    if (!lage || lage.laenge < 20 || lage.breite < 20) continue;

    const { positionen } = saeulenraster(
      lage,
      aussparungen,
      stuetzenSpec(hall.key),
    );
    const hl = lage.laenge / 2;
    const hb = lage.breite / 2;
    const ecke = (u: number, v: number): [number, number] => [
      lage.mx + u * lage.tx + v * lage.px,
      lage.my + u * lage.ty + v * lage.py,
    ];

    out.push({
      key: hall.key,
      umriss: [
        ecke(-hl, -hb),
        ecke(hl, -hb),
        ecke(hl, hb),
        ecke(-hl, hb),
      ],
      saeulen: positionen,
      reihen: PFEILERREIHEN_QUER,
      baender: PFEILERREIHEN_QUER + 1,
      breite: lage.breite,
      querAchsen: saeulenraster(lage, [], stuetzenSpec(hall.key)).querAchsen,
      profil: { breite: SAEULEN_BREITE_M, kragen: SOCKEL_KRAGEN_M },
      aufbau: hallenAufbau(hall.baseY, hall.height?.clearHeightM ?? 8),
      bahnen: leuchtenreihen(lage).map((r) => r.quer),
    });
  }

  return out;
}

export function Hallenstuetzen({
  data,
  centre,
  hallKey,
  visible,
}: {
  data: Dataset;
  centre: [number, number];
  hallKey: string | null;
  visible: boolean;
}) {
  const aussparungen = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (const node of data.graph.nodes.values()) {
      if (node.kind !== 'vertical') continue;
      out.push({ x: node.x, y: node.y });
    }
    return out;
  }, [data]);

  useEffect(() => {
    if (!PLAN_ANSICHT) return;
    const global = globalThis as { __GRUNDRISS?: unknown };
    global.__GRUNDRISS = () => hallenGrundriss(data, aussparungen);
    return () => {
      delete global.__GRUNDRISS;
    };
  }, [data, aussparungen]);

  const { schaefte, sockel, huelleGeometrie } = useMemo(() => {
    const schaefte: THREE.Matrix4[] = [];
    const sockel: THREE.Matrix4[] = [];
    const huellenTeile: THREE.BufferGeometry[] = [];
    const dummy = new THREE.Object3D();

    for (const hall of data.site.halls) {
      if (hall.key !== hallKey) continue;
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;
      const hoehe = hall.height?.clearHeightM ?? 8;
      const { positionen } = saeulenraster(
        lage,
        aussparungen,
        stuetzenSpec(hall.key),
      );
      const aufbau = hallenAufbau(hall.baseY, hoehe);

      for (const p of positionen) {
        const sx = p.x - centre[0];
        const sz = p.y - centre[1];
        dummy.rotation.set(0, lage.winkel, 0);

        dummy.position.set(
          sx,
          (aufbau.schaftVon + aufbau.schaftBis) / 2,
          sz,
        );
        dummy.scale.set(
          SAEULEN_BREITE_M,
          aufbau.schaftBis - aufbau.schaftVon,
          SAEULEN_TIEFE_M,
        );
        dummy.updateMatrix();
        schaefte.push(dummy.matrix.clone());
        // Fuer die Kontur: dieselbe Box, direkt in Weltkoordinaten gebacken
        // (statt per Instanzmatrix skaliert) -- `Kontur` blaest sie im
        // Vertex-Shader entlang ihrer eigenen Normalen auf, und das braucht
        // eine einzelne zusammenhaengende Geometrie, keine Instanzen.
        huellenTeile.push(new THREE.BoxGeometry(1, 1, 1).applyMatrix4(dummy.matrix));

        for (const [von, bis] of [aufbau.sockelUnten, aufbau.sockelOben]) {
          dummy.position.set(sx, (von + bis) / 2, sz);
          dummy.scale.set(
            SAEULEN_BREITE_M + 2 * SOCKEL_KRAGEN_M,
            SOCKEL_HOEHE_M,
            SAEULEN_TIEFE_M + 2 * SOCKEL_KRAGEN_M,
          );
          dummy.updateMatrix();
          sockel.push(dummy.matrix.clone());
          huellenTeile.push(new THREE.BoxGeometry(1, 1, 1).applyMatrix4(dummy.matrix));
        }
      }
    }

    let huelleGeometrie: THREE.BufferGeometry | null = null;
    if (huellenTeile.length) {
      huelleGeometrie = mergeGeometries(huellenTeile, false);
      huellenTeile.forEach((teil) => teil.dispose());
    }

    return { schaefte, sockel, huelleGeometrie };
  }, [data, centre, hallKey, aussparungen]);

  const material = useMemo(
    () => (ROHBAU_PHASE
      // Halle 10 zeigt auf den Referenzfotos helle, nicht dunkle Stuetzen --
      // M01 (WALL_LIGHT) statt der dunklen M02-Grundfarbe.
      ? flachMaterial(FAMILIEN.M01.grundton)
      : toonMaterial({ ...FAMILIEN.M02, grundton: '#3c4048', stufen: 3 })),
    [],
  );

  useEffect(() => () => {
    huelleGeometrie?.dispose();
  }, [huelleGeometrie]);

  const setzeMatrizen = (
    mesh: THREE.InstancedMesh | null,
    quelle: THREE.Matrix4[],
  ) => {
    if (!mesh) return;
    quelle.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  if (!visible || !schaefte.length) return null;

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
      {huelleGeometrie && (
        <Kontur geometry={huelleGeometrie} staerke={konturStaerke(FAMILIEN.M02.kontur)} />
      )}
    </group>
  );
}

const LICHT_HOEHE_M = 8.6;
// War 4x3 = 12 Punktlichter je Halle, jedes mit unbegrenzter Reichweite
// (distance=0). Three.js filtert Lichter nicht nach Distanz aus dem
// Fragment-Shader jedes Objekts -- alle aktiven Lichter der Szene stecken in
// jedem beleuchteten Pixel, egal wie weit weg. 12 davon gleichzeitig war im
// Ego-Modus einer der Haupttreiber der Framezeit. 3x2 = 6 halbiert die
// Schleife, ohne die "klare helle Inseln statt Flaechenlicht"-Optik zu
// verlieren -- eher im Gegenteil, die Inseln liegen jetzt weiter auseinander.
const LICHT_LAENGS = 3;
const LICHT_QUER = 2;

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
      const laengs =
        ((i + 0.5) / LICHT_LAENGS - 0.5) * lage.laenge * 0.88;
      for (let k = 0; k < LICHT_QUER; k += 1) {
        const quer =
          ((k + 0.5) / LICHT_QUER - 0.5) * lage.breite * 0.82;
        const x = lage.mx + ux * laengs - uy * quer;
        const y = lage.my + uy * laengs + ux * quer;
        const lichtHoehe = Math.min(
          LICHT_HOEHE_M,
          (hall.height?.clearHeightM ?? 8) - 1,
        );
        out.push([x - centre[0], hall.baseY + lichtHoehe, y - centre[1]]);
      }
    }

    return out;
  }, [data, centre, hallKey]);

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
      position: [
        mitte[0] + 26,
        mitte[1] + 90,
        mitte[2] + 16,
      ] as [number, number, number],
      spanne: Math.max(lage.laenge, lage.breite) * 0.62,
    };
  }, [data, centre, hallKey]);

  const ziel = useMemo(() => new THREE.Object3D(), []);
  const sonne = useRef<THREE.DirectionalLight>(null);

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
            intensity={0.55}
            color="#fff4e2"
            // 2048/Radius 5 war fuer eine einzelne Ersatz-Sonne in einer
            // Halle unnoetig teuer -- ein Shadow-Map-Depth-Pass in Software
            // (SwiftShader) mit weichem PCF-Kernel skaliert brutal mit
            // Aufloesung x Radius. 1024/2 bleibt fuer eine Halle scharf
            // genug und kostet einen Bruchteil.
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-schatten.spanne}
            shadow-camera-right={schatten.spanne}
            shadow-camera-top={schatten.spanne}
            shadow-camera-bottom={-schatten.spanne}
            shadow-camera-near={1}
            shadow-camera-far={240}
            shadow-bias={-0.0004}
            shadow-normalBias={0.45}
            shadow-radius={2}
          />
        </>
      )}
      {lampen.map((position, index) => (
        <pointLight
          key={index}
          position={position}
          color="#fff3dc"
          // War 38: ein Wert aus einer Zeit vor physikalisch korrekter
          // Beleuchtung. Seit three.js r155 ist `intensity` bei Punkt-/
          // Spotlichtern Candela, nicht mehr ein freier Multiplikator --
          // derselbe Code wurde damit um Grössenordnungen dunkler, ohne dass
          // sich eine Zeile daran geändert hätte. Bestätigt am gebauten
          // Stand: der Boden blieb schwarz, auch direkt unter einer Leuchte.
          intensity={1200}
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
  hallKey,
  visible,
}: {
  data: Dataset;
  centre: [number, number];
  hallKey: string | null;
  visible: boolean;
}) {
  const { strips, gehaeuse } = useMemo(() => {
    const strips: THREE.Matrix4[] = [];
    const gehaeuse: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();

    for (const hall of data.site.halls) {
      if (hall.key !== hallKey) continue;
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;

      const hoehe = hall.height?.clearHeightM ?? 8;
      const aufbau = hallenAufbau(hall.baseY, hoehe);
      const lichtY = (aufbau.band[0] + aufbau.band[1]) / 2;

      for (const reihe of leuchtenreihen(lage)) {
        const x = lage.mx + reihe.px * reihe.quer;
        const y = lage.my + reihe.py * reihe.quer;

        dummy.position.set(x - centre[0], lichtY, y - centre[1]);
        dummy.rotation.set(0, lage.winkel, 0);
        dummy.scale.set(
          reihe.laenge,
          STRIP_THICKNESS_M,
          STRIP_WIDTH_M,
        );
        dummy.updateMatrix();
        strips.push(dummy.matrix.clone());

        dummy.position.set(
          x - centre[0],
          (aufbau.fassung[0] + aufbau.fassung[1]) / 2,
          y - centre[1],
        );
        dummy.scale.set(
          reihe.laenge * 1.01,
          aufbau.fassung[1] - aufbau.fassung[0],
          STRIP_WIDTH_M * 1.5,
        );
        dummy.updateMatrix();
        gehaeuse.push(dummy.matrix.clone());
      }
    }

    return { strips, gehaeuse };
  }, [data, centre, hallKey]);

  const gehaeuseMaterial = useMemo(() => toonMaterial(FAMILIEN.M02), []);

  const setzeMatrizen = (
    mesh: THREE.InstancedMesh | null,
    quelle: THREE.Matrix4[],
  ) => {
    if (!mesh) return;
    quelle.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  };

  if (!strips.length) return null;

  return (
    <group visible={visible}>
      <instancedMesh
        ref={(mesh) => setzeMatrizen(mesh, gehaeuse)}
        args={[undefined, undefined, gehaeuse.length]}
        material={gehaeuseMaterial}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={(mesh) => setzeMatrizen(mesh, strips)}
        args={[undefined, undefined, strips.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
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

let scheinTexturCache: THREE.CanvasTexture | null = null;

function scheinTextur(): THREE.CanvasTexture {
  if (scheinTexturCache) return scheinTexturCache;

  const size = 256;
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  const ctx = element.getContext('2d')!;
  const mitte = size / 2;
  const verlauf = ctx.createLinearGradient(
    0,
    mitte - size * 0.4,
    0,
    mitte + size * 0.4,
  );
  verlauf.addColorStop(0, 'rgba(0,0,0,0)');
  verlauf.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  verlauf.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = verlauf;
  ctx.fillRect(0, 0, size, size);

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
  hallKey,
  visible,
}: {
  data: Dataset;
  centre: [number, number];
  hallKey: string | null;
  visible: boolean;
}) {
  const flaechen = useMemo(() => {
    const out: {
      key: string;
      position: [number, number, number];
      drehung: number;
      laenge: number;
    }[] = [];

    for (const hall of data.site.halls) {
      if (hall.key !== hallKey) continue;
      if (hall.outdoor) continue;
      const lage = hallenlage(hall.footprint);
      if (!lage || lage.laenge < 20 || lage.breite < 20) continue;

      leuchtenreihen(lage).forEach((reihe, index) => {
        const x = lage.mx + reihe.px * reihe.quer;
        const y = lage.my + reihe.py * reihe.quer;
        out.push({
          key: `${hall.key}-schein${index}`,
          position: [x - centre[0], hall.baseY + 0.03, y - centre[1]],
          drehung: lage.winkel,
          laenge: reihe.laenge,
        });
      });
    }

    return out;
  }, [data, centre, hallKey]);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: scheinTextur(),
        color: '#ffdfa8',
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );

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
