import * as THREE from 'three';

export declare class OutdoorGenerator {
  static createTree(x: number, z: number, scale?: number): THREE.Object3D;
  static createGrassField(count?: number, width?: number, depth?: number): THREE.Object3D;
  static createFence(length?: number, type?: 'mesh' | 'solid', height?: number): THREE.Object3D;
  static createLeitplanke(length?: number): THREE.Object3D;
}
