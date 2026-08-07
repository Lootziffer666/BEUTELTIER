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

  /**
   * Rolltreppe: Fachwerkkasten, Stufenband, Glasbalustrade, Handlauf.
   *
   * Gebaut wird sie am Fusspunkt beginnend entlang der lokalen +Z-Achse und
   * dabei steigend. Der Aufrufer muss sie damit nur noch um die Hochachse
   * drehen -- eine Neigung von aussen war der Grund, warum sie zuletzt in die
   * falsche Richtung fiel.
   *
   * Die Stufen bleiben waagerecht, auch wenn das Band steigt. Genau daran
   * erkennt man eine Rolltreppe und nicht eine Rampe.
   */
  static createEscalator(run = 18, rise = 7.45, width = 1.4, stepDepth = 0.42) {
    const group = new THREE.Group();
    const angle = Math.atan2(rise, run);
    const length = Math.hypot(run, rise);
    const steps = Math.max(2, Math.round(length / stepDepth));

    // Fachwerkkasten unter dem Band.
    const truss = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.16, 0.8, length),
      materials.get('darkMetal')
    );
    truss.position.set(0, rise / 2 - 0.5, run / 2);
    truss.rotation.x = -angle;
    truss.castShadow = true;
    group.add(truss);

    // Stufenband: waagerechte Tritte mit senkrechten Setzstufen dazwischen.
    const tread = new THREE.BoxGeometry(width - 0.06, 0.05, stepDepth * 0.92);
    const riser = new THREE.BoxGeometry(width - 0.06, rise / steps, 0.05);
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const y = t * rise;
      const z = t * run;
      const step = new THREE.Mesh(tread, materials.get('brushedAlu'));
      step.position.set(0, y, z);
      step.castShadow = true;
      group.add(step);

      const back = new THREE.Mesh(riser, materials.get('chrome'));
      back.position.set(0, y - rise / steps / 2, z - (stepDepth * 0.92) / 2);
      group.add(back);
    }

    // Balustrade aus Glas, darauf der dunkle Handlauf.
    for (const side of [-1, 1]) {
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.95, length),
        materials.get('balustradeGlass')
      );
      glass.position.set(side * (width / 2 + 0.06), rise / 2 + 0.42, run / 2);
      glass.rotation.x = -angle;
      group.add(glass);

      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.09, length),
        materials.get('darkMetal')
      );
      rail.position.set(side * (width / 2 + 0.06), rise / 2 + 0.94, run / 2);
      rail.rotation.x = -angle;
      group.add(rail);
    }

    // Kammplatten an beiden Enden -- der Übergang auf den festen Boden.
    for (const [y, z] of [[0.03, -0.35], [rise + 0.03, run + 0.35]]) {
      const comb = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.16, 0.06, 0.7),
        materials.get('chrome')
      );
      comb.position.set(0, y, z);
      group.add(comb);
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
