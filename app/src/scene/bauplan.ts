/**
 * Der Bauplan: was gebaut ist, als Liste von Klötzen.
 *
 * Die Szene ist aus gerechneter Geometrie gebaut -- gedrehte Rechtecke aus
 * eingemessenen Umrissen, Bänder aus Stationen, Treppen aus Konstanten. Zum
 * Ansehen ist das richtig, zum Verschieben ist es nichts: man kann eine
 * Formel nicht anfassen.
 *
 * Der Bauplan übersetzt dieselbe Rechnung einmal in die einzige Sprache, die
 * ein Blockeditor versteht: Mittelpunkt, Außenmaß, Drehung um die Hochachse.
 * Gerechnet wird dabei nichts neu -- die Körper kommen aus `markenkoerper`,
 * Achse und Wandabschnitte des Boulevards aus `boulevard.json`.
 * Wird an der Szene etwas nachgezogen, zieht der Bauplan mit, sobald er neu
 * erzeugt wird.
 *
 * Bewusst nicht enthalten: Materialien, Texturen, Licht. Der Editor kennt
 * Farbe und Deckkraft, mehr nicht -- und mehr braucht er auch nicht, um zu
 * zeigen, wo etwas steht.
 */

import type { BoulevardPlan, Dataset, Gelaende } from '../data/load';
import {
  AUFTRITT_M,
  boulevardAchse,
  boulevardBoden,
  LAEUFE,
  PODEST_M,
  ROLLTREPPE_BREITE_M,
  SCHILD_BREITE_M,
  SCHILD_HOEHE_M,
  SCHILD_Y,
  STEIGUNG_M,
  STUFEN_JE_LAUF,
  TREPPE_BREITE_M,
  TREPPE_HOEHE_M,
  TREPPE_LAUF_M,
  wegweiser,
  type Achse,
} from './boulevard';
import { hallenlage } from './interior';
import { markenkoerper } from './Markenstaende';
import { drehungNachZ } from './geometry';

/** Was der Editor aus einem Eintrag machen soll. */
export type Bauart = 'block' | 'glass' | 'slope' | 'marker' | 'door';

export interface Gefaelle {
  /** Grundriss des Gefällekörpers, in Metern. */
  w: number;
  d: number;
  /** Dicke unterhalb des tiefsten Eckpunkts. */
  baseThickness: number;
  /** Eckhöhen relativ zur Objekthöhe: NW, NE, SE, SW -- Nord ist lokal -Z. */
  corners: [number, number, number, number];
}

export interface BauplanObjekt {
  /** Ladbare Einheit, z. B. `Marken Halle 9.1` oder `Boulevard Nord`. */
  gruppe: string;
  name: string;
  art: Bauart;
  /** Mittelpunkt in Szenenmetern; beim Gefällekörper der Ursprung. */
  x: number;
  y: number;
  z: number;
  /** Außenmaß entlang der lokalen Achsen. */
  breite: number;
  hoehe: number;
  tiefe: number;
  /** Drehung um die Hochachse in Grad. */
  drehung: number;
  farbe: string;
  deckkraft?: number;
  /** Standardmäßig ausgeblendet -- Decken verdecken sonst alles darunter. */
  sichtbar?: boolean;
  gefaelle?: Gefaelle;
}

export interface Bauplan {
  schema: 'beuteltier.bauplan.v1';
  erzeugt: string;
  /** Nullpunkt des Szenensystems in Geländemetern -- zum Zurückrechnen. */
  centre: [number, number];
  gruppen: string[];
  objekte: BauplanObjekt[];
}

const FARBE = {
  hallenboden: '#6b7280',
  hallendecke: '#39404d',
  boulevardboden: '#cfd2d6',
  boulevarddach: '#eceff3',
  oberlicht: '#e8f0ff',
  massiv: '#c8ccd2',
  glas: '#9edcff',
  treppe: '#d9dade',
  rolltreppe: '#93a3b8',
  schild: '#f2f4f7',
  tuer: '#bfe6f5',
};

function grad(radiant: number): number {
  return (radiant * 180) / Math.PI;
}

function rund(wert: number): number {
  return Math.round(wert * 1000) / 1000;
}

function eintrag(objekt: BauplanObjekt): BauplanObjekt {
  return {
    ...objekt,
    x: rund(objekt.x),
    y: rund(objekt.y),
    z: rund(objekt.z),
    breite: rund(objekt.breite),
    hoehe: rund(objekt.hoehe),
    tiefe: rund(objekt.tiefe),
    drehung: rund(objekt.drehung),
  };
}

/**
 * Hallen als Boden- und Deckenplatte.
 *
 * Die Wände bleiben weg: eine geschlossene Halle wäre im Editor eine
 * Blackbox, in der man die Stände nicht mehr sieht. Boden und Decke reichen,
 * um zu wissen, wo man ist -- genau das tun sie auch in der Szene.
 */
function hallenplatten(data: Gelaende, centre: [number, number]): BauplanObjekt[] {
  const out: BauplanObjekt[] = [];
  for (const hall of data.site.halls) {
    if (hall.outdoor) continue;
    const lage = hallenlage(hall.footprint);
    if (!lage || lage.laenge < 20 || lage.breite < 20) continue;
    const hoehe = hall.height?.clearHeightM ?? 8;
    const x = lage.mx - centre[0];
    const z = lage.my - centre[1];
    const drehung = grad(lage.winkel);

    out.push(eintrag({
      gruppe: 'Hallenplatten',
      name: `${hall.name} Boden`,
      art: 'block',
      x,
      y: hall.baseY + 0.02 - 0.15,
      z,
      breite: lage.laenge,
      hoehe: 0.3,
      tiefe: lage.breite,
      drehung,
      farbe: FARBE.hallenboden,
    }));
    out.push(eintrag({
      gruppe: 'Hallenplatten',
      name: `${hall.name} Decke`,
      art: 'block',
      x,
      y: hall.baseY + hoehe + 0.15,
      z,
      breite: lage.laenge,
      hoehe: 0.3,
      tiefe: lage.breite,
      drehung,
      farbe: FARBE.hallendecke,
      // Von oben sieht man sonst nur Decken. Die Platte bleibt im Bauplan,
      // sie ist nur zugeklappt -- ein Haken im Inspektor holt sie zurück.
      sichtbar: false,
    }));
  }
  return out;
}

/** Die Markenstände -- ein Quader je Fläche, plus das Hängebanner als Platte. */
function markenbloecke(data: Gelaende, centre: [number, number]): BauplanObjekt[] {
  const out: BauplanObjekt[] = [];
  for (const k of markenkoerper(data, centre)) {
    const halle = k.standId.split(':')[0];
    const gruppe = `Marken Halle ${halle}`;
    const code = k.standId.split(':')[1] ?? k.standId;
    out.push(eintrag({
      gruppe,
      name: `${k.marke.label} ${code}`,
      art: 'block',
      x: k.position.x,
      y: k.position.y,
      z: k.position.z,
      breite: k.breite,
      hoehe: k.hoehe,
      tiefe: k.tiefe,
      drehung: grad(k.drehung),
      farbe: k.marke.wand,
    }));
    if (k.banner) {
      out.push(eintrag({
        gruppe,
        name: `${k.marke.label} ${code} Banner`,
        art: 'block',
        x: k.banner.position.x,
        y: k.banner.position.y,
        z: k.banner.position.z,
        breite: k.banner.breite,
        hoehe: 3.6,
        tiefe: 0.12,
        drehung: grad(k.banner.drehung),
        farbe: k.marke.band,
      }));
    }
  }
  return out;
}

/**
 * Der Boulevard.
 *
 * Alles hier hängt an einer einzigen Rechnung: `ort(s, q, h)` gibt zu einer
 * Station entlang der Achse, einem Abstand quer dazu und einer Höhe den Punkt
 * in Szenenkoordinaten. Die Drehung ist für alle Teile dieselbe -- lokal +Z
 * läuft die Achse entlang, lokal +X quer.
 */
function boulevardbloecke(achse: Achse, plan: BoulevardPlan,
                          centre: [number, number]): BauplanObjekt[] {
  const gruppe = 'Boulevard Nord';
  const out: BauplanObjekt[] = [];
  const ort = (s: number, q: number, h: number): [number, number, number] => {
    const x = achse.x0 + achse.laengs[0] * s + achse.quer[0] * q;
    const y = achse.y0 + achse.laengs[1] * s + achse.quer[1] * q;
    return [x - centre[0], h, y - centre[1]];
  };
  const drehung = grad(drehungNachZ(achse.laengs[0], achse.laengs[1]));

  const platte = (
    name: string,
    art: Bauart,
    s0: number,
    s1: number,
    q: number,
    unten: number,
    oben: number,
    dicke: number,
    farbe: string,
    deckkraft?: number,
  ): void => {
    const [x, , z] = ort((s0 + s1) / 2, q, 0);
    out.push(eintrag({
      gruppe,
      name,
      art,
      x,
      y: (unten + oben) / 2,
      z,
      breite: dicke,
      hoehe: Math.max(oben - unten, 0.01),
      tiefe: Math.max(s1 - s0, 0.01),
      drehung,
      farbe,
      ...(deckkraft === undefined ? {} : { deckkraft }),
    }));
  };

  // Boden, Dach und Oberlicht laufen über die ganze Länge.
  const laenge = plan.laengeM;
  const hoehe = plan.hoeheM;
  const bodenY = boulevardBoden(plan);
  const dachY = plan.bodenM + hoehe;
  const boden = ort(laenge / 2, 0, 0);
  out.push(eintrag({
    gruppe,
    name: 'Boulevard Boden',
    art: 'block',
    x: boden[0],
    y: bodenY - 0.1,
    z: boden[2],
    breite: plan.breiteM,
    hoehe: 0.2,
    tiefe: laenge,
    drehung,
    farbe: FARBE.boulevardboden,
  }));
  out.push(eintrag({
    gruppe,
    name: 'Boulevard Dach',
    art: 'block',
    x: boden[0],
    y: dachY + 0.15,
    z: boden[2],
    breite: plan.breiteM,
    hoehe: 0.3,
    tiefe: laenge,
    drehung,
    farbe: FARBE.boulevarddach,
    sichtbar: false,
  }));
  out.push(eintrag({
    gruppe,
    name: 'Boulevard Oberlicht',
    art: 'block',
    x: boden[0],
    y: dachY - 0.1,
    z: boden[2],
    breite: 6.4,
    hoehe: 0.08,
    tiefe: laenge,
    drehung,
    farbe: FARBE.oberlicht,
  }));

  // Beide Laengsseiten kommen aus der Messung: wo ein Gebaeude steht, ist es
  // eine Wand, wo keines steht, sieht man ins Freie.
  for (const [seite, q] of [['Ost', plan.seitenQ.ost], ['West', plan.seitenQ.west]] as const) {
    for (const stueck of plan.seiten[seite === 'Ost' ? 'ost' : 'west']) {
      const wand = stueck.art === 'wand';
      platte(
        `${seite} ${stueck.was}`, wand ? 'block' : 'glass',
        stueck.von, stueck.bis, q, bodenY, dachY,
        wand ? 0.4 : 0.08, wand ? FARBE.massiv : FARBE.glas,
        wand ? undefined : 0.28,
      );
    }
  }

  // Die Stirnwand am Südende steht quer im Gang: ihre Breite läuft entlang
  // der lokalen X-Achse, also quer zur Achse -- gedreht wird sie nicht.
  const stirn = ort(laenge, 0, 0);
  out.push(eintrag({
    gruppe,
    name: 'Südwand Glas',
    art: 'glass',
    x: stirn[0],
    y: bodenY + hoehe / 2,
    z: stirn[2],
    breite: plan.breiteM,
    hoehe,
    tiefe: 0.08,
    drehung,
    farbe: FARBE.glas,
    deckkraft: 0.28,
  }));
  for (const [index, versatz] of [-1.9, 1.9].entries()) {
    const tuer = ort(laenge, versatz, 0);
    out.push(eintrag({
      gruppe,
      name: `Südwand Doppeltür ${index + 1}`,
      art: 'door',
      x: tuer[0],
      y: bodenY + 1.3,
      z: tuer[2],
      breite: 3.2,
      hoehe: 2.6,
      tiefe: 0.22,
      drehung,
      farbe: FARBE.tuer,
    }));
  }

  // Die Wegweiser hängen quer über dem Gang.
  // Nur ein Gesicht je Standort: im Bauplan ist die Tafel ein Klotz.
  for (const schild of wegweiser(plan, achse).filter((s) => s.blick > 0)) {
    const [x, , z] = ort(schild.station, 3.4, 0);
    out.push(eintrag({
      gruppe,
      name: `Wegweiser ${schild.kopf} (Station ${schild.station} m)`,
      art: 'marker',
      x,
      y: plan.bodenM + SCHILD_Y + SCHILD_HOEHE_M / 2,
      z,
      breite: SCHILD_BREITE_M,
      hoehe: SCHILD_HOEHE_M,
      tiefe: 0.12,
      drehung,
      farbe: FARBE.schild,
    }));
  }

  // Die Treppenanlage: je Lauf ein Gefällekörper, dazwischen die Podeste.
  // In der Szene steht dort eine Folge von Stufenquadern; als 45 Klötze wäre
  // sie im Editor nicht zu gebrauchen, als drei Rampen ist sie es.
  const anfang = laenge - TREPPE_LAUF_M;
  const laufLaenge = STUFEN_JE_LAUF * AUFTRITT_M;
  const laufHoehe = STUFEN_JE_LAUF * STEIGUNG_M;
  let s = anfang;
  let h = 0;
  for (let lauf = 0; lauf < LAEUFE; lauf += 1) {
    const mitte = ort(s + laufLaenge / 2, 0, 0);
    out.push(eintrag({
      gruppe,
      name: `Treppenlauf ${lauf + 1} (${STUFEN_JE_LAUF} Stufen)`,
      art: 'slope',
      x: mitte[0],
      y: bodenY + h,
      z: mitte[2],
      breite: TREPPE_BREITE_M,
      hoehe: h,
      tiefe: laufLaenge,
      drehung,
      farbe: FARBE.treppe,
      gefaelle: {
        w: TREPPE_BREITE_M,
        d: laufLaenge,
        baseThickness: Math.max(h, 0.25),
        corners: [0, 0, rund(laufHoehe), rund(laufHoehe)],
      },
    }));
    s += laufLaenge;
    h += laufHoehe;
    if (lauf < LAEUFE - 1) {
      const podest = ort(s + PODEST_M / 2, 0, 0);
      out.push(eintrag({
        gruppe,
        name: `Podest ${lauf + 1}`,
        art: 'block',
        x: podest[0],
        y: bodenY + h / 2,
        z: podest[2],
        breite: TREPPE_BREITE_M,
        hoehe: h,
        tiefe: PODEST_M,
        drehung,
        farbe: FARBE.treppe,
      }));
      s += PODEST_M;
    }
  }

  // Die beiden Rolltreppen laufen ohne Podest durch.
  for (const [index, seite] of [-1, 1].entries()) {
    const q = seite * (TREPPE_BREITE_M / 2 + ROLLTREPPE_BREITE_M / 2 + 0.35);
    const mitte = ort(anfang + TREPPE_LAUF_M / 2, q, 0);
    out.push(eintrag({
      gruppe,
      name: `Rolltreppe ${index + 1}`,
      art: 'slope',
      x: mitte[0],
      y: bodenY,
      z: mitte[2],
      breite: ROLLTREPPE_BREITE_M,
      hoehe: 0.3,
      tiefe: TREPPE_LAUF_M,
      drehung,
      farbe: FARBE.rolltreppe,
      gefaelle: {
        w: ROLLTREPPE_BREITE_M,
        d: TREPPE_LAUF_M,
        baseThickness: 0.3,
        corners: [0, 0, rund(TREPPE_HOEHE_M), rund(TREPPE_HOEHE_M)],
      },
    }));
  }

  return out;
}

export function bauplan(data: Gelaende & Pick<Dataset, 'boulevard'>,
                        centre: [number, number]): Bauplan {
  const objekte = [
    ...hallenplatten(data, centre),
    ...markenbloecke(data, centre),
  ];
  const achse = boulevardAchse(data);
  if (achse && data.boulevard) {
    objekte.push(...boulevardbloecke(achse, data.boulevard, centre));
  }

  const gruppen: string[] = [];
  for (const objekt of objekte) {
    if (!gruppen.includes(objekt.gruppe)) gruppen.push(objekt.gruppe);
  }

  return {
    schema: 'beuteltier.bauplan.v1',
    erzeugt: new Date().toISOString(),
    centre,
    gruppen,
    objekte,
  };
}
