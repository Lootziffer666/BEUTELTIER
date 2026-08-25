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
  if (t === 'warning') errors.push(`console.warn: ${message.text()}`);
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 30000 });
await page.waitForTimeout(2500);

// 1) Halle 10.1 selektieren
await page.locator('input.search').fill('Halle 10.1');
await page.waitForTimeout(400);
const hallHit = page.locator('.hits li button', { hasText: 'Halle 10.1' }).first();
await hallHit.waitFor({ state: 'visible', timeout: 10000 });
await hallHit.evaluate((element) => element.click());
await page.waitForTimeout(1500);

// 2) Werkzeugkasten (Zahnrad) oeffnen
await page.getByRole('button', { name: 'Werkzeuge' }).click();
await page.waitForTimeout(400);

// 3) Ego / Begehen waehlen
try {
  const egoButton = page.getByRole('button', { name: 'Begehen' });
  await egoButton.waitFor({ state: 'visible', timeout: 5000 });
  await egoButton.click();
  await page.waitForTimeout(1500);
} catch (err) {
  errors.push(`Begehen-Klick: ${err.message}`);
  await page.screenshot({ path: `${OUT}/accept-fail.png` });
  await browser.close();
  console.log(`Konsolenfehler: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 20).join('\n'));
  process.exit(1);
}

try {
  // 4) Canvas erneut greifen (kann remounten)
  await page.waitForTimeout(800);
  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error('kein Canvas nach Preset-Wechsel');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.waitForTimeout(400);

  // 5) No-Clip an, leicht schauen, kurzer Schub nach vorn
  await page.keyboard.press('n');
  await page.waitForTimeout(150);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.move(bounds.x + bounds.width / 2 - 180, bounds.y + bounds.height / 2 + 60, { steps: 10 });
  await page.keyboard.down(' ');
  await page.waitForTimeout(900);
  await page.keyboard.up(' ');
  await page.waitForTimeout(800);

  await page.screenshot({ path: `${OUT}/accept-3-ego-staging.png` });
} catch (err) {
  errors.push(`navigate: ${err.message}`);
  try { await page.screenshot({ path: `${OUT}/accept-fail.png` }); } catch {}
}

console.log(`Konsolenfehler: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 30).join('\n---\n'));

try { await browser.close(); } catch {}
