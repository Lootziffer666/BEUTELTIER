import * as THREE from 'three';
import { materials } from '../materials/KoelnmesseMaterials.js';
import { ProceduralTextures } from '../materials/ProceduralTextures.js';

export class CrowdControlGenerator {
  static createTurnstile() {
    const group = new THREE.Group();

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.2, 1.4),
      materials.get('brushedAlu')
    );
    housing.position.y = 0.6;
    housing.castShadow = true;
    group.add(housing);

    const display = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0x00ff44,
        emissiveIntensity: 0.8
      })
    );
    display.position.set(0, 1.35, 0.71);
    group.add(display);

    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.9),
        materials.get('chrome')
      );
      arm.position.set(0, 1.1, 0.45);
      const pivot = new THREE.Group();
      pivot.add(arm);
      pivot.rotation.y = (i / 3) * Math.PI * 2;
      group.add(pivot);
    }

    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.5, 1.6),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.position.y = 0.75;
    collider.userData = { isCollider: true, type: 'turnstile' };
    group.add(collider);

    return group;
  }

  static createTicketScanner() {
    const group = new THREE.Group();

    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.3, 0.3),
      materials.get('brushedAlu')
    );
    pole.position.y = 0.65;
    group.add(pole);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00aa44, emissiveIntensity: 1 })
    );
    screen.position.set(0, 1.2, 0.16);
    group.add(screen);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.1, 0.25),
      materials.get('darkMetal')
    );
    head.position.set(0, 1.35, 0.1);
    head.rotation.x = -0.3;
    group.add(head);

    return group;
  }

  static createWristbandDispenser(gameName = 'GAMESCOM') {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.8, 0.8),
      materials.get('darkMetal')
    );
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);

    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.05, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    slot.position.set(0, 0.6, 0.42);
    group.add(slot);

    const tex = ProceduralTextures.wristband('#ff0044', gameName);
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.15),
      new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide })
    );
    band.position.set(0, 0.65, 0.45);
    group.add(band);

    const disp = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff0044, emissiveIntensity: 1.2 })
    );
    disp.position.set(0, 1.3, 0.41);
    group.add(disp);

    return group;
  }

  static createBarrierTape(length = 5, height = 1) {
    const group = new THREE.Group();

    const p1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, height, 6),
      materials.get('chrome')
    );
    p1.position.set(-length / 2, height / 2, 0);
    group.add(p1);

    const p2 = p1.clone();
    p2.position.set(length / 2, height / 2, 0);
    group.add(p2);

    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-length / 2, height - 0.1, 0),
      new THREE.Vector3(0, height - 0.3, 0),
      new THREE.Vector3(length / 2, height - 0.1, 0)
    );
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 8, 0.02, 6, false),
      materials.get('tapeRed')
    );
    group.add(tube);

    return group;
  }
}
