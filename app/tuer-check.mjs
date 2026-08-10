/**
 * Zeigt die Stirnwand am Uebergang Nord/Sued von beiden Seiten.
 *
 * Der Gangpruefer (`gang-check.mjs`) faehrt die Stationen ab, an denen der
 * Boulevard **laengs** verschieden aussieht. Die Tuerfront braucht andere
 * Standorte: sie steht quer, und man sieht sie nur, wenn man davor oder
 * dahinter steht und sie ansieht.
 *
 * Die Wand steht auf der Mitte des Suedteils, die Tueren dagegen dort, wo die
 * Treppe ankommt -- auf der Gangachse. Genau das wird hier nachgesehen.
 *
 * Wie der Gangpruefer laeuft er gegen die Vorschau und schaltet das Setzen der
 * Kamera mit `?setzen` frei (siehe `src/scene/fernsteuerung.ts`).
 *
 *   npm run build && npm run preview &
 *   node tuer-check.mjs
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { aufnehmen, AUFNAHME_MS } from './screenshot.mjs';

const CHROME = process.env.BEUTELTIER_CHROME
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ABLAGE = process.env.ABLAGE ?? '.';

const plan = JSON.parse(await readFile('public/data/boulevard.json', 'utf8'));
const { x0, y0, laengs, quer } = plan.achse;
const ort = (s, q) => [
  x0 + laengs[0] * s + quer[0] * q,
  y0 + laengs[1] * s + quer[1] * q,
];
// Vorwaerts ist in der Szene (-sin yaw, -cos yaw) in Gelaendemetern (siehe
// SiteScene). Soll das `laengs * vor` sein, gehoert vor beide Anteile ein
// Minus. Ohne das zweite stand der Blick an der x-Achse gespiegelt -- die
// Aufnahmen zeigten Wand und Decke statt der Front.
const blickrichtung = (vor) => Math.atan2(-laengs[0] * vor, -laengs[1] * vor);

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(AUFNAHME_MS);
const fehler = [];
page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));

const ziel = new URL(process.env.BEUTELTIER_URL ?? 'http://localhost:4173/');
ziel.searchParams.set('setzen', '1');
await page.goto(ziel.href, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Begehen' }).click();
await page.waitForTimeout(1500);

const oben = plan.sued.obenM;
const wand = plan.treppe.bisM;
for (const [name, station, q, vor, hoehe] of [
  // Von der Treppe aus auf die Front zu -- so kommt der Besucher an.
  ['t1-treppe-auf-die-front', wand - 9, 0, 1, 6.2],
  ['t2-dicht-vor-der-tuer', wand - 3, 0, 1, oben],
  // Und von innen zurueck: dieselbe Front, andere Seite.
  ['t3-von-innen-zurueck', wand + 8, 0, -1, oben],
  // Seitlich versetzt: hier muss Glas stehen und keine Tuer.
  ['t4-front-seitlich', wand + 12, -14, -1, oben],
]) {
  const [x, y] = ort(station, q);
  const yaw = blickrichtung(vor);
  await page.evaluate(({ x, y, yaw, hoehe }) => {
    globalThis.__SETZEN?.(x, y, hoehe, yaw);
  }, { x, y, yaw, hoehe });
  await page.waitForTimeout(1200);
  await aufnehmen(page, `${ABLAGE}/${name}.png`, { einfrieren: false });
  console.log(`${name}: Station ${station} m, q ${q} m`);
}
console.log('Fehler:', fehler.slice(0, 5));
await browser.close();
