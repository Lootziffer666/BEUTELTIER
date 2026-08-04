/**
 * Woraus das Gelände aussieht, wie es aussieht.
 *
 * Zwei Herkünfte, streng getrennt:
 *
 * * **Boden draußen und Dächer** tragen das amtliche Senkrechtluftbild —
 *   10 cm Auflösung, Stand 2025, entzerrt ins Geländesystem. Eine Aufnahme
 *   des Messegeländes, keine Erfindung.
 * * **Fassaden, Hallenböden und Decken** zeigt ein Senkrechtluftbild nicht.
 *   Sie werden hier erzeugt — aber nicht als Farbfläche mit Rauschen, sondern
 *   nach dem, was auf den Referenzfotos der Koelnmesse tatsächlich zu sehen
 *   ist: Betonstützen im festen Raster, feine waagerechte Lamellenbänder
 *   dazwischen, ein durchgehendes Fensterband oben, grüne Torschilder.
 *
 * Zu jeder Fläche gehören drei Karten, nicht eine: Farbe, Normale und
 * Rauheit. Ohne Normale bleibt jede Fuge ein aufgemalter Strich, und ohne
 * Rauheitskarte glänzt das Glas genauso stumpf wie der Beton daneben. Genau
 * das ließ die erste Fassung wie eine bemalte Kiste aussehen.
 */

import * as THREE from 'three';

const SIZE = 1024;

type Layer = [HTMLCanvasElement, CanvasRenderingContext2D];

export interface Surface {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  emissiveMap?: THREE.CanvasTexture;
}

function layer(fill?: string): Layer {
  const element = document.createElement('canvas');
  element.width = SIZE;
  element.height = SIZE;
  const context = element.getContext('2d');
  if (!context) throw new Error('Canvas ohne 2D-Kontext');
  if (fill) {
    context.fillStyle = fill;
    context.fillRect(0, 0, SIZE, SIZE);
  }
  return [element, context];
}

function texture(element: HTMLCanvasElement, repeat: [number, number],
                 colour = false): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(element);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat[0], repeat[1]);
  map.anisotropy = 8;
  if (colour) map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/**
 * Macht aus einer Höhenkarte eine Normalenkarte.
 *
 * Sobel über die Helligkeit: die Steigung in x und y wird zur Neigung der
 * Oberfläche. Das ist der Unterschied zwischen einer Fuge, die man sieht,
 * und einer Fuge, an der sich Licht bricht.
 */
function toNormalMap(height: HTMLCanvasElement, strength = 2.2): HTMLCanvasElement {
  const source = height.getContext('2d')!.getImageData(0, 0, SIZE, SIZE).data;
  const [element, context] = layer();
  const target = context.createImageData(SIZE, SIZE);

  const at = (x: number, y: number) => {
    const ix = ((x % SIZE) + SIZE) % SIZE;
    const iy = ((y % SIZE) + SIZE) % SIZE;
    return source[(iy * SIZE + ix) * 4] / 255;
  };

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      const nx = dx * strength;
      const ny = dy * strength;
      const length = Math.sqrt(nx * nx + ny * ny + 1);
      const index = (y * SIZE + x) * 4;
      target.data[index] = ((nx / length) * 0.5 + 0.5) * 255;
      target.data[index + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      target.data[index + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      target.data[index + 3] = 255;
    }
  }
  context.putImageData(target, 0, 0);
  return element;
}

function speckle(context: CanvasRenderingContext2D, strength: number): void {
  const image = context.getImageData(0, 0, SIZE, SIZE);
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
 * Feine waagerechte Lamellen — das prägende Element der Hallenfassaden.
 *
 * Auf den Fotos ist das kein Muster, sondern die Wand selbst: Blechbänder im
 * Zentimeterabstand, die je nach Lichteinfall silbrig oder fast weiß wirken.
 */
function louvres(context: CanvasRenderingContext2D, top: number, bottom: number,
                 pitch: number, light: string, dark: string): void {
  for (let y = top; y < bottom; y += pitch) {
    context.fillStyle = light;
    context.fillRect(0, y, SIZE, pitch * 0.55);
    context.fillStyle = dark;
    context.fillRect(0, y + pitch * 0.55, SIZE, pitch * 0.45);
  }
}

/**
 * Hallenfassade nach den Referenzfotos.
 *
 * Aufbau von unten nach oben, wie gebaut: Sockel, Lamellenfeld, umlaufendes
 * Fensterband, Attika. Quer dazu die Betonstützen im festen Raster, die auf
 * den Fotos das Bild bestimmen.
 *
 * ``interior`` dreht die Warmtöne etwas heller und lässt die Attika weg — von
 * innen sieht man das Band aus Fenstern unter der Decke, nicht die Brüstung.
 */
export function facadeSurface(interior = false): Surface {
  const [colour, ctx] = layer(interior ? '#e7e3da' : '#dedbd3');
  const [height, hctx] = layer('#808080');
  const [rough, rctx] = layer('#b0b0b0');
  const [glow, gctx] = layer('#000000');

  // --- Lamellenfeld ------------------------------------------------------
  const bandTop = SIZE * 0.16;
  const bandBottom = SIZE * 0.78;
  louvres(ctx, bandTop, bandBottom, 9, interior ? '#e9e6de' : '#d3d6db',
          interior ? '#d8d4c9' : '#bcc1c8');
  louvres(hctx, bandTop, bandBottom, 9, '#a8a8a8', '#585858');
  rctx.fillStyle = '#9a9a9a';
  rctx.fillRect(0, bandTop, SIZE, bandBottom - bandTop);

  // --- Sockel: glatter Beton, unten nachgedunkelt ------------------------
  ctx.fillStyle = interior ? '#dcd8ce' : '#d2cfc7';
  ctx.fillRect(0, bandBottom, SIZE, SIZE - bandBottom);
  const grime = ctx.createLinearGradient(0, SIZE, 0, bandBottom);
  grime.addColorStop(0, 'rgba(70, 68, 64, 0.28)');
  grime.addColorStop(1, 'rgba(70, 68, 64, 0)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, bandBottom, SIZE, SIZE - bandBottom);
  rctx.fillStyle = '#cfcfcf';
  rctx.fillRect(0, bandBottom, SIZE, SIZE - bandBottom);

  // --- Fensterband -------------------------------------------------------
  // Das ist der Punkt, an dem eine Halle aufhört, eine Kiste zu sein.
  const glassTop = SIZE * 0.045;
  const glassBottom = SIZE * 0.155;
  ctx.fillStyle = interior ? '#cfe0ef' : '#7d94a8';
  ctx.fillRect(0, glassTop, SIZE, glassBottom - glassTop);
  // Glas spiegelt: sehr glatt, und von innen leuchtet Tageslicht herein.
  rctx.fillStyle = '#1c1c1c';
  rctx.fillRect(0, glassTop, SIZE, glassBottom - glassTop);
  gctx.fillStyle = interior ? '#9fc4e4' : '#20303c';
  gctx.fillRect(0, glassTop, SIZE, glassBottom - glassTop);

  // Sprossen im Fensterband.
  const mullion = SIZE / 12;
  for (let x = 0; x <= SIZE; x += mullion) {
    ctx.fillStyle = '#9a9c9f';
    ctx.fillRect(x - 2, glassTop, 4, glassBottom - glassTop);
    hctx.fillStyle = '#c8c8c8';
    hctx.fillRect(x - 2, glassTop, 4, glassBottom - glassTop);
    gctx.fillStyle = '#000000';
    gctx.fillRect(x - 2, glassTop, 4, glassBottom - glassTop);
  }

  if (!interior) {
    // Attika über dem Fensterband.
    ctx.fillStyle = '#d8d5cd';
    ctx.fillRect(0, 0, SIZE, glassTop);
    rctx.fillStyle = '#c4c4c4';
    rctx.fillRect(0, 0, SIZE, glassTop);
  }

  // --- Betonstützen ------------------------------------------------------
  // Auf den Fotos springen sie vor und werfen harte Schatten. Deshalb in
  // der Höhenkarte deutlich heller als alles andere.
  const bay = SIZE / 6;
  const width = bay * 0.15;
  for (let x = 0; x <= SIZE; x += bay) {
    const left = x - width / 2;
    ctx.fillStyle = interior ? '#e3dfd5' : '#dcd8ce';
    ctx.fillRect(left, 0, width, SIZE);
    // Schattenkante rechts der Stütze.
    ctx.fillStyle = 'rgba(90, 88, 82, 0.22)';
    ctx.fillRect(left + width, 0, width * 0.28, SIZE);

    hctx.fillStyle = '#f0f0f0';
    hctx.fillRect(left, 0, width, SIZE);
    rctx.fillStyle = '#d6d6d6';
    rctx.fillRect(left, 0, width, SIZE);
    gctx.fillStyle = '#000000';
    gctx.fillRect(left, 0, width, SIZE);
  }

  // --- Grüne Torschilder -------------------------------------------------
  // Klein, aber sie geben der Fassade den Massstab. Ohne sie fehlt dem Auge
  // jeder Anhaltspunkt, wie gross das Gebaeude ist.
  for (let x = bay * 0.5; x < SIZE; x += bay * 2) {
    const y = SIZE * 0.83;
    ctx.fillStyle = '#0f9d58';
    ctx.fillRect(x, y, bay * 0.16, bay * 0.16);
    gctx.fillStyle = '#0b4f2c';
    gctx.fillRect(x, y, bay * 0.16, bay * 0.16);
  }

  speckle(ctx, 0.035);

  return {
    map: texture(colour, [1, 1], true),
    normalMap: texture(toNormalMap(height, 2.6), [1, 1]),
    roughnessMap: texture(rough, [1, 1]),
    emissiveMap: texture(glow, [1, 1], true),
  };
}

/**
 * Hallenboden: versiegelter Estrich, der spiegelt.
 *
 * Auf den Fotos ist der Boden das hellste Element im Bild — er wirft die
 * Deckenleuchten fast ungebrochen zurück. Deshalb ist die Rauheit niedrig
 * und ungleichmässig: dort, wo alle langlaufen, ist er blank poliert, in den
 * Ecken matter.
 */
export function floorSurface(): Surface {
  const [colour, ctx] = layer('#b6b8bb');
  const [height, hctx] = layer('#808080');
  const [rough, rctx] = layer('#5a5a5a');

  for (let i = 0; i < 160; i += 1) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const radius = 20 + Math.random() * 90;
    ctx.fillStyle = `rgba(${170 + Math.random() * 40}, ${172 + Math.random() * 40}, ${176 + Math.random() * 36}, 0.06)`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * 0.32, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Laufspuren: dunkler in der Farbe, glatter in der Rauheit.
  for (let i = 0; i < 30; i += 1) {
    const x = Math.random() * SIZE;
    const width = 30 + Math.random() * 150;
    ctx.fillStyle = `rgba(96, 98, 104, ${0.02 + Math.random() * 0.03})`;
    ctx.fillRect(x, 0, width, SIZE);
    rctx.fillStyle = `rgba(0, 0, 0, ${0.05 + Math.random() * 0.08})`;
    rctx.fillRect(x, 0, width, SIZE);
  }

  // Plattenfugen alle vier Meter.
  const joint = SIZE / 4;
  ctx.strokeStyle = 'rgba(126, 128, 134, 0.5)';
  hctx.strokeStyle = '#3a3a3a';
  ctx.lineWidth = 2;
  hctx.lineWidth = 3;
  for (let step = 0; step <= SIZE; step += joint) {
    for (const context of [ctx, hctx]) {
      context.beginPath();
      context.moveTo(step, 0);
      context.lineTo(step, SIZE);
      context.moveTo(0, step);
      context.lineTo(SIZE, step);
      context.stroke();
    }
  }

  speckle(ctx, 0.03);

  return {
    map: texture(colour, [1, 1], true),
    normalMap: texture(toNormalMap(height, 1.1), [1, 1]),
    roughnessMap: texture(rough, [1, 1]),
  };
}

/**
 * Hallendecke: dunkles Trapezblech mit Fachwerk.
 *
 * Die Leuchtbänder darunter sind eigene Geometrie, keine Textur — sie müssen
 * sich im Boden spiegeln, und eine aufgemalte Lampe spiegelt nicht.
 */
export function ceilingSurface(): Surface {
  const [colour, ctx] = layer('#33363c');
  const [height, hctx] = layer('#808080');
  const [rough, rctx] = layer('#8c8c8c');

  // Trapezblech quer.
  for (let y = 0; y < SIZE; y += 12) {
    ctx.fillStyle = '#3a3d44';
    ctx.fillRect(0, y, SIZE, 7);
    hctx.fillStyle = '#a0a0a0';
    hctx.fillRect(0, y, SIZE, 7);
  }

  // Fachwerkträger im groben Raster.
  const truss = SIZE / 5;
  ctx.strokeStyle = '#4c505a';
  hctx.strokeStyle = '#e0e0e0';
  rctx.strokeStyle = '#5a5a5a';
  for (const context of [ctx, hctx, rctx]) {
    context.lineWidth = 10;
    for (let step = 0; step <= SIZE; step += truss) {
      context.beginPath();
      context.moveTo(step, 0);
      context.lineTo(step, SIZE);
      context.moveTo(0, step);
      context.lineTo(SIZE, step);
      context.stroke();
    }
  }

  speckle(ctx, 0.04);

  return {
    map: texture(colour, [60, 60], true),
    normalMap: texture(toNormalMap(height, 1.6), [60, 60]),
    roughnessMap: texture(rough, [60, 60]),
  };
}

/**
 * Standflächen: Teppich, Messebauplatte, Stoffbanner.
 *
 * Die Farbe eines Standes trägt Information — belegt, gewählt, auf der Route —
 * und kommt deshalb aus den Vertexfarben. Diese Karte darf sie nicht
 * überschreiben, sondern nur brechen: sie ist fast weiß und liefert
 * ausschließlich Struktur. Multipliziert mit der Vertexfarbe bleibt die
 * Aussage erhalten, aber die Fläche hört auf, ein Farbklecks zu sein.
 */
export function standSurface(): Surface {
  const [colour, ctx] = layer('#f2f2f2');
  const [height, hctx] = layer('#808080');
  const [rough, rctx] = layer('#d2d2d2');

  // Gewebe: zwei versetzte Rasterrichtungen, wie bei Messeteppich.
  const weave = 6;
  for (let y = 0; y < SIZE; y += weave) {
    for (let x = 0; x < SIZE; x += weave) {
      const shade = 226 + Math.floor(Math.random() * 26);
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      ctx.fillRect(x, y, weave - 1, weave - 1);
      const bump = 96 + Math.floor(Math.random() * 96);
      hctx.fillStyle = `rgb(${bump}, ${bump}, ${bump})`;
      hctx.fillRect(x, y, weave - 1, weave - 1);
    }
  }

  // Plattenstöße des Systembaus alle zweieinhalb Kacheln: die einzige harte
  // Kante auf einem Stand, und die, an der man den Maßstab abliest.
  const panel = SIZE / 4;
  ctx.strokeStyle = 'rgba(150, 150, 152, 0.55)';
  hctx.strokeStyle = '#303030';
  rctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  for (const context of [ctx, hctx, rctx]) {
    context.lineWidth = 3;
    for (let step = 0; step <= SIZE; step += panel) {
      context.beginPath();
      context.moveTo(step, 0);
      context.lineTo(step, SIZE);
      context.moveTo(0, step);
      context.lineTo(SIZE, step);
      context.stroke();
    }
  }

  speckle(ctx, 0.02);

  return {
    map: texture(colour, [1, 1], true),
    normalMap: texture(toNormalMap(height, 0.9), [1, 1]),
    roughnessMap: texture(rough, [1, 1]),
  };
}

/** Lädt das entzerrte Luftbild. */
export function orthoTexture(url: string): THREE.Texture {
  const map = new THREE.TextureLoader().load(url);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 8;
  return map;
}

export function disposeSurface(surface: Surface): void {
  surface.map.dispose();
  surface.normalMap.dispose();
  surface.roughnessMap.dispose();
  surface.emissiveMap?.dispose();
}
