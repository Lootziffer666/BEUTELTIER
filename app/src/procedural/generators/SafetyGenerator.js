import * as THREE from 'three';
import { materials } from '../materials/KoelnmesseMaterials.js';

export class SafetyGenerator {
  static createFireExtinguisher() {
    const group = new THREE.Group();

    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.5, 12),
      materials.get('fireRed')
    );
    tank.position.y = 0.7;
    tank.castShadow = true;
    group.add(tank);

    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 12),
      materials.get('fireRed')
    );
    top.position.y = 0.95;
    group.add(top);

    const nozzle = new THREE.Mesh(
      new THREE.ConeGeometry(0.025, 0.12, 8),
      materials.get('fireBlack')
    );
    nozzle.position.set(0.05, 1.0, 0.05);
    nozzle.rotation.z = -Math.PI / 3;
    group.add(nozzle);

    const hoseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.6, 0),
      new THREE.Vector3(0.15, 0.4, 0),
      new THREE.Vector3(0.1, 0.2, 0.05)
    ]);
    const hose = new THREE.Mesh(
      new THREE.TubeGeometry(hoseCurve, 8, 0.015, 6, false),
      materials.get('fireBlack')
    );
    group.add(hose);

    const bracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.04, 0.12),
      materials.get('chrome')
    );
    bracket.position.set(0, 0.7, -0.1);
    group.add(bracket);

    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1.1, 0.3),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.position.y = 0.55;
    collider.userData = { isCollider: true, type: 'fireExtinguisher' };
    group.add(collider);

    return group;
  }

  static createExitSign() {
    const group = new THREE.Group();

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.25, 0.08),
      materials.get('exitGreen')
    );
    box.position.y = 2.4;
    group.add(box);

    const text = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    text.position.set(0, 2.4, 0.045);
    group.add(text);

    return group;
  }
}
