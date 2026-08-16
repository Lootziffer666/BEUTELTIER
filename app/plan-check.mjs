/**
 * Orthografische Draufsicht auf eine Halle -- als Zeichnung, nicht als Bild.
 *
 * Kein Renderer, kein Material, keine Beleuchtung, keine Perspektive: nur der
 * Hallenumriss und die Stützen, von oben, masstabsgetreu. Boden grau,
 * Stützen rot.
 *
 * Warum nicht die 3D-Szene von oben fotografieren: eine perspektivische
 * Kamera verzerrt, Materialien und Reflexe verdecken die Lage, und die
 * Deckenebene liegt im Weg. Beim Vergleich geht es aber genau um die Lage --
 * ob Reihen parallel laufen, ob die Bänder gleich breit sind, ob das Raster
 * zur Halle gehört. Ein verdrehtes Raster sah in der Perspektive plausibel
 * aus und lief mir dadurch mehrere Runden lang durch.
 *
 * Die Zahlen kommen aus `__GRUNDRISS()`, also aus derselben Rechnung, mit der
 * die Szene ihre Stützen setzt (`hallenGrundriss` in `interior.tsx`). Eine
 * eigene Rechnung hier waere eine zweite Wahrheit und zeigte genau die
 * Fehler nicht, wegen derer man hinsieht.
 *
 *   npm run build && npm run preview &
 *   node plan-check.mjs [hallenschluessel]
 */
import { chromium } from 'playwright';
import { AUFNAHME_MS } from './screenshot.mjs';

const CHROME = process.env.BEUTELTIER_CHROME
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ABLAGE = process.env.ABLAGE ?? '.';
const HALLE = process.argv[2] ?? '10.2';

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
page.setDefaultTimeout(AUFNAHME_MS);
const fehler = [];
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));

const ziel = new URL(process.env.BEUTELTIER_URL ?? 'http://localhost:4173/');
ziel.searchParams.set('setzen', '1');
ziel.searchParams.set('leer', '1');
ziel.searchParams.set('plan', '1');
await page.goto(ziel.href, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
// `__GRUNDRISS` haengt an `Hallenstuetzen`, und das rendert nur im Ego-Modus.
await page.getByRole('button', { name: 'Begehen' }).click();
await page.waitForTimeout(2000);

const grundriss = await page.evaluate((key) => {
  const alle = globalThis.__GRUNDRISS?.() ?? [];
  return alle.find((h) => h.key === key) ?? null;
}, HALLE);

if (!grundriss) {
  console.log(`Halle ${HALLE} liefert keinen Grundriss.`, fehler.slice(0, 3));
  await browser.close();
  process.exit(1);
}

console.log(`plan-${HALLE}: ${grundriss.saeulen.length} Stuetzen, `
  + `${grundriss.reihen} Reihen, ${grundriss.baender} Ausstellerbaender`);

// Zeichnen: Gelaendemeter auf Bildpunkte, Nordwert nach unten wie im Plan.
const svg = await page.evaluate((g) => {
  const xs = g.umriss.map((p) => p[0]);
  const ys = g.umriss.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rand = 24;
  const skala = Math.min(1300 / (maxX - minX), 1100 / (maxY - minY));
  const bx = (x) => rand + (x - minX) * skala;
  const by = (y) => rand + (maxY - y) * skala;
  const breite = (maxX - minX) * skala + 2 * rand;
  const hoehe = (maxY - minY) * skala + 2 * rand;

  const umriss = g.umriss.map((p) => `${bx(p[0]).toFixed(1)},${by(p[1]).toFixed(1)}`).join(' ');
  // Radius so, dass eine Stuetze sichtbar bleibt, ohne den Plan zuzukleistern.
  const r = Math.max(3, 0.8 * skala);
  const punkte = g.saeulen
    .map((s) => `<circle cx="${bx(s.x).toFixed(1)}" cy="${by(s.y).toFixed(1)}" r="${r.toFixed(1)}" fill="#e02020"/>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${breite.toFixed(0)}" height="${hoehe.toFixed(0)}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <polygon points="${umriss}" fill="#c8c8c8" stroke="#404040" stroke-width="2"/>
    ${punkte}
  </svg>`;
}, grundriss);

await page.setContent(
  `<body style="margin:0;background:#fff">${svg}</body>`,
  { waitUntil: 'load' },
);
const el = await page.locator('svg').boundingBox();
await page.screenshot({
  path: `${ABLAGE}/plan-${HALLE}.png`,
  clip: el ?? undefined,
  timeout: AUFNAHME_MS,
});
console.log('Fehler:', fehler.slice(0, 5));
await browser.close();
