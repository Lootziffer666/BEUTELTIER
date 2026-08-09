import * as THREE from 'three';

import { BoothGenerator } from '../procedural/generators/BoothGenerator.js';
import { CrowdControlGenerator } from '../procedural/generators/CrowdControlGenerator.js';
import { FnbGenerator } from '../procedural/generators/FnbGenerator.js';
import { FurnitureGenerator } from '../procedural/generators/FurnitureGenerator.js';
import { OutdoorGenerator } from '../procedural/generators/OutdoorGenerator.js';
import { SafetyGenerator } from '../procedural/generators/SafetyGenerator.js';
import { TechGenerator } from '../procedural/generators/TechGenerator.js';
import * as AbsurdStands from '../procedural/behavior/AbsurdStands.js';

export type StagingPreset = 'halle' | 'ego';
export type StageAnchor = 'stand' | 'outdoor';
export type BatchPolicy = 'auto' | 'never';
export type StageUpdateMode = 'static' | 'r3f';

export type GeneratorKey =
  | 'booth.infoCounter'
  | 'booth.cardboardFigure'
  | 'crowd.turnstile'
  | 'crowd.ticketScanner'
  | 'crowd.wristbandDispenser'
  | 'crowd.barrierTape'
  | 'fnb.cateringTable'
  | 'fnb.coffeeStation'
  | 'furniture.bench'
  | 'outdoor.tree'
  | 'outdoor.fence'
  | 'outdoor.leitplanke'
  | 'safety.fireExtinguisher'
  | 'tech.ledWall'
  | 'tech.hangingBanner'
  | 'absurd.patchnotes'
  | 'absurd.loading'
  | 'absurd.lootboxToilet'
  | 'absurd.agbBoss'
  | 'absurd.npcPettingZoo'
  | 'absurd.exitSimulator'
  | 'absurd.ai'
  | 'absurd.rating';

export type GeneratorParamsMap = {
  'booth.infoCounter': { width: number; brandColor: number };
  'booth.cardboardFigure': { name: string; gameTitle: string };
  'crowd.turnstile': Record<string, never>;
  'crowd.ticketScanner': Record<string, never>;
  'crowd.wristbandDispenser': { label: string };
  'crowd.barrierTape': { length: number; height: number };
  'fnb.cateringTable': { length: number };
  'fnb.coffeeStation': Record<string, never>;
  'furniture.bench': { length: number };
  'outdoor.tree': { scale: number };
  'outdoor.fence': { length: number; type: 'mesh' | 'solid'; height: number };
  'outdoor.leitplanke': { length: number };
  'safety.fireExtinguisher': Record<string, never>;
  'tech.ledWall': { width: number; height: number; title: string };
  'tech.hangingBanner': { text: string; height: number };
  'absurd.patchnotes': Record<string, never>;
  'absurd.loading': Record<string, never>;
  'absurd.lootboxToilet': Record<string, never>;
  'absurd.agbBoss': Record<string, never>;
  'absurd.npcPettingZoo': Record<string, never>;
  'absurd.exitSimulator': Record<string, never>;
  'absurd.ai': Record<string, never>;
  'absurd.rating': Record<string, never>;
};

export interface GeneratorDefinition<K extends GeneratorKey = GeneratorKey> {
  key: K;
  anchor: StageAnchor;
  width: number;
  depth: number;
  minAreaM2: number;
  presets: readonly StagingPreset[];
  batch: BatchPolicy;
  autoEligible: boolean;
  updateMode: StageUpdateMode;
  factory: (params: GeneratorParamsMap[K]) => THREE.Object3D;
}

type Registry = {
  [K in GeneratorKey]: GeneratorDefinition<K>;
};

function absurdFactory(
  key:
    | 'createPatchnotesStand'
    | 'createLoadingStand'
    | 'createLootboxToilet'
    | 'createAGBBossStand'
    | 'createNPCPettingZoo'
    | 'createExitSimulator'
    | 'createAIStand'
    | 'createRatingStand',
): () => THREE.Object3D {
  return () => {
    const factory = AbsurdStands[key] as unknown as (
      x: number,
      z: number,
    ) => THREE.Object3D;

    return factory(0, 0);
  };
}

export const GENERATOR_REGISTRY: Registry = {
  'booth.infoCounter': {
    key: 'booth.infoCounter',
    anchor: 'stand',
    width: 4.2,
    depth: 1.8,
    minAreaM2: 12,
    presets: ['halle', 'ego'],
    batch: 'auto',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ width, brandColor }) =>
      BoothGenerator.createInfoCounter(width, brandColor),
  },
  'booth.cardboardFigure': {
    key: 'booth.cardboardFigure',
    anchor: 'stand',
    width: 1.25,
    depth: 0.9,
    minAreaM2: 5,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ name, gameTitle }) =>
      BoothGenerator.createCardboardFigure(name, gameTitle, 0, 0),
  },
  'crowd.turnstile': {
    key: 'crowd.turnstile',
    anchor: 'stand',
    width: 1.9,
    depth: 1.9,
    minAreaM2: 10,
    presets: ['halle', 'ego'],
    batch: 'auto',
    autoEligible: true,
    updateMode: 'static',
    factory: () => CrowdControlGenerator.createTurnstile(),
  },
  'crowd.ticketScanner': {
    key: 'crowd.ticketScanner',
    anchor: 'stand',
    width: 0.8,
    depth: 0.8,
    minAreaM2: 4,
    presets: ['halle', 'ego'],
    batch: 'auto',
    autoEligible: true,
    updateMode: 'static',
    factory: () => CrowdControlGenerator.createTicketScanner(),
  },
  'crowd.wristbandDispenser': {
    key: 'crowd.wristbandDispenser',
    anchor: 'stand',
    width: 1.6,
    depth: 1.2,
    minAreaM2: 8,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ label }) =>
      CrowdControlGenerator.createWristbandDispenser(label),
  },
  'crowd.barrierTape': {
    key: 'crowd.barrierTape',
    anchor: 'stand',
    width: 5.5,
    depth: 0.7,
    minAreaM2: 15,
    presets: ['halle', 'ego'],
    batch: 'auto',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ length, height }) =>
      CrowdControlGenerator.createBarrierTape(length, height),
  },
  'fnb.cateringTable': {
    key: 'fnb.cateringTable',
    anchor: 'stand',
    width: 4.8,
    depth: 1.3,
    minAreaM2: 16,
    presets: ['halle', 'ego'],
    batch: 'auto',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ length }) => FnbGenerator.createCateringTable(length),
  },
  'fnb.coffeeStation': {
    key: 'fnb.coffeeStation',
    anchor: 'stand',
    width: 1.3,
    depth: 1.1,
    minAreaM2: 7,
    presets: ['halle', 'ego'],
    batch: 'auto',
    autoEligible: true,
    updateMode: 'static',
    factory: () => FnbGenerator.createCoffeeStation(),
  },
  'furniture.bench': {
    key: 'furniture.bench',
    anchor: 'stand',
    width: 3,
    depth: 1,
    minAreaM2: 10,
    presets: ['halle', 'ego'],
    batch: 'auto',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ length }) => FurnitureGenerator.createBench(length),
  },
  'outdoor.tree': {
    key: 'outdoor.tree',
    anchor: 'outdoor',
    width: 3.2,
    depth: 3.2,
    minAreaM2: 16,
    presets: ['halle', 'ego'],
    batch: 'auto',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ scale }) => OutdoorGenerator.createTree(0, 0, scale),
  },
  'outdoor.fence': {
    key: 'outdoor.fence',
    anchor: 'outdoor',
    width: 10,
    depth: 0.8,
    minAreaM2: 30,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ length, type, height }) =>
      OutdoorGenerator.createFence(length, type, height),
  },
  'outdoor.leitplanke': {
    key: 'outdoor.leitplanke',
    anchor: 'outdoor',
    width: 12,
    depth: 0.8,
    minAreaM2: 36,
    presets: ['halle', 'ego'],
    batch: 'auto',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ length }) => OutdoorGenerator.createLeitplanke(length),
  },
  'safety.fireExtinguisher': {
    key: 'safety.fireExtinguisher',
    anchor: 'stand',
    width: 0.5,
    depth: 0.5,
    minAreaM2: 4,
    presets: ['ego'],
    batch: 'auto',
    autoEligible: false,
    updateMode: 'static',
    factory: () => SafetyGenerator.createFireExtinguisher(),
  },
  'tech.ledWall': {
    key: 'tech.ledWall',
    anchor: 'stand',
    width: 6.6,
    depth: 1,
    minAreaM2: 30,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ width, height, title }) =>
      TechGenerator.createLEDWall(width, height, title),
  },
  'tech.hangingBanner': {
    key: 'tech.hangingBanner',
    anchor: 'stand',
    width: 1.8,
    depth: 0.8,
    minAreaM2: 8,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: ({ text, height }) =>
      TechGenerator.createHangingBanner(text, 0, height, 0),
  },
  'absurd.patchnotes': {
    key: 'absurd.patchnotes',
    anchor: 'stand',
    width: 4.8,
    depth: 4.8,
    minAreaM2: 28,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: absurdFactory('createPatchnotesStand'),
  },
  'absurd.loading': {
    key: 'absurd.loading',
    anchor: 'stand',
    width: 5.2,
    depth: 3.2,
    minAreaM2: 24,
    presets: ['ego'],
    batch: 'never',
    autoEligible: false,
    updateMode: 'static',
    factory: absurdFactory('createLoadingStand'),
  },
  'absurd.lootboxToilet': {
    key: 'absurd.lootboxToilet',
    anchor: 'stand',
    width: 6.2,
    depth: 2.1,
    minAreaM2: 26,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: absurdFactory('createLootboxToilet'),
  },
  'absurd.agbBoss': {
    key: 'absurd.agbBoss',
    anchor: 'stand',
    width: 8.6,
    depth: 1.8,
    minAreaM2: 42,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: absurdFactory('createAGBBossStand'),
  },
  'absurd.npcPettingZoo': {
    key: 'absurd.npcPettingZoo',
    anchor: 'stand',
    width: 7,
    depth: 3,
    minAreaM2: 28,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: absurdFactory('createNPCPettingZoo'),
  },
  'absurd.exitSimulator': {
    key: 'absurd.exitSimulator',
    anchor: 'stand',
    width: 7.4,
    depth: 7.4,
    minAreaM2: 48,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: absurdFactory('createExitSimulator'),
  },
  'absurd.ai': {
    key: 'absurd.ai',
    anchor: 'stand',
    width: 2,
    depth: 1.7,
    minAreaM2: 10,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: absurdFactory('createAIStand'),
  },
  'absurd.rating': {
    key: 'absurd.rating',
    anchor: 'stand',
    width: 3.8,
    depth: 1.5,
    minAreaM2: 16,
    presets: ['halle', 'ego'],
    batch: 'never',
    autoEligible: true,
    updateMode: 'static',
    factory: absurdFactory('createRatingStand'),
  },
};

export function generatorDefinition<K extends GeneratorKey>(
  key: K,
): GeneratorDefinition<K> {
  return GENERATOR_REGISTRY[key] as GeneratorDefinition<K>;
}
