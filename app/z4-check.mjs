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
  return { ux, uy, uMin, uMax, vM: (vMin + vMax) / 2 };
}

const l = lage(hall.footprint);
// Die Hallenmitte, nicht ein Fünftel von vorn: reale Hallenumrisse sind
// selten ein sauberes Rechteck (9.1 hat fünf Ecken, nicht vier), und nahe
// einem Ende kann die Kamera an einem Vorsprung stehen, den die schlichte
// Bounding-Box aus `lage()` nicht kennt -- sichtbar als schräge Kante quer
// durchs Bild, wo eigentlich nur Boden sein sollte. Die Mitte ist von jeder
// Unregelmässigkeit am Rand am weitesten weg.
// Versatz optional: die Stützen stehen alle 10 m, und mittig zwischen zwei
// Reihen zu stehen zeigt mehr Decke als direkt neben einer.
const versatz = Number(process.argv[3] ?? 0);
const station = (l.uMin + l.uMax) / 2 + versatz;
const x = l.ux * station - l.uy * l.vM;
const y = l.uy * station + l.ux * l.vM;
// Blick geradeaus die lange Achse hinunter, kein Versatz. Kamera schaut nach
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
