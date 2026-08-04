import * as THREE from 'three';
import { materials } from '../materials/KoelnmesseMaterials.js';

export class FnbGenerator {
  static createRedBullContainer() {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(6, 3, 3),
      materials.get('rbBlue')
    );
    body.position.y = 1.5;
    body.castShadow = true;
    group.add(body);

    const logoBand = new THREE.Mesh(
      new THREE.BoxGeometry(6.05, 0.8, 3.05),
      materials.get('rbRed')
    );
    logoBand.position.y = 2;
    group.add(logoBand);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(4.5, 1.5, 4),
      materials.get('rbBlue')
    );
    roof.position.y = 3.75;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(4, 1.1, 0.8),
      materials.get('rbSilver')
    );
    counter.position.set(0, 0.55, 2);
    counter.castShadow = true;
    group.add(counter);

    for (let i = -1; i <= 1; i += 2) {
      const fridge = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 2, 0.8),
        new THREE.MeshStandardMaterial({
          color: 0x001133,
          roughness: 0.1,
          metalness: 0.3,
          emissive: 0x001144,
          emissiveIntensity: 0.3
        })
      );
      fridge.position.set(i * 2, 1, -1);
      group.add(fridge);
    }

    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 4, 4),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.position.y = 2;
    collider.userData = { isCollider: true, type: 'redbull' };
    group.add(collider);

    return group;
  }

  static createCateringTable(length = 4) {
    const group = new THREE.Group();

    const top = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.05, 0.8),
      materials.get('benchWood')
    );
    top.position.y = 0.75;
    top.castShadow = true;
    group.add(top);

    for (let x = -length / 2 + 0.3; x <= length / 2 - 0.3; x += length - 0.6) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6),
        materials.get('chrome')
      );
      leg.position.set(x, 0.375, 0);
      group.add(leg);
    }

    return group;
  }

  static createCoffeeStation() {
    const group = new THREE.Group();

    const machine = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.2, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2, metalness: 0.8 })
    );
    machine.position.y = 0.6;
    group.add(machine);

    const light = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 2 })
    );
    light.position.set(0, 1.25, 0.2);
    group.add(light);

    return group;
  }
}
