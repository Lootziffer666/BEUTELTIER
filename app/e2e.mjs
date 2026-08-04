/**
 * Spielt den Erfolgsablauf aus PRD 9 durch einen echten Browser.
 *
 * Meldung -> Zuordnung -> Route -> Sperre -> Alternativroute -> Export.
 * Das ist der Nachweis, dass die Teile zusammen funktionieren und nicht nur
 * einzeln; Unit-Tests wuerden genau die Naht dazwischen nicht treffen.
 *
 * Aufruf (Vorschau muss auf 4173 laufen):
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node e2e.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BEUTELTIER_URL ?? 'http://localhost:4173/';
const OUT = process.env.BEUTELTIER_SHOTS ?? '.';
const CHROME =
  process.env.BEUTELTIER_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  executablePath: CHROME,
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
await page.waitForTimeout(3500);
check('Gelände wird gerendert', true);

// --- Meldung einlesen und automatisch zuordnen ----------------------------
await page.getByRole('button', { name: 'Funkwache' }).click();
await page
  .locator('textarea')
  .fill(
    'Bei CRYTEK in Halle 6.1 gibt es Poster solange Vorrat reicht\n\n' +
      'AOC International Halle 8.1 C060 Sticker am Stand',
  );
await page.getByRole('button', { name: 'Einlesen' }).click();
await page.locator('.report').first().waitFor({ timeout: 10000 }).catch(() => undefined);

const noticeText = (await page.locator('.notice').first().textContent()) ?? '';
check('Meldungen eingelesen und zugeordnet', /\d+ Meldungen/.test(noticeText), noticeText.trim());

const routeButtons = page.locator('.report button', { hasText: /^Route zu / });
const assigned = await routeButtons.count();
check('mindestens eine Meldung hat einen Stand', assigned > 0, `${assigned} zugeordnet`);
await page.screenshot({ path: `${OUT}/app-2-funkwache.png` });

// --- Von der Meldung auf die Karte ----------------------------------------
if (assigned > 0) {
  await routeButtons.first().click();
  await page.waitForTimeout(400);
}

await page.getByRole('button', { name: 'Karte' }).click();
await page.waitForTimeout(300);

// Startstand über die Suche setzen, Ziel bleibt der Stand aus der Meldung.
await page.locator('input.search').fill('10.2 E030');
await page.waitForTimeout(500);
const hit = page.locator('.hits button').first();
check('Suche liefert Treffer', (await page.locator('.hits button').count()) > 0);
await hit.click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Als Start setzen' }).click();
await page.waitForTimeout(300);

// Ziel neu wählen, damit Start und Ziel verschieden sind.
await page.locator('input.search').fill('CRYTEK');
await page.waitForTimeout(500);
await page.locator('.hits button').first().click();
await page.waitForTimeout(900);

const figures = page.locator('.card', { hasText: 'ROUTE' }).locator('.figures strong');
const hasRoute = (await figures.count()) > 0;
const firstDistance = hasRoute ? await figures.first().textContent() : null;
check('Route wird berechnet', hasRoute, firstDistance ?? 'keine Strecke');
await page.screenshot({ path: `${OUT}/app-3-route.png` });

// --- Sperre schalten, Route muss sich ändern ------------------------------
const blockButtons = page.locator('.edges__states button', { hasText: 'gesperrt' });
const switchable = await blockButtons.count();
check('Übergänge auf der Route sind schaltbar', switchable > 0, `${switchable} Übergänge`);

// Nicht jeder Übergang ist unverzichtbar -- wo es eine gleich gute
// Alternative gibt, bleibt die Strecke gleich. Geprüft wird, dass sich
// *irgendein* Übergang sperren lässt und die Route darauf reagiert.
let secondDistance = null;
if (switchable > 0 && hasRoute) {
  const figuresAfter = () => page.locator('.card', { hasText: 'ROUTE' }).locator('.figures strong');
  for (let index = 0; index < switchable; index += 1) {
    const button = page.locator('.edges li').nth(index).locator('button', { hasText: 'gesperrt' });
    if ((await button.count()) === 0) break;
    await button.click();
    await page.waitForTimeout(900);
    secondDistance = (await figuresAfter().count()) > 0 ? await figuresAfter().first().textContent() : null;
    if (secondDistance !== firstDistance) break;
  }
  check(
    'Sperre führt zu einer anderen Route',
    secondDistance !== firstDistance,
    `${firstDistance} → ${secondDistance ?? 'keine Route'}`,
  );
  await page.screenshot({ path: `${OUT}/app-4-gesperrt.png` });
}

// --- Epix: Import, Kampagnenfenster, Export -------------------------------
await page.getByRole('button', { name: 'Epix' }).click();
await page.waitForTimeout(400);
const windowText = (await page.locator('.card .muted').first().textContent()) ?? '';
check(
  'Kampagnenfenster endet im August und startet davor',
  /\d{2}\.\d{2}\.\d{4} bis \d{2}\.08\.\d{4}/.test(windowText),
  windowText.split('.')[0].slice(0, 60),
);

await page.locator('textarea').fill('Tag 1 Quiz https://gamescom.global/epix/1\nTag 2 https://gamescom.global/epix/2');
await page.getByRole('button', { name: 'Übernehmen' }).click();
await page.locator('.epix__item').first().waitFor({ timeout: 10000 }).catch(() => undefined);
const epixCount = await page.locator('.epix__item').count();
check('Epix-Einträge übernommen', epixCount >= 2, `${epixCount} Einträge`);
await page.screenshot({ path: `${OUT}/app-5-epix.png` });

await page.getByRole('button', { name: 'SteamGifts-Export' }).click();
await page.waitForTimeout(400);
const exportNotice = (await page.locator('.notice').last().textContent()) ?? '';
check('SteamGifts-Export ausgelöst', /Zwischenablage/.test(exportNotice), exportNotice.trim());

// --- Register --------------------------------------------------------------
await page.getByRole('button', { name: 'Register' }).click();
await page.waitForTimeout(400);
const registerText = await page.innerText('.panel__body');
check('Register nennt die Indie Arena Booth', /Indie Arena Booth/.test(registerText));
check('Register weist fehlende Lagen aus', /Ohne Lage|11\.1/.test(registerText));
await page.screenshot({ path: `${OUT}/app-6-register.png` });

check('keine Fehler in der Konsole', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden`);
process.exit(failed.length === 0 ? 0 : 1);
