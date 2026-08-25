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

import { familienZeichnung, kachelung } from './textur';

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
 *
 * Die Grundtoene sind nach einem Cel-/Archer-Vorbild gewaehlt: gesaettigt
 * genug, dass die Stufen spaeter sichtbar werden, aber gedeckt genug, dass
 * der Hallencharakter nicht verloren geht. Wer hier z.B. reine Weiss-Toene
 * eintraegt, kippt die Szene in eine High-Key-Aquarell-Optik -- die Schatten
 * haetten dann keinen Hue mehr, sich vom Licht abzuheben.
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
    glanz: 0.0,
    einsatz: 'Helle Hallen- und Foyerwände, Boulevard, Innenwände',
  },
  M02: {
    id: 'M02',
    name: 'STRUCTURE_DARK',
    grundton: '#3a3d44',
    stufen: 2,
    kontur: 'stark',
    glanz: 0.0,
    einsatz: 'Stützen, Deckenträger, dunkle Hallenstruktur, technische Rahmen',
  },
  M03: {
    id: 'M03',
    name: 'FLOOR_DARK',
    grundton: '#525a66',
    stufen: 3,
    kontur: 'schwach',
    glanz: 0.15,
    einsatz: 'Dunkle Messehallenböden',
  },
  M04: {
    id: 'M04',
    name: 'FLOOR_LIGHT',
    grundton: '#a89c80',
    stufen: 3,
    kontur: 'schwach',
    glanz: 0.05,
    einsatz: 'Foyer- und Boulevardböden, helle Innenzonen',
  },
  M05: {
    id: 'M05',
    name: 'OUTDOOR_CONCRETE',
    grundton: '#9a948a',
    stufen: 2,
    kontur: 'schwach',
    glanz: 0.0,
    einsatz: 'Plätze, Vorflächen, Aussengelände',
  },
  M06: {
    id: 'M06',
    name: 'WOOD_DECK',
    grundton: '#8b5a2b',
    stufen: 3,
    kontur: 'mittel',
    glanz: 0.0,
    einsatz: 'Terrassen, Aufenthaltsdecks, Einfassung von Pflanzinseln',
  },
  M07: {
    id: 'M07',
    name: 'GLASS_COOL',
    grundton: '#7a9fb8',
    stufen: 2,
    kontur: 'mittel',
    glanz: 0.0,
    einsatz: 'Fassaden, Glasgeländer, Rolltreppenseiten',
  },
  M08: {
    id: 'M08',
    name: 'METAL',
    grundton: '#8a8e96',
    stufen: 2,
    kontur: 'stark',
    glanz: 0.3,
    einsatz: 'Handläufe, Geländer, Rolltreppenkanten',
  },
  M09: {
    id: 'M09',
    name: 'VEGETATION',
    grundton: '#3f6b2c',
    stufen: 3,
    kontur: 'stark',
    glanz: 0.0,
    einsatz: 'Baumkronen und Sträucher',
  },
  M10: {
    id: 'M10',
    name: 'SIGNAGE',
    grundton: '#1f8a4c',
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
  // Eine lineare Identitaet (0..1) als Stufentextur -- die eigentliche
  // Banderung passiert in `beuteltierZellenLicht` auf der finalen
  // `outgoingLight` mit einem festen Drei-Stufen-Ramp. Hier nur linear
  // durchreichen, damit der Standard-MeshToonMaterial-Pfad, den Three.js
  // fuer jedes Licht einsammelt, nichts Unerwartetes tut. Eine zweistufige
  // oder dreistufige gradientMap an dieser Stelle wuerde die Werte
  // VERDOPPELT bandeln -- einmal hier pro Licht, einmal am Ende -- und
  // genau das hat vorher fuer die weichen Verlaeufe statt der harten
  // Archer-Stufen gesorgt.
  const werte = stufen === 2 ? [0, 255] : [0, 128, 255];
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
/**
 * Der eigentliche Grund, warum reines `MeshToonMaterial` in einer Halle mit
 * mehreren Leuchten nie nach Comic aussieht: three.js bandet JEDES Licht
 * einzeln durch die Gradient-Map und summiert danach
 * (`lights_toon_fragment`/`RE_Direct_Toon`). Bei einem Licht ist das eine
 * harte Stufe -- bei sechs bis zwoelf Punktlichtern je Halle (Deckenleuchten,
 * Standpools) summieren sich sechs bis zwoelf gestufte Beitraege wieder zu
 * einem praktisch weichen Verlauf. Die Flaeche selbst trug also nie sichtbare
 * Stufen, komplett unabhaengig von der Kontur.
 *
 * Der Fix patcht `outgoingLight` -- die bereits von three.js aus allen
 * Lichtern, Schatten und Texturen zusammengerechnete Endfarbe -- direkt vor
 * der Ausgabe noch einmal in `familie.stufen` Baender. Alle echten Lichter,
 * Schatten und Texturen bleiben unveraendert bestehen (die "helle
 * Lichtinseln"-Optik unter den Leuchten lebt weiter); nur das Endergebnis
 * wird flach. Referenz: mayacoda/toon-shader nach Alisavakis' Cel-Shading-
 * Artikel -- dort steckt dieselbe Bänderung + ein Rim-Light, das reinem
 * MeshToonMaterial ganz fehlt und das die Silhouette erst spielhaft lesbar
 * macht.
 */
function beuteltierZellenLicht(material: THREE.MeshToonMaterial, stufen: Stufen): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uZellenStufen = { value: stufen };
    // Archer/Cel-Look: warmes Streiflicht, das an den Silhouetten einen
    // leuchtenden Saum zieht. Drei Kanaele leben in der Konstante: die
    // Farbe (helles Bernstein, nicht Weiss), die Staerke (massiv genug, um
    // auf einer 12-Megapixel-Szene sichtbar zu sein) und die Schwelle
    // (frueh genug, dass die Kontur schon an der Vorderkante einsetzt, nicht
    // erst dahinter).
    shader.uniforms.uRandFarbe = { value: new THREE.Color('#ffe2a8') };
    shader.uniforms.uRandStaerke = { value: 0.55 };
    shader.uniforms.uRandSchwelle = { value: 0.45 };
    // Die Helligkeit, ab der das Material als "hell" gilt. Alles darunter
    // faellt in den Schatten-Band, alles darueber in den Licht-Band. Der
    // Wert wird NACH dem Banding in den Framebuffer geschrieben, das Band
    // wird also in echten Helligkeitseinheiten gebildet -- nicht in
    // 0..1-Anteilen, in denen Emissive und Mehrfachlicht dafuer sorgen,
    // dass die hellste Stufe sofort anfaengt.
    const uniformStelle = 'uniform vec3 diffuse;';
    const lichtStelle =
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;';
    const nachUniform = shader.fragmentShader.replace(
      uniformStelle,
      `${uniformStelle}
       uniform float uZellenStufen;
       uniform vec3 uRandFarbe;
       uniform float uRandStaerke;
       uniform float uRandSchwelle;`,
    );
    const gepatcht = nachUniform.replace(
      lichtStelle,
      `${lichtStelle}
       // Bänderung nach LEUCHTDICHTE, nicht pro RGB-Kanal: round(x*N)/N auf
       // R, G und B einzeln lässt jeden Kanal unabhängig zur naechsten
       // Stufe runden -- an einer Bandgrenze kann R aufrunden, waehrend G
       // abrundet, und die Mischfarbe kippt in einen Farbstich, der im
       // Ausgangsbild gar nicht da war. Hier wird stattdessen die Helligkeit
       // gebändert und die ORIGINALE Farbrichtung (Hue + Saettigung)
       // beibehalten.
       float bLeuchtdichte = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
       // Schwellen in tatsaechlicher Leuchtdichte, nicht in 0..1: ein
       // Glasband das 1.8 emittiert, ein weisses Wandstueck das 1.2
       // empfaengt, sollen im selben Band landen -- nicht getrennt nach
       // "alles ueber 1 ist hell". Die Schwellen sind die 1/N- und
       // (N-1)/N-Marken der Familie, gewichtet auf 1.0 als Soll-Helligkeit
       // eines mittelhellen Bauteils.
       float bSchwelleMax = 1.0;
       float bSchwelleMin = 0.5;
       float bStufe;
       if (uZellenStufen < 2.5) {
         bStufe = bLeuchtdichte > bSchwelleMin ? 1.0 : 0.5;
       } else {
         bStufe = bLeuchtdichte > 0.85 ? 1.0
                : bLeuchtdichte > 0.5  ? 0.72
                :                        0.45;
       }
       vec3 bFarbrichtung = bLeuchtdichte > 0.0005 ? outgoingLight / bLeuchtdichte : diffuse;
       outgoingLight = bFarbrichtung * bStufe;
       // Streiflicht am Saum: dort, wo die Flaechennormale senkrecht zur
       // Blickrichtung steht, ist die Materialflaeche "abgewandt" und es
       // wird kuenstlich ein warmes Licht daruebergelegt. Das macht die
       // Silhouette erst lesbar -- vorher war alles, was nicht direkt
       // beleuchtet war, eine dunkle Flaeche ohne Kontur.
       float bRandDot = 1.0 - max(dot(normalize(vViewPosition), normal), 0.0);
       float bRandStufe = smoothstep(uRandSchwelle - 0.18, uRandSchwelle + 0.18, bRandDot);
       outgoingLight += bRandStufe * uRandStaerke * uRandFarbe;`,
    );
    // Beide `.replace()`-Treffer sind exakte three.js-Quelltextzeilen (Version
    // in package.json gepinnt). Ohne diese Pruefung wuerde ein kuenftiges
    // three.js-Update, das eine der Zeilen nur umformuliert, den Patch
    // still verfehlen -- die zweite Ersetzung wuerde trotzdem greifen (sie
    // haengt nicht von der ersten ab) und Code einfuegen, der auf
    // `uZellenStufen`/`uRandFarbe`/etc. verweist, ohne dass deren
    // `uniform`-Deklarationen je eingefuegt wurden. Ergebnis waere kein
    // Absturz, sondern ein GLSL-Kompilierfehler, der jedes Toon-Material der
    // Halle schwarz zeichnet -- lieber laut im Log als still im Rendering.
    if (nachUniform === shader.fragmentShader || gepatcht === nachUniform) {
      console.error(
        'beuteltierZellenLicht: three.js-Shader-Chunk hat sich geaendert -- Patch griff nicht.',
      );
    }
    shader.fragmentShader = gepatcht;
  };
}

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
  beuteltierZellenLicht(material, familie.stufen);
  return material;
}

/**
 * Das fertige Material einer Familie -- Zeichnung inbegriffen.
 *
 * Der Weg, den man normalerweise nimmt. `toonMaterial()` darüber ist die
 * nackte Fassung für Fälle, in denen die Karten woanders herkommen (das
 * amtliche Luftbild etwa); hier kommen sie aus `textur.ts`, und zwar nach
 * Metern gekachelt statt nach Flächenanteil.
 *
 * Warum die Kachelung hierher gehört und nicht an die Aufrufstelle: eine
 * Standwand von 3 m und eine Hallenwand von 30 m sollen dieselbe Körnung
 * haben. Wer die Wiederholung selbst setzt, trifft das nie durchgängig, und
 * dann verrät der Maßstab, dass beides dieselbe Textur ist.
 */
export function familienMaterial(
  familie: Familie,
  masse?: { breiteM: number; hoeheM: number },
  zusatz: THREE.MeshToonMaterialParameters = {},
): THREE.MeshToonMaterial {
  const zeichnung = familienZeichnung(familie);
  const map = zeichnung.map.clone();
  const normalMap = zeichnung.normalMap.clone();
  if (masse) {
    const [x, y] = kachelung(familie, masse.breiteM, masse.hoeheM);
    map.repeat.set(x, y);
    normalMap.repeat.set(x, y);
    map.needsUpdate = true;
    normalMap.needsUpdate = true;
  }
  return toonMaterial(familie, { map, normalMap }, zusatz);
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
    // Die Hülle schreibt keine Tiefe. Sonst verdeckt der aufgeblasene Rand,
    // was hinter der Kante liegt -- bei dicken Linien um Türen und Geländer
    // ein sichtbarer schwarzer Saum vor dem Hintergrund statt einer Kontur.
    depthWrite: false,
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
  flachCache.forEach((material) => material.dispose());
  flachCache.clear();
}

/**
 * Rohbau-Phase: erst die Grundformen (Boden, Decke, Wände, Stützen) als
 * einfarbige Flächen pruefen -- keine Deckeninstallation, keine Leuchten,
 * keine Texturen --, bevor Details (Deckentaster, Lüfter) draufkommen.
 * `hallendecke` (die Trägerinstallation), `Deckenleuchten` und die
 * Lichtpunkte aus `Ausstattung` sind in dieser Phase ausgeschaltet; Boden,
 * Decke, Wände und Stützen tragen `flachMaterial()` statt Textur/Bänderung.
 * Ein einzelner Schalter zum Zurückdrehen, sobald die Grundformen sitzen.
 */
export const ROHBAU_PHASE = true;

const flachCache = new Map<string, THREE.MeshBasicMaterial>();

/** Eine einzelne flache Farbe, unbeleuchtet -- fuer die Rohbau-Phase. */
export function flachMaterial(farbe: string): THREE.MeshBasicMaterial {
  const fertig = flachCache.get(farbe);
  if (fertig) return fertig;
  // DoubleSide: in der Rohbau-Phase geht es um die Grundform, nicht um
  // korrekte Aussennormalen -- eine Flaeche, die von der falschen Seite
  // unsichtbar wird, waere in dieser Phase schwerer zu verifizieren als
  // die etwas hoehere Fuellrate wert ist.
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(farbe),
    side: THREE.DoubleSide,
  });
  material.name = `flach|${farbe}`;
  flachCache.set(farbe, material);
  return material;
}
