import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' para o mesmo build servir no Firebase Hosting e dentro do Electron (app://).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
});
