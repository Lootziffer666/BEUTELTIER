import type * as THREE from 'three';

/** Prozedurale Bauteile der Koelnmesse -- siehe ArchitectureGenerator.js. */
export declare class ArchitectureGenerator {
  static createGlassFacade(
    width?: number, height?: number, segments?: number, mirrorRatio?: number,
  ): THREE.Group;
  static createHalleFloor(width?: number, depth?: number): THREE.Group;
  static createEscalator(
    run?: number, rise?: number, width?: number, stepDepth?: number,
  ): THREE.Group;
  static createCeilingTruss(
    width?: number, depth?: number, gridSize?: number, height?: number,
  ): THREE.Group;
}
