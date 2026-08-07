/**
 * Woran man eine Halle erkennt, bevor man ein Schild liest: die Marken.
 *
 * Die Standflächen liegen längst metrisch richtig im Datensatz — aus dem
 * offiziellen Hallenplan. Was fehlte, war der Grund, warum Halle 9 anders
 * aussieht als Halle 8: die grossen Aussteller. Beim Betreten liest niemand
 * eine Standnummer; man sieht einen roten LEGO-Klotz, zwei weisse
 * Nintendo-Blöcke und die blaue Samsung-Wand gegenüber.
 *
 * Deshalb steht hier keine Modellierung einzelner Stände, sondern nur das,
 * was aus zwanzig Metern Entfernung tatsächlich wirkt: Körperhöhe,
 * Hausfarbe, Schriftzug, Leuchtband. Der Rest bleibt neutraler Messebau.
 *
 * Die Zuordnung Stand -> Marke stammt aus `data/raw/hallplan/9_1.json`
 * (Feld `kunden`), also aus derselben Quelle wie die Grundrisse.
 */

/** Wie der Schriftzug auf der Fassade gesetzt wird. */
export type Schriftbild = 'pille' | 'kachel' | 'schlicht' | 'wappen';

export interface Marke {
  key: string;
  /** Der Schriftzug selbst -- das, was man aus der Ferne liest. */
  label: string;
  /** Zweite Zeile, wenn die Marke selten allein auftritt (Krafton, Samsung). */
  sub?: string;
  schriftbild: Schriftbild;
  /** Hausfarbe des Standkörpers. */
  wand: string;
  /** Farbe der Logofläche. */
  platte: string;
  /** Schriftfarbe. */
  schrift: string;
  /** Kontur der Schrift, wo die Marke ohne sie nicht funktioniert (LEGO). */
  kontur?: string;
  /** Leuchtband oben -- das, was in der dunklen Halle als Erstes auffällt. */
  band: string;
  /** Standhöhe in Metern. Halle 9 hat 11 m lichte Höhe. */
  hoeheM: number;
  /** Hängebanner über dem Mittelgang. Nur für die dominanten Marken. */
  banner?: boolean;
}

export const MARKEN: Record<string, Marke> = {
  nintendo: {
    key: 'nintendo',
    label: 'Nintendo',
    schriftbild: 'pille',
    wand: '#eef1f5',
    platte: '#e60012',
    schrift: '#ffffff',
    band: '#e60012',
    hoeheM: 7.4,
    banner: true,
  },
  lego: {
    key: 'lego',
    label: 'LEGO',
    schriftbild: 'kachel',
    wand: '#d0110b',
    platte: '#d0110b',
    schrift: '#ffffff',
    kontur: '#ffdd00',
    band: '#ffdd00',
    hoeheM: 8.2,
    banner: true,
  },
  samsung: {
    key: 'samsung',
    label: 'SAMSUNG',
    schriftbild: 'schlicht',
    wand: '#f2f4f8',
    platte: '#f2f4f8',
    schrift: '#1428a0',
    band: '#1428a0',
    hoeheM: 7.4,
    banner: true,
  },
  samsungPearl: {
    key: 'samsungPearl',
    label: 'SAMSUNG',
    sub: 'PEARL ABYSS',
    schriftbild: 'schlicht',
    wand: '#f2f4f8',
    platte: '#f2f4f8',
    schrift: '#1428a0',
    band: '#4a7fd0',
    hoeheM: 7.4,
    banner: true,
  },
  krafton: {
    key: 'krafton',
    label: 'KRAFTON',
    sub: 'GAME UNION',
    schriftbild: 'wappen',
    wand: '#14171d',
    platte: '#14171d',
    schrift: '#ffffff',
    band: '#f2b705',
    hoeheM: 7.6,
    banner: true,
  },
  capcom: {
    key: 'capcom',
    label: 'CAPCOM',
    schriftbild: 'kachel',
    wand: '#0a1a4a',
    platte: '#0a2a8a',
    schrift: '#ffcc00',
    band: '#ffcc00',
    hoeheM: 7.8,
    banner: true,
  },
  sony: {
    key: 'sony',
    label: 'SONY',
    schriftbild: 'schlicht',
    wand: '#f4f5f7',
    platte: '#f4f5f7',
    schrift: '#101114',
    band: '#101114',
    hoeheM: 7.8,
    banner: true,
  },
  infold: {
    key: 'infold',
    label: 'INFOLD',
    schriftbild: 'schlicht',
    wand: '#fbf6f6',
    platte: '#fbf6f6',
    schrift: '#f4788a',
    band: '#f4788a',
    hoeheM: 7.0,
    banner: true,
  },
  plaion: {
    key: 'plaion',
    label: 'PLAION',
    schriftbild: 'schlicht',
    wand: '#f3f4f6',
    platte: '#f3f4f6',
    schrift: '#15161a',
    band: '#7ac943',
    hoeheM: 6.4,
  },
  jbl: {
    key: 'jbl',
    label: 'JBL',
    schriftbild: 'kachel',
    wand: '#ff3d15',
    platte: '#ff3d15',
    schrift: '#ffffff',
    band: '#ffffff',
    hoeheM: 6.0,
  },
  rocketbeans: {
    key: 'rocketbeans',
    label: 'ROCKET BEANS',
    schriftbild: 'wappen',
    wand: '#123a86',
    platte: '#123a86',
    schrift: '#ffffff',
    band: '#f2b705',
    hoeheM: 6.4,
  },
  aerosoft: {
    key: 'aerosoft',
    label: 'AEROSOFT',
    schriftbild: 'schlicht',
    wand: '#eceff3',
    platte: '#eceff3',
    schrift: '#16181c',
    band: '#9aa4b2',
    hoeheM: 5.4,
  },
};

/**
 * Ein Standkörper, der einer Marke gehört.
 *
 * `naheAn` teilt einen Stand in der Mitte: Halle 9 hat ganz rechts einen
 * einzigen 16 x 57 m langen Block, auf dem im Referenzplan oben Capcom und
 * unten Sony steht. Ein Körper, zwei Fassaden -- genau so steht es dort.
 * Welche Hälfte welcher Marke gehört, sagt der benachbarte Stand; eine
 * Himmelsrichtung wäre falsch, weil die Halle eingemessen und damit gedreht
 * im Gelände liegt.
 */
export interface Markenflaeche {
  standId: string;
  marke: string;
  /** Nimmt die Standhälfte, die diesem Stand am nächsten liegt. */
  naheAn?: string;
}

/** Halle 9, Ebene 1 -- aus dem offiziellen Hallenplan übernommen. */
export const MARKENFLAECHEN: Markenflaeche[] = [
  // Nordreihe (im Plan oben), von links nach rechts.
  { standId: '9.1:A010', marke: 'nintendo' },
  { standId: '9.1:A020', marke: 'nintendo' },
  { standId: '9.1:A030', marke: 'lego' },
  { standId: '9.1:A040', marke: 'lego' },
  { standId: '9.1:B043', marke: 'aerosoft' },
  { standId: '9.1:A046', marke: 'rocketbeans' },
  { standId: '9.1:A054', marke: 'infold' },
  { standId: '9.1:A070', marke: 'capcom', naheAn: '9.1:A054' },
  { standId: '9.1:A070', marke: 'sony', naheAn: '9.1:B050' },
  // Südreihe (im Plan unten).
  { standId: '9.1:B010', marke: 'samsungPearl' },
  { standId: '9.1:B020', marke: 'samsung' },
  { standId: '9.1:B030', marke: 'plaion' },
  { standId: '9.1:B034', marke: 'jbl' },
  { standId: '9.1:B040', marke: 'krafton' },
  { standId: '9.1:B050', marke: 'krafton' },
];

/** Stände, die eine eigene Fassade bekommen und deshalb nicht im Sammelkörper stecken. */
export const MARKEN_STAND_IDS = new Set(MARKENFLAECHEN.map((flaeche) => flaeche.standId));
