export type WorldPreset = 'uebersicht' | 'halle' | 'laufmodus' | 'ego';

/** Wie deckend die alte, nicht registrierte Arbeitskarte steht. */
const MAP_OPACITY: Record<WorldPreset, { kern: number; umgebung: number }> = {
  uebersicht: { kern: 0.18, umgebung: 0.35 },
  halle: { kern: 0.35, umgebung: 0.25 },
  laufmodus: { kern: 0.18, umgebung: 0.3 },
  ego: { kern: 1, umgebung: 0.15 },
};

/**
 * Registrierte amtliche Weltpakete sind die sichtbare Welt und deshalb immer
 * massiv. Die transparenten Hallenkoerper bleiben ausschliesslich eine Hilfe
 * fuer den alten Planraum; sie duerfen nie wieder die registrierte Geometrie
 * ueberlagern.
 */
export function worldPresentation(
  preset: WorldPreset,
  registered: boolean,
) {
  if (registered) {
    return {
      deckkraft: { kern: 1, umgebung: 1 },
      showHallOverlay: false,
    };
  }
  return {
    deckkraft: MAP_OPACITY[preset],
    showHallOverlay: preset !== 'ego',
  };
}
