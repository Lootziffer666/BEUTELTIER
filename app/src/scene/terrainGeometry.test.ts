import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  applyRegisteredOrthoUv,
  lod2TerrainConnectionGeometry,
  orthophotoTerrainGeometry,
  parseTerrainHeightmap,
  registeredOrthoContains,
  registeredOrthoUv,
  repairTerrainGrid,
  sampleRegisteredTerrainHeight,
  terrainDrapedSegments,
  type RegisteredCorners,
} from './terrainGeometry';

const corners: RegisteredCorners = [[0, 10], [10, 10], [0, 5], [10, 5]];

function twoByThreeGrid(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 10, 5, 0, 10, 10, 0, 10,
    0, 1, 5, 5, 1, 5, 10, 1, 5,
  ], 3));
  // Belegt, dass die Reparatur den gelieferten Index nicht vertraut.
  geometry.setIndex([3, 99, 4]);
  return geometry;
}

function twoByTwoHeightmap(): ArrayBuffer {
  const buffer = new ArrayBuffer(48 + 4 * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(buffer);
  view.setFloat64(0, 100, true);
  view.setFloat64(8, 200, true);
  view.setFloat64(16, 40, true);
  view.setFloat64(24, 10, true);
  view.setUint32(32, 2, true);
  view.setUint32(36, 2, true);
  // Historischer Offset; er gehoert nicht zum Hoehenarray.
  view.setFloat64(40, -79.5, true);
  new Float32Array(buffer, 48).set([40, 42, 44, 46]);
  return buffer;
}

describe('DGM1 terrain geometry', () => {
  it('reconstructs a bounded, upward-facing grid index', () => {
    const repaired = repairTerrainGrid(twoByThreeGrid());
    expect(repaired.cols).toBe(3);
    expect(repaired.rows).toBe(2);
    expect(Array.from(repaired.geometry.getIndex()!.array)).toEqual([
      0, 1, 3, 1, 4, 3,
      1, 2, 4, 2, 5, 4,
    ]);
    expect(Math.max(...Array.from(repaired.geometry.getIndex()!.array))).toBeLessThan(6);
    expect(repaired.geometry.getAttribute('normal').getY(0)).toBeGreaterThan(0);
  });

  it('closes coarse building-mask holes with the measured terrain grid', () => {
    const source = twoByThreeGrid();
    source.setIndex([1, 2, 4, 2, 5, 4]);
    const repaired = repairTerrainGrid(source);
    expect(Array.from(repaired.geometry.getIndex()!.array)).toEqual([
      0, 1, 3, 1, 4, 3,
      1, 2, 4, 2, 5, 4,
    ]);

    const drape = orthophotoTerrainGeometry(
      repaired.geometry,
      repaired.cols,
      repaired.rows,
      corners,
    );
    expect(Array.from(drape.getIndex()!.array)).toEqual([
      0, 1, 3, 1, 4, 3,
      1, 2, 4, 2, 5, 4,
    ]);
  });

  it('maps the southern image edge to v=0 without a second vertical flip', () => {
    expect(registeredOrthoUv(0, 10, corners)).toEqual([0, 0]);
    expect(registeredOrthoUv(10, 10, corners)).toEqual([1, 0]);
    const lowerLeft = registeredOrthoUv(0, 5, corners);
    expect(lowerLeft[0]).toBeCloseTo(0);
    expect(lowerLeft[1]).toBeCloseTo(1);
  });

  it('drapes exactly the registered image footprint over the repaired terrain', () => {
    const repaired = repairTerrainGrid(twoByThreeGrid());
    const drape = orthophotoTerrainGeometry(
      repaired.geometry,
      repaired.cols,
      repaired.rows,
      corners,
    );
    expect(drape.getIndex()!.count).toBe(12);
    expect(Array.from(drape.getAttribute('uv').array.slice(0, 6))).toEqual([0, 0, 0.5, 0, 1, 0]);
  });

  it('only applies roof UVs inside the registered image', () => {
    const inside = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2).translate(5, 0, 7.5);
    const outside = inside.clone().translate(100, 0, 0);
    expect(applyRegisteredOrthoUv(inside, corners)).toBe(true);
    expect(inside.getAttribute('uv').count).toBe(inside.getAttribute('position').count);
    expect(applyRegisteredOrthoUv(outside, corners)).toBe(false);
  });

  it('drapes roads only where both DGM and orthophoto have evidence', () => {
    const lines = [
      [[1, 9], [5, 7], [11, 7]],
    ] as const;
    const positions = terrainDrapedSegments(lines, (x, z) => x + z, corners);
    expect(positions).toEqual([1, 10.08, 9, 5, 12.08, 7]);
    expect(registeredOrthoContains(5, 7, corners)).toBe(true);
    expect(registeredOrthoContains(11, 7, corners)).toBe(false);
  });

  it('reads heights after the complete 48-byte header and samples registered coordinates', () => {
    const map = parseTerrainHeightmap(twoByTwoHeightmap());
    expect(Array.from(map.heights)).toEqual([40, 42, 44, 46]);
    expect(sampleRegisteredTerrainHeight(map, [100, 200, 40], 5, -5)).toBeCloseTo(3);
    expect(sampleRegisteredTerrainHeight(map, [100, 200, 40], -1, 0)).toBeNull();
  });

  it('rejects a truncated heightmap instead of returning a flat height', () => {
    expect(() => parseTerrainHeightmap(twoByTwoHeightmap().slice(0, -4))).toThrow(
      'Binaerraster inkonsistent',
    );
  });

  it('derives a wall-to-terrain connection only from measured endpoint heights', () => {
    const wall = new THREE.BufferGeometry();
    wall.setAttribute('position', new THREE.Float32BufferAttribute([
      1, 5, 2, 9, 5, 2, 9, 15, 2,
      1, 5, 2, 9, 15, 2, 1, 15, 2,
    ], 3));
    const connection = lod2TerrainConnectionGeometry([wall], (x) => (x < 5 ? 2 : 3));
    expect(connection).not.toBeNull();
    expect(connection!.getAttribute('position').count).toBe(6);
    expect(connection!.boundingBox!.min.y).toBeCloseTo(2);
    expect(connection!.boundingBox!.max.y).toBeCloseTo(5);
  });

  it('does not invent a connection when the DGM has no value', () => {
    const wall = new THREE.PlaneGeometry(8, 10).translate(5, 5, 0);
    expect(lod2TerrainConnectionGeometry([wall], () => null)).toBeNull();
  });
});
