/** Die Datenformen, die aus der Aufbereitung kommen. */

export type Placement2D = [number, number];

export interface HallPlacement {
  /** procrustes = eingemessen, abgeleitet = von der Ebene darunter, geschaetzt = Übersichtsplan. */
  source: 'procrustes' | 'abgeleitet' | 'geschaetzt';
  samples: number;
  residualM: number | null;
  maxResidualM: number | null;
  rotationDeg: number;
}

/** Das vertikale Modell einer Hallenebene, mit Herkunft je Wert. */
export interface HallHeight {
  floorElevationMinM: number;
  floorElevationMaxM: number;
  floorElevationRenderM: number;
  clearHeightM: number;
  /** official = veroeffentlicht, derived = gerechnet, estimated = geschaetzt. */
  heightSource: 'official' | 'derived' | 'estimated';
  heightConfidence: 'high' | 'medium' | 'low';
  heightUncertaintyM: number;
  roofStructureEstimateM?: number;
  exteriorEnvelopeMinM?: number;
  exteriorEnvelopeMaxM?: number;
}

/** Abgleich des belegten Bereichs gegen die offizielle Hallenflaeche. */
export interface HallArea {
  extentAreaSqm: number;
  officialAreaSqm: number | null;
  deviationPct: number | null;
  outlineSource: 'inhaltshuelle' | 'boundingbox';
  note: string;
}

export interface Hall {
  key: string;
  hall: string;
  level: number;
  outdoor: boolean;
  name: string;
  widthM: number;
  depthM: number;
  baseY: number;
  wallHeightM: number;
  height: HallHeight;
  area: HallArea;
  /** 11.3 bleibt aus dem Besucherrouting heraus, bis die Erreichbarkeit belegt ist. */
  routable: boolean;
  footprint: Placement2D[];
  blocks: Placement2D[][];
  placement: HallPlacement;
}

export interface Stand {
  id: string;
  hallKey: string;
  level: number;
  code: string;
  codes: string[];
  areaSqm: number;
  baseY: number;
  polygon: Placement2D[];
}

export interface Connector {
  key: string;
  passage: boolean;
  note: string;
  rotationDeg: number | null;
  uncertaintyM: number;
  outline: Placement2D[];
}

export interface Site {
  schema: string;
  /** Angenommene Geschossdeckenstaerke [min, max] in Metern. */
  slabAssumptionM: [number, number];
  referenceFit: { supports: number; residualM: number; crossValidatedM: number };
  halls: Hall[];
  stands: Stand[];
  connectors: Connector[];
}

export interface ExhibitorPlacement {
  hall: string;
  stand: string;
  standId: string | null;
  outdoor: boolean;
  derivedFrom?: string;
}

export interface Exhibitor {
  id: string;
  name: string;
  country: string;
  url: string;
  placements: ExhibitorPlacement[];
}

export interface Compound {
  id: string;
  name: string;
  hallKey: string;
  standIds: string[];
  memberIds: string[];
  confirmed: boolean;
  app: { android?: string; web?: string };
  handover: string;
  credit: string;
}

export interface Registry {
  schema: string;
  year: number;
  collectedAt: string;
  source: { name?: string; url?: string; domain?: string };
  coverage: { placements: number; withGeometry: number; withoutGeometry: number };
  exhibitors: Exhibitor[];
  occupancy: Record<string, string[]>;
  compounds: Compound[];
  unmatched: { exhibitor: string; hall: string; stand: string; raw: string }[];
}
