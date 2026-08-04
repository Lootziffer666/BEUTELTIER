import * as THREE from 'three';
import { materials } from '../materials/KoelnmesseMaterials.js';

export class OutdoorGenerator {
  static createTree(x, z, scale = 1) {
    const group = new THREE.Group();

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, 2.5 * scale, 8),
      materials.get('treeTrunk')
    );
    trunk.position.y = 1.25 * scale;
    trunk.castShadow = true;
    group.add(trunk);

    const leaves = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.3 * scale),
      materials.get('treeLeaves')
    );
    leaves.position.y = 2.8 * scale;
    leaves.castShadow = true;
    group.add(leaves);

    const leaves2 = leaves.clone();
    leaves2.scale.setScalar(0.7);
    leaves2.position.y = 3.4 * scale;
    group.add(leaves2);

    group.position.set(x, 0, z);
    return group;
  }

  static createGrassField(count = 3000, width = 80, depth = 20) {
    if (count < 10) return new THREE.Group();

    const geom = new THREE.PlaneGeometry(0.06, 0.5);
    geom.translate(0, 0.25, 0);

    const mesh = new THREE.InstancedMesh(
      geom,
      new THREE.MeshStandardMaterial({ color: 0x3a7a2a, roughness: 1, side: THREE.DoubleSide }),
      count
    );

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * width,
        0,
        (Math.random() - 0.5) * depth
      );
      dummy.rotation.y = Math.random() * Math.PI;
      dummy.rotation.x = (Math.random() - 0.5) * 0.4;
      dummy.scale.setScalar(0.6 + Math.random() * 0.8);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  static createFence(length = 20, type = 'mesh', height = 2) {
    const group = new THREE.Group();

    if (type === 'mesh') {
      const wire = new THREE.GridHelper(length, Math.floor(length / 0.5), 0x888888, 0x888888);
      wire.position.y = height / 2;
      wire.scale.set(1, height / 10, 1);
      group.add(wire);
    } else {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(length, height),
        materials.get('fencePanel')
      );
      panel.position.y = height / 2;
      group.add(panel);
    }

    for (let x = -length / 2; x <= length / 2; x += 2.5) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, height + 0.2, 6),
        materials.get('brushedAlu')
      );
      post.position.set(x, height / 2, 0);
      group.add(post);
    }

    const tape = new THREE.Mesh(
      new THREE.PlaneGeometry(length, 0.12),
      materials.get('tapeRed')
    );
    tape.position.set(0, height - 0.2, 0.02);
    group.add(tape);

    return group;
  }

  static createLeitplanke(length = 40) {
    const group = new THREE.Group();
    const postGeom = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8);
    const railGeom = new THREE.BoxGeometry(4, 0.12, 0.08);

    for (let x = -length / 2; x < length / 2; x += 4) {
      const post = new THREE.Mesh(postGeom, materials.get('chrome'));
      post.position.set(x + 2, 0.55, 0);
      post.castShadow = true;
      group.add(post);

      const rail = new THREE.Mesh(railGeom, materials.get('chrome'));
      rail.position.set(x + 4, 1.05, 0);
      rail.castShadow = true;
      group.add(rail);
    }
    return group;
  }
}
