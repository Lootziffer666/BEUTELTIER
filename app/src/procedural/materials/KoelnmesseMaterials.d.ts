import * as THREE from 'three';

declare class KoelnmesseMaterials {
  cache: Map<string, THREE.Material>;
  set(key: string, mat: THREE.Material): void;
  get(key: string): THREE.Material | undefined;
  createLEDMaterial(canvasTexture: THREE.Texture, emissiveColor?: number, intensity?: number): THREE.Material;
}

export declare const materials: KoelnmesseMaterials;
