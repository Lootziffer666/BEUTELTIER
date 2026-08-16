/**
 * Bilder von den Rolltreppen -- an einer festen Stelle, nicht erlaufen.
 *
 * Der Grund, warum es das braucht: die Ego-Kamera startet dort, wo der
 * Besucher startet, und das ist im Zweifel mitten in einem Standkörper.
 * Vorwärtslaufen und hoffen hat dreimal Bilder ergeben, auf denen das
 * gesuchte Bauteil nicht vorkam -- und ohne Bild kein Vergleich und keine
 * Verbesserung.
 *
 * `__SETZEN` gibt es in der App schon; es hängt an `import.meta.env.DEV` und
 * fehlt deshalb im gebauten Stand. Deswegen läuft dieses Werkzeug gegen den
 * **Dev-Server**, nicht gegen die Vorschau.
 *
 * Aufruf: `node rolltreppe-check.mjs [zielordner]`
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

import { AUFNAHME_MS, warteAufFrames } from './screenshot.mjs';

const ZIEL = process.argv[2] ?? 'rolltreppe-vorschau';
const URL = process.env.BEUTELTIER_URL ?? 'http://localhost:5173/';
const CHROME = process.env.BEUTELTIER_CHROME
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const graph = JSON.parse(readFileSync('public/data/registered-graph.json', 'utf8'));
const site = JSON.parse(readFileSync('public/data/registered-site.json', 'utf8'));
const mitte = (() => {
  const punkte = site.halls.flatMap((h) => h.footprint);
  const xs = punkte.map((p) => p[0]);
  const ys = punkte.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
})();

/**
 * Die Kamera steht **neben** der Anlage und blickt darauf, nicht darauf drauf.
 * Zwölf Meter Abstand: nah genug, dass Stufen und Handlauf zu sehen sind,
 * weit genug, dass die ganze Neigung ins Bild passt.
 */
const ABSTAND_M = 12;

const anlagen = graph.connectors
  .filter((c) => c.kind === 'vertical' && /escalator|stairs/.test(c.id))
  .slice(0, 4);

mkdirSync(ZIEL, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(AUFNAHME_MS);
const fehler = [];
page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
page.on('pageerror', (e) => fehler.push(String(e)));

await page.goto(URL, { waitUntil: 'domcontentloaded' });

// Auf den ersten fertigen Frame warten und nicht auf eine Uhr. Der Dev-Server
// uebersetzt die Szene beim ersten Aufruf, und das dauert unter dem
// Software-Renderer laenger als jede geratene Wartezeit -- der Grund, warum
// der erste Versuch nach zwei Minuten ohne ein einziges Bild abbrach.
// `networkidle` hilft nicht: Vite haelt eine offene HMR-Verbindung.
await page.waitForSelector('canvas', { timeout: AUFNAHME_MS });
await page.waitForFunction(() => {
  const leinwand = document.querySelector('canvas');
  return !!leinwand && leinwand.width > 0;
}, null, { timeout: AUFNAHME_MS });
await warteAufFrames(page, 6);

await page.getByRole('button', { name: 'Begehen' }).click();
await page.waitForTimeout(1800);

// Ohne Kollision: die Kamera soll an ihre Stelle, nicht an einer Standwand
// hängenbleiben.
await page.locator('canvas').click();
await page.keyboard.press('n');
await page.waitForTimeout(300);

const gesetzt = await page.evaluate(() => typeof globalThis.__SETZEN === 'function');
if (!gesetzt) {
  console.error('__SETZEN fehlt -- laeuft der Dev-Server? (npm run dev, Port 5173)');
  await browser.close();
  process.exit(1);
}

for (const anlage of anlagen) {
  const name = anlage.id.replace(/[^a-z0-9]+/gi, '-');
  // Von Sueden auf die Anlage blicken; y waechst nach Sueden, also steht die
  // Kamera bei y + Abstand und schaut nach Norden.
  await page.evaluate(([x, y, z, abstand]) => {
    globalThis.__SETZEN(x, y + abstand, z, Math.PI);
  }, [anlage.x + mitte[0], anlage.y + mitte[1], anlage.z, ABSTAND_M]);
  await page.waitForTimeout(600);
  await warteAufFrames(page, 4);
  await page.screenshot({
    path: join(ZIEL, `${name}.png`),
    clip: { x: 0, y: 0, width: 890, height: 640 },
    timeout: AUFNAHME_MS,
  });
  console.log(`  ${name}.png  (${anlage.label ?? anlage.id})`);
}

console.log(fehler.length ? `\nFehler:\n${fehler.slice(0, 6).join('\n')}` : '\nKeine Fehler.');
await browser.close();
