/**
 * Querschnitt durch eine Halle -- als Zeichnung, nicht als Bild.
 *
 * Das Gegenstueck zu `plan-check.mjs`. Der Plan zeigt die Lage, der Schnitt
 * die Hoehen: wo Boden und Decke liegen, wie weit die Stuetze reicht, wo
 * Sockel, Leuchtband und Fassung sitzen. Beides zusammen beschreibt die
 * Halle vollstaendig -- und beides ist masstabsgetreu, ohne Perspektive, ohne
 * Material, ohne Licht.
 *
 * Genau daran hat es gefehlt. Ob eine Stuetze bis zur Decke reicht, ob das
 * Leuchtband unter der Fassung haengt oder darin verschwindet, ob die Decke
 * ueberhaupt waagerecht liegt -- all das war an perspektivischen Aufnahmen
 * nicht zu entscheiden, und jeder Fehler dieser Art hat mehrere Runden
 * gekostet. In einem Schnitt sieht man es in einem Blick.
 *
 * Die Zahlen kommen aus `__GRUNDRISS()`, also aus derselben Rechnung wie die
 * Szene (`hallenAufbau` in `interior.tsx`).
 *
 *   npm run build && npm run preview &
 *   node schnitt-check.mjs [hallenschluessel]
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
const page = await browser.newPage({ viewport: { width: 1500, height: 700 } });
page.setDefaultTimeout(AUFNAHME_MS);
const fehler = [];
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));

const ziel = new URL(process.env.BEUTELTIER_URL ?? 'http://localhost:4173/');
ziel.searchParams.set('setzen', '1');
ziel.searchParams.set('leer', '1');
ziel.searchParams.set('plan', '1');
await page.goto(ziel.href, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Begehen' }).click();
await page.waitForTimeout(2000);

const g = await page.evaluate((key) => {
  const alle = globalThis.__GRUNDRISS?.() ?? [];
  return alle.find((h) => h.key === key) ?? null;
}, HALLE);

if (!g) {
  console.log(`Halle ${HALLE} liefert keinen Grundriss.`, fehler.slice(0, 3));
  await browser.close();
  process.exit(1);
}

const a = g.aufbau;
console.log(`schnitt-${HALLE}: Boden ${a.bodenY.toFixed(2)} m, Decke ${a.deckeY.toFixed(2)} m`);
console.log(`  Schaft ${a.schaftVon.toFixed(2)} .. ${a.schaftBis.toFixed(2)} m`);
console.log(`  Sockel unten ${a.sockelUnten.map((v) => v.toFixed(2)).join(' .. ')} m,`
  + ` oben ${a.sockelOben.map((v) => v.toFixed(2)).join(' .. ')} m`);
console.log(`  Band ${a.band.map((v) => v.toFixed(2)).join(' .. ')} m,`
  + ` Fassung ${a.fassung.map((v) => v.toFixed(2)).join(' .. ')} m`);
console.log(`  Stuetze schliesst an Decke an: ${Math.abs(a.sockelOben[1] - a.deckeY) < 1e-6}`);
console.log(`  Band haengt unter der Fassung: ${a.band[1] <= a.fassung[0] + 1e-6}`);

const svg = await page.evaluate((g) => {
  const a = g.aufbau;
  const halbe = g.breite / 2;
  const randL = 70, randO = 40;
  const skala = Math.min(1350 / g.breite, 520 / (a.deckeY - a.bodenY + 2));
  const bx = (q) => randL + (q + halbe) * skala;
  const by = (y) => randO + (a.deckeY + 1 - y) * skala;
  const breite = g.breite * skala + randL + 40;
  const hoehe = (a.deckeY - a.bodenY + 2) * skala + randO + 50;

  const kasten = (x0, x1, y0, y1, farbe) =>
    `<rect x="${bx(x0).toFixed(1)}" y="${by(y1).toFixed(1)}"`
    + ` width="${((x1 - x0) * skala).toFixed(1)}" height="${((y1 - y0) * skala).toFixed(1)}"`
    + ` fill="${farbe}"/>`;

  // Boden und Decke als durchgehende Baender.
  let teile = kasten(-halbe, halbe, a.bodenY - 0.25, a.bodenY, '#909090');
  teile += kasten(-halbe, halbe, a.deckeY, a.deckeY + 0.25, '#606060');

  // Stuetzen: Schaft plus Sockel, an den echten Querachsen.
  for (const q of g.querAchsen) {
    const hb = g.profil.breite / 2;
    const hk = hb + g.profil.kragen;
    teile += kasten(q - hb, q + hb, a.schaftVon, a.schaftBis, '#e02020');
    teile += kasten(q - hk, q + hk, a.sockelUnten[0], a.sockelUnten[1], '#a01010');
    teile += kasten(q - hk, q + hk, a.sockelOben[0], a.sockelOben[1], '#a01010');
  }

  // Leuchtbaender mit Fassung darueber.
  for (const q of g.bahnen) {
    teile += kasten(q - 0.21, q + 0.21, a.band[0], a.band[1], '#f2c200');
    teile += kasten(q - 0.32, q + 0.32, a.fassung[0], a.fassung[1], '#404040');
  }

  const beschriftung = [
    [a.deckeY, `Decke ${a.deckeY.toFixed(2)} m`],
    [a.bodenY, `Boden ${a.bodenY.toFixed(2)} m`],
  ].map(([y, text]) =>
    `<line x1="${(randL - 55).toFixed(1)}" y1="${by(y).toFixed(1)}"`
    + ` x2="${bx(-halbe).toFixed(1)}" y2="${by(y).toFixed(1)}" stroke="#202020" stroke-width="1"/>`
    + `<text x="4" y="${(by(y) - 4).toFixed(1)}" font-family="sans-serif" font-size="13">${text}</text>`,
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${breite.toFixed(0)}" height="${hoehe.toFixed(0)}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    ${teile}${beschriftung}
  </svg>`;
}, g);

await page.setContent(`<body style="margin:0;background:#fff">${svg}</body>`, { waitUntil: 'load' });
const el = await page.locator('svg').boundingBox();
await page.screenshot({
  path: `${ABLAGE}/schnitt-${HALLE}.png`,
  clip: el ?? undefined,
  timeout: AUFNAHME_MS,
});
console.log('Fehler:', fehler.slice(0, 5));
await browser.close();
