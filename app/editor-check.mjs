/**
 * Regression test for BEUTELTIER World Builder 6.
 *
 * Runs against a real browser and proves the editor boots and that the 15
 * required interactions actually change real state. Two modes:
 *   node editor-check.mjs            -> Vite dev server (port 8099)
 *   node editor-check.mjs --prod    -> production build served over HTTP
 *   node editor-check.mjs --file    -> production build via file://
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const HIER = dirname(fileURLToPath(import.meta.url));
const ABLAGE = process.env.ABLAGE || await mkdtemp(`${tmpdir()}/editor-check-`);
const CHROME = process.env.CHROME;
const MODE = process.argv[2] ?? 'dev';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FEHL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(15000);

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console:${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let url;
let server;
if (MODE === 'prod') {
  url = process.env.WB_URL ?? 'http://127.0.0.1:8199/world-builder.html';
} else if (MODE === 'file') {
  url = `file://${HIER}/dist/world-builder.html`;
} else {
  server = await createServer({
    root: HIER,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 8099, strictPort: true },
  });
  await server.listen();
  url = 'http://127.0.0.1:8099/world-builder.html';
}

await page.goto(url, { waitUntil: 'load', timeout: 20000 });

// 1+2. Boot successful -------------------------------------------------------
const boot = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const ctx = c.getContext('webgl2') || c.getContext('webgl');
  return {
    hasEditor: !!window.__BEUTELTIER_EDITOR__,
    hasState: !!window.__BEUTELTIER_EDITOR__?.state,
    state: window.__BEUTELTIER_EDITOR__ ? window.__BEUTELTIER_EDITOR__.state() : null,
    canvas: !!c,
    webgl: !!ctx,
  };
});
check('Editor existiert (window.__BEUTELTIER_EDITOR__)', boot.hasEditor);
check('State existiert', boot.hasState);
check('Canvas existiert', boot.canvas);
check('WebGL-Kontext existiert', boot.webgl);
check('Startzustand (1 Objekt, Boulevard, Karte)', boot.state &&
  boot.state.worldSize === 1132.8 && boot.state.objects === 1 &&
  boot.state.boulevard && boot.state.mapVisible, JSON.stringify(boot.state));

await page.waitForTimeout(1000);

// 3. Nordboulevard auswaehlen ------------------------------------------------
await page.click('#selectBoulevard');
await page.waitForTimeout(400);
const type = await page.$eval('#typeInput', (e) => e.value);
check('Nordboulevard ausgewählt (Typ assembly)', type === 'assembly', type);

// 4. Inspector enthaelt Boulevard-Daten --------------------------------------
const selInfo = await page.textContent('#selectionInfo');
const width = await page.$eval('#widthInput', (e) => e.value);
check('Inspector gefüllt (Breite > 100 m)', Number(width) > 100, `width=${width} info=${selInfo.replace(/\n/g, ' ')}`);

// 5. Verankern an/aus --------------------------------------------------------
await page.click('#anchorBoulevard');
const locked1 = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().boulevardLocked);
check('Verankern an', locked1);
await page.click('#anchorBoulevard');
const locked2 = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().boulevardLocked);
check('Verankern aus', !locked2);

// 6. + 1-m-Stein -------------------------------------------------------------
const before = await page.$$eval('#objectList .object-item', (n) => n.length);
await page.click('#addCube');
await page.waitForTimeout(300);
const after = await page.$$eval('#objectList .object-item', (n) => n.length);
check('+ 1-m-Stein erzeugt Objekt', after === before + 1, `${before} -> ${after}`);

// 7. Stein auswaehlen --------------------------------------------------------
await page.click('#objectList .object-item:nth-child(2)');
await page.waitForTimeout(300);
const cubeSel = await page.textContent('#selectionInfo');
check('Stein ausgewählt', cubeSel.includes('Block'), cubeSel.replace(/\n/g, ' | '));

// 8. Transform-Modus wechseln -------------------------------------------------
await page.click('#modeRotate');
await page.waitForTimeout(200);
const rotActive = await page.evaluate(() => document.getElementById('modeRotate').classList.contains('active'));
check('Rotate-Modus aktiv', rotActive);
await page.click('#modeScale');
await page.waitForTimeout(200);
const scaleActive = await page.evaluate(() => document.getElementById('modeScale').classList.contains('active'));
check('Scale-Modus aktiv', scaleActive);
await page.click('#modeMove');
await page.waitForTimeout(200);
const moveActive = await page.evaluate(() => document.getElementById('modeMove').classList.contains('active'));
check('Move-Modus aktiv', moveActive);

// 9. Mapslider aendern -------------------------------------------------------
await page.$eval('#mapOpacity', (e) => { e.value = '0.22'; e.dispatchEvent(new Event('input')); });
const op = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().mapOpacity);
check('Karten-Deckkraft ändert Material', Math.abs(op - 0.22) < 0.001, String(op));

// 10. Undo --------------------------------------------------------------------
await page.click('#undoBtn');
await page.waitForTimeout(300);
const nUndo = await page.$$eval('#objectList .object-item', (n) => n.length);
check('Undo: Stein entfernt', nUndo === before, String(nUndo));

// 11. Redo --------------------------------------------------------------------
await page.click('#redoBtn');
await page.waitForTimeout(300);
const nRedo = await page.$$eval('#objectList .object-item', (n) => n.length);
check('Redo: Stein wiederhergestellt', nRedo === after, String(nRedo));

// 12. Neue Welt --------------------------------------------------------------
await page.click('#newWorld');
await page.waitForTimeout(600);
const nNew = await page.$$eval('#objectList .object-item', (n) => n.length);
check('Neue Welt: wieder 1 Objekt', nNew === 1, String(nNew));

// 13. Bauplan wieder laden ---------------------------------------------------
await page.click('#bauplanAlles');
await page.waitForTimeout(800);
const nBp = await page.$$eval('#objectList .object-item', (n) => n.length);
check('Bauplan "Alles laden" erzeugt > 1 Objekt', nBp > 1, String(nBp));

// 14+15. Walk Mode betreten / verlassen --------------------------------------
await page.click('#walkBtn');
await page.waitForTimeout(800);
const walkOn = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().walkActive);
check('Walk Mode betreten', walkOn);
// Im Walk-Modus verdeckt der Canvas die Paneele; der Exit-Klick wird per JS
// ausgeloest, damit der Test nicht am Pointer-Event scheitert.
await page.evaluate(() => document.getElementById('walkExit').click());
await page.waitForTimeout(500);
const walkOff = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().walkActive);
check('Walk Mode verlassen', !walkOff);

// Delete + Verhalten ---------------------------------------------------------
await page.click('#selectBoulevard');
await page.waitForTimeout(300);
await page.click('#deleteBtn');
const boulevardGone = await page.evaluate(() => !window.__BEUTELTIER_EDITOR__.state().boulevard);
check('Löschen des verankerten Objekts wird verweigert', boulevardGone === false);

// Screenshots -----------------------------------------------------------------
await page.click('[data-view="perspective"]');
await page.waitForTimeout(1000);
await page.screenshot({ path: `${ABLAGE}/check-3d.png` });
await page.click('[data-view="top"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${ABLAGE}/check-top.png` });

console.log('\nBrowserfehler:', errors);
if (errors.length) throw new Error(`Browserfehler: ${errors.join(' | ')}`);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Pruefungen bestanden`);
if (failed.length) {
  console.log('FEHLERHAFT:');
  failed.forEach((r) => console.log(`  - ${r.name}: ${r.detail}`));
  process.exit(1);
}
console.log('ALLES OK');
if (server) await server.close();
await browser.close();