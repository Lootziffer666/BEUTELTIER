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

  // --- Halle 7 ---
  xbox: {
    key: 'xbox',
    label: 'XBOX',
    schriftbild: 'kachel',
    wand: '#107c10',
    platte: '#0e6a0e',
    schrift: '#ffffff',
    band: '#9bf00b',
    hoeheM: 8.4,
    banner: true,
  },
  sega: {
    key: 'sega',
    label: 'SEGA',
    schriftbild: 'kachel',
    wand: '#f2f5f8',
    platte: '#0067b3',
    schrift: '#ffffff',
    band: '#0067b3',
    hoeheM: 7.4,
    banner: true,
  },
  konami: {
    key: 'konami',
    label: 'KONAMI',
    schriftbild: 'schlicht',
    wand: '#f4f5f7',
    platte: '#f4f5f7',
    schrift: '#c8102e',
    band: '#c8102e',
    hoeheM: 7.2,
    banner: true,
  },
  google: {
    key: 'google',
    label: 'Google',
    schriftbild: 'schlicht',
    wand: '#ffffff',
    platte: '#ffffff',
    schrift: '#4285f4',
    band: '#ea4335',
    hoeheM: 7.2,
    banner: true,
  },
  webedia: {
    key: 'webedia',
    label: 'webedia',
    schriftbild: 'schlicht',
    wand: '#f1f3f7',
    platte: '#f1f3f7',
    schrift: '#1a3fd4',
    band: '#1a3fd4',
    hoeheM: 7.0,
    banner: true,
  },
  netease: {
    key: 'netease',
    label: 'NetEase',
    sub: 'GAMES',
    schriftbild: 'schlicht',
    wand: '#f6f2f2',
    platte: '#f6f2f2',
    schrift: '#e2231a',
    band: '#e2231a',
    hoeheM: 6.6,
  },
  huawei: {
    key: 'huawei',
    label: 'HUAWEI',
    schriftbild: 'kachel',
    wand: '#f2f4f8',
    platte: '#ef4b4b',
    schrift: '#ffffff',
    band: '#ef4b4b',
    hoeheM: 6.4,
  },
  divinity: {
    key: 'divinity',
    label: '4DIVINITY',
    schriftbild: 'wappen',
    wand: '#1b1c20',
    platte: '#1b1c20',
    schrift: '#e8e2d4',
    band: '#c8a25a',
    hoeheM: 7.0,
  },

  // --- Halle 8 ---
  asus: {
    key: 'asus',
    label: 'ASUS',
    schriftbild: 'schlicht',
    wand: '#f3f4f6',
    platte: '#f3f4f6',
    schrift: '#111318',
    band: '#111318',
    hoeheM: 7.4,
    banner: true,
  },
  cdprojekt: {
    key: 'cdprojekt',
    label: 'CD PROJEKT',
    schriftbild: 'wappen',
    wand: '#151114',
    platte: '#151114',
    schrift: '#f2eee8',
    band: '#d21f26',
    hoeheM: 7.6,
    banner: true,
  },
  tencent: {
    key: 'tencent',
    label: 'Tencent',
    schriftbild: 'schlicht',
    wand: '#f2f6fb',
    platte: '#f2f6fb',
    schrift: '#1a8cd8',
    band: '#1a8cd8',
    hoeheM: 7.4,
    banner: true,
  },
  gryphline: {
    key: 'gryphline',
    label: 'GRYPHLINE',
    schriftbild: 'schlicht',
    wand: '#eef0f3',
    platte: '#eef0f3',
    schrift: '#15171c',
    band: '#15171c',
    hoeheM: 7.2,
    banner: true,
  },
  subway: {
    key: 'subway',
    label: 'SUBWAY',
    sub: 'REWE · TELEKOM · SK GAMING',
    schriftbild: 'schlicht',
    wand: '#fdf6e3',
    platte: '#fdf6e3',
    schrift: '#008938',
    band: '#ffc60b',
    hoeheM: 6.8,
    banner: true,
  },
  gigabyte: {
    key: 'gigabyte',
    label: 'GIGABYTE',
    schriftbild: 'schlicht',
    wand: '#f1f2f4',
    platte: '#f1f2f4',
    schrift: '#16181c',
    band: '#f36f21',
    hoeheM: 6.6,
  },
  mattel: {
    key: 'mattel',
    label: 'MATTEL',
    schriftbild: 'kachel',
    wand: '#f5f5f7',
    platte: '#e4002b',
    schrift: '#ffffff',
    band: '#e4002b',
    hoeheM: 6.2,
  },
  snail: {
    key: 'snail',
    label: 'Snail',
    schriftbild: 'schlicht',
    wand: '#f4f4f2',
    platte: '#f4f4f2',
    schrift: '#1a1a1a',
    band: '#8a8f7a',
    hoeheM: 6.2,
  },
  mbc: {
    key: 'mbc',
    label: 'mbc',
    sub: 'GROUP',
    schriftbild: 'schlicht',
    wand: '#f6f6f8',
    platte: '#f6f6f8',
    schrift: '#16181c',
    band: '#9aa0aa',
    hoeheM: 6.6,
  },
  aoc: {
    key: 'aoc',
    label: 'AOC',
    schriftbild: 'schlicht',
    wand: '#f2f4f6',
    platte: '#f2f4f6',
    schrift: '#16181c',
    band: '#1a5fd4',
    hoeheM: 6.0,
  },
  philips: {
    key: 'philips',
    label: 'PHILIPS',
    schriftbild: 'schlicht',
    wand: '#f2f6fb',
    platte: '#f2f6fb',
    schrift: '#0b5ed7',
    band: '#0b5ed7',
    hoeheM: 6.0,
  },

  // --- Halle 6 ---
  ubisoft: {
    key: 'ubisoft',
    label: 'UBISOFT',
    schriftbild: 'schlicht',
    wand: '#f4f5f7',
    platte: '#f4f5f7',
    schrift: '#111318',
    band: '#111318',
    hoeheM: 8.0,
    banner: true,
  },
  ea: {
    key: 'ea',
    label: 'EA',
    sub: 'SPORTS FC',
    schriftbild: 'kachel',
    wand: '#0e1014',
    platte: '#0e1014',
    schrift: '#ffffff',
    band: '#ffffff',
    hoeheM: 7.8,
    banner: true,
  },
  bandai: {
    key: 'bandai',
    label: 'BANDAI',
    sub: 'NAMCO',
    schriftbild: 'wappen',
    wand: '#f5f5f7',
    platte: '#f5f5f7',
    schrift: '#16181c',
    band: '#e60012',
    hoeheM: 7.6,
    banner: true,
  },
  embark: {
    key: 'embark',
    label: 'embark',
    schriftbild: 'schlicht',
    wand: '#f2f2f0',
    platte: '#f2f2f0',
    schrift: '#16181c',
    band: '#16181c',
    hoeheM: 7.4,
    banner: true,
  },
  paradox: {
    key: 'paradox',
    label: 'PARADOX',
    sub: 'TENCENT · REMEDY',
    schriftbild: 'wappen',
    wand: '#14161b',
    platte: '#14161b',
    schrift: '#f0f0f2',
    band: '#4a90d9',
    hoeheM: 8.0,
    banner: true,
  },
  hoyoverse: {
    key: 'hoyoverse',
    label: 'HoYoverse',
    schriftbild: 'schlicht',
    wand: '#f6f8fc',
    platte: '#f6f8fc',
    schrift: '#4a7fd0',
    band: '#4a7fd0',
    hoeheM: 7.2,
    banner: true,
  },
  team17: {
    key: 'team17',
    label: 'TEAM17',
    sub: 'FOCUS · ASTRAGON',
    schriftbild: 'kachel',
    wand: '#f2f2f4',
    platte: '#e8003c',
    schrift: '#ffffff',
    band: '#e8003c',
    hoeheM: 7.2,
    banner: true,
  },
  giants: {
    key: 'giants',
    label: 'FARMING',
    sub: 'SIMULATOR',
    schriftbild: 'wappen',
    wand: '#f4f5f0',
    platte: '#f4f5f0',
    schrift: '#16181c',
    band: '#8dc63f',
    hoeheM: 6.8,
  },
  pathofexile: {
    key: 'pathofexile',
    label: 'PATH OF EXILE',
    schriftbild: 'wappen',
    wand: '#171310',
    platte: '#171310',
    schrift: '#e6d6b8',
    band: '#a8321f',
    hoeheM: 6.8,
  },
  elementa: {
    key: 'elementa',
    label: 'ElementA',
    schriftbild: 'schlicht',
    wand: '#f3f5f8',
    platte: '#f3f5f8',
    schrift: '#16181c',
    band: '#4a90d9',
    hoeheM: 6.6,
  },
  pawprint: {
    key: 'pawprint',
    label: 'PAWPRINT',
    schriftbild: 'schlicht',
    wand: '#f8f5f2',
    platte: '#f8f5f2',
    schrift: '#16181c',
    band: '#f2a65a',
    hoeheM: 6.4,
  },
  eclipseglow: {
    key: 'eclipseglow',
    label: 'ECLIPSE GLOW',
    schriftbild: 'schlicht',
    wand: '#eef0f2',
    platte: '#eef0f2',
    schrift: '#16181c',
    band: '#7a8794',
    hoeheM: 6.4,
  },
  secretmode: {
    key: 'secretmode',
    label: 'SECRET MODE',
    schriftbild: 'schlicht',
    wand: '#f5f2ec',
    platte: '#f5f2ec',
    schrift: '#8a7340',
    band: '#c8a25a',
    hoeheM: 6.2,
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

  // Halle 7: Xbox nimmt die ganze linke Hallenbreite ein, gegenüber SEGA,
  // Konami und Google.
  { standId: '7.1:A061', marke: 'xbox' },
  { standId: '7.1:A041', marke: 'sega' },
  { standId: '7.1:A031', marke: 'sega' },
  { standId: '7.1:A021', marke: 'konami' },
  { standId: '7.1:A011', marke: 'google' },
  { standId: '7.1:A051', marke: 'netease' },
  { standId: '7.1:B050', marke: 'netease' },
  { standId: '7.1:B041', marke: 'webedia' },
  { standId: '7.1:B051', marke: 'webedia' },
  { standId: '7.1:B031', marke: 'huawei' },
  { standId: '7.1:B021', marke: 'divinity' },

  // Halle 8: die Hardware-Halle -- Asus, Gigabyte, Gryphline, dazu die
  // Partnerzeile mit Subway, REWE und Telekom an der Stirnseite.
  { standId: '8.1:B060', marke: 'subway' },
  { standId: '8.1:B041', marke: 'asus' },
  { standId: '8.1:B040', marke: 'asus' },
  { standId: '8.1:B030', marke: 'cdprojekt' },
  { standId: '8.1:B050', marke: 'tencent' },
  { standId: '8.1:C020', marke: 'gryphline' },
  { standId: '8.1:B021', marke: 'gryphline' },
  { standId: '8.1:C050', marke: 'gigabyte' },
  { standId: '8.1:B020', marke: 'mattel' },
  { standId: '8.1:A041', marke: 'snail' },
  { standId: '8.1:A011', marke: 'mbc' },
  { standId: '8.1:C060', marke: 'aoc' },
  { standId: '8.1:A065', marke: 'philips' },

  // Halle 6: die Publisher-Halle -- Ubisoft und EA rechts, Paradox/Remedy
  // links, Embark und Bandai Namco in der unteren Reihe.
  { standId: '6.1:C071', marke: 'paradox' },
  { standId: '6.1:C011', marke: 'ubisoft' },
  { standId: '6.1:B020', marke: 'ubisoft' },
  { standId: '6.1:B011', marke: 'ea' },
  { standId: '6.1:B021', marke: 'bandai' },
  { standId: '6.1:B041', marke: 'embark' },
  { standId: '6.1:B051', marke: 'embark' },
  { standId: '6.1:B060', marke: 'team17' },
  { standId: '6.1:B030', marke: 'hoyoverse' },
  { standId: '6.1:B061', marke: 'giants' },
  { standId: '6.1:B031', marke: 'pathofexile' },
  { standId: '6.1:C021', marke: 'elementa' },
  { standId: '6.1:C041', marke: 'pawprint' },
  { standId: '6.1:B050', marke: 'eclipseglow' },
  { standId: '6.1:B040', marke: 'secretmode' },
  { standId: '6.1:A030', marke: 'divinity' },
];

/** Stände, die eine eigene Fassade bekommen und deshalb nicht im Sammelkörper stecken. */
export const MARKEN_STAND_IDS = new Set(MARKENFLAECHEN.map((flaeche) => flaeche.standId));
