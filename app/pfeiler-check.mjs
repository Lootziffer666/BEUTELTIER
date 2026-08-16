/**
 * Nahaufnahme eines einzelnen Pfeilers.
 *
 * Der Gangblick (`z4-check.mjs`) zeigt, ob das Raster stimmt. Er zeigt nicht,
 * ob der einzelne Pfeiler als Bauteil taugt: Sockel oben und unten, eine
 * beleuchtete und eine abgewandte Seite, schmales Profil. Dafür braucht es
 * einen Standpunkt dicht davor.
 *
 *   npm run build && npm run preview &
 *   node pfeiler-check.mjs [hallenschluessel] [abstand]
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { aufnehmen, AUFNAHME_MS } from './screenshot.mjs';

const CHROME = process.env.BEUTELTIER_CHROME
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ABLAGE = process.env.ABLAGE ?? '.';
const HALLE = process.argv[2] ?? '10.2';
const ABSTAND = Number(process.argv[3] ?? 4);

const RASTER_M = 12;
const PFEILERREIHEN_QUER = 5;

const site = JSON.parse(await readFile('public/data/registered-site.json', 'utf8'));
const hall = site.halls.find((h) => h.key === HALLE);
if (!hall) throw new Error(`Halle ${HALLE} nicht im Datensatz`);

// Dieselbe Rechnung wie `hallenlage()`: Laengsachse in Gelaendemetern.
const fp = hall.footprint;
let laengste = 0;
let richtung = 0;
for (let i = 0; i < fp.length; i += 1) {
  const a = fp[i];
  const b = fp[(i + 1) % fp.length];
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d > laengste) { laengste = d; richtung = Math.atan2(b[1] - a[1], b[0] - a[0]); }
}
const tx = Math.cos(richtung), ty = Math.sin(richtung);
const px = -ty, py = tx;
let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
for (const [x, y] of fp) {
  const u = x * tx + y * ty, v = x * px + y * py;
  uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
  vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
}
const uM = (uMin + uMax) / 2, vM = (vMin + vMax) / 2;
const mx = uM * tx + vM * px, my = uM * ty + vM * py;
const breite = vMax - vMin;
const laenge = uMax - uMin;

// Ein Pfeiler der mittleren Reihe, nahe der Hallenmitte.
const reiheQuer = (3 / (PFEILERREIHEN_QUER + 1) - 0.5) * breite;
const felder = Math.max(1, Math.floor(laenge / RASTER_M));
const pfeilerLaengs = (Math.round(felder / 2)) * RASTER_M - (felder * RASTER_M) / 2;
const pfx = mx + tx * pfeilerLaengs + px * reiheQuer;
const pfy = my + ty * pfeilerLaengs + py * reiheQuer;

// Davor stehen, laengs versetzt, und den Pfeiler ansehen.
const kx = pfx - tx * ABSTAND - px * (ABSTAND * 0.55);
const ky = pfy - ty * ABSTAND - py * (ABSTAND * 0.55);
const yaw = Math.atan2(-(pfx - kx), -(pfy - ky));

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });
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
}, { x: kx, y: ky, z: hall.baseY, yaw });
await page.waitForTimeout(1200);

await page.addStyleTag({
  content: '.survey, .layout-editor, .stage__hint, .stage__controls { display: none !important; }',
});
const box = await page.locator('canvas').boundingBox();
await aufnehmen(page, `${ABLAGE}/pfeiler-${HALLE}.png`, {
  einfrieren: false,
  clip: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : undefined,
});
console.log(`pfeiler-${HALLE}: aus ${ABSTAND} m`);
console.log('Fehler:', fehler.slice(0, 5));
await browser.close();
