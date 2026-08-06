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
}

// DEBUG (temporär, siehe Diagnoseanfrage): geteilte Geometrie/Material für
// den grellen Marker -- eine Instanz für alle Roots, kein Pro-Objekt-Leck.
const DEBUG_MARKER_GEOMETRY = new THREE.SphereGeometry(0.3);
const DEBUG_MARKER_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xff00ff });

function addDebugMarker(root: THREE.Group): void {
  const helper = new THREE.Mesh(DEBUG_MARKER_GEOMETRY, DEBUG_MARKER_MATERIAL);
  helper.position.y = 1;
  helper.userData.noBatch = true;
  helper.userData.debugMarker = true;
  root.add(helper);
}

function disposePlan(plan: PreparedStage): void {
  plan.objects.forEach((object) => object.dispose());
  plan.batches.length = 0;
  plan.singles.length = 0;
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
}: {
  data: Dataset;
  centre: [number, number];
  preset: CameraPreset;
  focusHallKey: string | null;
  enabled?: boolean;
  maxItems?: number;
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
    // eslint-disable-next-line no-console
    console.log('[ProceduralStaging][DEBUG] Generatorobjekte', {
      hallKey: focusHallKey,
      angefragteStageSpecs: specs.length,
      erfolgreicheGeneratorobjekte: objects.length,
      fehlgeschlagen: specs.length - objects.length,
      rootPositionen: objects.map((object) => ({
        id: object.id,
        position: object.root.position.toArray(),
      })),
    });

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
    </group>
  );
}
