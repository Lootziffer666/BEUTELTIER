/**
 * Visuelle Abnahme nach dem OfficialWorld-Materialfix:
 * Übersicht mit Außengelände, Halle mit geöffnetem Dach und Staging,
 * Ego mit sichtbaren Generatorobjekten.
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

const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(2500);

// --- 1) Übersicht mit Außengelände ----------------------------------------
await page.screenshot({ path: `${OUT}/accept-1-uebersicht.png` });

// --- 2) Halle fokussieren, Dach offen, Staging sichtbar --------------------
await page.locator('input.search').fill('Halle 10.1');
await page.waitForTimeout(400);
const hallHit = page.locator('.hits li button', { hasText: 'Halle 10.1' }).first();
await hallHit.waitFor({ state: 'visible', timeout: 10000 });
await hallHit.evaluate((element) => element.click());
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/accept-2-halle-staging.png` });

// --- 3) Ego innerhalb der Halle, Staging + Dach als Decke ------------------
const egoButton = page.getByRole('button', { name: 'Begehen' });
await egoButton.waitFor({ state: 'visible', timeout: 10000 });
await egoButton.evaluate((element) => element.click());
await page.waitForTimeout(1500);

const canvas = page.locator('canvas');
const bounds = await canvas.boundingBox();
if (bounds) {
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.waitForTimeout(300);
}

// Halle 10.1 ist 5.7 m lichte Hoehe, Augenhoehe 1.7 m -- No-Clip und ein
// moderater Aufstieg von ~2.5 m bleibt klar unter der Decke und gibt einen
// Ueberblick ueber Staende samt Inszenierung, statt an einer Wand zu kleben.
await page.keyboard.press('n');
await page.waitForTimeout(200);
await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
await page.mouse.move(bounds.x + bounds.width / 2 - 260, bounds.y + bounds.height / 2 + 90, { steps: 12 });
await page.keyboard.down('s');
await page.keyboard.down(' ');
await page.waitForTimeout(1100);
await page.keyboard.up(' ');
await page.waitForTimeout(1400);
await page.keyboard.up('s');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/accept-3-ego-staging.png` });

console.log(`Konsolenfehler: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));

await browser.close();
