import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const HIER = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const ABLAGE = process.env.ABLAGE || join(HIER, '..', 'artifacts', 'world-builder');

function startStatic(root) {
  const types = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary',
  };
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = join(root, normalize(p));
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('nf');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function sameVector(a, b, tolerance = .02) {
  return a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
}

const server = await startStatic(join(HIER, 'dist'));
const port = server.address().port;
const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(60000);

try {
  await page.goto(`http://127.0.0.1:${port}/world-builder.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__BEUTELTIER_EDITOR__?.state().boulevard);

  if (!(await page.$('#ultraDuploAll'))) throw new Error('Ultra-Duplo-Schalter fehlt im Produktionsbuild.');
  if (!(await page.evaluate(() => !!window.__BEUTELTIER_EDITOR__.ultraDuplo))) {
    throw new Error('Ultra-Duplo-API fehlt im Produktionsbuild.');
  }

  await page.click('#ultraDuploAll');
  await page.waitForFunction(() => window.__BEUTELTIER_EDITOR__.state().ultraDuploPieces >= 7);
  const built = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.state());
  if (!built.ultraDuploActive || built.ultraDuploPieces < 7) {
    throw new Error(`Ultra Duplo wurde nicht aufgebaut: ${JSON.stringify(built)}`);
  }

  const selected = await page.evaluate(() => !!window.__BEUTELTIER_EDITOR__.ultraDuplo.select('Halle 9.1'));
  if (!selected) throw new Error('Halle 9.1 konnte nicht als Duplo-Klotz gewählt werden.');

  const before = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.ultraDuplo.inspect('Halle 9.1'));
  if (!before || before.detail) throw new Error('Halle 9.1 ist vor dem Aufklappen kein Duplo-Klotz.');

  await page.click('#ultraDuploDetails');
  await page.waitForFunction(() => window.__BEUTELTIER_EDITOR__.state().ultraDuploExpanded === 1);
  const expanded = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.ultraDuplo.inspect('Halle 9.1'));
  if (!expanded?.detail) throw new Error('Halle 9.1 wurde nicht in Details aufgeklappt.');

  await page.click('#ultraDuploDetails');
  await page.waitForFunction(() => window.__BEUTELTIER_EDITOR__.state().ultraDuploExpanded === 0);
  const after = await page.evaluate(() => window.__BEUTELTIER_EDITOR__.ultraDuplo.inspect('Halle 9.1'));
  if (!after || after.detail) throw new Error('Halle 9.1 wurde nicht wieder zum Klotz zusammengeklappt.');
  if (!sameVector(before.dimensions, after.dimensions)) {
    throw new Error(`Maße gingen beim Detail-Roundtrip verloren: ${before.dimensions} -> ${after.dimensions}`);
  }
  if (!sameVector(before.position, after.position)) {
    throw new Error(`Position ging beim Detail-Roundtrip verloren: ${before.position} -> ${after.position}`);
  }
  if (Math.abs(before.rotationY - after.rotationY) > .001) {
    throw new Error(`Drehung ging beim Detail-Roundtrip verloren: ${before.rotationY} -> ${after.rotationY}`);
  }

  await page.evaluate(() => window.__BEUTELTIER_EDITOR__.ultraDuplo.setSnap(10));
  const snap = await page.$eval('#translateSnap', (e) => Number(e.value));
  if (snap !== 10) throw new Error(`Ultra-Duplo-Raster wurde nicht auf 10 m gesetzt (${snap}).`);

  await page.click('[data-view="top"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(ABLAGE, 'ultra-duplo-prod.png') });
  console.log(`ULTRA DUPLO OK: ${built.ultraDuploPieces} Bausteine, Detail-Roundtrip und Raster funktionieren.`);
} finally {
  await browser.close();
  server.close();
}
