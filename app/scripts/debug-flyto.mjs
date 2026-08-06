/**
 * Fliegt im No-Clip gezielt zum Cluster der erzeugten Staging-Objekte
 * (aus den geloggten Positionen berechnet), statt sich auf den zufälligen
 * Hallenzentrum-Spawn zu verlassen. Prüft, ob die pinken Debug-Marker dort
 * tatsächlich sichtbar sind.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BEUTELTIER_URL ?? 'http://localhost:4173/';
const OUT = process.env.BEUTELTIER_SHOTS ?? '.';
const CHROME = process.env.BEUTELTIER_CHROME;

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const consoleLines = [];
page.on('console', (message) => {
  const text = message.text();
  if (text.includes('[ProceduralStaging]') || text.includes('[OfficialWorld]')) consoleLines.push(text);
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(2000);

await page.locator('input.search').fill('Halle 10.1');
await page.waitForTimeout(400);
const hallHit = page.locator('.hits li button', { hasText: 'Halle 10.1' }).first();
await hallHit.waitFor({ state: 'visible', timeout: 10000 });
await hallHit.evaluate((element) => element.click());
await page.waitForTimeout(1500);

const egoButton = page.getByRole('button', { name: 'Begehen' });
await egoButton.waitFor({ state: 'visible', timeout: 10000 });
await egoButton.evaluate((element) => element.click());
await page.waitForTimeout(1200);

const canvas = page.locator('canvas');
const bounds = await canvas.boundingBox();
await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
await page.waitForTimeout(300);
await page.keyboard.press('n'); // No-Clip
await page.waitForTimeout(200);

// ClosureSurface-Blockade ist behoben -- direkter Flug zum Cluster ohne
// vorheriges Aufsteigen ueber die Hallenhoehe.
console.log('Fliege ~73m seitlich Richtung Staging-Cluster ...');
await page.keyboard.down('a');
await page.keyboard.down('Shift');
await page.waitForTimeout(17500);
await page.keyboard.up('a');
await page.keyboard.up('Shift');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/flyto-1-cluster.png` });

// Etwas nach unten blicken, um Bodennaehe (Staging-Objekte) einzufangen.
await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 220, { steps: 12 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/flyto-2-cluster-oben.png` });

console.log('\n=== KONSOLE ===');
consoleLines.forEach((line) => console.log(line));

await browser.close();
