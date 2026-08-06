import { describe, expect, it } from 'vitest';

import { FlatSurfaceProvider, PrioritySurfaceProvider, TriangleSurfaceProvider } from './surfaces';

const square = (id: string, z: number, blocked = false) => ({
  id,
  z,
  blocked,
  polygon: [[0, 0], [10, 0], [10, 10], [0, 10]] as const,
});

describe('TriangleSurfaceProvider', () => {
  it('interpoliert die Hoehe einer Rampe baryzentrisch', () => {
    const provider = new TriangleSurfaceProvider([{
      id: 'ramp-a', blocked: false,
      triangle: [[0, 0, 0], [10, 0, 10], [0, 10, 0]],
    }]);
    expect(provider.footingAt(5, 2, 0)).toEqual({ z: 5, blocked: false, surfaceId: 'ramp-a' });
  });

  it('waehlt bei Bruecke und Boden die naechste Hoehe', () => {
    const provider = new TriangleSurfaceProvider([
      { id: 'ground', blocked: false, triangle: [[0, 0, 0], [10, 0, 0], [0, 10, 0]] },
      { id: 'bridge', blocked: false, triangle: [[0, 0, 8], [10, 0, 8], [0, 10, 8]] },
    ]);
    expect(provider.footingAt(2, 2, 7).surfaceId).toBe('bridge');
    expect(provider.footingAt(2, 2, 1).surfaceId).toBe('ground');
  });
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
