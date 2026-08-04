import * as THREE from 'three';

class KoelnmesseMaterials {
  constructor() {
    this.cache = new Map();
    this.init();
  }

  init() {
    // ARCHITEKTUR
    this.set('floor', new THREE.MeshStandardMaterial({
      color: 0xc5c5c7, roughness: 0.2, metalness: 0.05
    }));
    this.set('wall', new THREE.MeshStandardMaterial({
      color: 0xe8e8ea, roughness: 0.85, metalness: 0.0
    }));
    this.set('truss', new THREE.MeshStandardMaterial({
      color: 0x1a1a1e, roughness: 0.4, metalness: 0.85
    }));
    this.set('concrete', new THREE.MeshStandardMaterial({
      color: 0x999999, roughness: 0.95
    }));

    // FENSTER: Spiegelnd + durchsichtig
    this.set('windowGlass', new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.0,
      transmission: 0.75,
      thickness: 0.15,
      transparent: true,
      opacity: 0.25,
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
      ior: 1.5,
      envMapIntensity: 1.0,
      side: THREE.DoubleSide
    }));

    this.set('windowMirror', new THREE.MeshPhysicalMaterial({
      color: 0xddeeff,
      metalness: 0.95,
      roughness: 0.02,
      clearcoat: 1.0,
      envMapIntensity: 2.0
    }));

    // OUTDOOR
    this.set('asphalt', new THREE.MeshStandardMaterial({ color: 0x333338, roughness: 0.95 }));
    this.set('grass', new THREE.MeshStandardMaterial({ color: 0x2d5a1e, roughness: 1.0 }));
    this.set('treeTrunk', new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 1.0 }));
    this.set('treeLeaves', new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 1.0 }));

    // METALLE
    this.set('chrome', new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 1.0 }));
    this.set('brushedAlu', new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.35, metalness: 0.9 }));
    this.set('darkMetal', new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.9 }));

    // MÖBLIERUNG
    this.set('benchWood', new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85 }));
    this.set('benchMetal', new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.3, metalness: 0.9 }));
    this.set('toiletDoor', new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.6 }));
    this.set('porcelain', new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.05 }));

    // SICHERHEIT
    this.set('fireRed', new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.4 }));
    this.set('fireBlack', new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
    this.set('exitGreen', new THREE.MeshStandardMaterial({ color: 0x00aa44, emissive: 0x004400, emissiveIntensity: 0.8 }));

    // MESSE-TECH
    this.set('ledOff', new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.3 }));
    this.set('bannerFabric', new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.9 }));
    this.set('cableBlack', new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }));

    // RED BULL
    this.set('rbBlue', new THREE.MeshStandardMaterial({ color: 0x001133, roughness: 0.3, metalness: 0.2 }));
    this.set('rbRed', new THREE.MeshStandardMaterial({ color: 0xdc0000, roughness: 0.3, emissive: 0x330000, emissiveIntensity: 0.5 }));
    this.set('rbSilver', new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.2, metalness: 0.9 }));

    // ABSPERRUNGEN
    this.set('tapeRed', new THREE.MeshStandardMaterial({ color: 0xff0044, roughness: 0.8, side: THREE.DoubleSide }));
    this.set('fenceMesh', new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5, metalness: 0.8, wireframe: true }));
    this.set('fencePanel', new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }));

    // PAPPE
    this.set('cardboard', new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, alphaTest: 0.5 }));
  }

  set(key, mat) { this.cache.set(key, mat); }
  get(key) { return this.cache.get(key); }

  createLEDMaterial(canvasTexture, emissiveColor = 0xffffff, intensity = 2.0) {
    return new THREE.MeshStandardMaterial({
      map: canvasTexture,
      emissive: emissiveColor,
      emissiveMap: canvasTexture,
      emissiveIntensity: intensity,
      roughness: 0.2,
      color: 0x000000
    });
  }
}

export const materials = new KoelnmesseMaterials();
