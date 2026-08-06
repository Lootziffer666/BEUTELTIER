/**
 * Fängt die ProceduralStaging-DEBUG-Konsolenausgabe ein und schießt
 * Screenshots von Halle und Ego mit sichtbaren pinken Markern.
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
page.on('pageerror', (error) => consoleLines.push(`PAGEERROR: ${error.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(2000);

await page.locator('input.search').fill('Halle 10.1');
await page.waitForTimeout(400);
const hallHit = page.locator('.hits li button', { hasText: 'Halle 10.1' }).first();
await hallHit.waitFor({ state: 'visible', timeout: 10000 });
await hallHit.evaluate((element) => element.click());
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/debug-1-halle.png` });

console.log('\n=== KONSOLE NACH HALLE-FOKUS ===');
consoleLines.forEach((line) => console.log(line));
consoleLines.length = 0;

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
await page.screenshot({ path: `${OUT}/debug-2-ego.png` });

console.log('\n=== KONSOLE NACH EGO-EINSTIEG ===');
consoleLines.forEach((line) => console.log(line));

await browser.close();
