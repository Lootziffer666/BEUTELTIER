import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import type { Dataset } from '../data/load';
import type { CameraPreset } from './SiteScene';
import { prepareStageRenderPlan, type StageBatch } from './batching';
import { createGeneratedStageObject } from './generatorAdapter';
import { createStageSpecs } from './stageSpec';

interface PreparedStage {
  objects: ReturnType<typeof createGeneratedStageObject>[];
  batches: StageBatch[];
  singles: THREE.Object3D[];
  // DEBUG (temporär, siehe Diagnoseanfrage): eine sichtbare BoundingBox je
  // erzeugtem Root, unabhängig von dessen Material/Sichtbarkeit.
  debugBoxes: THREE.Box3Helper[];
}

// DEBUG (temporär): geteilte Geometrie/Material für den grellen Marker --
// eine Instanz für alle Roots, kein Pro-Objekt-Leck.
const DEBUG_MARKER_GEOMETRY = new THREE.SphereGeometry(0.3);
const DEBUG_MARKER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xff00ff });

function addDebugMarker(root: THREE.Group): void {
  const helper = new THREE.Mesh(DEBUG_MARKER_GEOMETRY, DEBUG_MARKER_MATERIAL);
  helper.position.y = 1;
  helper.userData.noBatch = true;
  helper.userData.debugMarker = true;
  root.add(helper);
}

// DEBUG (temporär): BoundingBox in Weltkoordinaten -- root.updateMatrixWorld
// lief in createGeneratedStageObject bereits ohne Elternobjekt, die äußere
// Staging-Gruppe hat selbst keine eigene Transformation, daher deckungsgleich
// mit der späteren tatsächlichen Position.
function createDebugBox(root: THREE.Group): THREE.Box3Helper {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) {
    box.setFromCenterAndSize(root.position, new THREE.Vector3(0.5, 0.5, 0.5));
  }
  return new THREE.Box3Helper(box, new THREE.Color(0xff00ff));
}

function disposePlan(plan: PreparedStage): void {
  plan.objects.forEach((object) => object.dispose());
  plan.debugBoxes.forEach((helper) => {
    helper.geometry.dispose();
    (helper.material as THREE.Material).dispose();
  });
  plan.batches.length = 0;
  plan.singles.length = 0;
  plan.debugBoxes.length = 0;
}

function InstancedStageBatch({ batch }: { batch: StageBatch }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const current = mesh.current;
    if (!current) return;

    batch.matrices.forEach((matrix, index) => {
      current.setMatrixAt(index, matrix);
    });

    current.instanceMatrix.needsUpdate = true;
    current.computeBoundingSphere();
  }, [batch]);

  return (
    <instancedMesh
      ref={mesh}
      args={[batch.geometry, batch.material, batch.matrices.length]}
      castShadow={batch.castShadow}
      receiveShadow={batch.receiveShadow}
      dispose={null}
    />
  );
}

function R3FStageUpdates({
  objects,
}: {
  objects: readonly ReturnType<typeof createGeneratedStageObject>[];
}) {
  useFrame((state, delta) => {
    objects.forEach((object) => {
      if (object.updateMode !== 'r3f') return;

      const update = object.root.userData.r3fUpdate as
        | ((time: number, deltaSeconds: number) => void)
        | undefined;

      update?.(state.clock.elapsedTime, delta);
    });
  });

  return null;
}

export function ProceduralStaging({
  data,
  centre,
  preset,
  focusHallKey,
  enabled = true,
  maxItems,
  onObjectCount,
}: {
  data: Dataset;
  centre: [number, number];
  preset: CameraPreset;
  focusHallKey: string | null;
  enabled?: boolean;
  maxItems?: number;
  /** Meldet, wie viele Staging-Objekte tatsächlich im Renderplan stehen --
   * die Karte zeigt den Inszenierungs-Hinweis nur, wenn das > 0 ist. */
  onObjectCount?: (count: number) => void;
}) {
  const stagingVisible =
    enabled &&
    Boolean(focusHallKey) &&
    (preset === 'halle' || preset === 'ego');

  const prepared = useMemo<PreparedStage>(() => {
    if (!stagingVisible) {
      return {
        objects: [],
        batches: [],
        singles: [],
        debugBoxes: [],
      };
    }

    const specs = createStageSpecs({
      data,
      centre,
      preset,
      focusHallKey,
      maxItems,
    });

    const objects = specs.flatMap((spec) => {
      try {
        const object = createGeneratedStageObject(spec);
        // DEBUG (temporär): grelle Markierung, damit sichtbar ist, ob
        // überhaupt ein Root an der erwarteten Position landet.
        addDebugMarker(object.root);
        return [object];
      } catch (cause) {
        console.warn(
          `[ProceduralStaging] ${spec.generator} konnte nicht erzeugt werden`,
          cause,
        );
        return [];
      }
    });

    // DEBUG (temporär, siehe Diagnoseanfrage): sichtbare Zusammenfassung.
    // JSON.stringify statt Objekt-Log, damit Playwright/DevTools nicht auf
    // "Array(N)" kürzen.
    // eslint-disable-next-line no-console
    console.log('[ProceduralStaging][DEBUG] Generatorobjekte ' + JSON.stringify({
      hallKey: focusHallKey,
      angefragteStageSpecs: specs.length,
      erfolgreicheGeneratorobjekte: objects.length,
      fehlgeschlagen: specs.length - objects.length,
      rootPositionen: objects.map((object) => ({
        id: object.id,
        position: object.root.position.toArray(),
      })),
    }));

    // DEBUG (temporär, siehe Diagnoseanfrage): sichtbare BoundingBox je
    // Root, unabhängig davon, ob die Generatorgeometrie selbst sichtbar ist.
    const debugBoxes = objects.map((object) => createDebugBox(object.root));

    const plan = prepareStageRenderPlan(objects);

    // eslint-disable-next-line no-console
    console.log('[ProceduralStaging][DEBUG] Renderplan', {
      hallKey: focusHallKey,
      batches: plan.batches.length,
      singles: plan.singles.length,
    });

    return {
      objects,
      batches: plan.batches,
      singles: plan.singles,
      debugBoxes,
    };
  }, [
    stagingVisible,
    data,
    centre,
    preset,
    focusHallKey,
    maxItems,
  ]);

  useEffect(
    () => () => {
      disposePlan(prepared);
    },
    [prepared],
  );

  useEffect(() => {
    onObjectCount?.(prepared.objects.length);
  }, [prepared, onObjectCount]);

  if (!stagingVisible) return null;

  return (
    <group
      name="procedural-staging"
      userData={{
        layer: 'procedural-staging',
        classification: 'fictional',
        collision: false,
        hallKey: focusHallKey,
      }}
    >
      <R3FStageUpdates objects={prepared.objects} />

      {prepared.batches.map((batch) => (
        <InstancedStageBatch key={batch.id} batch={batch} />
      ))}

      {prepared.singles.map((object) => (
        <primitive
          key={object.userData.stageId ?? object.uuid}
          object={object}
          dispose={null}
        />
      ))}

      {prepared.debugBoxes.map((helper, index) => (
        <primitive key={`debug-box-${index}`} object={helper} dispose={null} />
      ))}
    </group>
  );
}
