export type WorldPreset = 'uebersicht' | 'halle' | 'laufmodus' | 'ego';

/** Wie deckend die amtlichen Weltpakete in der Arbeitskarte stehen. */
const MAP_OPACITY: Record<WorldPreset, { kern: number; umgebung: number }> = {
  uebersicht: { kern: 0.18, umgebung: 0.35 },
  halle: { kern: 0.35, umgebung: 0.25 },
  laufmodus: { kern: 0.18, umgebung: 0.3 },
  ego: { kern: 1, umgebung: 0.15 },
};

/**
 * Trennt die durchsichtige Arbeitskarte von der massiven Demonstration.
 * Im Demokorridor sind die vorhandenen amtlichen GLBs die sichtbare Welt;
 * transparente Legacy-Hallenkörper dürfen sie dort nicht wieder überlagern.
 */
export function worldPresentation(
  preset: WorldPreset,
  registered: boolean,
  solidWorld: boolean,
) {
  return {
    deckkraft: solidWorld ? { kern: 1, umgebung: 1 } : MAP_OPACITY[preset],
    showHallOverlay: preset !== 'ego' && !(registered && solidWorld),
  };
}
