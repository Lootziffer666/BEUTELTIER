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
        return [createGeneratedStageObject(spec)];
      } catch (cause) {
        console.warn(
          `[ProceduralStaging] ${spec.generator} konnte nicht erzeugt werden`,
          cause,
        );
        return [];
      }
    });

    const plan = prepareStageRenderPlan(objects);

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
