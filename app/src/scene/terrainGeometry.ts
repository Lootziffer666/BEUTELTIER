import * as THREE from 'three';

export type RegisteredCorners = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

const EPSILON_M = 0.001;

export interface TerrainHeightmap {
  origin: [number, number, number];
  stepM: number;
  cols: number;
  rows: number;
  heights: Float32Array;
}

/** Liest den eingecheckten DGM-Header; 40--47 ist ein obsoleter Alt-Offset. */
export function parseTerrainHeightmap(buffer: ArrayBuffer): TerrainHeightmap {
  if (buffer.byteLength < 48) {
    throw new Error(`Binaerheader zu kurz: ${buffer.byteLength} Bytes`);
  }
  const view = new DataView(buffer);
  const origin: [number, number, number] = [
    view.getFloat64(0, true),
    view.getFloat64(8, true),
    view.getFloat64(16, true),
  ];
  const stepM = view.getFloat64(24, true);
  const cols = view.getUint32(32, true);
  const rows = view.getUint32(36, true);
  const expectedBytes = 48 + cols * rows * Float32Array.BYTES_PER_ELEMENT;
  if (
    origin.some((value) => !Number.isFinite(value)) ||
    !Number.isFinite(stepM) ||
    stepM <= 0 ||
    cols < 2 ||
    rows < 2 ||
    buffer.byteLength !== expectedBytes
  ) {
    throw new Error(
      `Binaerraster inkonsistent: ${cols}×${rows}, ${buffer.byteLength}/${expectedBytes} Bytes`,
    );
  }
  // Der Header ist 48 Bytes lang. Der alte Renderer begann bei 44 und las
  // dadurch die obere Haelfte des obsoleten Offsets als ersten Hoehenwert.
  return {
    origin,
    stepM,
    cols,
    rows,
    heights: new Float32Array(buffer, 48, cols * rows),
  };
}

/** Bilineare DGM-Hoehe fuer eine registrierte sceneX/sceneZ-Koordinate. */
export function sampleRegisteredTerrainHeight(
  map: TerrainHeightmap,
  worldOrigin: [number, number, number],
  sceneX: number,
  sceneZ: number,
): number | null {
  const utmX = sceneX + worldOrigin[0];
  const utmY = worldOrigin[1] - sceneZ;
  const gx = (utmX - map.origin[0]) / map.stepM;
  const gy = (utmY - map.origin[1]) / map.stepM;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  if (x0 < 0 || y0 < 0 || x0 >= map.cols - 1 || y0 >= map.rows - 1) return null;

  const fx = gx - x0;
  const fy = gy - y0;
  const index = (row: number, col: number) => row * map.cols + col;
  const h00 = map.heights[index(y0, x0)];
  const h01 = map.heights[index(y0, x0 + 1)];
  const h10 = map.heights[index(y0 + 1, x0)];
  const h11 = map.heights[index(y0 + 1, x0 + 1)];
  if (![h00, h01, h10, h11].every(Number.isFinite)) return null;
  const north = h00 * (1 - fx) + h01 * fx;
  const south = h10 * (1 - fx) + h11 * fx;
  return north * (1 - fy) + south * fy - worldOrigin[2];
}

/**
 * Das eingecheckte Terrain-GLB enthaelt echte DGM1-Hoehen, aber sein alter
 * Generator hat jede Zelle um eine Zeile versetzt indiziert. Die letzten
 * 1.203 Indizes zeigen deshalb sogar hinter das Vertex-Array. Diese Funktion
 * rekonstruiert ausschliesslich die regelmaessige Raster-Topologie aus den
 * vorhandenen, gemessenen Vertexpositionen; sie erfindet keine Hoehen.
 */
export function repairTerrainGrid(source: THREE.BufferGeometry): {
  geometry: THREE.BufferGeometry;
  cols: number;
  rows: number;
} {
  const position = source.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute) || position.itemSize !== 3) {
    throw new Error('Terrain besitzt kein VEC3-Positionsraster.');
  }
  if (position.count < 4) throw new Error('Terrain-Raster ist leer.');

  const firstZ = position.getZ(0);
  let cols = 1;
  while (cols < position.count && Math.abs(position.getZ(cols) - firstZ) <= EPSILON_M) {
    cols += 1;
  }
  if (cols < 2 || cols === position.count || position.count % cols !== 0) {
    throw new Error(`Terrain-Raster kann nicht aus ${position.count} Punkten gelesen werden.`);
  }
  const rows = position.count / cols;
  if (rows < 2) throw new Error('Terrain-Raster besitzt weniger als zwei Zeilen.');

  const x0 = position.getX(0);
  const x1 = position.getX(1);
  const stepX = x1 - x0;
  const stepZ = position.getZ(cols) - firstZ;
  if (Math.abs(stepX) <= EPSILON_M || Math.abs(stepZ) <= EPSILON_M) {
    throw new Error('Terrain-Raster besitzt keine metrische Schrittweite.');
  }

  for (let row = 0; row < rows; row += 1) {
    const start = row * cols;
    const expectedZ = firstZ + row * stepZ;
    if (
      Math.abs(position.getZ(start) - expectedZ) > EPSILON_M ||
      Math.abs(position.getZ(start + cols - 1) - expectedZ) > EPSILON_M ||
      Math.abs(position.getX(start) - x0) > EPSILON_M ||
      Math.abs(position.getX(start + cols - 1) - (x0 + (cols - 1) * stepX)) > EPSILON_M
    ) {
      throw new Error(`Terrain-Raster ist in Zeile ${row} nicht regelmaessig.`);
    }
  }

  const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // Raster-Z nimmt im Asset von Zeile zu Zeile ab. Diese Reihenfolge
      // zeigt deshalb nach +Y und bleibt von oben sichtbar.
      indices[cursor++] = a;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = d;
      indices[cursor++] = c;
    }
  }

  const geometry = source.clone();
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, cols, rows };
}

function orthoBasis(corners: RegisteredCorners) {
  const [p00, p10, p01, p11] = corners;
  const ux = p10[0] - p00[0];
  const uz = p10[1] - p00[1];
  const vx = p01[0] - p00[0];
  const vz = p01[1] - p00[1];
  const determinant = ux * vz - uz * vx;
  if (Math.abs(determinant) <= 1e-6) throw new Error('Orthofoto-Ecken sind entartet.');

  const expected11: [number, number] = [p10[0] + vx, p10[1] + vz];
  if (Math.hypot(p11[0] - expected11[0], p11[1] - expected11[1]) > 0.1) {
    throw new Error('Orthofoto-Ecken bilden keine affine Flaeche.');
  }
  return { p00, ux, uz, vx, vz, determinant };
}

/** Weltrelative sceneX/sceneZ-Koordinate -> UV des registrierten Luftbilds. */
export function registeredOrthoUv(
  x: number,
  z: number,
  corners: RegisteredCorners,
): [number, number] {
  const { p00, ux, uz, vx, vz, determinant } = orthoBasis(corners);
  const dx = x - p00[0];
  const dz = z - p00[1];
  const u = (dx * vz - dz * vx) / determinant;
  const alongV = (ux * dz - uz * dx) / determinant;
  // Das entzerrte JPEG beginnt oben; dieselbe Orientierung nutzte bereits
  // der belegte alte Luftbildpfad (p00 -> 0/1, p01 -> 0/0).
  return [u, 1 - alongV];
}

function insideImage([u, v]: [number, number], margin = 0): boolean {
  return u >= -margin && u <= 1 + margin && v >= -margin && v <= 1 + margin;
}

/**
 * Projiziert das reale Orthofoto auf eine einzelne amtliche Dachflaeche.
 * Liegt deren Mittelpunkt ausserhalb des belegten Bildausschnitts, bleibt die
 * Flaeche unveraendert, statt einen geklemmten Randpixel vorzutäuschen.
 */
export function applyRegisteredOrthoUv(
  geometry: THREE.BufferGeometry,
  corners: RegisteredCorners,
): boolean {
  const position = geometry.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute) || position.itemSize !== 3 || position.count === 0) {
    return false;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < position.count; index += 1) {
    minX = Math.min(minX, position.getX(index));
    maxX = Math.max(maxX, position.getX(index));
    minZ = Math.min(minZ, position.getZ(index));
    maxZ = Math.max(maxZ, position.getZ(index));
  }
  if (!insideImage(registeredOrthoUv((minX + maxX) / 2, (minZ + maxZ) / 2, corners))) {
    return false;
  }

  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const [u, v] = registeredOrthoUv(position.getX(index), position.getZ(index), corners);
    uv[index * 2] = u;
    uv[index * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return true;
}

/** Legt nur den belegten Luftbildausschnitt als zweite Haut aufs DGM1. */
export function orthophotoTerrainGeometry(
  terrain: THREE.BufferGeometry,
  cols: number,
  rows: number,
  corners: RegisteredCorners,
): THREE.BufferGeometry {
  const position = terrain.getAttribute('position');
  const normal = terrain.getAttribute('normal');
  if (!(position instanceof THREE.BufferAttribute) || !(normal instanceof THREE.BufferAttribute)) {
    throw new Error('Repariertes Terrain besitzt keine Positionen oder Normalen.');
  }
  if (position.count !== cols * rows) throw new Error('Terrain-Rastermasse widersprechen der Geometrie.');

  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const mapped = registeredOrthoUv(position.getX(index), position.getZ(index), corners);
    uv[index * 2] = mapped[0];
    uv[index * 2 + 1] = mapped[1];
  }

  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const a = row * cols + col;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      const centreX = (position.getX(a) + position.getX(d)) / 2;
      const centreZ = (position.getZ(a) + position.getZ(d)) / 2;
      if (!insideImage(registeredOrthoUv(centreX, centreZ, corners), 0.005)) continue;
      indices.push(a, b, c, b, d, c);
    }
  }
  if (indices.length === 0) throw new Error('Orthofoto und Terrain ueberlappen sich nicht.');

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(indices), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
