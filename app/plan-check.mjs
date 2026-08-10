/**
 * Senkrechte Draufsicht auf eine Halle -- der Test für die Geometrie.
 *
 * In der Perspektive sieht ein Raster plausibel aus, auch wenn es falsch ist:
 * Fluchtlinien verdecken, ob Reihen parallel laufen, und ob ein Leuchtband
 * wirklich zwischen zwei Stützen liegt oder daneben. Von oben ist beides
 * sofort zu sehen.
 *
 * `?plan` blendet die Decke aus (sonst verdeckt sie alles), `?leer` die
 * Stände, `?setzen` erlaubt das Stellen der Kamera. Die Kamera steht über der
 * Hallenmitte und blickt senkrecht nach unten.
 *
 *   npm run build && npm run preview &
 *   node plan-check.mjs [hallenschluessel] [hoehe]
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { aufnehmen, AUFNAHME_MS } from './screenshot.mjs';

const CHROME = process.env.BEUTELTIER_CHROME
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ABLAGE = process.env.ABLAGE ?? '.';
const HALLE = process.argv[2] ?? '10.2';
const HOEHE = Number(process.argv[3] ?? 70);

const site = JSON.parse(await readFile('public/data/registered-site.json', 'utf8'));
const hall = site.halls.find((h) => h.key === HALLE);
if (!hall) throw new Error(`Halle ${HALLE} nicht im Datensatz`);

const pts = hall.footprint;
const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1480, height: 1200 } });
page.setDefaultTimeout(AUFNAHME_MS);
const fehler = [];
page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));

const ziel = new URL(process.env.BEUTELTIER_URL ?? 'http://localhost:4173/');
ziel.searchParams.set('setzen', '1');
ziel.searchParams.set('leer', '1');
ziel.searchParams.set('plan', '1');
await page.goto(ziel.href, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Begehen' }).click();
await page.waitForTimeout(1500);

// Ohne Kollision, sonst zieht das Wegenetz die Kamera auf Bodenhöhe zurück.
await page.keyboard.press('n');
await page.waitForTimeout(300);

await page.evaluate(({ x, y, z, pitch }) => {
  globalThis.__SETZEN?.(x, y, z, 0, pitch);
}, { x: mx, y: my, z: hall.baseY + HOEHE, pitch: -Math.PI / 2 });
await page.waitForTimeout(1500);

await page.addStyleTag({
  content: '.survey, .layout-editor, .stage__hint, .stage__controls { display: none !important; }',
});
const box = await page.locator('canvas').boundingBox();
await aufnehmen(page, `${ABLAGE}/plan-${HALLE}.png`, {
  einfrieren: false,
  clip: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : undefined,
});
console.log(`plan-${HALLE}: aus ${HOEHE} m ueber Hallenboden`);
console.log('Fehler:', fehler.slice(0, 5));
await browser.close();
