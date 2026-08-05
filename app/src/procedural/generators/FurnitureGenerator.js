import * as THREE from 'three';
import { materials } from '../materials/KoelnmesseMaterials.js';
import { ProceduralTextures } from '../materials/ProceduralTextures.js';

export class FurnitureGenerator {
  static createToiletStall(gender = 'male') {
    const group = new THREE.Group();

    const wallMat = materials.get('wall');
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 1.3), wallMat);
    sideWall.position.set(-0.6, 1.1, 0);
    group.add(sideWall);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.08), wallMat);
    backWall.position.set(0, 1.1, -0.6);
    group.add(backWall);

    const doorTex = ProceduralTextures.toiletSign(gender);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 2),
      new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.6 })
    );
    door.position.set(0, 1.1, 0.61);
    group.add(door);

    const bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.15, 0.4, 16),
      materials.get('porcelain')
    );
    bowl.position.set(0, 0.45, -0.2);
    group.add(bowl);

    const cistern = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.25, 0.15),
      materials.get('porcelain')
    );
    cistern.position.set(0, 1.1, -0.55);
    group.add(cistern);

    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 2.2, 1.3),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.position.y = 1.1;
    collider.userData = { isCollider: true, type: 'toilet' };
    group.add(collider);

    return group;
  }

  static createSink() {
    const group = new THREE.Group();

    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.2, 0.12, 16),
      materials.get('porcelain')
    );
    basin.position.y = 0.85;
    group.add(basin);

    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.85, 8),
      materials.get('chrome')
    );
    leg.position.y = 0.425;
    group.add(leg);

    const faucet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8),
      materials.get('chrome')
    );
    faucet.position.set(0, 1.0, 0.1);
    faucet.rotation.x = Math.PI / 4;
    group.add(faucet);

    const mirror = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.5),
      materials.get('windowMirror')
    );
    mirror.position.set(0, 1.6, -0.1);
    group.add(mirror);

    return group;
  }

  static createBench(length = 2) {
    const group = new THREE.Group();

    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.06, 0.45),
      materials.get('benchWood')
    );
    seat.position.y = 0.48;
    seat.castShadow = true;
    group.add(seat);

    const legGeom = new THREE.BoxGeometry(0.06, 0.48, 0.4);
    [-length / 2 + 0.15, length / 2 - 0.15].forEach(x => {
      const leg = new THREE.Mesh(legGeom, materials.get('benchMetal'));
      leg.position.set(x, 0.24, 0);
      leg.castShadow = true;
      group.add(leg);
    });

    const back = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.4, 0.04),
      materials.get('benchWood')
    );
    back.position.set(0, 0.9, -0.22);
    back.castShadow = true;
    group.add(back);

    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(length, 1.1, 0.5),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.position.y = 0.55;
    collider.userData = { isCollider: true, type: 'bench' };
    group.add(collider);

    return group;
  }
}
