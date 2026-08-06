import * as THREE from 'three';

import type { GeneratedStageObject } from './generatorAdapter';

export interface StageBatch {
  id: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrices: THREE.Matrix4[];
  castShadow: boolean;
  receiveShadow: boolean;
}

export interface StageRenderPlan {
  batches: StageBatch[];
  singles: THREE.Object3D[];
}

function hasTexture(material: THREE.Material): boolean {
  const record = material as unknown as Record<string, unknown>;

  return [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'emissiveMap',
    'alphaMap',
    'aoMap',
    'bumpMap',
    'displacementMap',
  ].some((key) => record[key] instanceof THREE.Texture);
}

function eligible(mesh: THREE.Mesh): boolean {
  return (
    mesh.visible &&
    mesh.children.length === 0 &&
    !Array.isArray(mesh.material) &&
    !mesh.morphTargetInfluences &&
    !hasTexture(mesh.material) &&
    mesh.userData.noBatch !== true &&
    mesh.userData.batchPolicy !== 'never'
  );
}

function hasRenderable(root: THREE.Object3D): boolean {
  let result = false;

  root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.visible) result = true;
  });

  return result;
}

export function prepareStageRenderPlan(
  objects: readonly GeneratedStageObject[],
): StageRenderPlan {
  const candidates = new Map<
    string,
    Array<{ mesh: THREE.Mesh; matrix: THREE.Matrix4 }>
  >();

  for (const object of objects) {
    object.root.updateMatrixWorld(true);

    object.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !eligible(node)) return;

      const material = node.material as THREE.Material;
      const key = `${node.geometry.uuid}:${material.uuid}`;
      const entries = candidates.get(key) ?? [];

      entries.push({
        mesh: node,
        matrix: node.matrixWorld.clone(),
      });

      candidates.set(key, entries);
    });
  }

  const batches: StageBatch[] = [];

  for (const [id, entries] of candidates) {
    if (entries.length < 2) continue;

    const first = entries[0].mesh;

    batches.push({
      id,
      geometry: first.geometry,
      material: first.material as THREE.Material,
      matrices: entries.map((entry) => entry.matrix),
      castShadow: entries.some((entry) => entry.mesh.castShadow),
      receiveShadow: entries.some((entry) => entry.mesh.receiveShadow),
    });

    entries.forEach((entry) => entry.mesh.parent?.remove(entry.mesh));
  }

  return {
    batches,
    singles: objects
      .map((object) => object.root)
      .filter(hasRenderable),
  };
}
