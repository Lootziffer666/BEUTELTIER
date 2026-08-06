import * as THREE from 'three';

export declare class BoothGenerator {
  static createCardboardFigure(name: string, gameTitle: string, x: number, z: number): THREE.Object3D;
  static createInfoCounter(width?: number, brandColor?: number): THREE.Object3D;
  static createPressKitDisplay(gameData: unknown): THREE.Object3D;
}
