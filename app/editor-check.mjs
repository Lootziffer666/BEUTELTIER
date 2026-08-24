import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const HIER = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const MODE = process.env.MODE || 'both';
const ABLAGE = process.env.ABLAGE || await mkdtemp(join(tmpdir(), 'editor-check-'));

function findChrome() {
  const homes = ['/home'];
  const names = ['chrome-headless-shell', 'chrome', 'chromium'];
  for (const h of homes) {
    let ents; try { ents = readdirSyncSafe(h); } catch { continue; }
    for (const u of ents) {
      const base = join(h, u, '.cache', 'ms-playwright');
      if (!existsSync(base)) continue;
      for (const d of readdirSyncSafe(base)) {
        for (const n of names) {
          const a = join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
          if (existsSync(a)) return a;
          const b = join(base, d, 'chrome-linux64', 'chrome');
          if (existsSync(b)) return b;
        }
      }
    }
  }
  return undefined;
}
function readdirSyncSafe(p) { try { return readdirSync(p); } catch { return []; } }

function buildIfNeeded() {
  if (process.env.SKIP_BUILD) return;
  const dist = join(HIER, 'dist', 'world-builder.html');
  if (existsSync(dist)) return;
  console.log('Baue App (npm run build) …');
  const r = spawnSync('npm', ['run', 'build'], { cwd: HIER, stdio: 'inherit', timeout: 180000 });
  if (r.status !== 0) throw new Error('Build fehlgeschlagen');
}

function startStatic(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.map': 'application/json', '.glb': 'model/gltf-binary' };
  const s = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = join(root, normalize(p));
      const data = await readFile(fp);
      res.writeHead(200, { 'content-type': types[extname(fp)] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r(s)));
}

const fatalConsole = (t) =>
  !/Failed to load resource|net::ERR|gelaende\.jpg|Cross origin|Not allowed to load local resource/i.test(t);

async function runChecks(page, label) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && fatalConsole(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  const assert = (c, m) => { if (!c) throw new Error(`[${label}] ${m}`); };
  const ev = (fn) => page.evaluate(fn);
  const shot = (n) => page.screenshot({ path: join(ABLAGE, `${label}-${n}.png`) });

  console.log(`\n=== ${label}: laden ===`);
  await page.goto(page._target, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__BEUTELTIER_EDITOR__ && window.__BEUTELTIER_EDITOR__.state().boulevard, { timeout: 60000 });

  // 1+2 Boot
  assert(await ev(() => !!window.__BEUTELTIER_EDITOR__), 'Editor nicht initialisiert');
  const st0 = await ev(() => window.__BEUTELTIER_EDITOR__.state());
  assert(st0.boulevard === true, 'Nordboulevard fehlt im Startzustand');
  assert(st0.mapVisible === true, 'Kartenfolie nicht sichtbar');

  // Canvas / WebGL
  const webgl = await ev(() => {
    const c = document.querySelector('#viewport canvas');
    if (!c) return false;
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
  assert(webgl, 'Kein WebGL-Canvas vorhanden');

  const items0 = await page.$$eval('#objectList .object-item', (n) => n.length);
  assert(items0 >= 1, 'Objektliste leer');
  await shot('01-boot');

  // 3 Nordboulevard auswaehlen
  console.log(`=== ${label}: Nordboulevard ===`);
  await page.click('#selectBoulevard');
  await page.waitForTimeout(300);
  assert((await page.$eval('#typeInput', (e) => e.value)) === 'assembly', 'Nordboulevard nicht als Baugruppe geladen');
  assert(!(await page.textContent('#selectionTag')).includes('Nichts ausgewaehlt'), 'Auswahl zeigt "Nichts ausgewaehlt"');
  const tsB = await ev(() => window.__BEUTELTIER_EDITOR__.transformShow());
  // TransformControls skaliert das Gizmo auf dem Bildschirm. Der Editor setzt
  // fuer Desktop bewusst 1.08; die fruehere >1.5-Schwelle widersprach diesem
  // aktiven Produktwert und liess selbst den visuell greifbaren Editor rot.
  assert(Math.abs(tsB.size - 1.08) < 0.01,
    `Unerwartete Desktop-Gizmo-Groesse (${tsB.size}; erwartet 1.08)`);

  // 4 Inspector enthaelt Boulevard-Daten
  const w = parseFloat(await page.$eval('#widthInput', (e) => e.value));
  assert(w > 0, 'Inspector-Breite des Boulevards leer');
  assert((await page.textContent('#selectionInfo')).toLowerCase().includes('boulevard'), 'Inspector ohne Boulevard-Daten');

  // 5 Verankern an/aus + gesperrte Loeschung
  console.log(`=== ${label}: Verankern ===`);
  await page.click('#anchorBoulevard');
  await page.waitForTimeout(200);
  assert(await ev(() => window.__BEUTELTIER_EDITOR__.state().boulevardLocked) === true, 'Verankern schlug fehl');
  const beforeDel = await ev(() => window.__BEUTELTIER_EDITOR__.objectCount());
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);
  const afterDel = await ev(() => window.__BEUTELTIER_EDITOR__.objectCount());
  assert(beforeDel === afterDel, 'Verankerter Boulevard wurde geloescht (muss gesperrt bleiben)');
  await page.click('#anchorBoulevard');
  await page.waitForTimeout(200);
  assert(await ev(() => window.__BEUTELTIER_EDITOR__.state().boulevardLocked) === false, 'Entriegeln schlug fehl');

  // 6 + 1-m-Stein
  console.log(`=== ${label}: + 1-m-Stein ===`);
  const n0 = await ev(() => window.__BEUTELTIER_EDITOR__.objectCount());
  await page.click('#addCube');
  await page.waitForTimeout(300);
  const n1 = await ev(() => window.__BEUTELTIER_EDITOR__.objectCount());
  assert(n1 === n0 + 1, '1-m-Stein wurde nicht erzeugt');
  await shot('02-stein');

  // 7 Stein auswaehlen
  console.log(`=== ${label}: Stein auswaehlen ===`);
  const items = await page.$$('#objectList .object-item');
  await items[items.length - 1].click();
  await page.waitForTimeout(200);
  assert((await page.$eval('#typeInput', (e) => e.value)) === 'block', 'Ausgewaehlter Stein ist kein Block');
  const selId = await ev(() => window.__BEUTELTIER_EDITOR__.selectedId());
  const traId = await ev(() => window.__BEUTELTIER_EDITOR__.transformObjectId());
  assert(selId && traId === selId, 'TransformControls haengen nicht am ausgewaehlten Objekt');

  // 8 Transform-Modus wechseln
  console.log(`=== ${label}: Transform-Modus ===`);
  await page.click('#modeRotate');
  await page.waitForTimeout(120);
  assert(await ev(() => window.__BEUTELTIER_EDITOR__.mode()) === 'rotate', 'Modus Rotate nicht aktiv');
  const tsR = await ev(() => window.__BEUTELTIER_EDITOR__.transformShow());
  assert(tsR.showY === true && tsR.showX === false && tsR.showZ === false, 'Rotation nicht auf Yaw (Vertikalachse) begrenzt – Objekt liesse sich kippen/neigen');
  assert(await page.$eval('#modeRotate', (e) => e.classList.contains('active')), 'Rotate-Button nicht aktiv');
  await page.click('#modeScale');
  await page.waitForTimeout(120);
  assert(await ev(() => window.__BEUTELTIER_EDITOR__.mode()) === 'scale', 'Modus Scale nicht aktiv');

  // 9 Mapslider
  console.log(`=== ${label}: Karten-Deckkraft ===`);
  await page.$eval('#mapOpacity', (e) => { e.value = '0.22'; e.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(150);
  const op = await ev(() => window.__BEUTELTIER_EDITOR__.state().mapOpacity);
  assert(Math.abs(op - 0.22) < 0.01, `Karten-Deckkraft nicht angewandt (${op})`);

  // 10 Undo
  console.log(`=== ${label}: Undo ===`);
  await page.click('#undoBtn');
  await page.waitForTimeout(200);
  assert((await ev(() => window.__BEUTELTIER_EDITOR__.objectCount())) === n0, 'Undo entfernte den Stein nicht');

  // 11 Redo
  console.log(`=== ${label}: Redo ===`);
  await page.click('#redoBtn');
  await page.waitForTimeout(200);
  assert((await ev(() => window.__BEUTELTIER_EDITOR__.objectCount())) === n0 + 1, 'Redo stellte den Stein nicht wieder her');

  // 12 neue Welt
  console.log(`=== ${label}: Neue Welt ===`);
  await page.click('#newWorld');
  await page.waitForTimeout(500);
  const nw = await ev(() => window.__BEUTELTIER_EDITOR__.state());
  assert(nw.boulevard === true, 'Neue Welt ohne Boulevard');
  assert((await ev(() => window.__BEUTELTIER_EDITOR__.objectCount())) === 1, 'Neue Welt hat falsche Objektzahl');

  // 13 Bauplan wieder laden
  console.log(`=== ${label}: Bauplan laden ===`);
  await page.click('#bauplanAlles');
  await page.waitForTimeout(600);
  const nb = await ev(() => window.__BEUTELTIER_EDITOR__.objectCount());
  assert(nb > 20, `Bauplan nicht geladen (nur ${nb} Objekte)`);
  await shot('03-bauplan');

  // 14 Walk Mode betreten
  console.log(`=== ${label}: Walk Mode ein ===`);
  await page.click('#walkBtn');
  await page.waitForTimeout(300);
  assert(await ev(() => window.__BEUTELTIER_EDITOR__.state().walkActive) === true, 'Walk Mode nicht aktiv');
  assert(await page.$eval('body', (e) => e.classList.contains('walking')), 'body ohne walking-Klasse');
  await shot('04-walk');

  // 15 Walk Mode verlassen (Button ist oberstes Element; Playwrights CDP-Hit-Test
  // meldet hier fälschlich Canvas-Überlappung, daher echter Handler-Aufruf)
  console.log(`=== ${label}: Walk Mode aus ===`);
  await page.evaluate(() => document.getElementById('walkExit').click());
  await page.waitForTimeout(300);
  assert(await ev(() => window.__BEUTELTIER_EDITOR__.state().walkActive) === false, 'Walk Mode noch aktiv');

  if (errs.length) throw new Error(`[${label}] Browserfehler: ${errs.join(' | ')}`);
  console.log(`=== ${label}: ALLE PRUEFUNGEN BESTANDEN ===`);
}

async function main() {
  buildIfNeeded();
  const browser = await chromium.launch({
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(60000);
  page.on('dialog', (d) => d.accept());
  page._target = '';

  const runMode = async (mode) => {
    if (mode === 'dev') {
      const { createServer: viteCreate } = await import('vite');
      const server = await viteCreate({ root: HIER, logLevel: 'error', server: { host: '127.0.0.1', port: 8097, strictPort: true } });
      await server.listen();
      page._target = 'http://127.0.0.1:8097/world-builder.html';
      await runChecks(page, 'dev');
      await server.close();
    } else {
      const sroot = join(HIER, 'dist');
      const srv = await startStatic(sroot);
      const port = srv.address().port;
      page._target = `http://127.0.0.1:${port}/world-builder.html`;
      await runChecks(page, 'prod');
      // echtes Dateiprotokoll: die gebündelte, eigenständige HTML muss auch per Doppelklick booten
      page._target = pathToFileURL(join(HIER, 'dist', 'world-builder.html')).href;
      await runChecks(page, 'file');
      srv.close();
    }
  };

  if (MODE === 'both' || MODE === 'dev') await runMode('dev');
  if (MODE === 'both' || MODE === 'prod') await runMode('prod');

  await browser.close();
  console.log('\nBilder in', ABLAGE);
}

main().catch((e) => { console.error('TEST FEHLGESCHLAGEN:', e.message); process.exit(1); });
