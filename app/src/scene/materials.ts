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
 * Senkrechte Lamellen — das prägende Element der Hallenfassaden.
 *
 * Auf den Fotos laufen sie **stehend**, nicht liegend: schmale weiße Streben
 * im Meterabstand, jede mit einer schmalen Schattenkante an einer Seite, wo
 * das Profil vorspringt. Eine horizontale Bänderung war hier zuvor der
 * Fehler -- an keinem Referenzfoto liegt eine Lamelle waagerecht.
 */
function louvres(context: CanvasRenderingContext2D, top: number, bottom: number,
                 pitch: number, light: string, dark: string): void {
  for (let x = 0; x < SIZE; x += pitch) {
    // Schmale Strebe, breiterer Zwischenraum -- einzelne Lamellen, keine
    // geschlossene Fläche mit aufgemalten Linien.
    context.fillStyle = dark;
    context.fillRect(x, top, pitch, bottom - top);
    context.fillStyle = light;
    context.fillRect(x, top, pitch * 0.4, bottom - top);
    context.fillStyle = 'rgba(0, 0, 0, 0.12)';
    context.fillRect(x + pitch * 0.4, top, pitch * 0.08, bottom - top);
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
  // Weiß, nicht beige: die Fotos zeigen kühles #f0f0f2, kein Sandton.
  const [colour, ctx] = layer(interior ? '#eceae3' : '#f0f0f2');
  const [height, hctx] = layer('#808080');
  const [rough, rctx] = layer('#b0b0b0');
  const [glow, gctx] = layer('#000000');

  // --- Lamellenfeld: stehende Streben, rund ein Meter Rastermaß ----------
  // Die Texturkachel deckt FACADE_TILE_M = 30 m ab (build_buildings.py),
  // 1024 px darauf macht rund 34 px/m -- exakt der Rastermassstab hier.
  const bandTop = SIZE * 0.16;
  const bandBottom = SIZE * 0.78;
  const lamellePitch = 34;
  louvres(ctx, bandTop, bandBottom, lamellePitch,
          interior ? '#f2f0e9' : '#ffffff', interior ? '#ddd9cf' : '#c7cbd1');
  louvres(hctx, bandTop, bandBottom, lamellePitch, '#c8c8c8', '#606060');
  rctx.fillStyle = '#a8a8a8';
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
  const [colour, ctx] = layer('#c5c5c7');
  const [height, hctx] = layer('#808080');
  // Poliert: niedrige Grundrauheit statt der vorherigen matten Fläche.
  const [rough, rctx] = layer('#3c3c3c');

  // Dunkle Einlagequadrate, wie auf den Referenzfotos: kein Schachbrett,
  // sondern unregelmässig gesetzte Platten in einem groben Raster.
  const tile = SIZE / 8;
  for (let ty = 0; ty < 8; ty += 1) {
    for (let tx = 0; tx < 8; tx += 1) {
      if ((tx + ty) % 2 !== 0 || Math.random() < 0.3) continue;
      ctx.fillStyle = 'rgba(60, 60, 65, 0.16)';
      ctx.fillRect(tx * tile, ty * tile, tile, tile);
    }
  }

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
  const [colour, ctx] = layer('#2a2a2e');
  const [height, hctx] = layer('#808080');
  const [rough, rctx] = layer('#8c8c8c');

  // Trapezblech quer.
  for (let y = 0; y < SIZE; y += 12) {
    ctx.fillStyle = '#313136';
    ctx.fillRect(0, y, SIZE, 7);
    hctx.fillStyle = '#a0a0a0';
    hctx.fillRect(0, y, SIZE, 7);
  }

  // Fachwerkträger im groben Raster.
  const truss = SIZE / 5;
  ctx.strokeStyle = '#4a4a52';
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

  // Lüftungsrohre: dickere Querleitungen, versetzt zum Trägerraster.
  ctx.strokeStyle = '#55555e';
  hctx.strokeStyle = '#8c8c8c';
  for (const context of [ctx, hctx]) {
    context.lineWidth = 22;
    for (let step = truss / 2; step <= SIZE; step += truss) {
      context.beginPath();
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
 * Kantenlänge einer Texturkachel auf dem amtlichen Weltmodell, in Metern.
 *
 * Das registrierte Modell bringt keine UV-Koordinaten mit — die werden beim
 * Laden aus den Positionen projiziert, in Metern. Diese Zahlen sagen, wie
 * gross eine Kachel dabei ist, und gehören deshalb neben die Textur, die sie
 * malt, und nicht an die Stelle, die sie anwendet.
 */
export const WELT_KACHEL_M = { boden: 16, decke: 12, wand: 30 };

/**
 * Hallenboden von innen: geschliffener Estrich.
 *
 * Auf den Referenzfotos ist der Boden kein Belag mit Fugen, sondern eine
 * durchgehende graue Fläche mit den Schleifspuren der Maschine — und er
 * spiegelt die Decke so deutlich, dass die Leuchtenreihen ein zweites Mal
 * darin stehen. Genau das trägt den ganzen Raumeindruck: ohne Spiegelung
 * wirkt jede Halle wie ein Foto bei bedecktem Himmel.
 */
export function hallenbodenSurface(): Surface {
  const [colour, ctx] = layer('#74777c');
  // War bisher unbemalt: `toNormalMap` las eine reine Fläche und lieferte
  // damit überall dieselbe, nach oben zeigende Normale -- ein Boden ohne
  // jede Neigung, so glatt wie Glas, unabhängig davon, was Farbe und Rauheit
  // zeigten. Jede Spur unten bekommt jetzt auch eine Höhe.
  const [height, hctx] = layer('#808080');
  // Dunkel = glatt. Der Boden ist überall poliert, aber nicht gleichmässig.
  const [rough, rctx] = layer('#2e2e2e');

  // Schleifbahnen der Maschine: lange, leicht gebogene Züge -- als echte
  // Rillen, nicht nur als Farbwechsel.
  for (let i = 0; i < 90; i += 1) {
    const y = Math.random() * SIZE;
    const strength = 0.03 + Math.random() * 0.05;
    const breite = 6 + Math.random() * 40;
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? 120 : 168}, 124, 130, ${strength})`;
    ctx.lineWidth = breite;
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.bezierCurveTo(SIZE * 0.3, y + (Math.random() - 0.5) * 60,
                      SIZE * 0.7, y + (Math.random() - 0.5) * 60, SIZE + 20, y);
    ctx.stroke();
    rctx.strokeStyle = `rgba(255,255,255,${strength * 0.8})`;
    rctx.lineWidth = breite;
    rctx.stroke();
    // Deutlich schwächer als Farbe und Rauheit: eine Rille ist ein sanfter
    // Wechsel im Relief, keine Kante. Zu kräftige Werte hier ergaben nach
    // dem Sobel-Filter ein wirres Ringelmuster statt eines Bodens.
    hctx.strokeStyle = `rgba(0, 0, 0, ${0.1 + Math.random() * 0.08})`;
    hctx.lineWidth = breite * 0.6;
    hctx.beginPath();
    hctx.moveTo(-20, y);
    hctx.bezierCurveTo(SIZE * 0.3, y + (Math.random() - 0.5) * 60,
                       SIZE * 0.7, y + (Math.random() - 0.5) * 60, SIZE + 20, y);
    hctx.stroke();
  }

  // Flecken vom Aufbau: hellere Schleier, wo Kleber und Teppichband sassen --
  // flache, breite Erhebungen, kein scharfer Rand.
  for (let i = 0; i < 70; i += 1) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const radius = 30 + Math.random() * 130;
    const dreh = Math.random() * Math.PI;
    const laenge = radius * (0.3 + Math.random() * 0.5);
    ctx.fillStyle = `rgba(150, 154, 160, ${0.03 + Math.random() * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, laenge, dreh, 0, Math.PI * 2);
    ctx.fill();
    rctx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`;
    rctx.fill();
    hctx.fillStyle = `rgba(255, 255, 255, ${0.04 + Math.random() * 0.05})`;
    hctx.beginPath();
    hctx.ellipse(x, y, radius, laenge, dreh, 0, Math.PI * 2);
    hctx.fill();
  }

  // Dehnfugen alle acht Meter -- die einzige durchgehende Linie des Estrichs,
  // und die einzige mit einer echten Kante statt eines Schleiers.
  const joint = SIZE / 2;
  ctx.strokeStyle = 'rgba(70, 72, 78, 0.55)';
  ctx.lineWidth = 3;
  hctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  hctx.lineWidth = 3;
  for (let step = 0; step <= SIZE; step += joint) {
    ctx.beginPath();
    ctx.moveTo(step, 0);
    ctx.lineTo(step, SIZE);
    ctx.moveTo(0, step);
    ctx.lineTo(SIZE, step);
    ctx.stroke();
    hctx.beginPath();
    hctx.moveTo(step, 0);
    hctx.lineTo(step, SIZE);
    hctx.moveTo(0, step);
    hctx.lineTo(SIZE, step);
    hctx.stroke();
  }

  speckle(ctx, 0.025);

  // Weichzeichnen, bevor daraus Normalen werden: neunzig sich
  // überlappende Schleifbahnen ergaben scharfkantig ein Ringelmuster wie
  // ein Fingerabdruck statt eines Bodenreliefs. Ein Bodenschliff hat keine
  // Kanten, nur sanfte Übergänge -- die Unschärfe ist hier die Zeichnung,
  // nicht ihr Verlust.
  hctx.filter = 'blur(7px)';
  hctx.drawImage(height, 0, 0);
  hctx.filter = 'none';

  return {
    map: texture(colour, [1, 1], true),
    // Massvoll, nicht die 2,6 der Fassade: der Boden ist geschliffen, kein
    // Sichtbeton. Vorher stand hier faktisch 0 -- eine Hoehenkarte, die nie
    // bemalt wurde --, jetzt reicht es fuer sichtbares, aber ruhiges Relief.
    normalMap: texture(toNormalMap(height, 0.8), [1, 1]),
    roughnessMap: texture(rough, [1, 1]),
  };
}

/**
 * Hallendecke von innen: schwarze Kassettendecke mit Leuchtfeldern.
 *
 * Die Fotos zeigen oben nicht das Dach, sondern eine fast schwarze Decke, in
 * der die Leuchten als helle Rechtecke in einem strengen Raster sitzen. Das
 * ist der Grund, warum eine Messehalle innen wie eine Halle aussieht und
 * nicht wie ein überdachter Hof: dunkle Decke, helle Felder, sonst nichts.
 *
 * Die Leuchtfelder stehen in der Emissionskarte. Sie leuchten damit auch
 * dann, wenn keine Lampe auf sie scheint — was für eine Leuchte die einzig
 * richtige Beschreibung ist.
 */
export function hallendeckeSurface(): Surface {
  const [colour, ctx] = layer('#17181c');
  const [height, hctx] = layer('#808080');
  const [rough, rctx] = layer('#c0c0c0');
  const [glow, gctx] = layer('#000000');

  // Kassettenraster: die Decke ist in Felder von rund 1,5 m geteilt.
  const cell = SIZE / 8;
  ctx.strokeStyle = '#25262c';
  hctx.strokeStyle = '#d0d0d0';
  for (const context of [ctx, hctx]) {
    context.lineWidth = 5;
    for (let step = 0; step <= SIZE; step += cell) {
      context.beginPath();
      context.moveTo(step, 0);
      context.lineTo(step, SIZE);
      context.moveTo(0, step);
      context.lineTo(SIZE, step);
      context.stroke();
    }
  }

  // Trägerlage darüber, gröber und dunkler.
  ctx.strokeStyle = '#0e0f12';
  rctx.strokeStyle = '#909090';
  for (const context of [ctx, rctx]) {
    context.lineWidth = 26;
    for (let step = cell * 2; step <= SIZE; step += cell * 4) {
      context.beginPath();
      context.moveTo(step, 0);
      context.lineTo(step, SIZE);
      context.stroke();
    }
  }

  // Leuchtfelder: vier je Kachel, also rund alle sechs Meter eines.
  const panelW = cell * 1.5;
  const panelH = cell * 0.62;
  for (const px of [cell, cell * 5]) {
    for (const py of [cell, cell * 5]) {
      const x = px - panelW / 2 + cell / 2;
      const y = py - panelH / 2 + cell / 2;
      ctx.fillStyle = '#f6f2e8';
      ctx.fillRect(x, y, panelW, panelH);
      gctx.fillStyle = '#fff6e2';
      gctx.fillRect(x, y, panelW, panelH);
      // Ein schmaler Hof um die Leuchte -- die Decke daneben wird angestrahlt.
      gctx.fillStyle = 'rgba(255, 240, 210, 0.22)';
      gctx.fillRect(x - 14, y - 14, panelW + 28, panelH + 28);
      rctx.fillStyle = '#e8e8e8';
      rctx.fillRect(x, y, panelW, panelH);
    }
  }

  speckle(ctx, 0.02);

  return {
    map: texture(colour, [1, 1], true),
    normalMap: texture(toNormalMap(height, 1.2), [1, 1]),
    roughnessMap: texture(rough, [1, 1]),
    emissiveMap: texture(glow, [1, 1], true),
  };
}

/**
 * Glasfassade des Boulevards.
 *
 * Auf dem Referenzfoto sind die Längsseiten raumhoch verglast: schlanke
 * Pfosten im gut anderthalb Meter breiten Raster, ein Riegel auf Türhöhe,
 * darüber durchgehend Glas bis unter die Decke. Das ist der Grund, warum der
 * Boulevard hell ist und eine Halle nicht -- er steht im Tageslicht.
 */
export function glasfassadeSurface(): Surface & { alphaMap: THREE.CanvasTexture } {
  const [colour, ctx] = layer('#e8f0f6');
  const [height, hctx] = layer('#808080');
  const [rough, rctx] = layer('#141414');
  const [glow, gctx] = layer('#000000');
  // Die Alphakarte entscheidet, was Rahmen ist und was Glas: weiss bleibt
  // stehen, dunkel wird durchsichtig. Ohne sie ist eine Glasfassade eine
  // hellblaue Wand mit aufgemalten Sprossen.
  const [alpha, actx] = layer('#2a2a2a');

  // Das Glas selbst leuchtet leicht: draussen ist Tag.
  gctx.fillStyle = '#9fc0dc';
  gctx.fillRect(0, 0, SIZE, SIZE);

  // Sockel: undurchsichtige Bruestung unten.
  const sockel = SIZE * 0.9;
  ctx.fillStyle = '#eceef0';
  ctx.fillRect(0, sockel, SIZE, SIZE - sockel);
  gctx.fillStyle = '#000000';
  gctx.fillRect(0, sockel, SIZE, SIZE - sockel);
  rctx.fillStyle = '#b0b0b0';
  rctx.fillRect(0, sockel, SIZE, SIZE - sockel);
  actx.fillStyle = '#ffffff';
  actx.fillRect(0, sockel, SIZE, SIZE - sockel);

  // Pfosten im Raster -- die Kachel deckt 30 m ab, also alle 1,7 m einer.
  const pfosten = SIZE / 18;
  for (let x = 0; x < SIZE; x += pfosten) {
    for (const [context, farbe] of [[ctx, '#fbfcfd'], [gctx, '#101010'],
                                    [hctx, '#d8d8d8'], [actx, '#ffffff']] as const) {
      context.fillStyle = farbe;
      context.fillRect(x, 0, 9, SIZE);
    }
  }
  // Riegel auf Tuerhoehe und unter der Decke.
  for (const y of [SIZE * 0.08, SIZE * 0.6]) {
    for (const [context, farbe] of [[ctx, '#fbfcfd'], [gctx, '#101010'],
                                    [hctx, '#d8d8d8'], [actx, '#ffffff']] as const) {
      context.fillStyle = farbe;
      context.fillRect(0, y, SIZE, 10);
    }
  }

  return {
    map: texture(colour, [1, 1], true),
    normalMap: texture(toNormalMap(height, 1.0), [1, 1]),
    roughnessMap: texture(rough, [1, 1]),
    emissiveMap: texture(glow, [1, 1], true),
    alphaMap: texture(alpha, [1, 1]),
  };
}

/**
 * Decke des Boulevards: hell, mit sichtbarer Tragstruktur.
 *
 * Anders als in der Halle ist sie nicht schwarz, sondern weiss -- auf dem
 * Foto liegt das Licht oben, nicht die Dunkelheit. Quer laufen die Träger,
 * dazwischen die geschlossenen Felder.
 */
export function boulevarddeckeSurface(): Surface {
  const [colour, ctx] = layer('#eceef0');
  const [height, hctx] = layer('#808080');
  const [rough, rctx] = layer('#9a9a9a');

  // Querträger alle rund drei Meter (Kachel = 12 m).
  const traeger = SIZE / 4;
  for (let y = 0; y < SIZE; y += traeger) {
    ctx.fillStyle = '#c9ccd0';
    ctx.fillRect(0, y, SIZE, 26);
    hctx.fillStyle = '#e8e8e8';
    hctx.fillRect(0, y, SIZE, 26);
    rctx.fillStyle = '#6a6a6a';
    rctx.fillRect(0, y, SIZE, 26);
  }
  // Feine Fugen der Deckenfelder dazwischen.
  ctx.strokeStyle = 'rgba(150, 154, 160, 0.5)';
  ctx.lineWidth = 3;
  for (let x = 0; x <= SIZE; x += SIZE / 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, SIZE);
    ctx.stroke();
  }

  speckle(ctx, 0.015);

  return {
    map: texture(colour, [1, 1], true),
    normalMap: texture(toNormalMap(height, 1.0), [1, 1]),
    roughnessMap: texture(rough, [1, 1]),
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
