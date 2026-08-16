/**
 * Schreibt jede Materialzeichnung als PNG heraus -- zum Hinsehen.
 *
 * Der Grund: prozedurale Texturen kann man nicht durch Lesen beurteilen. Der
 * Test sagt "die Fuge ist zwei Pixel breit", aber nicht, ob die Fläche nach
 * Beton aussieht. Dafür braucht es ein Bild, und zwar eines, das ohne Browser
 * entsteht -- sonst dauert jede Runde Minuten statt Sekunden.
 *
 * Aufruf: `node textur-vorschau.mjs [zielordner]`
 *
 * Der PNG-Schreiber ist absichtlich hier und nicht in einer Abhängigkeit: er
 * braucht dreissig Zeilen und `zlib`, das Node mitbringt.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ZIEL = process.argv[2] ?? 'textur-vorschau';

function crc32(daten) {
  let tabelle = crc32.tabelle;
  if (!tabelle) {
    tabelle = crc32.tabelle = new Int32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelle[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < daten.length; i += 1) crc = tabelle[(crc ^ daten[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function block(typ, inhalt) {
  const kopf = Buffer.alloc(4);
  kopf.writeUInt32BE(inhalt.length, 0);
  const name = Buffer.from(typ, 'ascii');
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(Buffer.concat([name, inhalt])), 0);
  return Buffer.concat([kopf, name, inhalt, pruef]);
}

/** RGBA-Daten als PNG. Filterbyte 0 je Zeile -- zlib erledigt den Rest. */
export function png(daten, breite, hoehe) {
  const roh = Buffer.alloc((breite * 4 + 1) * hoehe);
  for (let y = 0; y < hoehe; y += 1) {
    roh[y * (breite * 4 + 1)] = 0;
    Buffer.from(daten.buffer ?? daten, y * breite * 4, breite * 4)
      .copy(roh, y * (breite * 4 + 1) + 1);
  }
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(breite, 0);
  kopf.writeUInt32BE(hoehe, 4);
  kopf[8] = 8;
  kopf[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    block('IHDR', kopf),
    block('IDAT', deflateSync(roh, { level: 9 })),
    block('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Legt vier Kacheln nebeneinander.
 *
 * Zwei mal zwei und nicht eine: eine einzelne Kachel sieht immer gut aus. Erst
 * an der Naht zeigt sich, ob sie wirklich umläuft oder ob dort ein Gitter
 * entsteht -- und das Gitter ist der Fehler, den man in der fertigen Halle
 * sieht und in der Einzelkachel nie.
 */
function gekachelt(daten, kante) {
  const gross = new Uint8ClampedArray(kante * 2 * kante * 2 * 4);
  for (let y = 0; y < kante * 2; y += 1) {
    for (let x = 0; x < kante * 2; x += 1) {
      const q = ((y % kante) * kante + (x % kante)) * 4;
      const z = (y * kante * 2 + x) * 4;
      gross[z] = daten[q];
      gross[z + 1] = daten[q + 1];
      gross[z + 2] = daten[q + 2];
      gross[z + 3] = 255;
    }
  }
  return gross;
}

// Geladen über Vite und nicht über `import()`: die Quellen schreiben ihre
// Importe ohne Endung, wie im Browser üblich. Node löst das nicht auf, Vite
// schon -- und so läuft die Vorschau durch dieselbe Auflösung wie die App.
const { createServer } = await import('vite');
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
});
const { zeichnungsRaster, KACHEL_PX } = await server.ssrLoadModule('./src/scene/textur.ts');

mkdirSync(ZIEL, { recursive: true });
for (const [id, { bild }] of Object.entries(zeichnungsRaster())) {
  writeFileSync(join(ZIEL, `${id}.png`), png(bild.daten, KACHEL_PX, KACHEL_PX));
  writeFileSync(join(ZIEL, `${id}-gekachelt.png`),
                png(gekachelt(bild.daten, KACHEL_PX), KACHEL_PX * 2, KACHEL_PX * 2));
}
/**
 * Alle Familien auf einem Blatt.
 *
 * Einzelbilder beantworten "sieht diese Fläche gut aus". Das Blatt beantwortet
 * die wichtigere Frage: gehören sie zusammen? Zehn für sich gelungene
 * Materialien können nebeneinander trotzdem auseinanderfallen -- an der
 * Sättigung, an der Körnung, an der Strichstärke.
 */
function blatt(eintraege, kante, spalten) {
  const zeilen = Math.ceil(eintraege.length / spalten);
  const feld = Math.floor(kante / 2);
  const breite = spalten * feld;
  const hoehe = zeilen * feld;
  const ziel = new Uint8ClampedArray(breite * hoehe * 4);
  eintraege.forEach(({ daten }, i) => {
    const ox = (i % spalten) * feld;
    const oy = Math.floor(i / spalten) * feld;
    for (let y = 0; y < feld; y += 1) {
      for (let x = 0; x < feld; x += 1) {
        // Halbiert durch Abtastung jedes zweiten Punktes -- fürs Blatt genügt das.
        const q = ((y * 2) * kante + x * 2) * 4;
        const z = ((oy + y) * breite + ox + x) * 4;
        ziel[z] = daten[q];
        ziel[z + 1] = daten[q + 1];
        ziel[z + 2] = daten[q + 2];
        ziel[z + 3] = 255;
      }
    }
  });
  return { ziel, breite, hoehe };
}

const alle = Object.entries(zeichnungsRaster())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([id, { bild }]) => ({ id, daten: bild.daten }));
const { ziel, breite, hoehe } = blatt(alle, KACHEL_PX, 5);
writeFileSync(join(ZIEL, 'alle.png'), png(ziel, breite, hoehe));

console.log(`Vorschau in ${ZIEL}/ (${alle.map((e) => e.id).join(', ')})`);
await server.close();
