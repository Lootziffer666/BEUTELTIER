import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ultraDuploSource = readFileSync(
  fileURLToPath(new URL('./src/world-builder/ultra-duplo.inc.js', import.meta.url)),
  'utf8',
);

const ultraDuploPlugin = {
  name: 'beuteltier-world-builder-ultra-duplo-singlefile',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      if (!html.includes('<title>BEUTELTIER World Builder 6</title>')) return html;
      const marker = '// Startzustand: keine Hallenlawine, sondern die kleinste brauchbare Welt.';
      if (!html.includes(marker)) {
        throw new Error('World Builder Ultra Duplo: Einspritzpunkt fehlt.');
      }
      return html.replace(marker, `${ultraDuploSource}\n${marker}`);
    },
  },
};

// Eigener, abhaengigkeitsfreier Build des World Builders.
//
// Der World Builder wird zu EINER einzigen, in sich geschlossenen HTML-Datei
// gebündelt. Alle Three.js-Module werden inline gepackt, sodass die fertige
// dist/world-builder.html keinen einzigen Bare-Module-Import mehr enthaelt.
// Dadurch startet sie gleich zuverlaessig ueber den Vite-Dev-Server, über
// einen beliebigen statischen Webserver und sogar per Doppelklick
// (lokales Dateiprotokoll) – ohne dass der Browser einen Modul-Resolver
// braucht. Genau das war die Ursache des Totalausfalls: rohe Bare-Imports
// scheitern ausserhalb der Vite-Modulumgebung still.
export default defineConfig({
  base: './',
  plugins: [ultraDuploPlugin, viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: fileURLToPath(new URL('./world-builder.html', import.meta.url)),
    },
  },
});
