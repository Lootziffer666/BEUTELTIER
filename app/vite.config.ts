import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// Auf dem Messegelaende bricht das Netz genau dann zusammen, wenn alle es
// brauchen. Die App muss deshalb vollstaendig aus dem Cache laufen -- Karte,
// Wegenetz und Register liegen als Schnappschuss bei und werden mit
// eingelagert.
export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        worldBuilder: fileURLToPath(new URL('./world-builder.html', import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      // three@0.185.1 legt die Addons unter examples/jsm ab. Die Form
      // "three/addons/..." funktioniert nur, solange Vite die Umleitung
      // vornimmt -- bei einem file://-Start oder einem anderen Toolchain
      // bricht der Import ab und der Editor bootet nicht. Auf die echte
      // Paket-Relativpfad wird hier also standardisiert.
      'three/addons/': fileURLToPath(new URL('./node_modules/three/examples/jsm/', import.meta.url)),
    },
  },
  plugins: [
    react(),
    // Der Service-Worker wird NUR in die Haupt-App (index.html) eingebaut.
    // world-builder.html ist ein eigenes, eigenstaendiges Modul: ein
    // Workbox-SW ruft importScripts() auf und laeuft im Module-Scope des
    // Editors -- da bricht der gesamte Boot ab.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/*.png'],
      injectRegister: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      manifest: {
        name: 'BEUTELTIER',
        short_name: 'BEUTELTIER',
        description: 'Finde Beute. Finde den Weg. Gamescom-Begleiter.',
        lang: 'de',
        start_url: './',
        display: 'standalone',
        background_color: '#0b0d12',
        theme_color: '#f0a03c',
        icons: [
          { src: 'brand/lootzy-head.png', sizes: '848x818', type: 'image/png', purpose: 'any' },
          { src: 'brand/lootzy-full.png', sizes: '1048x1536', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
    // world-builder.html ist ein eigenstaendiges Modul und kein PWA-Entry.
    // Ein <link rel="manifest"> (und damit der PWA-Bootstrap) laesst den
    // Browser vor dem Modul-Script eine separate Web-App-Kontext initialisieren
    // und klaut dem Canvas den einzigen WebGL-Kontext. THREE meldet dann
    // "Canvas has an existing context of a different type" und der Editor
    // bootet nicht. Die Manifest-Link-Tags werden hier nach dem Build aus
    // world-builder.html entfernt; index.html behält sie.
    {
      name: 'strip-worldbuilder-pwa',
      apply: 'build',
      generateBundle(_opts, bundle) {
        const wb = bundle['world-builder.html'] as { source?: string | Uint8Array } | undefined;
        if (!wb || typeof wb.source !== 'string') return;
        wb.source = wb.source.replace(/<link rel="manifest"[^>]*>\s*/g, '');
      },
    },
  ],
});