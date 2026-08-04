import * as THREE from 'three';

export class AtmosphereSystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.initSky();
    this.initFog();
    this.initDust(2000);
  }

  initSky() {
    const geom = new THREE.SphereGeometry(150, 32, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x0077ff) },
        bottomColor: { value: new THREE.Color(0xffffff) },
        offset: { value: 33 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `
    });
    this.scene.add(new THREE.Mesh(geom, mat));
  }

  initFog(density = 0.02) {
    this.scene.fog = new THREE.FogExp2(0x020204, density);
  }

  initDust(count) {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 15;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.dust = new THREE.Points(
      geom,
      new THREE.PointsMaterial({
        color: 0xffffff, size: 0.04, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
      })
    );
    this.scene.add(this.dust);
  }

  update(time, delta) {
    if (!this.dust) return;
    const pos = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < pos.length / 3; i++) {
      pos[i * 3 + 1] += delta * 0.1;
      pos[i * 3] += Math.sin(time * 0.5 + i) * 0.002;
      if (pos[i * 3 + 1] > 15) pos[i * 3 + 1] = 0;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }
}
