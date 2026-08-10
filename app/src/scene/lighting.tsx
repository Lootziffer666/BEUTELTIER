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
 * Die Umgebung *in* einer Halle.
 *
 * Drinnen den Himmel zu spiegeln ist nicht bloß ungenau, es ist verkehrt: der
 * Boden einer Messehalle wirft die Leuchtenreihen zurück, nicht das
 * Firmament. Deshalb eine zweite Kugel — oben ein warmes helles Band aus
 * Deckenlicht über dunklem Dach, in der Mitte die matten Wände, unten der
 * aufgehellte Boden. Nach dem PMREM-Filter ist genau das die Spiegelung, die
 * auf den Referenzfotos den ganzen Raum trägt.
 */
const HALL_FRAGMENT = /* glsl */ `
  varying vec3 vDirection;
  uniform vec3 lamp;
  uniform vec3 deck;
  uniform vec3 wall;
  uniform vec3 floorTone;

  void main() {
    float height = vDirection.y;

    // Decke: dunkles Blech mit einem gleichmaessigen Lichtanteil.
    //
    // Hier stand ein Streifenmuster aus sin(vDirection.x * 9.0), das der
    // Boden als breite Baender zurueckwarf. Diese Baender lagen in der
    // Welt-X-Achse fest und hatten mit den Leuchtenreihen der Halle, in der
    // man steht, nichts zu tun -- eine Halle steht schraeg im Gelaende, jede
    // andere anders. Auf dem Boden kreuzten sich damit zwei Spiegelungen:
    // die echte aus Lichtspiegel und diese erfundene.
    //
    // Die Umgebung liefert jetzt nur noch die Grundhelligkeit von oben. Die
    // Zeichnung der Baender im Boden kommt von den Baendern selbst.
    // Nur ein schwacher Anteil: die Umgebung liefert Grundhelligkeit, nicht
    // das Bild der Leuchten. Bei einem hohen Anteil spiegelt der Boden
    // ueberall eine gleichmaessig helle Decke und wird flaechig weiss -- die
    // Baender aus Lichtspiegel verschwinden dann in ihrem eigenen Hof.
    vec3 ceiling = mix(deck, lamp, 0.16);

    vec3 colour = wall;
    colour = mix(colour, ceiling, smoothstep(0.18, 0.62, height));
    colour = mix(colour, floorTone, smoothstep(-0.12, -0.55, height));

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
export function useProceduralSky(intensity = 1, hall = false): void {
  const { gl, scene } = useThree();

  const environment = useMemo(() => {
    const material = hall
      ? new THREE.ShaderMaterial({
          side: THREE.BackSide,
          depthWrite: false,
          vertexShader: SKY_VERTEX,
          fragmentShader: HALL_FRAGMENT,
          uniforms: {
            lamp: { value: new THREE.Color('#fff4de').multiplyScalar(3.4 * intensity) },
            deck: { value: new THREE.Color('#2b2e34').multiplyScalar(intensity) },
            wall: { value: new THREE.Color('#8d8b84').multiplyScalar(intensity) },
            floorTone: { value: new THREE.Color('#5c5e63').multiplyScalar(intensity) },
          },
        })
      : new THREE.ShaderMaterial({
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
        });

    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), material);
    const source = new THREE.Scene();
    source.add(sky);

    const generator = new THREE.PMREMGenerator(gl);
    generator.compileEquirectangularShader();
    const target = generator.fromScene(source, 0.02);
    generator.dispose();
    sky.geometry.dispose();
    material.dispose();
    return target.texture;
  }, [gl, intensity, hall]);

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
  useProceduralSky(1, interior);

  const span = extent * 0.62;

  if (interior) {
    // Drinnen keine Sonne: sie stünde durch die Wand und legte einen
    // Schlagschatten quer durch die Halle, den es dort nicht gibt. Das Licht
    // kommt von oben aus den Leuchtenreihen -- der Rest aus der Umgebung.
    return (
      <>
        {/* Grundhelligkeit, nicht Beleuchtung: was den Raum formt, sind die
            Leuchtenreihen und die Punktlichter darunter, dazu jetzt die
            Stützen, die echten Schlagschatten werfen. Eine starke Halbkugel
            würde all das wieder einebnen -- auf den Referenzfotos ist der
            Raum dunkel, mit klaren hellen Inseln, nicht gleichmässig grau. */}
        {/* Wieder herauf. Ich hatte beides gedämpft, weil der Boden zu hell
            wirkte -- der Fehler lag aber an der Bodentextur, nicht an der
            Helligkeit. Zu wenig Grundlicht heisst: senkrechte Flächen bekommen
            gar nichts ab, Stützen werden schwarze Silhouetten ohne
            Flächenunterschied, und ihr Kopf verschwindet vor der ebenfalls
            schwarzen Decke. Genau das sah nach "reicht nicht bis zur Decke"
            aus, obwohl beide auf derselben Höhe liegen. */}
        <hemisphereLight args={['#fff3dd', '#33353b', 0.5]} position={[0, extent, 0]} />
        <ambientLight intensity={0.14} color="#cfd7e2" />
      </>
    );
  }

  return (
    <>
      <hemisphereLight args={['#cfe0f2', '#4a4740', 0.9]} position={[0, extent, 0]} />
      <directionalLight
        castShadow
        position={[SUN.x * extent, SUN.y * extent, SUN.z * extent]}
        intensity={2.6}
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
        intensity={0.5}
        color="#b9cde2"
      />
    </>
  );
}

export { SUN };
