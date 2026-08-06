/** Explizite Bodenquellen außerhalb der bestehenden Hallen-WalkGrids. */
export interface SurfaceFooting {
  z: number;
  blocked: boolean;
  surfaceId: string | null;
}

export interface SurfaceProvider {
  footingAt(x: number, y: number, preferZ: number): SurfaceFooting;
}

export const BLOCKED_FOOTING: SurfaceFooting = {
  z: 0,
  blocked: true,
  surfaceId: null,
};

export class PrioritySurfaceProvider implements SurfaceProvider {
  private readonly providers: readonly SurfaceProvider[];

  constructor(providers: readonly SurfaceProvider[]) {
    this.providers = providers;
  }

  footingAt(x: number, y: number, preferZ: number): SurfaceFooting {
    for (const provider of this.providers) {
      const footing = provider.footingAt(x, y, preferZ);
      if (footing.surfaceId !== null) return footing;
    }
    return BLOCKED_FOOTING;
  }
}

export interface FlatSurface {
  id: string;
  polygon: readonly (readonly [number, number])[];
  z: number;
  blocked: boolean;
  priority?: number;
}

function inside(polygon: FlatSurface['polygon'], x: number, y: number): boolean {
  let hit = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const [ax, ay] = polygon[index];
    const [bx, by] = polygon[(index + polygon.length - 1) % polygon.length];
    if ((ay > y) !== (by > y) && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) {
      hit = !hit;
    }
  }
  return hit;
}

/** Provider für freigegebene, geglättete Außen- und Übergangsflächen. */
export class FlatSurfaceProvider implements SurfaceProvider {
  private readonly surfaces: readonly FlatSurface[];

  constructor(surfaces: readonly FlatSurface[]) {
    this.surfaces = [...surfaces].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  footingAt(x: number, y: number, preferZ: number): SurfaceFooting {
    const candidates = this.surfaces.filter((surface) => inside(surface.polygon, x, y));
    if (!candidates.length) return BLOCKED_FOOTING;
    const surface = candidates.reduce((best, candidate) =>
      Math.abs(candidate.z - preferZ) < Math.abs(best.z - preferZ) ? candidate : best,
    );
    return { z: surface.z, blocked: surface.blocked, surfaceId: surface.id };
  }
}
