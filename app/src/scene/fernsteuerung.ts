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
