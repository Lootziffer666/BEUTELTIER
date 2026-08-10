/**
 * Eine einzige Aufnahme: mittig in einer leeren Halle, geradeaus den Gang
 * hinunter. Die Perspektive des Referenzbilds Z4 (`docs/bildziele.md`) --
 * kein Versatz zur Seite, keine Stände dazwischen.
 *
 * Anders als `halle-check.mjs`, das mehrere Hallen aus zwei Richtungen zeigt:
 * dieser Pruefer nimmt genau einen Blick auf, damit der Vergleich Bild gegen
 * Bild nicht in vier Ständen zugleich stattfindet. Element für Element --
 * erst die Decke, dann der Boden, dann die Wände.
 *
 *   npm run build && npm run preview &
 *   node z4-check.mjs [hallenschluessel]
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { aufnehmen, AUFNAHME_MS } from './screenshot.mjs';

const CHROME = process.env.BEUTELTIER_CHROME
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ABLAGE = process.env.ABLAGE ?? '.';
const HALLE = process.argv[2] ?? '9.1';

const site = JSON.parse(await readFile('public/data/registered-site.json', 'utf8'));
const hall = site.halls.find((h) => h.key === HALLE);
if (!hall) throw new Error(`Halle ${HALLE} nicht im Datensatz`);

/** Dieselbe Rechnung wie `hallenlage()` in interior.tsx. */
function lage(footprint) {
  let laengste = 0;
  let winkel = 0;
  for (let i = 0; i < footprint.length; i += 1) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > laengste) {
      laengste = d;
      winkel = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  const ux = Math.cos(winkel);
  const uy = Math.sin(winkel);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, y] of footprint) {
    const u = x * ux + y * uy;
    const v = -x * uy + y * ux;
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  return { ux, uy, uMin, uMax, vM: (vMin + vMax) / 2, breite: vMax - vMin };
}

/**
 * Der Standpunkt der Referenzaufnahme: im Gang zwischen zwei Stützenreihen,
 * mit je vier Pfeilern in die Tiefe.
 *
 * Zwei Dinge machen genau diese Perspektive aus, und beide werden hier
 * gerechnet statt geraten:
 *
 * 1. **Quer mittig im Feld.** Die Stützenachsen liegen im 12-m-Raster
 *    symmetrisch um die Hallenmitte -- bei gerader Feldzahl steht die Mitte
 *    also *auf* einer Achse, und die Kamera stünde in einer Stütze. Ein
 *    halbes Feld Versatz stellt sie in den Gang, und dann flankieren zwei
 *    Reihen den Blick.
 * 2. **Längs so weit vom Hallenende, dass vier Achsen davor liegen.** Steht
 *    man mittig in einer 175 m langen Halle, laufen fünfzehn Reihen bis zum
 *    Fluchtpunkt und das Bild wird ein Wald. Vier Felder Abstand zur
 *    Stirnwand zeigt vier Pfeiler je Reihe, wie auf dem Referenzbild.
 */
const RASTER_M = 12;
const PFEILER_IN_DIE_TIEFE = 4;

const l = lage(hall.footprint);
// Wie das Raster in `interior.tsx`: floor(breite / 12) Felder, mittig
// eingepasst. Der halbe Feldversatz stellt die Kamera in den Gang.
const felderQuer = Math.max(1, Math.floor(l.breite / RASTER_M));
const gangVersatz = felderQuer % 2 === 0 ? RASTER_M / 2 : 0;
// Auch laengs mittig im Feld stehen, nicht auf einer Achse: sonst steht die
// flankierende Stuetze auf gleicher Hoehe wie die Kamera, also einen halben
// Feldabstand seitlich -- und fuellt das halbe Bild, statt die Flucht zu
// zeigen. Von hier aus liegen vier Achsen voraus.
const felderLaengs = Math.max(1, Math.floor((l.uMax - l.uMin) / RASTER_M));
const ersteAchse = (l.uMin + l.uMax) / 2 - (felderLaengs * RASTER_M) / 2;
// Optionaler Feinversatz laengs, in Metern.
const versatz = Number(process.argv[3] ?? 0);
const station =
  ersteAchse
  + Math.max(0, felderLaengs - PFEILER_IN_DIE_TIEFE) * RASTER_M
  + RASTER_M / 2
  + versatz;
const quer = l.vM + gangVersatz;
const x = l.ux * station - l.uy * quer;
const y = l.uy * station + l.ux * quer;
// Blick die lange Achse hinunter, auf die Stirnwand zu. Kamera schaut nach
// -Z, Szenen-Z nach Sueden -- vor beiden Anteilen ein Minus (siehe SiteScene).
const yaw = Math.atan2(-l.ux, -l.uy);

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
// Breit genug, dass nach Abzug der Seitenleiste noch ein hochformatiges
// Bild uebrig bleibt, aehnlich dem Referenzfoto.
const page = await browser.newPage({ viewport: { width: 1480, height: 1400 } });
page.setDefaultTimeout(AUFNAHME_MS);
const fehler = [];
page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));

const ziel = new URL(process.env.BEUTELTIER_URL ?? 'http://localhost:4173/');
ziel.searchParams.set('setzen', '1');
ziel.searchParams.set('leer', '1');
await page.goto(ziel.href, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Begehen' }).click();
await page.waitForTimeout(1500);

await page.evaluate(({ x, y, z, yaw }) => {
  globalThis.__SETZEN?.(x, y, z, yaw);
}, { x, y, z: hall.baseY, yaw });
await page.waitForTimeout(1200);

// Werkzeugleisten und Hinweise liegen als DOM ueber der Leinwand -- fuer den
// Bildvergleich sollen nur Decke, Boden und Waende zu sehen sein.
await page.addStyleTag({
  content: '.survey, .layout-editor, .stage__hint, .stage__controls { display: none !important; }',
});

// Nur die Leinwand, ohne die Seitenleiste -- die Breite der Leiste haengt
// vom Viewport ab (`minmax(340px, 30vw)` in index.css) und wird deshalb
// gemessen statt geraten.
const box = await page.locator('canvas').boundingBox();
const clip = box
  ? { x: box.x, y: box.y, width: box.width, height: box.height }
  : undefined;
await aufnehmen(page, `${ABLAGE}/z4-${HALLE}.png`, { einfrieren: false, clip });
console.log(`z4-${HALLE}: Station ${station.toFixed(0)} m, Halle ${(l.uMax - l.uMin).toFixed(0)} m lang`);
console.log('Fehler:', fehler.slice(0, 5));
await browser.close();
