import type { Dataset } from '../data/load';
import { toScene } from './geometry';
import type { CameraPreset } from './SiteScene';
import {
  GENERATOR_REGISTRY,
  generatorDefinition,
  type GeneratorKey,
  type GeneratorParamsMap,
} from './generatorRegistry';
import {
  findPlacement,
  polygonArea,
  seededUnit,
  type AcceptedFootprint,
  type Point2,
} from './placement';

export interface StageSpec<K extends GeneratorKey = GeneratorKey> {
  id: string;
  generator: K;
  params: GeneratorParamsMap[K];
  hallKey: string;
  standId: string | null;
  position: [number, number, number];
  rotationY: number;
  scale: number;
  classification: 'fictional';
  collision: false;
}

const COLOURS = [
  0xff2e88,
  0x21c7ff,
  0xa8ff5a,
  0xffc84a,
  0x9567ff,
  0xff654a,
] as const;

function choose<T>(items: readonly T[], seed: string, index: number): T {
  return items[
    Math.min(
      items.length - 1,
      Math.floor(seededUnit(seed, index) * items.length),
    )
  ];
}

function paramsFor<K extends GeneratorKey>(
  key: K,
  seed: string,
  index: number,
): GeneratorParamsMap[K] {
  const colour = choose(COLOURS, seed, index + 10);

  switch (key) {
    case 'booth.infoCounter':
      return {
        width: 3 + seededUnit(seed, index + 1) * 1.2,
        brandColor: colour,
      } as GeneratorParamsMap[K];

    case 'booth.cardboardFigure':
      return {
        name: 'Lootzy',
        gameTitle: 'BEUTELTIER',
      } as GeneratorParamsMap[K];

    case 'crowd.wristbandDispenser':
      return { label: 'BEUTELTIER' } as GeneratorParamsMap[K];

    case 'crowd.barrierTape':
      return {
        length: 3.5 + seededUnit(seed, index + 2) * 1.2,
        height: 1.1,
      } as GeneratorParamsMap[K];

    case 'fnb.cateringTable':
      return {
        length: 3.2 + seededUnit(seed, index + 3) * 1.2,
      } as GeneratorParamsMap[K];

    case 'furniture.bench':
      return {
        length: 2 + seededUnit(seed, index + 4) * 0.8,
      } as GeneratorParamsMap[K];

    case 'outdoor.tree':
      return {
        scale: 0.75 + seededUnit(seed, index + 5) * 0.45,
      } as GeneratorParamsMap[K];

    case 'outdoor.fence':
      return {
        length: 8 + seededUnit(seed, index + 6) * 4,
        type: seededUnit(seed, index + 7) < 0.5 ? 'mesh' : 'solid',
        height: 2,
      } as GeneratorParamsMap[K];

    case 'outdoor.leitplanke':
      return {
        length: 8 + seededUnit(seed, index + 8) * 4,
      } as GeneratorParamsMap[K];

    case 'tech.ledWall':
      return {
        width: 4.5 + seededUnit(seed, index + 9) * 1.5,
        height: 2.8,
        title: 'PROZEDURALE INSZENIERUNG',
      } as GeneratorParamsMap[K];

    case 'tech.hangingBanner':
      return {
        text: 'NICHT ORTSGETREU',
        height: 3.5,
      } as GeneratorParamsMap[K];

    default:
      return {} as GeneratorParamsMap[K];
  }
}

function eligibleKeys(
  preset: CameraPreset,
  outdoor: boolean,
  areaM2: number,
): GeneratorKey[] {
  return (Object.keys(GENERATOR_REGISTRY) as GeneratorKey[]).filter((key) => {
    const definition = generatorDefinition(key);

    return (
      definition.autoEligible &&
      definition.anchor === (outdoor ? 'outdoor' : 'stand') &&
      definition.presets.includes(preset as 'halle' | 'ego') &&
      definition.minAreaM2 <= areaM2
    );
  });
}

function concreteFootprint<K extends GeneratorKey>(
  key: K,
  params: GeneratorParamsMap[K],
  scale: number,
): { width: number; depth: number } {
  const definition = generatorDefinition(key);
  let width = definition.width;
  let depth = definition.depth;

  switch (key) {
    case 'booth.infoCounter':
      width = (params as GeneratorParamsMap['booth.infoCounter']).width + 0.25;
      depth = 1.35;
      break;

    case 'crowd.barrierTape':
      width = (params as GeneratorParamsMap['crowd.barrierTape']).length + 0.2;
      depth = 0.55;
      break;

    case 'fnb.cateringTable':
      width = (params as GeneratorParamsMap['fnb.cateringTable']).length;
      depth = 1.05;
      break;

    case 'furniture.bench':
      width = (params as GeneratorParamsMap['furniture.bench']).length;
      depth = 0.7;
      break;

    case 'outdoor.tree':
      width = 2.6 * (params as GeneratorParamsMap['outdoor.tree']).scale;
      depth = 2.6 * (params as GeneratorParamsMap['outdoor.tree']).scale;
      break;

    case 'outdoor.fence':
      width = (params as GeneratorParamsMap['outdoor.fence']).length;
      depth = 0.4;
      break;

    case 'outdoor.leitplanke':
      width = (params as GeneratorParamsMap['outdoor.leitplanke']).length;
      depth = 0.55;
      break;

    case 'tech.ledWall':
      width = (params as GeneratorParamsMap['tech.ledWall']).width + 0.2;
      depth = 0.5;
      break;

    case 'tech.hangingBanner':
      width = 1.4;
      depth = 0.3;
      break;

    default:
      break;
  }

  return {
    width: width * scale,
    depth: depth * scale,
  };
}

function createSpec<K extends GeneratorKey>(
  key: K,
  seed: string,
  index: number,
  polygon: readonly Point2[],
  accepted: AcceptedFootprint[],
  baseY: number,
  centre: [number, number],
  hallKey: string,
  standId: string | null,
): StageSpec<K> | null {
  const scale = 0.86 + seededUnit(seed, index + 30) * 0.22;
  const params = paramsFor(key, seed, index);
  const footprint = concreteFootprint(key, params, scale);

  const placement = findPlacement(
    polygon,
    {
      width: footprint.width,
      depth: footprint.depth,
      margin: 0.35,
    },
    accepted,
    `${seed}:${key}`,
  );

  if (!placement) return null;

  accepted.push({ corners: placement.corners });

  const scenePoint = toScene(
    placement.point[0],
    placement.point[1],
    baseY + 0.06,
    centre,
  );

  return {
    id: `${hallKey}:${standId ?? 'outdoor'}:${index}:${key}`,
    generator: key,
    params,
    hallKey,
    standId,
    position: [scenePoint.x, scenePoint.y, scenePoint.z],
    rotationY: placement.rotationY,
    scale,
    classification: 'fictional',
    collision: false,
  };
}

export function createStageSpecs({
  data,
  centre,
  preset,
  focusHallKey,
  maxItems = preset === 'ego' ? 20 : 14,
}: {
  data: Dataset;
  centre: [number, number];
  preset: CameraPreset;
  focusHallKey: string | null;
  maxItems?: number;
}): StageSpec[] {
  if (
    !focusHallKey ||
    (preset !== 'halle' && preset !== 'ego') ||
    maxItems <= 0
  ) {
    return [];
  }

  const hall = data.hallsByKey.get(focusHallKey);
  if (!hall) return [];

  const result: StageSpec[] = [];
  const acceptedByArea = new Map<string, AcceptedFootprint[]>();
  // DEBUG (temporär, siehe Diagnoseanfrage): Zaehlt Platzierungsversuche, die
  // an findPlacement() scheitern (kein freier Footprint im Polygon).
  let discarded = 0;

  if (hall.outdoor) {
    const keys = eligibleKeys(preset, true, polygonArea(hall.footprint));
    const accepted = acceptedByArea.get(hall.key) ?? [];
    acceptedByArea.set(hall.key, accepted);

    for (let index = 0; index < maxItems && keys.length; index += 1) {
      const seed = `staging:${hall.key}:outdoor:${index}`;
      const key = choose(keys, seed, 0);
      const spec = createSpec(
        key,
        seed,
        index,
        hall.footprint,
        accepted,
        hall.baseY,
        centre,
        hall.key,
        null,
      );

      if (spec) result.push(spec);
      else discarded += 1;
    }

    // eslint-disable-next-line no-console
    console.log('[ProceduralStaging][DEBUG] StageSpecs (outdoor)', {
      hallKey: hall.key,
      erzeugteStageSpecs: result.length,
      verworfenePlatzierungen: discarded,
      standIds: [],
    });

    return result;
  }

  const stands = data.site.stands
    .filter(
      (stand) =>
        stand.hallKey === hall.key &&
        stand.polygon.length >= 3 &&
        stand.level === hall.level,
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const stand of stands) {
    if (result.length >= maxItems) break;

    const area = polygonArea(stand.polygon);
    const keys = eligibleKeys(preset, false, area);
    if (!keys.length) continue;

    const accepted = acceptedByArea.get(stand.id) ?? [];
    acceptedByArea.set(stand.id, accepted);

    const count = area >= 120 ? 2 : 1;

    for (
      let localIndex = 0;
      localIndex < count && result.length < maxItems;
      localIndex += 1
    ) {
      const seed = `staging:${hall.key}:${stand.id}:${localIndex}`;
      const key = choose(keys, seed, 0);
      const spec = createSpec(
        key,
        seed,
        localIndex,
        stand.polygon,
        accepted,
        stand.baseY,
        centre,
        hall.key,
        stand.id,
      );

      if (spec) result.push(spec);
      else discarded += 1;
    }
  }

  // DEBUG (temporär): sichtbare Zusammenfassung je Fokuswechsel.
  // eslint-disable-next-line no-console
  console.log('[ProceduralStaging][DEBUG] StageSpecs', {
    hallKey: hall.key,
    erzeugteStageSpecs: result.length,
    verworfenePlatzierungen: discarded,
    betroffeneStandIds: [...new Set(result.map((spec) => spec.standId).filter(Boolean))],
  });

  return result;
}
