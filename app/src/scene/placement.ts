export type Point2 = readonly [number, number];

export interface Footprint {
  width: number;
  depth: number;
  margin: number;
}

export interface AcceptedFootprint {
  corners: Point2[];
}

export interface Placement {
  point: [number, number];
  rotationY: number;
  corners: Point2[];
}

const EPSILON = 0.000001;

export function hashString(seed: string): number {
  let value = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }

  return value >>> 0;
}

export function seededUnit(seed: string, index: number): number {
  let value = hashString(`${seed}:${index}`);
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function polygonArea(polygon: readonly Point2[]): number {
  let result = 0;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    result += current[0] * next[1] - next[0] * current[1];
  }

  return Math.abs(result) / 2;
}

function bounds(polygon: readonly Point2[]) {
  return polygon.reduce(
    (result, [x, y]) => ({
      minX: Math.min(result.minX, x),
      maxX: Math.max(result.maxX, x),
      minY: Math.min(result.minY, y),
      maxY: Math.max(result.maxY, y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

export function pointInPolygon(
  point: Point2,
  polygon: readonly Point2[],
): boolean {
  const [x, y] = point;
  let inside = false;

  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1
  ) {
    const [cx, cy] = polygon[current];
    const [px, py] = polygon[previous];

    if (
      cy > y !== py > y &&
      x < ((px - cx) * (y - cy)) / (py - cy) + cx
    ) {
      inside = !inside;
    }
  }

  return inside;
}

function orientation(a: Point2, b: Point2, c: Point2): number {
  return (
    (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0])
  );
}

function onSegment(a: Point2, b: Point2, point: Point2): boolean {
  return (
    point[0] >= Math.min(a[0], b[0]) - EPSILON &&
    point[0] <= Math.max(a[0], b[0]) + EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + EPSILON
  );
}

function intersects(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  if (
    ((abC > EPSILON && abD < -EPSILON) ||
      (abC < -EPSILON && abD > EPSILON)) &&
    ((cdA > EPSILON && cdB < -EPSILON) ||
      (cdA < -EPSILON && cdB > EPSILON))
  ) {
    return true;
  }

  return (
    (Math.abs(abC) <= EPSILON && onSegment(a, b, c)) ||
    (Math.abs(abD) <= EPSILON && onSegment(a, b, d)) ||
    (Math.abs(cdA) <= EPSILON && onSegment(c, d, a)) ||
    (Math.abs(cdB) <= EPSILON && onSegment(c, d, b))
  );
}

function distanceToSegment(point: Point2, a: Point2, b: Point2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const divisor = dx * dx + dy * dy;

  if (divisor < EPSILON) {
    return Math.hypot(point[0] - a[0], point[1] - a[1]);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / divisor,
    ),
  );

  return Math.hypot(
    point[0] - (a[0] + dx * t),
    point[1] - (a[1] + dy * t),
  );
}

function rectangle(
  centre: Point2,
  width: number,
  depth: number,
  rotationY: number,
): Point2[] {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  return [
    [-halfWidth, -halfDepth],
    [halfWidth, -halfDepth],
    [halfWidth, halfDepth],
    [-halfWidth, halfDepth],
  ].map(([x, y]) => [
    centre[0] + x * cos - y * sin,
    centre[1] + x * sin + y * cos,
  ]);
}

function overlaps(a: readonly Point2[], b: readonly Point2[]): boolean {
  for (let index = 0; index < a.length; index += 1) {
    const start = a[index];
    const end = a[(index + 1) % a.length];

    for (let inner = 0; inner < b.length; inner += 1) {
      if (
        intersects(
          start,
          end,
          b[inner],
          b[(inner + 1) % b.length],
        )
      ) {
        return true;
      }
    }
  }

  return pointInPolygon(a[0], b) || pointInPolygon(b[0], a);
}

function fitsPolygon(
  polygon: readonly Point2[],
  corners: readonly Point2[],
  margin: number,
): boolean {
  for (const corner of corners) {
    if (!pointInPolygon(corner, polygon)) return false;

    for (let index = 0; index < polygon.length; index += 1) {
      if (
        distanceToSegment(
          corner,
          polygon[index],
          polygon[(index + 1) % polygon.length],
        ) < margin
      ) {
        return false;
      }
    }
  }

  for (let index = 0; index < corners.length; index += 1) {
    const start = corners[index];
    const end = corners[(index + 1) % corners.length];

    for (let edge = 0; edge < polygon.length; edge += 1) {
      if (
        intersects(
          start,
          end,
          polygon[edge],
          polygon[(edge + 1) % polygon.length],
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

export function findPlacement(
  polygon: readonly Point2[],
  footprint: Footprint,
  accepted: readonly AcceptedFootprint[],
  seed: string,
  attempts = 80,
): Placement | null {
  if (polygon.length < 3 || polygonArea(polygon) <= 0) return null;

  const extent = bounds(polygon);

  for (let index = 0; index < attempts; index += 1) {
    const point: [number, number] = [
      extent.minX +
        seededUnit(seed, index * 3) * (extent.maxX - extent.minX),
      extent.minY +
        seededUnit(seed, index * 3 + 1) * (extent.maxY - extent.minY),
    ];

    const rotationY = seededUnit(seed, index * 3 + 2) * Math.PI * 2;
    const corners = rectangle(
      point,
      footprint.width,
      footprint.depth,
      rotationY,
    );

    if (!fitsPolygon(polygon, corners, footprint.margin)) continue;
    if (accepted.some((entry) => overlaps(corners, entry.corners))) continue;

    return { point, rotationY, corners };
  }

  return null;
}
