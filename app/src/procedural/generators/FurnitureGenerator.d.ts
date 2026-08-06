import * as THREE from 'three';

export declare class FurnitureGenerator {
  static createToiletStall(gender?: string): THREE.Object3D;
  static createSink(): THREE.Object3D;
  static createBench(length?: number): THREE.Object3D;
}
