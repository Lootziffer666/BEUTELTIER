import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BEUTELTIER_URL ?? 'http://localhost:4174/';
const OUT = process.env.BEUTELTIER_SHOTS ?? '.';
const CHROME = process.env.BEUTELTIER_CHROME;

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  const t = message.type();
  if (t === 'error') errors.push(`console.error: ${message.text()}`);
});

// Start: lichtmodus "halle" sollte Cel-Shading nah zeigen
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(2500);

// Halle 10.1 suchen + anwaehlen
await page.locator('input.search').fill('Halle 10.1');
await page.waitForTimeout(400);
await page.locator('.hits li button', { hasText: 'Halle 10.1' }).first().evaluate((el) => el.click());
await page.waitForTimeout(2000);

await page.screenshot({ path: `${OUT}/cel-1-halle-overview.png` });

// Werkzeuge oeffnen, Halle-Preset klicken (idR schon aktiv)
try {
  await page.getByRole('button', { name: 'Werkzeuge' }).click({ timeout: 3000 });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Halle' }).click({ timeout: 3000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/cel-2-halle-near.png` });
} catch (err) {
  errors.push(`preset wechsel: ${err.message}`);
}

// Maus-Drag -> Kamera drehen
const canvas = page.locator('canvas');
const bounds = await canvas.boundingBox();
if (bounds) {
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 200, bounds.y + bounds.height / 2 - 80, { steps: 18 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/cel-3-halle-rotated.png` });
}

console.log(`Konsolenfehler: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 20).join('\n---\n'));

try { await browser.close(); } catch {}
