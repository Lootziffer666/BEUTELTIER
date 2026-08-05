import * as THREE from 'three';
import { materials } from '../materials/KoelnmesseMaterials.js';
import { ProceduralTextures } from '../materials/ProceduralTextures.js';

export class TechGenerator {
  static createSpotlight(x, y, z, targetY = 0) {
    const group = new THREE.Group();

    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4),
      materials.get('cableBlack')
    );
    cable.position.y = y - 0.75;
    group.add(cable);

    const housing = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.5, 16, 1, true),
      materials.get('truss')
    );
    housing.position.y = y;
    housing.rotation.x = Math.PI;
    group.add(housing);

    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffee })
    );
    lens.position.set(0, y - 0.26, 0);
    lens.rotation.x = Math.PI / 2;
    group.add(lens);

    const spot = new THREE.SpotLight(0xfff5e6, 120, 30, 0.5, 0.5, 1);
    spot.position.set(x, y - 0.2, z);
    spot.target.position.set(x, targetY, z);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0001;

    group.userData.light = spot;
    group.add(spot);
    group.add(spot.target);

    return group;
  }

  static createLEDWall(width = 8, height = 4.5, title = 'TRAILER') {
    const group = new THREE.Group();

    const tex = ProceduralTextures.videoScreen(0, title);
    const mat = materials.createLEDMaterial(tex, 0x0044ff, 2.5);

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    group.add(screen);

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.3, height + 0.3, 0.15),
      materials.get('truss')
    );
    frame.position.z = -0.1;
    group.add(frame);

    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 0.2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.userData = { isCollider: true, type: 'screen' };
    group.add(collider);

    return group;
  }

  static createHangingBanner(text, x, y, z) {
    const tex = ProceduralTextures.banner(text);
    const mat = materials.get('bannerFabric').clone();
    mat.map = tex;

    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 3.5, 4, 8),
      mat
    );

    const pos = banner.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vy = pos.getY(i);
      const vz = Math.sin(vy * 2) * 0.05;
      pos.setZ(i, vz);
    }
    pos.needsUpdate = true;
    banner.geometry.computeVertexNormals();

    banner.position.set(x, y, z);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 4, 6),
      materials.get('chrome')
    );
    pole.position.set(x, y + 1, z);

    const group = new THREE.Group();
    group.add(banner);
    group.add(pole);

    return group;
  }
}
