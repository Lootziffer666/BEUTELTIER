/**
 * Reale, gelieferte Standkörper (siehe `customStands.ts`) als GLB statt
 * prozeduralem Platzhalter.
 *
 * Die Originalgröße einer Lieferdatei ist unbekannt -- sie kommt aus einem
 * fremden Autorenwerkzeug mit eigenem Massstab und eigenem Pivot. Deshalb
 * wird hier nichts angenommen: `THREE.Box3` vermisst das geladene Modell
 * nach dem Laden, skaliert es gleichmässig auf die reale Standfläche
 * (`rechteck()` aus `Markenstaende.tsx`, dieselbe Rechnung wie für die
 * Markenkörper) und hebt es so an, dass seine tiefste Kante exakt auf dem
 * Standboden steht, nicht auf dem Ursprung der Lieferdatei.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';

import type { Dataset } from '../data/load';
import { toScene } from './geometry';
import { rechteck } from './Markenstaende';
import { CUSTOM_STAND_MODELS } from './customStands';

const Y_ACHSE = new THREE.Vector3(0, 1, 0);
/** Rand zu den Standgrenzen, damit ein 1:1 vermessenes Modell nicht in den
 *  Nachbarstand hineinskaliert wird. */
const RANDFAKTOR = 0.92;

function CustomStandModel({
  url,
  mx,
  my,
  winkel,
  breite,
  tiefe,
  baseY,
  centre,
}: {
  url: string;
  mx: number;
  my: number;
  winkel: number;
  breite: number;
  tiefe: number;
  baseY: number;
  centre: [number, number];
}) {
  const { scene } = useGLTF(url);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    const roh = new THREE.Box3().setFromObject(clone);
    const groesse = roh.getSize(new THREE.Vector3());
    const scale =
      groesse.x > 0 && groesse.z > 0
        ? Math.min((breite * RANDFAKTOR) / groesse.x, (tiefe * RANDFAKTOR) / groesse.z)
        : 1;
    clone.scale.setScalar(scale);
    clone.updateMatrixWorld(true);

    const skaliert = new THREE.Box3().setFromObject(clone);
    const mitte = skaliert.getCenter(new THREE.Vector3());
    // Bodenhöhe (min.y) auf den Standboden heben -- siehe Modulkommentar.
    const liftY = -skaliert.min.y;

    // Der Standmittelpunkt liegt in Weltkoordinaten fest; das Modell selbst
    // wird um seine eigene (Boden-)Mitte gedreht. Der Versatz zwischen
    // Lieferursprung und Bounding-Box-Mitte muss deshalb mitgedreht werden,
    // sonst wandert das Modell bei jedem Winkel != 0 aus der Standmitte.
    const versatz = new THREE.Vector3(mitte.x, 0, mitte.z).applyAxisAngle(Y_ACHSE, winkel);
    const ziel = toScene(mx, my, baseY, centre);
    clone.position.set(ziel.x - versatz.x, ziel.y + liftY, ziel.z - versatz.z);
    clone.rotation.set(0, winkel, 0);
    return clone;
  }, [scene, breite, tiefe, mx, my, winkel, baseY, centre]);

  return <primitive object={model} />;
}

export function CustomStandModels({
  data,
  centre,
}: {
  data: Dataset;
  centre: [number, number];
}) {
  const stands = useMemo(
    () => new Map(data.site.stands.map((stand) => [stand.id, stand])),
    [data],
  );

  const eintraege = useMemo(
    () =>
      Object.entries(CUSTOM_STAND_MODELS)
        .map(([standId, entry]) => {
          const stand = stands.get(standId);
          if (!stand) return null;
          const r = rechteck(stand.polygon);
          if (!r) return null;
          return { standId, url: entry.url, stand, r };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null),
    [stands],
  );

  return (
    <>
      {eintraege.map(({ standId, url, stand, r }) => (
        <CustomStandModel
          key={standId}
          url={`${import.meta.env.BASE_URL}${url}`}
          mx={r.mx}
          my={r.my}
          winkel={r.winkel}
          breite={r.breite}
          tiefe={r.tiefe}
          baseY={stand.baseY}
          centre={centre}
        />
      ))}
    </>
  );
}
