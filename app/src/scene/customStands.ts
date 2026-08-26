/**
 * Reale Standkörper, geliefert als GLB statt prozedural gebaut.
 *
 * `KleineStaende` und der Sammelkörper in `Stands` zeichnen einen
 * generischen Platzhalter für jeden Stand ohne eigene Fassade. Für einen
 * Stand mit echtem, gelieferten Modell ist das falsch -- er soll neben all
 * den Platzhaltern als das stehen, was er ist. Diese Liste ist die
 * Schnittstelle: Stand-ID -> GLB-Datei unter `app/public/models/`.
 *
 * Das Modell wird beim Laden automatisch auf die Standfläche skaliert
 * (`CustomStandModels` in `SiteScene.tsx`, per `THREE.Box3`) -- die
 * Originalgröße der Lieferdatei ist unbekannt und wird nicht angenommen.
 */
export const CUSTOM_STAND_MODELS: Record<string, { url: string }> = {
  '10.1:B083': { url: 'models/messestand.glb' },
};

export const CUSTOM_MODEL_STAND_IDS = new Set(Object.keys(CUSTOM_STAND_MODELS));
