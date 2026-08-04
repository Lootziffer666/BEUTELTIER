/**
 * Licht und Umgebung.
 *
 * Bis hierher hatte die Szene zwei Richtungslichter und sonst nichts. Das ist
 * der Grund, warum sie wie ein Drahtgittermodell mit Farbe aussah: PBR-Material
 * ohne Umgebung hat nichts zu spiegeln, und ohne Tone Mapping kippt jede
 * hellere Stelle nach Weiß.
 *
 * Die Umgebung wird **prozedural** erzeugt und nicht als HDR-Datei geladen.
 * Die App muss auf dem Messegelände offline laufen; jede Datei, die dafür
 * nicht zwingend nötig ist, gehört nicht in den Cache. Ein Farbverlauf von
 * Himmel zu Boden reicht vollkommen: er liefert genau das, was fehlte —
 * gerichtetes Umgebungslicht und etwas zum Spiegeln.
 */

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Sonnenstand: gamescom ist im August, spätvormittags. */
const SUN = new THREE.Vector3(0.45, 0.72, 0.28).normalize();

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  varying vec3 vDirection;
  uniform vec3 zenith;
  uniform vec3 horizon;
  uniform vec3 ground;
  uniform vec3 sun;

  void main() {
    float height = vDirection.y;
    vec3 sky = mix(horizon, zenith, clamp(pow(max(height, 0.0), 0.42), 0.0, 1.0));
    // Unter dem Horizont steht das Gelände -- hell genug, damit Fassaden von
    // unten nicht absaufen, aber deutlich matter als der Himmel.
    vec3 below = mix(horizon * 0.72, ground, clamp(-height * 3.0, 0.0, 1.0));
    vec3 colour = height > 0.0 ? sky : below;

    // Sonnenscheibe plus Hof: das macht die Spiegelung auf dem Boden aus.
    float towardsSun = max(dot(normalize(vDirection), normalize(sun)), 0.0);
    colour += vec3(1.0, 0.94, 0.82) * pow(towardsSun, 700.0) * 14.0;
    colour += vec3(1.0, 0.92, 0.78) * pow(towardsSun, 14.0) * 0.35;

    gl_FragColor = vec4(colour, 1.0);
  }
`;

/**
 * Erzeugt eine Umgebungskarte aus einem Farbverlauf.
 *
 * `PMREMGenerator.fromScene` filtert die Kugel für alle Rauheitsstufen vor --
 * damit reagiert glatter Beton anders als Glas, ohne dass dafür ein Bild
 * ausgeliefert werden muss.
 */
export function useProceduralSky(intensity = 1): void {
  const { gl, scene } = useThree();

  const environment = useMemo(() => {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        uniforms: {
          zenith: { value: new THREE.Color('#3f6fa8').multiplyScalar(intensity) },
          horizon: { value: new THREE.Color('#c3d3e2').multiplyScalar(intensity) },
          ground: { value: new THREE.Color('#39373a').multiplyScalar(intensity) },
          sun: { value: SUN },
        },
      }),
    );

    const source = new THREE.Scene();
    source.add(sky);

    const generator = new THREE.PMREMGenerator(gl);
    generator.compileEquirectangularShader();
    const target = generator.fromScene(source, 0.02);
    generator.dispose();
    sky.geometry.dispose();
    (sky.material as THREE.Material).dispose();
    return target.texture;
  }, [gl, intensity]);

  useEffect(() => {
    scene.environment = environment;
    return () => {
      scene.environment = null;
      environment.dispose();
    };
  }, [scene, environment]);
}

/**
 * Sonne, Himmelslicht und die Umgebungskarte.
 *
 * Der Schattenwurf deckt nur den Ausschnitt ab, den man auch sieht — eine
 * Schattenkamera über das ganze Gelände hätte bei 2048 Pixeln keine
 * brauchbare Auflösung mehr.
 */
export function Beleuchtung({ extent, interior }: { extent: number; interior: boolean }) {
  useProceduralSky(interior ? 0.35 : 1);

  const span = extent * 0.62;
  return (
    <>
      <hemisphereLight
        args={['#cfe0f2', '#4a4740', interior ? 0.35 : 0.9]}
        position={[0, extent, 0]}
      />
      <directionalLight
        castShadow={!interior}
        position={[SUN.x * extent, SUN.y * extent, SUN.z * extent]}
        intensity={interior ? 0.6 : 2.6}
        color="#fff4e2"
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.6}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={1}
        shadow-camera-far={extent * 3}
      />
      {/* Gegenlicht aus dem Norden: ohne das werden abgewandte Fassaden
          schwarz, und schwarze Flächen lesen sich als Loch. */}
      <directionalLight
        position={[-extent * 0.5, extent * 0.35, -extent * 0.45]}
        intensity={interior ? 0.25 : 0.5}
        color="#b9cde2"
      />
      {interior && <ambientLight intensity={0.45} color="#e8eef6" />}
    </>
  );
}

export { SUN };
