import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

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
  plugins: [viteSingleFile()],
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
