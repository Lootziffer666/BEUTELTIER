import * as THREE from 'three';
import { materials } from '../materials/KoelnmesseMaterials.js';

export class ArchitectureGenerator {
  static createGlassFacade(width = 60, height = 8, segments = 12, mirrorRatio = 0.3) {
    const group = new THREE.Group();
    const segW = width / segments;

    for (let i = 0; i < segments; i++) {
      const x = -width / 2 + i * segW + segW / 2;
      const isMirror = Math.random() < mirrorRatio;
      const mat = isMirror ? materials.get('windowMirror') : materials.get('windowGlass');

      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(segW * 0.95, height * 0.95),
        mat
      );
      pane.position.set(x, height / 2, 0);
      group.add(pane);

      const frameV = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, height, 0.15),
        materials.get('brushedAlu')
      );
      frameV.position.set(x + segW / 2, height / 2, 0);
      group.add(frameV);
    }

    const frameH = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.2, 0.15, 0.2),
      materials.get('brushedAlu')
    );
    frameH.position.set(0, height + 0.05, 0);
    group.add(frameH);

    return group;
  }

  static createHalleFloor(width = 60, depth = 40) {
    const geom = new THREE.PlaneGeometry(width, depth);
    const mesh = new THREE.Mesh(geom, materials.get('floor'));
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;

    const group = new THREE.Group();
    group.add(mesh);

    const tileSize = 4;
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x333336, roughness: 0.25 });
    for (let x = -width / 2; x < width / 2; x += tileSize * 2) {
      for (let z = -depth / 2; z < depth / 2; z += tileSize * 2) {
        if (Math.random() > 0.4) {
          const tile = new THREE.Mesh(new THREE.PlaneGeometry(tileSize, tileSize), darkMat);
          tile.rotation.x = -Math.PI / 2;
          tile.position.set(x + tileSize, 0.01, z + tileSize);
          tile.receiveShadow = true;
          group.add(tile);
        }
      }
    }
    return group;
  }

  static createCeilingTruss(width = 60, depth = 40, gridSize = 10, height = 13.5) {
    const group = new THREE.Group();
    const mat = materials.get('truss');

    for (let x = -width / 2; x <= width / 2; x += gridSize) {
      for (let z = -depth / 2; z <= depth / 2; z += gridSize) {
        const hBeam = new THREE.Mesh(new THREE.BoxGeometry(gridSize, 0.12, 0.12), mat);
        hBeam.position.set(x, height, z);
        group.add(hBeam);

        const vBeam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, gridSize), mat);
        vBeam.position.set(x, height, z);
        group.add(vBeam);

        if (Math.random() > 0.5) {
          const cable = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6),
            materials.get('cableBlack')
          );
          cable.position.set(x + (Math.random() - 0.5) * 2, height - 0.75, z + (Math.random() - 0.5) * 2);
          group.add(cable);
        }
      }
    }
    return group;
  }
}
