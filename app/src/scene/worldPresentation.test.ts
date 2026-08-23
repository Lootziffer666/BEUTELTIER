import { describe, expect, it } from 'vitest';

import { worldPresentation } from './worldPresentation';

describe('worldPresentation', () => {
  it.each(['uebersicht', 'halle', 'laufmodus', 'ego'] as const)(
    'zeigt registrierte Weltpakete in %s massiv und ohne Legacy-Bloecke',
    (preset) => {
      expect(worldPresentation(preset, true)).toEqual({
        deckkraft: { kern: 1, umgebung: 1 },
        showHallOverlay: false,
      });
    },
  );

  it('bewahrt die Deckkraft der nicht registrierten Arbeitskarte', () => {
    expect(worldPresentation('uebersicht', false)).toEqual({
      deckkraft: { kern: 0.18, umgebung: 0.35 },
      showHallOverlay: true,
    });
    expect(worldPresentation('halle', false).deckkraft).toEqual({ kern: 0.35, umgebung: 0.25 });
    expect(worldPresentation('laufmodus', false).deckkraft).toEqual({ kern: 0.18, umgebung: 0.3 });
  });

  it('blendet Legacy-Hallenkoerper im Ego-Preset aus', () => {
    expect(worldPresentation('ego', false).showHallOverlay).toBe(false);
  });
});
