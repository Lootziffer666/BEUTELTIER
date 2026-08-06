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
  if (text.includes('[ProceduralStaging]')) consoleLines.push(text);
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

// Spawn (Hallenzentrum) ~73m in -X vom Staging-Cluster entfernt (siehe
// Konsole der vorigen Diagnoseläufe). Bei yaw=0 bewegt 'a' (strafe) in -X.
console.log('Fliege ~73m Richtung Staging-Cluster ...');
await page.keyboard.down('a');
await page.keyboard.down('shift');
await page.waitForTimeout(18000);
await page.keyboard.up('a');
await page.keyboard.up('shift');
await page.waitForTimeout(500);

// Etwas absenken/umsehen, um den Boden-nahen Bereich zu erfassen.
await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
await page.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + bounds.height / 2 + 150, { steps: 10 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/flyto-1-cluster.png` });

// Eine weitere Ansicht: Aufsteigen fuer Ueberblick ueber den Cluster.
await page.keyboard.down(' ');
await page.waitForTimeout(1500);
await page.keyboard.up(' ');
await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 150);
await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 280, { steps: 10 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/flyto-2-cluster-oben.png` });

console.log('\n=== KONSOLE ===');
consoleLines.forEach((line) => console.log(line));

await browser.close();
