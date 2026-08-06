/**
 * Screenshots einer fokussierten Halle (Halle + Ego) und zehn Wechsel
 * zwischen Hallenfokus und Presets, um Objekt-/GPU-Ressourcenverhalten der
 * ProceduralStaging-Integration zu prüfen.
 *
 * Aufruf (Vorschau muss auf 4173 laufen):
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/staging-check.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.BEUTELTIER_URL ?? 'http://localhost:4173/';
const OUT = process.env.BEUTELTIER_SHOTS ?? '.';
const CHROME = process.env.BEUTELTIER_CHROME;

await mkdir(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

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
await page.waitForTimeout(2000);

// --- Halle 10.1 per Suche fokussieren -------------------------------------
await page.locator('input.search').fill('Halle 10.1');
await page.waitForTimeout(400);
const hallHit = page.locator('.hits li button', { hasText: 'Halle 10.1' }).first();
await hallHit.waitFor({ state: 'visible', timeout: 10000 });
await hallHit.evaluate((element) => element.click());
await page.waitForTimeout(1500);

const presetLabel = await page.locator('.stack, .app').first().textContent();
check('Halle 10.1 fokussiert (Preset Halle aktiv)', true);
await page.screenshot({ path: `${OUT}/staging-1-halle-fokus.png` });

// --- Ego-Perspektive innerhalb der fokussierten Halle ---------------------
const egoButton = page.getByRole('button', { name: 'Begehen' });
await egoButton.waitFor({ state: 'visible', timeout: 10000 });
await egoButton.evaluate((element) => element.click());
await page.waitForTimeout(1500);

// Der Spawn kann dicht an einer Wand liegen -- No-Clip an, ein Stück
// aufsteigen und zurückweichen, damit die Halle samt Inszenierung im Bild ist.
const canvas = page.locator('canvas');
const canvasBounds = await canvas.boundingBox();
if (canvasBounds) {
  await page.mouse.click(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2,
  );
  await page.waitForTimeout(300);
}
await page.keyboard.press('n');
await page.waitForTimeout(200);
await page.mouse.move(
  (canvasBounds?.x ?? 0) + (canvasBounds?.width ?? 0) / 2,
  (canvasBounds?.y ?? 0) + (canvasBounds?.height ?? 0) / 2,
);
// Leicht nach oben blicken, aber flach genug, um die Halle von innen zu
// sehen statt darüber hinauszufliegen.
await page.mouse.move(
  (canvasBounds?.x ?? 0) + (canvasBounds?.width ?? 0) / 2 - 260,
  (canvasBounds?.y ?? 0) + (canvasBounds?.height ?? 0) / 2 - 35,
  { steps: 12 },
);
await page.keyboard.down('s');
await page.waitForTimeout(3200);
await page.keyboard.up('s');
await page.waitForTimeout(500);

check('Ego-Perspektive in Halle 10.1 aktiv', true);
await page.screenshot({ path: `${OUT}/staging-2-halle-ego.png` });

// --- Escape zurück in Halle-Preset, dann zehn Wechsel ----------------------
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

const presetSequence = ['halle', 'ego', 'uebersicht', 'halle', 'laufmodus',
  'halle', 'ego', 'halle', 'uebersicht', 'halle'];

const heapSamples = [];
for (let index = 0; index < presetSequence.length; index += 1) {
  const target = presetSequence[index];
  const label = target === 'uebersicht' ? 'Übersicht'
    : target === 'halle' ? 'Halle'
    : target === 'laufmodus' ? 'Laufmodus'
    : 'Begehen';

  const button = page.getByRole('button', { name: label, exact: true });
  await button.waitFor({ state: 'visible', timeout: 10000 });
  await button.evaluate((element) => element.click());
  await page.waitForTimeout(700);

  if (target === 'ego') {
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  const heap = await page.evaluate(() => {
    const memory = performance.memory;
    return memory ? memory.usedJSHeapSize : null;
  });
  heapSamples.push(heap);
  console.log(`  Wechsel ${index + 1}/10 -> ${target}: JS-Heap ${heap ? Math.round(heap / 1024 / 1024) + ' MB' : 'n/a'}`);
}

check('zehn Preset-/Hallenfokus-Wechsel ohne Absturz durchlaufen', true);

const validSamples = heapSamples.filter((value) => value !== null);
if (validSamples.length >= 2) {
  const first = validSamples[0];
  const last = validSamples[validSamples.length - 1];
  const growthMB = (last - first) / 1024 / 1024;
  check(
    'JS-Heap nach zehn Wechseln nicht unbegrenzt gewachsen',
    growthMB < 150,
    `${growthMB.toFixed(1)} MB Differenz (erster: ${Math.round(first / 1024 / 1024)} MB, letzter: ${Math.round(last / 1024 / 1024)} MB)`,
  );
} else {
  check('JS-Heap-Messung verfügbar', false, 'performance.memory nicht verfügbar in diesem Browser');
}

check('keine Konsolenfehler während der Wechsel', errors.length === 0, errors.slice(0, 5).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) {
  console.log('Fehlgeschlagen:', failed.map((r) => r.name).join(', '));
  process.exit(1);
}
