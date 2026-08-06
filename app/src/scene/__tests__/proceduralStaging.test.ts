// @vitest-environment happy-dom
//
// Generatoren wie TechGenerator.createLEDWall() zeichnen Canvas-Texturen
// (ProceduralTextures.videoScreen()). happy-dom liefert `document`, aber
// keine 2D-Canvas-Implementierung -- deshalb der Stub direkt darunter, statt
// die native `canvas`-Paketabhaengigkeit fuer eine Offline-PWA einzuziehen.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { BoothGenerator } from '../../procedural/generators/BoothGenerator.js';
import { CrowdControlGenerator } from '../../procedural/generators/CrowdControlGenerator.js';
import { FnbGenerator } from '../../procedural/generators/FnbGenerator.js';
import { FurnitureGenerator } from '../../procedural/generators/FurnitureGenerator.js';
import { OutdoorGenerator } from '../../procedural/generators/OutdoorGenerator.js';
import { SafetyGenerator } from '../../procedural/generators/SafetyGenerator.js';
import { TechGenerator } from '../../procedural/generators/TechGenerator.js';
import { prepareStageRenderPlan } from '../batching';
import { createGeneratedStageObject } from '../generatorAdapter';
import { findPlacement, pointInPolygon } from '../placement';

beforeAll(() => {
  const store: Record<string | symbol, unknown> = {};
  const stubContext = new Proxy(store, {
    get: (target, prop) => {
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set: (target, prop, value) => {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  HTMLCanvasElement.prototype.getContext = ((contextId: string) =>
    contextId === '2d'
      ? stubContext
      : null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('Generator-Imports', () => {
  it('stellt alle benötigten benannten Klassen bereit', () => {
    expect(BoothGenerator).toBeTypeOf('function');
    expect(CrowdControlGenerator).toBeTypeOf('function');
    expect(FnbGenerator).toBeTypeOf('function');
    expect(FurnitureGenerator).toBeTypeOf('function');
    expect(OutdoorGenerator).toBeTypeOf('function');
    expect(SafetyGenerator).toBeTypeOf('function');
    expect(TechGenerator).toBeTypeOf('function');
  });
});

describe('Placement', () => {
  const polygon: Array<[number, number]> = [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
  ];

  it('liefert für denselben Seed dieselbe Position', () => {
    const a = findPlacement(
      polygon,
      { width: 3, depth: 2, margin: 0.35 },
      [],
      'same-seed',
    );

    const b = findPlacement(
      polygon,
      { width: 3, depth: 2, margin: 0.35 },
      [],
      'same-seed',
    );

    expect(a).toEqual(b);
  });

  it('hält den gesamten Footprint im Polygon', () => {
    const placement = findPlacement(
      polygon,
      { width: 4, depth: 3, margin: 0.35 },
      [],
      'inside',
    );

    expect(placement).not.toBeNull();
    placement!.corners.forEach((corner) => {
      expect(pointInPolygon(corner, polygon)).toBe(true);
    });
  });

  it('verhindert Überlappung mit akzeptierten Footprints', () => {
    const first = findPlacement(
      polygon,
      { width: 8, depth: 8, margin: 0.35 },
      [],
      'first',
    );

    expect(first).not.toBeNull();

    const second = findPlacement(
      polygon,
      { width: 8, depth: 8, margin: 0.35 },
      [{ corners: first!.corners }],
      'second',
    );

    expect(second).not.toBeNull();
  });
});

describe('Generator-Adapter', () => {
  it('entfernt Collider und echte Lights aus dem Renderbaum', () => {
    const generated = createGeneratedStageObject({
      id: 'test',
      generator: 'tech.ledWall',
      params: {
        width: 4,
        height: 2,
        title: 'TEST',
      },
      hallKey: 'halle-1',
      standId: 'stand-1',
      position: [1, 2, 3],
      rotationY: 0,
      scale: 1,
      classification: 'fictional',
      collision: false,
    });

    const colliders: THREE.Object3D[] = [];
    const lights: THREE.Light[] = [];

    generated.root.traverse((node) => {
      if (node.userData.isCollider === true) colliders.push(node);
      if (node instanceof THREE.Light) lights.push(node);
    });

    expect(colliders).toHaveLength(0);
    expect(lights).toHaveLength(0);

    generated.dispose();
  });

  it('respektiert batch never', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();

    const root = new THREE.Group();
    const meshA = new THREE.Mesh(geometry, material);
    const meshB = new THREE.Mesh(geometry, material);

    meshA.userData.batchPolicy = 'never';
    meshB.userData.batchPolicy = 'never';

    root.add(meshA, meshB);
    root.updateMatrixWorld(true);

    const plan = prepareStageRenderPlan([
      {
        id: 'a',
        root,
        updateMode: 'static',
        dispose: vi.fn(),
      },
    ]);

    expect(plan.batches).toHaveLength(0);
    expect(plan.singles).toHaveLength(1);

    geometry.dispose();
    material.dispose();
  });

  it('gibt eigene Ressourcen nur einmal frei', () => {
    const generated = createGeneratedStageObject({
      id: 'cleanup',
      generator: 'booth.infoCounter',
      params: {
        width: 3,
        brandColor: 0x3366cc,
      },
      hallKey: 'halle-1',
      standId: 'stand-1',
      position: [0, 0, 0],
      rotationY: 0,
      scale: 1,
      classification: 'fictional',
      collision: false,
    });

    const dispose = vi.spyOn(
      THREE.BufferGeometry.prototype,
      'dispose',
    );

    generated.dispose();
    const callsAfterFirstDispose = dispose.mock.calls.length;

    generated.dispose();

    expect(dispose.mock.calls.length).toBe(callsAfterFirstDispose);
    dispose.mockRestore();
  });
});
