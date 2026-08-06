import * as THREE from 'three';

import { materials } from '../procedural/materials/KoelnmesseMaterials.js';
import { generatorDefinition } from './generatorRegistry';
import type { StageSpec } from './stageSpec';

const TEXTURE_SLOTS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
] as const;

type UpdateMode = 'static' | 'r3f';

type MaterialRegistryInternals = {
  cache: Map<string, THREE.Material>;
};

interface OwnedResources {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  textures: Set<THREE.Texture>;
}

export interface GeneratedStageObject {
  id: string;
  root: THREE.Group;
  updateMode: UpdateMode;
  dispose(): void;
}

function texturesOf(material: THREE.Material): THREE.Texture[] {
  const record = material as unknown as Record<string, unknown>;

  return TEXTURE_SLOTS.flatMap((slot) => {
    const value = record[slot];
    return value instanceof THREE.Texture ? [value] : [];
  });
}

function isCanvasTexture(texture: THREE.Texture): boolean {
  return texture instanceof THREE.CanvasTexture;
}

const materialCache = (
  materials as unknown as MaterialRegistryInternals
).cache;

const GLOBAL_MATERIALS = new Set<THREE.Material>(
  materialCache.values(),
);

const GLOBAL_TEXTURES = new Set<THREE.Texture>(
  [...GLOBAL_MATERIALS].flatMap(texturesOf),
);

function addOwnedMaterial(
  material: THREE.Material,
  owned: OwnedResources,
  globalTextures: ReadonlySet<THREE.Texture>,
): void {
  owned.materials.add(material);

  texturesOf(material).forEach((texture) => {
    if (isCanvasTexture(texture) && !globalTextures.has(texture)) {
      owned.textures.add(texture);
    }
  });
}

function cloneGlobalMaterial(
  source: THREE.Material,
  clones: Map<THREE.Material, THREE.Material>,
  owned: OwnedResources,
): THREE.Material {
  const existing = clones.get(source);
  if (existing) return existing;

  const clone = source.clone();
  clones.set(source, clone);
  addOwnedMaterial(clone, owned, GLOBAL_TEXTURES);

  return clone;
}

function adoptMaterials(
  root: THREE.Object3D,
  clones: Map<THREE.Material, THREE.Material>,
  owned: OwnedResources,
): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;

    const sources = Array.isArray(node.material)
      ? node.material
      : [node.material];

    const adopted = sources.map((source) => {
      if (GLOBAL_MATERIALS.has(source)) {
        return cloneGlobalMaterial(source, clones, owned);
      }

      addOwnedMaterial(source, owned, GLOBAL_TEXTURES);
      return source;
    });

    node.material = Array.isArray(node.material) ? adopted : adopted[0];
  });
}

function ownGeometries(
  root: THREE.Object3D,
  owned: OwnedResources,
): void {
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      owned.geometries.add(node.geometry);
    }
  });
}

function removeUnsupportedNodes(
  root: THREE.Object3D,
  materialClones: Map<THREE.Material, THREE.Material>,
  owned: OwnedResources,
): void {
  const removed = new Set<THREE.Object3D>();

  root.traverse((node) => {
    if (node instanceof THREE.Light) {
      removed.add(node);

      if (node instanceof THREE.SpotLight && node.target.parent) {
        removed.add(node.target);
      }

      return;
    }

    if (node.userData.isCollider === true) {
      removed.add(node);
    }
  });

  removed.forEach((node) => {
    ownGeometries(node, owned);
    adoptMaterials(node, materialClones, owned);
    node.parent?.remove(node);
  });

  delete root.userData.light;
}

function disposeOwnedResources(owned: OwnedResources): void {
  owned.geometries.forEach((geometry) => geometry.dispose());
  owned.materials.forEach((material) => material.dispose());
  owned.textures.forEach((texture) => texture.dispose());

  owned.geometries.clear();
  owned.materials.clear();
  owned.textures.clear();
}

function takeR3FUpdate(
  generated: THREE.Object3D,
  updateMode: UpdateMode,
): ((time: number, delta: number) => void) | undefined {
  if (updateMode !== 'r3f') return undefined;

  const update = generated.userData.update;

  return typeof update === 'function'
    ? (time, delta) => update(time, delta)
    : undefined;
}

export function createGeneratedStageObject(
  spec: StageSpec,
): GeneratedStageObject {
  const definition = generatorDefinition(spec.generator);
  const owned: OwnedResources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };
  const materialClones = new Map<THREE.Material, THREE.Material>();

  const generated = definition.factory(spec.params as never);
  const r3fUpdate = takeR3FUpdate(generated, definition.updateMode);

  removeUnsupportedNodes(generated, materialClones, owned);
  adoptMaterials(generated, materialClones, owned);
  ownGeometries(generated, owned);

  generated.traverse((node) => {
    node.userData.layer = 'procedural-staging';
    node.userData.classification = 'fictional';
    node.userData.collision = false;
    node.userData.generator = spec.generator;
    node.userData.stageId = spec.id;

    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      node.userData.batchPolicy = definition.batch;
    }
  });

  const root = new THREE.Group();
  root.name = `procedural-stage:${spec.generator}`;
  root.position.set(...spec.position);
  root.rotation.y = spec.rotationY;
  root.scale.setScalar(spec.scale);
  root.userData = {
    layer: 'procedural-staging',
    classification: 'fictional',
    collision: false,
    generator: spec.generator,
    stageId: spec.id,
    hallKey: spec.hallKey,
    standId: spec.standId,
    updateMode: definition.updateMode,
    r3fUpdate,
  };

  root.add(generated);
  root.updateMatrixWorld(true);

  let disposed = false;

  return {
    id: spec.id,
    root,
    updateMode: definition.updateMode,
    dispose() {
      if (disposed) return;
      disposed = true;

      root.removeFromParent();
      root.clear();
      disposeOwnedResources(owned);
    },
  };
}
