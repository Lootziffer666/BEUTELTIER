import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export class PostProcessingStack {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.2, 0.4, 0.85
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.addVignette();
  }

  addVignette() {
    const vignetteShader = {
      uniforms: {
        tDiffuse: { value: null },
        offset: { value: 1.0 },
        darkness: { value: 1.2 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float offset;
        uniform float darkness;
        varying vec2 vUv;
        void main() {
          vec4 texel = texture2D(tDiffuse, vUv);
          vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
          gl_FragColor = vec4(mix(texel.rgb, vec3(0.0), dot(uv, uv) * darkness), texel.a);
        }
      `
    };
    this.composer.addPass(new ShaderPass(vignetteShader));
  }

  render() {
    this.composer.render();
  }

  resize(width, height) {
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width, height);
  }

  setBloomStrength(val) { this.bloom.strength = val; }
  setBloomThreshold(val) { this.bloom.threshold = val; }
}
