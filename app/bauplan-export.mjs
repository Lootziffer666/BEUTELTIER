/**
 * Schreibt den Bauplan fuer den Blockeditor.
 *
 * Gerechnet wird mit demselben Quelltext, den auch die App benutzt: Vite laedt
 * `src/scene/bauplan.ts` samt allem, was daran haengt, direkt in Node. Damit
 * kann der Bauplan gar nicht von der Szene abweichen -- er ist dieselbe
 * Rechnung, nur in Zahlen statt in Meshes.
 *
 *   node bauplan-export.mjs
 *
 * Erzeugt `editor/bauplan.json` und traegt denselben Inhalt in den Editor
 * `editor/BEUTELTIER_Block_Editor_v5.html` ein, damit er auch ohne Server
 * per Doppelklick funktioniert.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const hier = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(hier, '..');
const QUELLE = resolve(hier, 'public/data/registered-site.json');
const ZIEL_JSON = resolve(WURZEL, 'editor/bauplan.json');
const ZIEL_HTML = resolve(WURZEL, 'editor/BEUTELTIER_Block_Editor_v5.html');
const MARKE_AUF = '/*BAUPLAN*/';
const MARKE_ZU = '/*/BAUPLAN*/';

const site = JSON.parse(await readFile(QUELLE, 'utf8'));
const gelaende = {
  site,
  hallsByKey: new Map(site.halls.map((hall) => [hall.key, hall])),
};

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'warn',
});

let plan;
try {
  const { siteCentre } = await server.ssrLoadModule('/src/data/load.ts');
  const { bauplan } = await server.ssrLoadModule('/src/scene/bauplan.ts');
  plan = bauplan(gelaende, siteCentre(site));
} finally {
  await server.close();
}

const text = JSON.stringify(plan);
await writeFile(ZIEL_JSON, `${JSON.stringify(plan, null, 1)}\n`, 'utf8');

const html = await readFile(ZIEL_HTML, 'utf8');
const auf = html.indexOf(MARKE_AUF);
const zu = html.indexOf(MARKE_ZU);
if (auf < 0 || zu < auf) {
  throw new Error(`Im Editor fehlen die Marken ${MARKE_AUF} … ${MARKE_ZU}.`);
}
await writeFile(
  ZIEL_HTML,
  html.slice(0, auf + MARKE_AUF.length) + text + html.slice(zu),
  'utf8',
);

const je = new Map();
for (const objekt of plan.objekte) je.set(objekt.gruppe, (je.get(objekt.gruppe) ?? 0) + 1);
console.log(`Bauplan: ${plan.objekte.length} Objekte in ${plan.gruppen.length} Gruppen`);
for (const [gruppe, anzahl] of je) console.log(`  ${gruppe}: ${anzahl}`);
console.log(`Nullpunkt: ${plan.centre.map((v) => v.toFixed(1)).join(' / ')}`);
console.log(`${(text.length / 1024).toFixed(0)} kB in ${ZIEL_JSON} und in den Editor geschrieben.`);
