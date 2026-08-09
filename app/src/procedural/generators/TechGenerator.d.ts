import * as THREE from 'three';

export declare class TechGenerator {
  static createSpotlight(x: number, y: number, z: number, targetY?: number): THREE.Object3D;
  static createLEDWall(width?: number, height?: number, title?: string): THREE.Object3D;
  static createHangingBanner(text: string, x: number, y: number, z: number): THREE.Object3D;
}
