import { describe, expect, it } from 'vitest';

import buildings from '../../public/data/buildings.json';
import surroundings from '../../public/data/surroundings.json';
import {
  alignLegacyLayers,
  legacyPointToRegistered,
  type Footprints,
  type LegacySiteFit,
  type Ortho,
  type Surroundings,
} from './load';

const WORLD_ORIGIN: [number, number, number] = [358300, 5645800, 40];
const fit = buildings.fit as unknown as LegacySiteFit;

describe('legacy exterior alignment', () => {
  it('puts the checked-in Eingang Süd marker in the official scene frame', () => {
    const marker = (surroundings as Surroundings).markers.find((entry) => entry.id === 3063838345);
    expect(marker?.name).toBe('Eingang Süd');

    const point = legacyPointToRegistered(marker!.point, fit, WORLD_ORIGIN);
    expect(point[0]).toBeCloseTo(-377.35, 1);
    expect(point[1]).toBeCloseTo(449.48, 1);
  });

  it('is a rigid frame conversion and does not invent scale', () => {
    const first: [number, number] = [837.59, 218.11];
    const second: [number, number] = [860.53, 638.32];
    const before = Math.hypot(second[0] - first[0], second[1] - first[1]);
    const a = legacyPointToRegistered(first, fit, WORLD_ORIGIN);
    const b = legacyPointToRegistered(second, fit, WORLD_ORIGIN);
    const after = Math.hypot(b[0] - a[0], b[1] - a[1]);
    expect(after).toBeCloseTo(before, 8);
  });

  it('aligns every legacy layer and records the resulting coordinate plane', () => {
    const ortho: Ortho = {
      schema: 'beuteltier.ortho.v1',
      image: 'gelaende.jpg',
      extent: [0, 0, 10, 20],
      metresPerPixel: 1,
    };
    const roads: Surroundings = {
      schema: 'beuteltier.surroundings.v1',
      attribution: 'test',
      roads: [{ id: 1, kind: 'footway', name: null, points: [[0, 0], [3, 4]] }],
      markers: [],
    };
    const footprints: Footprints = {
      schema: 'beuteltier.footprints.v1',
      gapsWithoutLod2: 1,
      footprints: [{ id: 'one', lod2Covered: false, footprint: [[0, 0], [3, 0], [0, 4]] }],
    };

    const aligned = alignLegacyLayers(ortho, roads, footprints, fit, WORLD_ORIGIN);
    expect(aligned.ortho?.coordinatePlane).toBe('sceneX/sceneZ');
    expect(aligned.ortho?.corners).toHaveLength(4);
    expect(aligned.surroundings?.coordinatePlane).toBe('sceneX/sceneZ');
    expect(aligned.footprints?.coordinatePlane).toBe('sceneX/sceneZ');

    const [a, b] = aligned.surroundings!.roads[0].points;
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(5, 8);
  });

  it('does not transform layers that already carry registered coordinates', () => {
    const registeredOrtho: Ortho = {
      schema: 'beuteltier.ortho.v1',
      image: 'wide.jpg',
      extent: [-30, -10, 40, 20],
      metresPerPixel: 1,
      coordinatePlane: 'sceneX/sceneZ',
      corners: [[-30, 20], [40, 20], [-30, -10], [40, -10]],
    };
    const registeredRoads: Surroundings = {
      schema: 'beuteltier.surroundings.v1',
      coordinatePlane: 'sceneX/sceneZ',
      attribution: 'source',
      roads: [{ id: 1, kind: 'path', name: null, points: [[1, 2], [3, 4]] }],
      markers: [],
    };
    const aligned = alignLegacyLayers(
      registeredOrtho,
      registeredRoads,
      null,
      { rotationDeg: 90, mirrored: true, translation: [999, 999] },
      [100, 200, 40],
    );
    expect(aligned.ortho).toBe(registeredOrtho);
    expect(aligned.surroundings).toBe(registeredRoads);
  });

  it('rejects a registered ortho without explicit corners', () => {
    const broken: Ortho = {
      schema: 'beuteltier.ortho.v1',
      image: 'broken.jpg',
      extent: [0, 0, 1, 1],
      metresPerPixel: 1,
      coordinatePlane: 'sceneX/sceneZ',
    };
    expect(() => alignLegacyLayers(
      broken,
      null,
      null,
      { rotationDeg: 0, mirrored: false, translation: [0, 0] },
      [0, 0, 0],
    )).toThrow('keine belegten Szenenecken');
  });
});
