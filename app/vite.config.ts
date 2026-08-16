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
  plugins: [
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
