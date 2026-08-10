/**
 * Der BEUTELTIER-Look: Cel-Shading, Konturen, Materialfamilien.
 *
 * Das Gegenstück zu `materials.ts`. Dort entstehen Texturen -- was eine Fläche
 * zeigt. Hier steht, wie sie beleuchtet und umrandet wird: mit wie vielen
 * Lichtstufen, wie dick die Kontur ist, wie stark sie glänzen darf.
 *
 * Warum getrennt: die Texturen sind an den Referenzfotos gebaut und sollen
 * bleiben. Der Look ist eine Entscheidung darüber, und die soll man an einer
 * Stelle ändern können, nicht in dreissig Komponenten.
 *
 * Zwei Regeln aus der Stilbibel bestimmen den Aufbau:
 *
 * * **Es gibt Familien, keine Einzelmaterialien.** Zehn Familien decken die
 *   ganze Messe ab. Wer eine elfte braucht, hat meistens eine der zehn nicht
 *   gefunden.
 * * **Konturen sind nicht überall gleich dick.** Türen, Treppen, Geländer und
 *   Schilder tragen die starke Linie, Wände und Böden die mittlere, ferne
 *   Flächen fast keine. Genau das trennt eine lesbare Zeichnung von einem
 *   Modell mit einem Filter darüber.
 *
 * Die Kontur entsteht als umgestülpte Hülle (`THREE.BackSide`, um einen
 * festen Betrag in Metern aufgeblasen) und nicht als Bildschirmeffekt. Das
 * ist die einzige Bauart, in der die Linienstärke **pro Objekt** gilt --
 * ein Kanteneffekt über das fertige Bild kennt keine Türen, nur Pixel. Und
 * sie kostet keinen zweiten Renderdurchgang, was auf dem Telefon zählt.
 */

import * as THREE from 'three';

/**
 * Wie viele Lichtstufen ein Material hat.
 *
 * Zwei Stufen sind der harte Comic-Look, drei der ruhigere. Mehr als drei
 * ist keine Stilentscheidung mehr, sondern ein weicher Verlauf mit
 * Zwischenschritten -- dann kann man auch gleich normal shaden.
 */
export type Stufen = 2 | 3;

/**
 * Wie stark ein Bauteil umrandet wird, in Metern Hüllenabstand.
 *
 * Die Zahlen sind Weltmaß und nicht Pixel: eine Tür behält ihre Linie, wenn
 * man näher herangeht, und eine Halle am Horizont franst nicht aus. `keine`
 * ist ausdrücklich enthalten -- die Abwesenheit einer Kontur ist eine
 * Entscheidung und soll benannt werden können.
 */
export const KONTUR_M = {
  keine: 0,
  schwach: 0.02,
  mittel: 0.05,
  stark: 0.12,
} as const;

export type Kontur = keyof typeof KONTUR_M;

/**
 * Eine Materialfamilie: Grundton, Lichtstufen, Kontur, Glanz.
 *
 * `glanz` ist bewusst eine Zahl von 0 bis 1 und keine Rauheit: Toon-Materialien
 * kennen kein PBR. Sie steuert, wie hell die Glanzstufe ausfällt, und 0 heisst
 * matt.
 */
export interface Familie {
  /** Kennung aus der Stilbibel, M01 bis M10. */
  id: string;
  name: string;
  grundton: string;
  stufen: Stufen;
  kontur: Kontur;
  glanz: number;
  /** Wofür sie gedacht ist -- damit die elfte Familie gar nicht erst entsteht. */
  einsatz: string;
}

/**
 * Die zehn Familien der Stilbibel.
 *
 * Reihenfolge und Kennungen sind die aus dem Dokument; wer hier etwas
 * umsortiert, macht die Stilbibel zur Fälschung.
 */
export const FAMILIEN: Record<string, Familie> = {
  M01: {
    id: 'M01',
    name: 'WALL_LIGHT',
    grundton: '#c9c5bd',
    stufen: 3,
    kontur: 'mittel',
    glanz: 0.05,
    einsatz: 'Helle Hallen- und Foyerwände, Boulevard, Innenwände',
  },
  M02: {
    id: 'M02',
    name: 'STRUCTURE_DARK',
    grundton: '#2b2e33',
    stufen: 2,
    kontur: 'stark',
    glanz: 0.12,
    einsatz: 'Stützen, Deckenträger, dunkle Hallenstruktur, technische Rahmen',
  },
  M03: {
    id: 'M03',
    name: 'FLOOR_DARK',
    grundton: '#3a3d42',
    stufen: 3,
    kontur: 'schwach',
    glanz: 0.35,
    einsatz: 'Dunkle Messehallenböden',
  },
  M04: {
    id: 'M04',
    name: 'FLOOR_LIGHT',
    grundton: '#cfc7b6',
    stufen: 3,
    kontur: 'schwach',
    glanz: 0.22,
    einsatz: 'Foyer- und Boulevardböden, helle Innenzonen',
  },
  M05: {
    id: 'M05',
    name: 'OUTDOOR_CONCRETE',
    grundton: '#d5d1c7',
    stufen: 2,
    kontur: 'schwach',
    glanz: 0.04,
    einsatz: 'Plätze, Vorflächen, Aussengelände',
  },
  M06: {
    id: 'M06',
    name: 'WOOD_DECK',
    grundton: '#9a6b3f',
    stufen: 3,
    kontur: 'mittel',
    glanz: 0.1,
    einsatz: 'Terrassen, Aufenthaltsdecks, Einfassung von Pflanzinseln',
  },
  M07: {
    id: 'M07',
    name: 'GLASS_COOL',
    grundton: '#8fa9bd',
    stufen: 2,
    kontur: 'mittel',
    glanz: 0.55,
    einsatz: 'Fassaden, Glasgeländer, Rolltreppenseiten',
  },
  M08: {
    id: 'M08',
    name: 'METAL',
    grundton: '#a8adb4',
    stufen: 2,
    kontur: 'stark',
    glanz: 0.6,
    einsatz: 'Handläufe, Geländer, Rolltreppenkanten',
  },
  M09: {
    id: 'M09',
    name: 'VEGETATION',
    grundton: '#5f8043',
    stufen: 3,
    kontur: 'stark',
    glanz: 0.0,
    einsatz: 'Baumkronen und Sträucher',
  },
  M10: {
    id: 'M10',
    name: 'SIGNAGE',
    grundton: '#2f7d4f',
    stufen: 2,
    kontur: 'stark',
    glanz: 0.0,
    einsatz: 'Hallennummern, Leitsystem, Wegweiser, Editormarker',
  },
};

/**
 * Die Stufentextur, die aus weichem Licht Stufen macht.
 *
 * Ein Streifen von wenigen Pixeln, den `MeshToonMaterial` als Nachschlagewerk
 * benutzt: es rechnet die Beleuchtung wie sonst auch und liest den Farbwert
 * dann hier ab, statt ihn direkt zu nehmen. `NearestFilter` ist dabei nicht
 * Geschmack, sondern Bedingung -- mit weicher Filterung käme genau der
 * Verlauf zurück, den die Stufen loswerden sollen.
 *
 * Die Texturen werden geteilt: es gibt nur zwei, und sie hängen an nichts,
 * was pro Objekt verschieden wäre.
 */
const stufenCache = new Map<Stufen, THREE.DataTexture>();

export function stufenTextur(stufen: Stufen): THREE.DataTexture {
  const fertig = stufenCache.get(stufen);
  if (fertig) return fertig;
  // Die Stufen liegen nicht gleichmässig: der Sprung von Schatten zu Licht
  // soll früh kommen, damit beschienene Flächen zusammenhängend hell bleiben
  // und nicht in der Mitte auseinanderfallen.
  const werte = stufen === 2 ? [90, 255] : [70, 168, 255];
  const daten = new Uint8Array(werte.length * 4);
  werte.forEach((wert, index) => {
    daten[index * 4] = wert;
    daten[index * 4 + 1] = wert;
    daten[index * 4 + 2] = wert;
    daten[index * 4 + 3] = 255;
  });
  const textur = new THREE.DataTexture(daten, werte.length, 1, THREE.RGBAFormat);
  textur.minFilter = THREE.NearestFilter;
  textur.magFilter = THREE.NearestFilter;
  textur.generateMipmaps = false;
  textur.needsUpdate = true;
  stufenCache.set(stufen, textur);
  return textur;
}

/** Was von einer Fläche in ein Toon-Material übernommen wird. */
export interface Karten {
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
}

/**
 * Ein Toon-Material nach einer Familie.
 *
 * Die Rauheitskarte aus `materials.ts` bleibt aussen vor: `MeshToonMaterial`
 * kennt keine Rauheit. Ihre Aufgabe -- zu trennen, was glänzt und was nicht --
 * übernimmt `glanz` der Familie, und zwar für die ganze Fläche statt pro Pixel.
 * Das ist ein Verlust und eine Stilentscheidung zugleich: gestufter Glanz auf
 * einer gestuften Fläche wäre Rauschen.
 */
export function toonMaterial(
  familie: Familie,
  karten: Karten = {},
  zusatz: THREE.MeshToonMaterialParameters = {},
): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    color: new THREE.Color(familie.grundton),
    gradientMap: stufenTextur(familie.stufen),
    map: karten.map ?? null,
    normalMap: karten.normalMap ?? null,
    alphaMap: karten.alphaMap ?? null,
    ...zusatz,
  });
  if (familie.glanz > 0) {
    // Toon kennt kein Metall. Der Glanz kommt als eigenes Leuchten dazu, in
    // der Farbe der Familie und gedeckelt -- sonst wird aus Stahl eine Lampe.
    material.emissive = new THREE.Color(familie.grundton);
    material.emissiveIntensity = Math.min(familie.glanz, 1) * 0.28;
    if (karten.emissiveMap) material.emissiveMap = karten.emissiveMap;
  }
  material.name = `${familie.id}|${familie.name}`;
  return material;
}

/**
 * Das Material der Konturhülle.
 *
 * Es wird nicht beleuchtet -- eine Kontur, die im Schatten heller oder dunkler
 * wird, ist keine Kontur mehr, sondern eine weitere Fläche. `BackSide` sorgt
 * dafür, dass nur der Rand stehen bleibt: die zugewandte Seite der aufgeblasenen
 * Hülle wird weggeschnitten, sichtbar bleibt der Ring ringsherum.
 */
const konturCache = new Map<string, THREE.MeshBasicMaterial>();

export function konturMaterial(farbe = '#14161a'): THREE.MeshBasicMaterial {
  const fertig = konturCache.get(farbe);
  if (fertig) return fertig;
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(farbe),
    side: THREE.BackSide,
  });
  material.name = `kontur|${farbe}`;
  konturCache.set(farbe, material);
  return material;
}

/**
 * Wie weit die Hülle aufgeblasen wird, in Metern.
 *
 * Der Umweg über eine Funktion statt über `KONTUR_M` direkt ist Absicht: die
 * Entfernungsregel der Stilbibel -- ferne Flächen tragen kaum Kontur -- gehört
 * an genau eine Stelle. `entfernung` ist der Abstand zur Kamera in Metern;
 * ohne Angabe gilt die volle Stärke.
 */
export function konturStaerke(kontur: Kontur, entfernung?: number): number {
  const grund = KONTUR_M[kontur];
  if (grund === 0 || entfernung === undefined) return grund;
  // Ab 150 m verliert die Linie, ab 400 m ist sie weg. Dazwischen linear.
  if (entfernung <= 150) return grund;
  if (entfernung >= 400) return 0;
  return grund * (1 - (entfernung - 150) / 250);
}

/**
 * Die Konturhülle zu einem fertigen Mesh, als Geschwister zum Anhängen.
 *
 * Für Geometrie, die nicht durch React läuft -- die amtlichen GLB-Pakete
 * kommen als Objektbaum und nicht als Komponenten. Geteilt wird die Geometrie,
 * aufgeblasen wird im Vertex-Shader: eine zweite Kopie jeder Halle wäre der
 * halbe Speicher für eine Linie.
 *
 * `null`, wenn die Geometrie keine Normalen führt -- ohne sie gibt es keine
 * Richtung, in die aufgeblasen werden könnte, und das Ergebnis wäre ein
 * schwarzer Klotz statt einer Kontur.
 */
export function konturHuelle(
  mesh: THREE.Mesh,
  staerke: number,
  farbe?: string,
): THREE.Mesh | null {
  if (staerke <= 0 || !mesh.geometry.attributes.normal) return null;
  const material = konturMaterial(farbe).clone();
  // `normal` und nicht `objectNormal`: letzteres legt erst der
  // Beleuchtungs-Baustein an, und die Konturhuelle wird nicht beleuchtet.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       transformed += normalize(normal) * ${staerke.toFixed(4)};`,
    );
  };
  material.needsUpdate = true;
  const huelle = new THREE.Mesh(mesh.geometry, material);
  huelle.name = `${mesh.name || 'mesh'}|kontur`;
  huelle.castShadow = false;
  huelle.receiveShadow = false;
  huelle.raycast = () => null;
  huelle.renderOrder = -1;
  huelle.userData.kontur = true;
  return huelle;
}

/**
 * Der Kontrastschub für ausgewählte oder editierbare Objekte.
 *
 * Aus der Stilbibel: der Edit-Modus ist kein Fremdkörper, sondern dieselbe
 * Sprache eine Stufe lauter. Deshalb keine eigene Farbe auf der Fläche,
 * sondern eine hellere und dickere Kontur.
 */
export const EDIT_KONTUR = { farbe: '#ffd23c', faktor: 2.2 } as const;

/** Gibt geteilte Ressourcen frei. Nur für Tests und Szenenwechsel gedacht. */
export function stilAufraeumen(): void {
  stufenCache.forEach((textur) => textur.dispose());
  stufenCache.clear();
  konturCache.forEach((material) => material.dispose());
  konturCache.clear();
}
