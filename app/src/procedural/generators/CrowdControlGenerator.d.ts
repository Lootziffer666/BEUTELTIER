import * as THREE from 'three';

export declare class CrowdControlGenerator {
  static createTurnstile(): THREE.Object3D;
  static createTicketScanner(): THREE.Object3D;
  static createWristbandDispenser(gameName?: string): THREE.Object3D;
  static createBarrierTape(length?: number, height?: number): THREE.Object3D;
}
