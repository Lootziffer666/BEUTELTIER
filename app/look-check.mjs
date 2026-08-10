/**
 * Bilder aus der Ego-Perspektive, zum Hinsehen.
 *
 * Der Loop, in dem der Look entsteht, braucht drei Dinge: bauen, testen,
 * vergleichen. Die Texturvorschau deckt das Material ab, dieses Werkzeug die
 * fertige Szene -- denn wie eine Fläche wirkt, entscheidet sich erst mit
 * Beleuchtung, Kontur und Perspektive daneben.
 *
 * Aufruf: `node look-check.mjs [zielordner]`
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

import { AUFNAHME_MS, warteAufFrames } from './screenshot.mjs';

const ZIEL = process.argv[2] ?? 'look-vorschau';
const CHROME = process.env.BEUTELTIER_CHROME
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

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

await page.goto(process.env.BEUTELTIER_URL ?? 'http://localhost:4173/',
                { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

/** Nicht `locator.screenshot()`: eine Szene mit Renderschleife wird nie "stabil". */
async function bild(name, clip = { x: 0, y: 0, width: 890, height: 800 }) {
  await warteAufFrames(page, 4);
  await page.screenshot({ path: join(ZIEL, `${name}.png`), clip, timeout: AUFNAHME_MS });
  console.log(`  ${name}.png`);
}

await bild('01-uebersicht');

await page.getByRole('button', { name: 'Begehen' }).click();
await page.waitForTimeout(2000);
await bild('02-ego-start');

const canvas = page.locator('canvas');
await canvas.click();

// Ein Stück nach vorn -- der Blick aus der Halle heraus ist der Fall, an dem
// sich Boden, Wand und Kontur zugleich beurteilen lassen.
for (const [taste, dauer, name] of [
  ['w', 2200, '03-vorwaerts'],
  ['a', 1200, '04-links'],
  ['w', 2200, '05-weiter'],
]) {
  await page.keyboard.down(taste);
  await page.waitForTimeout(dauer);
  await page.keyboard.up(taste);
  await page.waitForTimeout(500);
  await bild(name);
}

console.log(fehler.length ? `\nFehler in der Konsole:\n${fehler.slice(0, 8).join('\n')}`
                          : '\nKeine Konsolenfehler.');
await browser.close();
