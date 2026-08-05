import * as THREE from 'three';

export class LightingRig {
  constructor(scene) {
    this.scene = scene;
    this.lights = [];
    this.init();
  }

  init() {
    this.ambient = new THREE.AmbientLight(0x111122, 0.06);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xfff5e6, 1.8);
    this.sun.position.set(30, 50, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -50;
    this.sun.shadow.camera.right = 50;
    this.sun.shadow.camera.top = 50;
    this.sun.shadow.camera.bottom = -50;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);

    this.hemi = new THREE.HemisphereLight(0x87CEEB, 0x2d5a1e, 0.35);
    this.scene.add(this.hemi);

    this.rim = new THREE.SpotLight(0x4466ff, 50, 40, 0.5, 0.8, 1);
    this.rim.position.set(0, 10, -30);
    this.rim.target.position.set(0, 0, 0);
    this.scene.add(this.rim);
    this.scene.add(this.rim.target);
  }

  addZoneLight(color, intensity, x, y, z, distance = 15) {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, y, z);
    this.scene.add(light);
    this.lights.push(light);
    return light;
  }

  addTrussGrid(width, depth, spacing = 10, height = 13) {
    const spots = [];
    for (let x = -width / 2; x <= width / 2; x += spacing) {
      for (let z = -depth / 2; z <= depth / 2; z += spacing) {
        const spot = new THREE.SpotLight(0xfff5e6, 100, 25, 0.55, 0.5, 1);
        spot.position.set(x, height, z);
        spot.target.position.set(x, 0, z);
        spot.castShadow = true;
        spot.shadow.mapSize.set(512, 512);
        this.scene.add(spot);
        this.scene.add(spot.target);
        spots.push(spot);
      }
    }
    return spots;
  }
}
