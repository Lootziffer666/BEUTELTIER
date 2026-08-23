import { describe, expect, it } from 'vitest';

import { worldPresentation } from './worldPresentation';

describe('worldPresentation', () => {
  it('zeigt im registrierten Demokorridor die echten Weltpakete massiv', () => {
    expect(worldPresentation('uebersicht', true, true)).toEqual({
      deckkraft: { kern: 1, umgebung: 1 },
      showHallOverlay: false,
    });
  });

  it('bewahrt ausserhalb der Demo die bestehende Kartenansicht', () => {
    expect(worldPresentation('uebersicht', true, false)).toEqual({
      deckkraft: { kern: 0.18, umgebung: 0.35 },
      showHallOverlay: true,
    });
  });

  it('blendet Legacy-Hallenkörper nur bei registrierter massiver Welt aus', () => {
    expect(worldPresentation('uebersicht', false, true).showHallOverlay).toBe(true);
    expect(worldPresentation('ego', true, false).showHallOverlay).toBe(false);
  });
});
