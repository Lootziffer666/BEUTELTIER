/**
 * Bilder aus der laufenden App holen.
 *
 * Warum es dafür ein eigenes Stück Werkzeug gibt: `page.screenshot()` wartet
 * darauf, dass der Browser ein fertiges Bild liefert. Bei einer Szene, die
 * unter dem Software-Renderer dieses Containers 0,7 Sekunden je Bild braucht,
 * reicht das voreingestellte Zeitlimit von 30 s nicht -- die Aufnahme schlug
 * fehl, obwohl weder WebGL noch die Szene ein Problem hatten. Gemessen:
 *
 *   Übersicht        17 ms/Bild    Aufnahme  8,2 s
 *   Ego, Halle 9    706 ms/Bild    Aufnahme  9,7 s
 *
 * Kein Kontextverlust, kein Shaderfehler, kein Tainting. Deshalb steht hier
 * kein Umbau am Renderer, sondern das, was tatsächlich fehlte: Ruhe im Bild,
 * ein nachweislich fertiger Frame und genug Zeit.
 */

/** Zeitlimit für eine Aufnahme. Grosszügig -- ein Bild kann Sekunden dauern. */
export const AUFNAHME_MS = 180_000;

/**
 * Wartet auf `anzahl` vollständige Bilder und erzwingt deren Fertigstellung.
 *
 * `requestAnimationFrame` sagt nur, dass der Browser zeichnen *will*.
 * `gl.finish()` kehrt erst zurück, wenn alles durchgelaufen ist -- erst danach
 * steht im Puffer, was man aufnehmen will.
 */
export async function warteAufFrames(page, anzahl = 3) {
  return page.evaluate(async (n) => {
    const bild = () => new Promise((fertig) => requestAnimationFrame(() => fertig()));
    for (let i = 0; i < n; i += 1) await bild();
    const leinwand = document.querySelector('canvas');
    const gl = leinwand?.getContext('webgl2') ?? leinwand?.getContext('webgl');
    if (gl && !gl.isContextLost()) gl.finish();
    return {
      verloren: gl ? gl.isContextLost() : null,
      breite: leinwand?.width ?? 0,
      hoehe: leinwand?.height ?? 0,
    };
  }, anzahl);
}

/**
 * Hält die Szene an, wartet einen fertigen Frame ab und nimmt auf.
 *
 * Angehalten wird mit der Taste, die die App dafür ohnehin hat (`F`,
 * „einfrieren"): keine zusätzliche Schnittstelle nur für den Test. Ohne sie
 * bewegt sich das Bild zwischen dem Warten und der Aufnahme weiter.
 */
export async function aufnehmen(page, pfad, { einfrieren = true, clip, frames = 3 } = {}) {
  const angehalten = einfrieren && (await page.locator('.stage__hint').count()) > 0;
  if (angehalten) {
    await page.keyboard.press('f');
    await page.waitForTimeout(400);
  }

  const zustand = await warteAufFrames(page, frames);
  const start = Date.now();
  await page.screenshot({ path: pfad, clip, timeout: AUFNAHME_MS });
  const dauer = Date.now() - start;

  if (angehalten) {
    await page.keyboard.press('f');
    await page.waitForTimeout(200);
  }
  return { dauer, ...zustand };
}
