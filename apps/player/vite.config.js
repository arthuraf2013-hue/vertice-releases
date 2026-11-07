import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

/** version.json ao lado do index.html: o player web recarrega sozinho quando ele muda. */
const versionFile = () => ({
  name: 'vertice-version',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: pkg.version }) });
  },
});

// O mesmo build vira o APK (Capacitor) e o player web em /tv no Firebase Hosting
// (Windows, Linux e Raspberry abrem em modo quiosque no Chromium).
export default defineConfig({
  base: './',
  plugins: [react(), versionFile()],
  build: {
    outDir: 'dist',
    // TV Box antiga costuma ter WebView Chromium 80+.
    target: ['chrome80', 'safari14'],
    chunkSizeWarningLimit: 1200,
  },
});
