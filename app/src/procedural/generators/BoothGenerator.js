import * as THREE from 'three';
import { materials } from '../materials/KoelnmesseMaterials.js';
import { ProceduralTextures } from '../materials/ProceduralTextures.js';

export class BoothGenerator {
  static createCardboardFigure(name, gameTitle, x, z) {
    const tex = ProceduralTextures.cardboardFigure(name, gameTitle);
    const mat = materials.get('cardboard').clone();
    mat.map = tex;

    const figure = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 2),
      mat
    );
    figure.position.set(x, 1, z);
    figure.userData = { isCardboard: true, isCollider: true, type: 'cardboard' };

    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.05, 0.5),
      materials.get('truss')
    );
    stand.position.set(x, 0.025, z);

    const group = new THREE.Group();
    group.add(figure);
    group.add(stand);

    return group;
  }

  static createInfoCounter(width = 3, brandColor = 0x0044ff) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.1, 1),
      new THREE.MeshStandardMaterial({ color: brandColor, roughness: 0.3 })
    );
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);

    const top = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.1, 0.05, 1.1),
      materials.get('chrome')
    );
    top.position.y = 1.125;
    group.add(top);

    const monitor = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.4, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x222222, emissiveIntensity: 0.5 })
    );
    monitor.position.set(0, 1.4, -0.4);
    group.add(monitor);

    const collider = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.5, 1.2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collider.position.y = 0.75;
    collider.userData = { isCollider: true, type: 'counter' };
    group.add(collider);

    return group;
  }

  static createPressKitDisplay(gameData) {
    const group = new THREE.Group();

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(4, 3, 0.2),
      new THREE.MeshStandardMaterial({ color: gameData.color || 0x222222, roughness: 0.4 })
    );
    wall.position.y = 1.5;
    wall.castShadow = true;
    group.add(wall);

    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 0.8),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: gameData.color || 0xffffff,
        emissiveIntensity: 0.5
      })
    );
    logo.position.set(0, 2.4, 0.11);
    group.add(logo);

    for (let i = 0; i < 3; i++) {
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x111111 })
      );
      frame.position.set(-1 + i * 1, 1.4, 0.11);
      group.add(frame);
    }

    const cardboard = this.createCardboardFigure('Hero', gameData.title, 2.5, 0.5);
    group.add(cardboard);

    return group;
  }
}
