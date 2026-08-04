/**
 * Woraus das Gelände aussieht, wie es aussieht.
 *
 * Zwei Herkünfte, streng getrennt:
 *
 * * **Boden und Dächer** tragen das amtliche Senkrechtluftbild — 10 cm
 *   Auflösung, Stand 2025, entzerrt ins Geländesystem. Das ist eine Aufnahme
 *   des Messegeländes, keine Erfindung.
 * * **Wände** kann ein Senkrechtluftbild nicht zeigen. Sie werden prozedural
 *   erzeugt: Paneelfugen, Sockelverschmutzung, feines Rauschen. Das ist
 *   plausibel, aber nicht gemessen — und wird in der Herkunftsangabe der App
 *   auch so benannt.
 *
 * Prozedural statt Bilddatei, weil eine Wandtextur, die niemand fotografiert
 * hat, auch niemand ausliefern muss: der Canvas erzeugt sie beim Start in
 * wenigen Millisekunden und kostet kein Byte Übertragung.
 */

import * as THREE from 'three';

/** Kantenlänge der erzeugten Texturen. */
const TILE_PX = 512;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement('canvas');
  element.width = TILE_PX;
  element.height = TILE_PX;
  const context = element.getContext('2d');
  if (!context) throw new Error('Canvas ohne 2D-Kontext');
  return [element, context];
}

/** Feines Rauschen — ohne das wirkt jede Fläche wie lackiert. */
function speckle(context: CanvasRenderingContext2D, strength: number): void {
  const image = context.getImageData(0, 0, TILE_PX, TILE_PX);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * strength * 255;
    data[i] += noise;
    data[i + 1] += noise;
    data[i + 2] += noise;
  }
  context.putImageData(image, 0, 0);
}

/**
 * Hallenwand: Paneelfugen und Schmutz am Sockel.
 *
 * Die Koelnmesse-Hallen sind aussen wie innen in Paneelen gegliedert, und
 * unten setzt sich Staub ab. Beides zusammen genügt, damit eine Wand beim
 * Vorbeigehen als Wand gelesen wird statt als Farbfläche.
 */
export function wallTexture(): THREE.CanvasTexture {
  const [element, context] = canvas();

  context.fillStyle = '#d9dade';
  context.fillRect(0, 0, TILE_PX, TILE_PX);

  const panel = TILE_PX / 6;
  context.strokeStyle = 'rgba(150, 152, 160, 0.55)';
  context.lineWidth = 2;
  for (let x = 0; x <= TILE_PX; x += panel) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, TILE_PX);
    context.stroke();
  }

  context.strokeStyle = 'rgba(150, 152, 160, 0.28)';
  context.lineWidth = 1;
  for (let y = 0; y <= TILE_PX; y += TILE_PX / 3) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(TILE_PX, y);
    context.stroke();
  }

  // Sockel: unten dunkler. Im Bild ist unten die höhere Zeilennummer.
  const dirt = context.createLinearGradient(0, TILE_PX, 0, TILE_PX * 0.6);
  dirt.addColorStop(0, 'rgba(60, 62, 70, 0.22)');
  dirt.addColorStop(1, 'rgba(60, 62, 70, 0)');
  context.fillStyle = dirt;
  context.fillRect(0, 0, TILE_PX, TILE_PX);

  speckle(context, 0.05);

  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  // Eine Kachel je acht Meter Wand -- darüber wird die Fuge zum Streifen.
  texture.repeat.set(6, 6);
  return texture;
}

/**
 * Hallenboden: polierter Estrich mit Abnutzung.
 *
 * Warum nicht das Luftbild: ein Senkrechtluftbild zeigt **Dächer**. Auf den
 * Boden einer Halle projiziert wäre es das Foto des Daches darüber — also das
 * falsche Bild an der falschen Stelle. Draußen liegt das Luftbild, drinnen
 * dieser Estrich.
 */
export function floorTexture(): THREE.CanvasTexture {
  const [element, context] = canvas();

  context.fillStyle = '#b9babd';
  context.fillRect(0, 0, TILE_PX, TILE_PX);

  // Marmorierung des Estrichs.
  for (let i = 0; i < 120; i += 1) {
    const x = Math.random() * TILE_PX;
    const y = Math.random() * TILE_PX;
    const radius = 10 + Math.random() * 40;
    context.fillStyle = `rgba(${168 + Math.random() * 40}, ${168 + Math.random() * 40}, ${172 + Math.random() * 36}, 0.05)`;
    context.beginPath();
    context.ellipse(x, y, radius, radius * 0.35, Math.random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }

  // Laufspuren: dort, wo alle langgehen, wird es dunkler.
  for (let i = 0; i < 24; i += 1) {
    const x = Math.random() * TILE_PX;
    const width = 20 + Math.random() * 90;
    context.fillStyle = `rgba(96, 98, 105, ${0.015 + Math.random() * 0.025})`;
    context.fillRect(x, 0, width, TILE_PX);
  }

  // Plattenfugen alle vier Meter.
  context.strokeStyle = 'rgba(140, 142, 148, 0.35)';
  context.lineWidth = 1;
  for (let step = 0; step <= TILE_PX; step += TILE_PX / 4) {
    context.beginPath();
    context.moveTo(step, 0);
    context.lineTo(step, TILE_PX);
    context.moveTo(0, step);
    context.lineTo(TILE_PX, step);
    context.stroke();
  }

  speckle(context, 0.05);

  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(24, 24);
  return texture;
}

/** Lädt das entzerrte Luftbild. */
export function orthoTexture(url: string): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}
