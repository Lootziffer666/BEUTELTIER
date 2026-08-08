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

import http from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, '..');
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.169.0/';
const ABLAGE = process.env.ABLAGE || await mkdtemp(`${tmpdir()}/editor-check-`);
const CHROME = process.env.CHROME;

const server = http.createServer(async (req, res) => {
  try {
    const pfad = req.url.split('?')[0];
    const datei = pfad === '/' ? '/editor/BEUTELTIER_Block_Editor_v5.html' : pfad;
    const body = await readFile(WURZEL + datei);
    res.writeHead(200, { 'content-type': datei.endsWith('.html') ? 'text/html' : 'application/json' });
    res.end(body);
  } catch { res.writeHead(404); res.end('weg'); }
});
await new Promise((r) => server.listen(8099, r));

const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(180000);

await page.route(`${CDN}**`, async (route) => {
  const rest = route.request().url().slice(CDN.length);
  try {
    const body = await readFile(`${HIER}/node_modules/three/${rest}`);
    await route.fulfill({ status: 200, contentType: 'text/javascript', body });
  } catch (err) {
    console.log('fehlt:', rest, err.message);
    await route.abort();
  }
});

const fehler = [];
page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
page.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));

await page.goto('http://localhost:8099/', { waitUntil: 'load', timeout: 60000 });
await page
  .waitForFunction(() => document.querySelectorAll('#objectList .object-item').length > 0,
    { timeout: 60000 })
  .catch(() => {});
await page.waitForTimeout(2000);

console.log('Status:', await page.textContent('#status'));
console.log('Objekte:', await page.$$eval('#objectList .object-item', (n) => n.length));
console.log('Arten:', await page.$$eval('#objectList .object-item .tiny',
  (n) => Object.entries(n.reduce((acc, e) => {
    acc[e.textContent] = (acc[e.textContent] || 0) + 1; return acc;
  }, {})).map(([k, v]) => `${k}:${v}`).join(' ')));
console.log('Gruppen:', await page.$$eval('#bauplanGruppe option', (n) => n.map((o) => o.textContent)));

await page.click('[data-view="top"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${ABLAGE}/editor-oben.png` });
await page.click('[data-view="perspective"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${ABLAGE}/editor-3d.png` });

// Ein Objekt anfassen: laesst sich der Inspektor damit fuellen?
await page.click('#objectList .object-item:nth-child(31)');
await page.waitForTimeout(600);
console.log('Auswahl:', (await page.textContent('#selectionInfo')).replace(/\n/g, ' | '));
console.log('Maße:', await page.$eval('#widthInput', (e) => e.value),
  await page.$eval('#heightInput', (e) => e.value),
  await page.$eval('#depthInput', (e) => e.value),
  '· Drehung', await page.$eval('#rotationInput', (e) => e.value));

// Auf einen Markenstand fokussieren -- so sieht man, ob Halle 9 stimmt.
await page.evaluate(() => {
  const treffer = [...document.querySelectorAll('#objectList .object-item')]
    .find((e) => e.textContent.includes('LEGO A030'));
  treffer?.click();
});
await page.waitForTimeout(400);
await page.click('#focusBtn');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${ABLAGE}/editor-halle9.png` });

console.log('Fehler:', fehler.slice(0, 8));
console.log('Bilder in', ABLAGE);
await browser.close();
server.close();
