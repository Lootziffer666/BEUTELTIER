import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.URL ?? 'http://127.0.0.1:4179/';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('stall') || t.includes('Error') || t.includes('error')) errs.push(`[${m.type()}] ${t}`);
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

await page.screenshot({ path: 'app/cel-fix-1-uebersicht.png' });
console.log('1 Uebersicht ok');

// Search Halle 10.1 to set focusHallKey
const search = page.locator('input.search');
if (await search.count()) {
  await search.fill('Halle 10.1');
  await page.waitForTimeout(400);
  const hit = page.locator('.hits li button', { hasText: 'Halle 10.1' }).first();
  if (await hit.count()) await hit.evaluate((el) => el.click());
  await page.waitForTimeout(1500);
}

// Open Werkzeuge
const werkzeuge = page.getByRole('button', { name: 'Werkzeuge' });
if (await werkzeuge.count()) {
  await werkzeuge.click();
  await page.waitForTimeout(400);
}

async function clickIcon(label) {
  const icons = await page.$$('.icon-choice');
  for (let i = 0; i < icons.length; i++) {
    const t = (await icons[i].textContent())?.trim();
    if (t === label) {
      await icons[i].click();
      return true;
    }
  }
  return false;
}

if (await clickIcon('Halle')) {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'app/cel-fix-2-halle.png' });
  console.log('2 Halle ok');
} else {
  console.log('2 Halle: icon not found');
}

// Reopen Werkzeuge, click Begehen
const werkzeuge2 = page.getByRole('button', { name: 'Werkzeuge' });
if (await werkzeuge2.count()) {
  await werkzeuge2.click();
  await page.waitForTimeout(400);
}
if (await clickIcon('Begehen')) {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'app/cel-fix-3-begehen.png' });
  console.log('3 Begehen ok');
} else {
  console.log('3 Begehen: icon not found');
}

fs.writeFileSync('app/cel-fix-errors.txt', errs.join('\n'));
await browser.close();
