/**
 * Stellt die Kamera in eine Halle und schaut sich um.
 *
 * Der Gangpruefer nimmt den Boulevard auf, der Tuerpruefer die Stirnwand --
 * beide stehen nie in einer Halle. Genau dort liegt aber das Bildziel Z4
 * (`docs/bildziele.md`): dunkler Boden, helle Lichtbaender, Bahnen darunter,
 * schwarzes Deckenraster, leerer Raum. Ohne eine Aufnahme von innen laesst
 * sich daran nichts pruefen.
 *
 * Gewaehlt werden die grossen Hallen: in einer kleinen sieht man die Waende
 * und nicht den Raum.
 *
 *   npm run build && npm run preview &
 *   node halle-check.mjs
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { aufnehmen, AUFNAHME_MS } from './screenshot.mjs';

const CHROME = process.env.BEUTELTIER_CHROME
  ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ABLAGE = process.env.ABLAGE ?? '.';

const site = JSON.parse(await readFile('public/data/registered-site.json', 'utf8'));

/**
 * Mitte, Ausdehnung und Drehung einer Halle -- dieselbe Rechnung wie
 * `hallenlage()` in `interior.tsx`, damit die Kamera laengs schaut und nicht
 * schraeg gegen eine Wand.
 */
function lage(footprint) {
  let laengste = 0;
  let winkel = 0;
  for (let i = 0; i < footprint.length; i += 1) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d > laengste) {
      laengste = d;
      winkel = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  const ux = Math.cos(winkel);
  const uy = Math.sin(winkel);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, y] of footprint) {
    const u = x * ux + y * uy;
    const v = -x * uy + y * ux;
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  const uM = (uMin + uMax) / 2;
  const vM = (vMin + vMax) / 2;
  return {
    mx: uM * ux - vM * uy,
    my: uM * uy + vM * ux,
    laenge: uMax - uMin,
    breite: vMax - vMin,
    ux, uy,
  };
}

// Die Kamera schaut nach -Z, Szenen-Z zeigt nach Sueden: der Blick geht nach
// kleinerem y. Vor beiden Anteilen steht deshalb ein Minus (siehe SiteScene).
const blickrichtung = (dx, dy) => Math.atan2(-dx, -dy);

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(AUFNAHME_MS);
const fehler = [];
page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));

const ziel = new URL(process.env.BEUTELTIER_URL ?? 'http://localhost:4173/');
ziel.searchParams.set('setzen', '1');
await page.goto(ziel.href, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Begehen' }).click();
await page.waitForTimeout(1500);

// Augenhoehe ueber der Bodenplatte der Halle. `__SETZEN` erwartet die Hoehe
// der Fuesse; die Augenhoehe legt die Szene selbst drauf.
const HALLEN = ['9.1', '8.1', '6.1'];
for (const key of HALLEN) {
  const hall = site.halls.find((h) => h.key === key);
  if (!hall) {
    console.log(`${key}: nicht im Datensatz`);
    continue;
  }
  const l = lage(hall.footprint);
  for (const [name, entlang] of [
    // Aus einem Drittel der Laenge in die lange Achse: so laeuft der Blick
    // ueber die volle Tiefe, und die Baender fluchten mit der Bahn im Boden.
    [`h-${key}-laengs`, -0.32],
    // Und aus der Gegenrichtung, damit nicht ein einzelner Standpunkt
    // ueber den ganzen Raum entscheidet.
    [`h-${key}-zurueck`, 0.32],
  ]) {
    const x = l.mx + l.ux * l.laenge * entlang;
    const y = l.my + l.uy * l.laenge * entlang;
    const vor = entlang < 0 ? 1 : -1;
    const yaw = blickrichtung(l.ux * vor, l.uy * vor);
    await page.evaluate(({ x, y, z, yaw }) => {
      globalThis.__SETZEN?.(x, y, z, yaw);
    }, { x, y, z: hall.baseY, yaw });
    await page.waitForTimeout(1200);
    await aufnehmen(page, `${ABLAGE}/${name}.png`, { einfrieren: false });
    console.log(`${name}: ${l.laenge.toFixed(0)} x ${l.breite.toFixed(0)} m`);
  }
}
console.log('Fehler:', fehler.slice(0, 5));
await browser.close();
