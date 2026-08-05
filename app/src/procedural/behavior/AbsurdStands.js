// src/behavior/AbsurdStands.js
import * as THREE from 'three';
import { materials } from '../materials/KoelnmesseMaterials.js';
import { ProceduralTextures } from '../materials/ProceduralTextures.js';

export const StandRegistry = [];

export function createPatchnotesStand(x, z) {
  const group = new THREE.Group();
  group.userData = { id: 'patchnotes', type: 'absurd_stand', x, z, interact: 'patchnotes' };

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 2),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x00ff44, emissiveIntensity: 0.8 })
  );
  screen.position.set(0, 2.5, 0);
  group.add(screen);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), materials.get('floor'));
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  group.position.set(x, 0, z);
  StandRegistry.push(group.userData);
  return group;
}

export function createLoadingStand(x, z) {
  const group = new THREE.Group();
  group.userData = { id: 'loading', type: 'absurd_stand', x, z, interact: 'loading' };

  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 64;
  const ctx = canvas.getContext('2d');

  function drawBar(progress) {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, 512, 64);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(4, 4, (512 - 8) * progress, 56);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(progress * 100)}%`, 256, 40);
  }

  const tex = new THREE.CanvasTexture(canvas);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 0.5),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0x002200, emissiveIntensity: 0.5 })
  );
  screen.position.set(0, 2.5, 0);
  group.add(screen);

  const npc = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.25, 0.6, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x3366cc })
  );
  npc.position.set(1.5, 0.55, 0.5);
  group.add(npc);

  group.position.set(x, 0, z);

  group.userData.update = (time) => {
    const progress = (time * 0.1) % 1.2;
    const display = progress > 1 ? 0.99 : progress;
    drawBar(display);
    tex.needsUpdate = true;
  };

  StandRegistry.push(group.userData);
  return group;
}

export function createLootboxToilet(x, z) {
  const group = new THREE.Group();
  group.userData = { id: 'lootbox_toilet', type: 'absurd_stand', x, z, interact: 'toilet' };

  const colors = { gewoehnlich: 0xffffff, selten: 0x4488ff, legendär: 0xffaa00 };

  ['gewoehnlich', 'selten', 'legendär'].forEach((rarity, i) => {
    const stall = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2.2, 1.3),
      materials.get('wall')
    );
    stall.position.set((i - 1) * 1.8, 1.1, 0);

    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 2),
      new THREE.MeshStandardMaterial({ color: colors[rarity], emissive: colors[rarity], emissiveIntensity: 0.3 })
    );
    door.position.set((i - 1) * 1.8, 1.1, 0.66);
    group.add(stall);
    group.add(door);
  });

  group.position.set(x, 0, z);
  StandRegistry.push(group.userData);
  return group;
}

export function createAGBBossStand(x, z) {
  const group = new THREE.Group();
  group.userData = { id: 'agb_boss', type: 'absurd_stand', x, z, interact: 'agb' };

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const textPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 0.8),
        new THREE.MeshStandardMaterial({ color: 0xeeeeee, side: THREE.DoubleSide })
      );
      textPlane.position.set((col - 1.5) * 2, 1 + row * 0.9, 0);
      group.add(textPlane);
    }
  }

  const updateSign = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xcc0000, emissiveIntensity: 1 })
  );
  updateSign.position.set(0, 8, 0.1);
  group.add(updateSign);

  group.position.set(x, 0, z);
  StandRegistry.push(group.userData);
  return group;
}

export function createNPCPettingZoo(x, z) {
  const group = new THREE.Group();
  group.userData = { id: 'petting_zoo', type: 'absurd_stand', x, z, interact: 'petting' };

  for (let i = 0; i < 5; i++) {
    const npc = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.6, 4, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 5, 0.6, 0.5) })
    );
    npc.position.set((i - 2) * 1.2, 0.55, 0);
    npc.userData = {
      isPettable: true,
      dialog: [
        'Bitte unterbrechen Sie meine Laufroute nicht.',
        'Diese Nähe wurde nicht im Dialogbaum vorgesehen.',
        'Ich bin eigentlich nur ein Platzhalter.',
        'Haben Sie meinen Questmarker gesehen?'
      ][i]
    };
    group.add(npc);
  }

  group.position.set(x, 0, z);
  StandRegistry.push(group.userData);
  return group;
}

export function createExitSimulator(x, z) {
  const group = new THREE.Group();
  group.userData = { id: 'exit_sim', type: 'absurd_stand', x, z, interact: 'exit_trap' };

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.6),
      new THREE.MeshStandardMaterial({ map: ProceduralTextures.banner('AUSGANG', '#cc0000', '#ffffff') })
    );
    sign.position.set(Math.cos(angle) * 3, 2, Math.sin(angle) * 3);
    sign.lookAt(0, 2, 0);
    group.add(sign);
  }

  group.position.set(x, 0, z);
  StandRegistry.push(group.userData);
  return group;
}

export function createAIStand(x, z) {
  const group = new THREE.Group();
  group.userData = { id: 'ai_stand', type: 'absurd_stand', x, z, interact: 'ai' };

  const terminal = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1.4, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.2 })
  );
  terminal.position.set(0, 0.7, 0);
  group.add(terminal);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x001100, emissive: 0x00ff00, emissiveIntensity: 0.6 })
  );
  screen.position.set(0, 1.2, 0.31);
  group.add(screen);

  group.position.set(x, 0, z);
  StandRegistry.push(group.userData);
  return group;
}

export function createRatingStand(x, z) {
  const group = new THREE.Group();
  group.userData = { id: 'rating', type: 'absurd_stand', x, z, interact: 'rating' };

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 2),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0.5 })
  );
  screen.position.set(0, 2.5, 0);
  group.add(screen);

  group.position.set(x, 0, z);
  StandRegistry.push(group.userData);
  return group;
}
