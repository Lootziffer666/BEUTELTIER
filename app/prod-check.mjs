/**
 * Smoke test for the PRODUCTION build of the World Builder.
 * Usage: node prod-check.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.WB_URL ?? 'http://127.0.0.1:8199/world-builder.html';
const CHROME = process.env.CHROME;

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(60000);

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console:${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });

// Boot proof
const boot = await page.evaluate(() => {
  const editor = window.__BEUTELTIER_EDITOR__;
  return {
    hasEditor: !!editor,
    hasState: !!editor?.state,
    state: editor ? editor.state() : null,
    canvas: !!document.querySelector('canvas'),
    webgl: (() => {
      const c = document.querySelector('canvas');
      if (!c) return false;
      const ctx = c.getContext('webgl') || c.getContext('experimental-webgl');
      return !!ctx;
    })(),
  };
});
console.log('BOOT:', JSON.stringify(boot, null, 2));

if (!boot.hasEditor) throw new Error('window.__BEUTELTIER_EDITOR__ fehlt — JS-Boot gescheitert');
if (!boot.webgl) throw new Error('Kein WebGL-Kontext');
if (boot.state.objects !== 1 || !boot.state.boulevard) throw new Error('Startzustand falsch');

// Select boulevard
await page.click('#selectBoulevard');
await page.waitForTimeout(500);
const type = await page.$eval('#typeInput', (e) => e.value);
if (type !== 'assembly') throw new Error(`Boulevard-Typ falsch: ${type}`);

// Anchor
await page.click('#anchorBoulevard');
const locked1 = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().boulevardLocked);
if (!locked1) throw new Error('Verankern fehlgeschlagen');
await page.click('#anchorBoulevard');

// Add 1-m cube
await page.click('#addCube');
const nAfterCube = await page.$$eval('#objectList .object-item', (n) => n.length);
if (nAfterCube !== 2) throw new Error(`Cube nicht angelegt: ${nAfterCube}`);

// Select the cube
await page.click('#objectList .object-item:nth-child(2)');
await page.waitForTimeout(400);
const selInfo = await page.textContent('#selectionInfo');
console.log('Selection:', selInfo.replace(/\n/g, ' | '));

// Change transform mode
await page.click('#modeRotate');
await page.waitForTimeout(300);
const rotActive = await page.evaluate(() => document.getElementById('modeRotate').classList.contains('active'));
if (!rotActive) throw new Error('Rotate-Modus nicht aktiv');

// Map opacity
await page.$eval('#mapOpacity', (e) => { e.value = '0.22'; e.dispatchEvent(new Event('input')); });
const op = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().mapOpacity);
if (Math.abs(op - 0.22) > 0.001) throw new Error(`Map opacity falsch: ${op}`);

// Undo
await page.click('#undoBtn');
await page.waitForTimeout(300);
const nUndo = await page.$$eval('#objectList .object-item', (n) => n.length);
console.log('After undo objects:', nUndo);

// Redo
await page.click('#redoBtn');
await page.waitForTimeout(300);
const nRedo = await page.$$eval('#objectList .object-item', (n) => n.length);
console.log('After redo objects:', nRedo);

// New world
await page.click('#newWorld');
await page.waitForTimeout(500);
const nNew = await page.$$eval('#objectList .object-item', (n) => n.length);
if (nNew !== 1) throw new Error(`Neue Welt falsch: ${nNew} Objekte`);

// Walk mode
await page.click('#walkBtn');
await page.waitForTimeout(800);
const walk = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().walkActive);
if (!walk) throw new Error('Walk Mode nicht betreten');
await page.click('#walkExit');
await page.waitForTimeout(500);
const walkOff = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().walkActive);
if (walkOff) throw new Error('Walk Mode nicht verlassen');

// Screenshots
await page.screenshot({ path: '/tmp/agent_f2c5b850-94b5-4bf7-a417-06da17d05cc0/prod-3d.png' });
await page.click('[data-view="top"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/agent_f2c5b850-94b5-4bf7-a417-06da17d05cc0/prod-top.png' });

console.log('ERRORS:', errors);
if (errors.length) throw new Error(`Browserfehler: ${errors.join(' | ')}`);
console.log('PROD BUILD: ALLES OK');
await browser.close();