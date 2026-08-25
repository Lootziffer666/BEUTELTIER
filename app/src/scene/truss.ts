import * as THREE from 'three';

export type Vec3 = readonly [number, number, number];
export type TrussTubeKind = 'chord' | 'brace' | 'frame';

export interface TrussTube {
  start: Vec3;
  end: Vec3;
  radius: number;
  kind: TrussTubeKind;
}

export interface BoxTrussOptions {
  /** Overall outside width of the box truss, in metres. */
  width?: number;
  /** Overall outside height of the box truss, in metres. */
  height?: number;
  /** Radius of the four longitudinal chords. */
  chordRadius?: number;
  /** Radius of the welded diagonal bracing. */
  braceRadius?: number;
  /** Desired length of one repeated brace bay. The real bay size is adjusted
   * slightly so the last bay ends exactly on the requested endpoint. */
  bayLength?: number;
  /** X = two diagonals on every face/bay. Zigzag = one alternating diagonal. */
  bracing?: 'x' | 'zigzag';
  /** Add square end frames between the four chords. */
  endFrames?: boolean;
}

export interface GeneratedTruss {
  length: number;
  bays: number;
  tubes: TrussTube[];
}

export interface TrussGraph {
  /** Named connection points. */
  nodes: Record<string, Vec3>;
  /** Each edge becomes one procedural box truss between two nodes. */
  edges: ReadonlyArray<readonly [string, string]>;
}

const DEFAULTS: Required<BoxTrussOptions> = {
  width: 0.29,
  height: 0.29,
  chordRadius: 0.025,
  braceRadius: 0.012,
  bayLength: 0.32,
  bracing: 'x',
  endFrames: true,
};

function tuple(v: THREE.Vector3): Vec3 {
  return [v.x, v.y, v.z];
}

function vector(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

function tube(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  kind: TrussTubeKind,
): TrussTube {
  return { start: tuple(start), end: tuple(end), radius, kind };
}

/**
 * Creates the four longitudinal chords and the welded cross bracing for one
 * straight box truss between arbitrary 3D points.
 *
 * The generator intentionally returns tube primitives instead of unique mesh
 * objects. Callers can instance every radius/kind with one cylinder geometry,
 * merge them for a static bake, or feed them to another renderer. This keeps
 * "a 20 m truss" a rule, not a 20 m bespoke asset.
 */
export function generateBoxTruss(
  startValue: Vec3,
  endValue: Vec3,
  options: BoxTrussOptions = {},
): GeneratedTruss {
  const cfg = { ...DEFAULTS, ...options };
  const start = vector(startValue);
  const end = vector(endValue);
  const axis = end.clone().sub(start);
  const length = axis.length();

  if (!Number.isFinite(length) || length <= 1e-6) {
    return { length: 0, bays: 0, tubes: [] };
  }
  if (
    cfg.width <= 0 || cfg.height <= 0 || cfg.chordRadius <= 0 ||
    cfg.braceRadius <= 0 || cfg.bayLength <= 0
  ) {
    return { length, bays: 0, tubes: [] };
  }

  const direction = axis.clone().multiplyScalar(1 / length);

  // Build a stable orthonormal frame around the truss axis. For almost-
  // vertical trusses we deliberately choose X as helper so cross products do
  // not collapse. The exact roll is irrelevant for a square box truss; it is
  // deterministic and continuous for the normal horizontal use case.
  const helper = Math.abs(direction.y) < 0.95
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(direction, helper).normalize();
  const v = new THREE.Vector3().crossVectors(direction, u).normalize();

  const halfW = cfg.width / 2;
  const halfH = cfg.height / 2;
  const offsets = [
    u.clone().multiplyScalar(+halfW).addScaledVector(v, +halfH),
    u.clone().multiplyScalar(-halfW).addScaledVector(v, +halfH),
    u.clone().multiplyScalar(-halfW).addScaledVector(v, -halfH),
    u.clone().multiplyScalar(+halfW).addScaledVector(v, -halfH),
  ];

  const at = (offset: THREE.Vector3, t: number) => start.clone()
    .addScaledVector(direction, length * t)
    .add(offset);

  const tubes: TrussTube[] = [];

  // The defining feature: exactly four parallel longitudinal tubes.
  for (const offset of offsets) {
    tubes.push(tube(at(offset, 0), at(offset, 1), cfg.chordRadius, 'chord'));
  }

  const bays = Math.max(1, Math.ceil(length / cfg.bayLength));
  const faces: ReadonlyArray<readonly [number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
  ];

  for (let bay = 0; bay < bays; bay += 1) {
    const t0 = bay / bays;
    const t1 = (bay + 1) / bays;

    for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
      const [a, b] = faces[faceIndex];
      const firstForward = ((bay + faceIndex) & 1) === 0;

      if (cfg.bracing === 'x') {
        // Both diagonals on every side: the familiar welded X pattern.
        tubes.push(tube(at(offsets[a], t0), at(offsets[b], t1), cfg.braceRadius, 'brace'));
        tubes.push(tube(at(offsets[b], t0), at(offsets[a], t1), cfg.braceRadius, 'brace'));
      } else if (firstForward) {
        tubes.push(tube(at(offsets[a], t0), at(offsets[b], t1), cfg.braceRadius, 'brace'));
      } else {
        tubes.push(tube(at(offsets[b], t0), at(offsets[a], t1), cfg.braceRadius, 'brace'));
      }
    }
  }

  if (cfg.endFrames) {
    for (const t of [0, 1]) {
      for (const [a, b] of faces) {
        tubes.push(tube(at(offsets[a], t), at(offsets[b], t), cfg.braceRadius, 'frame'));
      }
    }
  }

  return { length, bays, tubes };
}

/**
 * A whole exhibition rig is just named points plus edges. Rectangles, Ls,
 * crosses, grids and hanging branches therefore need no bespoke GLB assets.
 */
export function generateTrussGraph(
  graph: TrussGraph,
  options: BoxTrussOptions = {},
): TrussTube[] {
  const result: TrussTube[] = [];
  for (const [from, to] of graph.edges) {
    const start = graph.nodes[from];
    const end = graph.nodes[to];
    if (!start || !end) continue;
    result.push(...generateBoxTruss(start, end, options).tubes);
  }
  return result;
}

/**
 * Matrix for a unit cylinder whose local Y axis runs from tube.start to
 * tube.end. This is the intended fast render path: one InstancedMesh can draw
 * every generated tube with a shared cylinder geometry/material.
 */
export function trussTubeMatrix(spec: TrussTube, target = new THREE.Matrix4()): THREE.Matrix4 {
  const start = vector(spec.start);
  const end = vector(spec.end);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 1e-6) return target.identity();

  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.multiplyScalar(1 / length),
  );
  const scale = new THREE.Vector3(spec.radius, length, spec.radius);
  return target.compose(midpoint, rotation, scale);
}
