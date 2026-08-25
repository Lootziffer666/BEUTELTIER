import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ultraDuploSource = readFileSync(
  fileURLToPath(new URL('./src/world-builder/ultra-duplo.inc.js', import.meta.url)),
  'utf8',
);

// World Builder ist absichtlich noch eine einzelne HTML-Werkbank. Ultra Duplo
// wird beim Vite-Bau in denselben Modul-Scope injiziert, damit der Modus die
// vorhandenen Bauplan-, Auswahl-, Transform- und GLB-Funktionen wiederverwendet.
const ultraDuploPlugin = {
  name: 'beuteltier-world-builder-ultra-duplo',
  transformIndexHtml: {
    order: 'pre' as const,
    handler(html: string) {
      if (!html.includes('<title>BEUTELTIER World Builder 6</title>')) return html;
      const marker = '// Startzustand: keine Hallenlawine, sondern die kleinste brauchbare Welt.';
      if (!html.includes(marker)) {
        throw new Error('World Builder Ultra Duplo: Einspritzpunkt fehlt.');
      }
      return html.replace(marker, `${ultraDuploSource}\n${marker}`);
    },
  },
};

// Karte, Wegenetz und Register werden beim Installieren vorgeladen. Die
// grossen, realen Weltassets werden beim ersten erfolgreichen Abruf separat
// gecacht. Online gewinnt immer die aktuelle Deployment-Datei; nur bei einem
// echten Netzfehler dient der letzte erfolgreiche Abruf als Offline-Rueckgriff.
// Die v2-Namen isolieren die korrigierte Welt von den alten CacheFirst-Dateien.
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
  plugins: [
    ultraDuploPlugin,
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,jpg,jpeg,json}'],
        globIgnores: ['models/gelaende.jpg'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Ohne diese drei kann ein Tab, der schon offen war, als naechstes
        // einen Mix aus altem `index.html` und neu benannten JS-Chunks (oder
        // umgekehrt) laden -- ein Chunk, den der alte Service Worker nicht
        // kennt und der Server nicht mehr ausliefert, weil das Deployment
        // inzwischen weiter ist. `skipWaiting`+`clientsClaim` sorgen dafuer,
        // dass ein neuer Worker sofort uebernimmt statt auf den naechsten
        // Tab-Neustart zu warten; `cleanupOutdatedCaches` raeumt die alten
        // Precache-Eintraege weg, damit nichts Veraltetes haengen bleibt.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/models\/(?:gelaende\.jpg|.*\.glb)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'beuteltier-world-assets-v2',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 16, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /\/data\/terrain_heightmap\.bin$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'beuteltier-world-data-v2',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 4, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
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
  ],
});
