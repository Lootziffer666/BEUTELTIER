/**
 * Wer darf die Kamera von aussen setzen?
 *
 * Die Bildpruefer (`gang-check.mjs`, `tuer-check.mjs`) stellen die Kamera an
 * eine gemessene Stelle, statt dorthin zu laufen: unter dem Software-Renderer
 * dieses Containers kostet jeder Meter Sekunden. Dafuer haengt die App eine
 * Funktion `__SETZEN` ans globale Objekt.
 *
 * Frueher entschied darueber `import.meta.env.DEV`. Das band die Aufnahme an
 * den Entwicklungsstand -- und der faehrt unminifiziertes Three.js, unter
 * SwiftShader ein Vielfaches der Vorschau. Vier Stationen mal ein nachweislich
 * fertiges Bild sprengten damit jedes Zeitlimit.
 *
 * Der Haken haengt deshalb nicht mehr am Bauzustand, sondern an einem Merkmal,
 * das nur der Pruefer setzt: `?setzen`. Die Aufnahme laeuft wieder gegen die
 * Vorschau, und der ausgelieferte Stand hat die Fernsteuerung nur, wenn jemand
 * sie ausdruecklich anfordert.
 */
export const SETZEN_PARAMETER = 'setzen';

/** Erlaubt die Adresse das Setzen der Kamera von aussen? */
export function fernsteuerungErlaubt(search: string): boolean {
  return new URLSearchParams(search).has(SETZEN_PARAMETER);
}

/**
 * Soll die Halle leer bleiben -- ohne Stände, ohne Standbau?
 *
 * Das Referenzbild Z4 (`docs/bildziele.md`) zeigt eine leere Halle: nur
 * Boden, Decke, Stützen, Wände. Der Vergleich Bild-gegen-Bild braucht genau
 * das, und keine hunderte Stände dazwischen. Wie `?setzen` ein Merkmal, das
 * nur der Bildprüfer setzt -- kein Schalter für Besucher.
 */
export const LEER_PARAMETER = 'leer';

/** Erlaubt die Adresse eine Halle ohne Stände? */
export function leerErlaubt(search: string): boolean {
  return new URLSearchParams(search).has(LEER_PARAMETER);
}

/**
 * Soll die Decke wegbleiben?
 *
 * Für die senkrechte Draufsicht: von oben verdeckt die Deckenebene alles,
 * was darunter steht. Ohne sie sieht man Boden, Stützen und Leuchtbänder im
 * Grundriss -- die einzige Ansicht, in der sich prüfen lässt, ob die
 * Stützenreihen parallel laufen und die Bänder wirklich zwischen ihnen
 * liegen. In der Perspektive sieht beides plausibel aus, auch wenn es
 * falsch ist. Wie `?setzen` ein Merkmal nur für den Bildprüfer.
 */
export const PLAN_PARAMETER = 'plan';

/** Erlaubt die Adresse den Blick von oben ohne Decke? */
export function planErlaubt(search: string): boolean {
  return new URLSearchParams(search).has(PLAN_PARAMETER);
}
