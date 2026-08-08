/**
 * Stellt die Kamera in den Nordboulevard und schaut sich um.
 *
 * Der Gang steht auf gemessener Geometrie (`boulevard.json`); geprueft wird
 * deshalb am Bild, ob dort tatsaechlich ein Gang steht -- und zwar an
 * mehreren Stationen, weil sich die Wandabschnitte laengs unterscheiden.
 *
 * Braucht den Entwicklungsserver, nicht den gebauten Stand: das Setzen der
 * Kamera von aussen gibt es nur dort (siehe SiteScene, `import.meta.env.DEV`).
 *
 *   npm run dev &
 *   node gang-check.mjs
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { aufnehmen, AUFNAHME_MS } from './screenshot.mjs';

const CHROME = process.env.BEUTELTIER_CHROME
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ABLAGE = process.env.ABLAGE ?? '.';

const plan = JSON.parse(await readFile('public/data/boulevard.json', 'utf8'));
const site = JSON.parse(await readFile('public/data/registered-site.json', 'utf8'));
const punkte = site.halls.flatMap((h) => h.footprint);
const centre = [
  (Math.min(...punkte.map((p) => p[0])) + Math.max(...punkte.map((p) => p[0]))) / 2,
  (Math.min(...punkte.map((p) => p[1])) + Math.max(...punkte.map((p) => p[1]))) / 2,
];
const { x0, y0, laengs } = plan.achse;
const ort = (s) => [x0 + laengs[0] * s, y0 + laengs[1] * s];
const blickrichtung = (vor) => Math.atan2(-laengs[0] * vor, laengs[1] * vor);

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(AUFNAHME_MS);
const fehler = [];
page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));

await page.goto(process.env.BEUTELTIER_URL ?? 'http://localhost:5173/',
  { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Begehen' }).click();
await page.waitForTimeout(1500);

// Die Kamera direkt setzen: gehen dauert unter dem Software-Renderer Minuten.
for (const [name, station, vor] of [
  ['n1-nordende', 10, 1],
  ['n2-vor-halle9', 190, 1],
  ['n3-suedende', 265, -1],
  ['n4-mitte-zurueck', 120, -1],
]) {
  const [x, y] = ort(station);
  const yaw = blickrichtung(vor);
  await page.evaluate(({ x, y, yaw }) => {
    globalThis.__SETZEN?.(x, y, 0.02, yaw);
  }, { x, y, yaw });
  await page.waitForTimeout(1200);
  await aufnehmen(page, `${ABLAGE}/${name}.png`, { einfrieren: false });
  console.log(`${name}: Station ${station} m`);
}
console.log('Fehler:', fehler.slice(0, 5));
await browser.close();
