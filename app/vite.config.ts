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
// wird deshalb beim Vite-Bau in *denselben* Modul-Scope injiziert, statt eine
// zweite Editor-API daneben aufzubauen. So kann der Modus die vorhandenen
// Bauplan-, Auswahl-, Transform- und GLB-Funktionen direkt wiederverwenden.
const ultraDuploPlugin = {
  name: 'beuteltier-world-builder-ultra-duplo',
  transformIndexHtml: {
    // Vor vite:build-html laufen: danach ist das Inline-Modul bereits in einen
    // Chunk umgeschrieben und der Kommentar-Marker nicht mehr vorhanden.
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
  plugins: [
    ultraDuploPlugin,
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/*.png'],
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
  ],
});
