/**
 * Prueft die Ego-Perspektive im echten Browser.
 *
 * Gemessen wird am Bild, nicht an ausgestellten Interna: wenn W die Kamera
 * bewegt, aendert sich das Rendering. Damit muss nichts nur fuer den Test
 * nach aussen gereicht werden, was in der App nichts zu suchen hat.
 */
import { chromium } from 'playwright';

const CHROME = process.env.BEUTELTIER_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(process.env.BEUTELTIER_URL ?? 'http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const canvas = page.locator('canvas');
const overview = await canvas.screenshot();

await page.getByRole('button', { name: 'Begehen' }).click();
await page.waitForTimeout(1500);
check('Ego-Modus lässt sich schalten', await page.locator('.stage__hint').isVisible());

const standing = await canvas.screenshot();
const differs = (a, b) => {
  if (a.length !== b.length) return 1;
  let changed = 0;
  for (let i = 0; i < a.length; i += 997) if (a[i] !== b[i]) changed += 1;
  return changed / Math.ceil(a.length / 997);
};
check('Ansicht wechselt in die Ego-Perspektive', differs(overview, standing) > 0.05,
  `${(differs(overview, standing) * 100).toFixed(0)} % der Stichproben anders`);

await canvas.click();
await page.keyboard.down('w');
await page.waitForTimeout(1600);
await page.keyboard.up('w');
await page.waitForTimeout(400);
const walked = await canvas.screenshot();
check('W verändert den Standpunkt', differs(standing, walked) > 0.01,
  `${(differs(standing, walked) * 100).toFixed(0)} % der Stichproben anders`);

await page.screenshot({ path: 'app-7-begehen.png' });

// Solange der Zeiger gefangen ist, faengt die Leinwand jeden Klick ab --
// deshalb fuehrt Escape hinaus, und nichts anderes.
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
check('Escape führt zurück zur Übersicht',
  !(await page.locator('.stage__hint').isVisible()));
check('keine Fehler in der Konsole', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} Prüfungen bestanden`);
process.exit(failed ? 1 : 0);
