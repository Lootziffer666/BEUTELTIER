import { describe, expect, it } from 'vitest';

import { FlatSurfaceProvider, PrioritySurfaceProvider } from './surfaces';

const square = (id: string, z: number, blocked = false) => ({
  id,
  z,
  blocked,
  polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] as const,
});

describe('SurfaceProvider', () => {
  it('sperrt unbekannte Flächen statt z=0 automatisch zu öffnen', () => {
    const footing = new PrioritySurfaceProvider([]).footingAt(50, 50, 0);
    expect(footing).toEqual({ z: 0, blocked: true, surfaceId: null });
  });

  it('liefert nur explizit freigegebene Außenflächen', () => {
    const provider = new FlatSurfaceProvider([square('boulevard', 1.4)]);
    expect(provider.footingAt(5, 5, 0)).toEqual({
      z: 1.4, blocked: false, surfaceId: 'boulevard',
    });
    expect(provider.footingAt(15, 5, 0).blocked).toBe(true);
  });

  it('wählt bei gestapelten Flächen die bevorzugte Höhe', () => {
    const provider = new FlatSurfaceProvider([
      square('unten', 0), square('bruecke', 8),
    ]);
    expect(provider.footingAt(5, 5, 7).surfaceId).toBe('bruecke');
    expect(provider.footingAt(5, 5, 1).surfaceId).toBe('unten');
  });

  it('beachtet die Provider-Priorität Übergang vor Außengelände', () => {
    const transition = new FlatSurfaceProvider([square('rampe', 2)]);
    const outside = new FlatSurfaceProvider([square('platz', 0)]);
    const provider = new PrioritySurfaceProvider([transition, outside]);
    expect(provider.footingAt(5, 5, 0).surfaceId).toBe('rampe');
  });
});
