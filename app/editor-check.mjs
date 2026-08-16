/**
 * Rauchprobe fuer den Blockeditor.
 *
 * Startet den Editor im Browser, laesst ihn den eingetragenen Bauplan bauen
 * und zaehlt nach, was dabei entsteht. Three.js wird dabei aus node_modules
 * bedient statt vom CDN -- die Probe soll den Editor pruefen und nicht die
 * Netzverbindung.
 *
 *   node editor-check.mjs
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

const server = await createServer({
  root: HIER,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 8099, strictPort: true },
});
await server.listen();

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(180000);

const fehler = [];
page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));

await page.goto('http://127.0.0.1:8099/world-builder.html', { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => window.__BEUTELTIER_EDITOR__?.state().boulevard,
  { timeout: 60000 });
await page.waitForTimeout(2000);

console.log('Status:', await page.textContent('#status'));
console.log('Objekte:', await page.$$eval('#objectList .object-item', (n) => n.length));
console.log('Arten:', await page.$$eval('#objectList .object-item .tiny',
  (n) => Object.entries(n.reduce((acc, e) => {
    acc[e.textContent] = (acc[e.textContent] || 0) + 1; return acc;
  }, {})).map(([k, v]) => `${k}:${v}`).join(' ')));
console.log('Gruppen:', await page.$$eval('#bauplanGruppe option', (n) => n.map((o) => o.textContent)));
const start = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state());
if (start.worldSize !== 1132.8 || start.objects !== 1 || !start.boulevard || !start.mapVisible) {
  throw new Error(`Falscher Startzustand: ${JSON.stringify(start)}`);
}

// Ultra Duplo: komplette Messe erst als wenige grobe, direkt greifbare
// Baukloetze aufbauen. Halle 9 muss sich danach in die verknuepften
// Bauplan-Details auf- und wieder zuklappen lassen.
if (!(await page.$('#ultraDuploAll'))) throw new Error('Ultra-Duplo-Schalter fehlt.');
await page.click('#ultraDuploAll');
await page.waitForFunction(() => window.__BEUTELTIER_EDITOR__.state().ultraDuploPieces >= 7);
const duplo = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state());
if (!duplo.ultraDuploActive || duplo.ultraDuploPieces < 7) {
  throw new Error(`Ultra Duplo wurde nicht aufgebaut: ${JSON.stringify(duplo)}`);
}
await page.evaluate(() => window.__BEUTELTIER_EDITOR__.ultraDuplo.select('Halle 9.1'));
await page.click('#ultraDuploDetails');
await page.waitForFunction(() => window.__BEUTELTIER_EDITOR__.state().ultraDuploExpanded === 1);
await page.click('#ultraDuploDetails');
await page.waitForFunction(() => window.__BEUTELTIER_EDITOR__.state().ultraDuploExpanded === 0);
await page.click('[data-view="top"]');
await page.waitForTimeout(700);
await page.screenshot({ path: `${ABLAGE}/editor-ultra-duplo.png` });

// Fuer die bisherigen Rauchproben wieder in den absichtlich kleinen
// Startzustand zurueckkehren.
await page.evaluate(() => window.__BEUTELTIER_EDITOR__.newWorld());
await page.waitForFunction(() => window.__BEUTELTIER_EDITOR__.state().objects === 1);

// Der Boulevard ist wirklich eine gemeinsame, verriegelbare Baugruppe.
await page.click('#selectBoulevard');
if ((await page.$eval('#typeInput', (e) => e.value)) !== 'assembly') {
  throw new Error('Nordboulevard wurde nicht als Baugruppe geladen.');
}
await page.click('#anchorBoulevard');
if (!(await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().boulevardLocked))) {
  throw new Error('Nordboulevard ließ sich nicht verankern.');
}
await page.click('#anchorBoulevard');

// Duplo/Minecraft-Palette und Kartenfolie reagieren ohne Seitenneuladen.
await page.click('#addCube');
if ((await page.$$eval('#objectList .object-item', (n) => n.length)) !== 2) {
  throw new Error('1-m-Baustein wurde nicht angelegt.');
}
await page.$eval('#mapOpacity', (e) => { e.value = '0.22'; e.dispatchEvent(new Event('input')); });
const opacity = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state().mapOpacity);
if (Math.abs(opacity - 0.22) > 0.001) throw new Error(`Falsche Karten-Deckkraft: ${opacity}`);

await page.click('[data-view="top"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${ABLAGE}/editor-oben.png` });
await page.click('[data-view="perspective"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${ABLAGE}/editor-3d.png` });

// Ein Objekt anfassen: laesst sich der Inspektor damit fuellen?
await page.click('#objectList .object-item:nth-child(1)');
await page.waitForTimeout(600);
console.log('Auswahl:', (await page.textContent('#selectionInfo')).replace(/\n/g, ' | '));
console.log('Maße:', await page.$eval('#widthInput', (e) => e.value),
  await page.$eval('#heightInput', (e) => e.value),
  await page.$eval('#depthInput', (e) => e.value),
  '· Drehung', await page.$eval('#rotationInput', (e) => e.value));

// Auf den Boulevard fokussieren -- so sieht man Baugruppe und Luftbildfolie.
await page.click('#selectBoulevard');
await page.waitForTimeout(400);
await page.click('#focusBtn');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${ABLAGE}/editor-boulevard.png` });

console.log('Fehler:', fehler.slice(0, 8));
if (fehler.length) throw new Error(`Browserfehler: ${fehler.join(' | ')}`);
console.log('Bilder in', ABLAGE);
await browser.close();
await server.close();
