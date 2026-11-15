import { defineConfig } from 'vite';

// Três páginas estáticas: início, termos e privacidade.
export default defineConfig({
  base: '/',
  build: {
    rollupOptions: { input: { index: 'index.html', termos: 'termos.html', privacidade: 'privacidade.html' } },
  },
  server: { port: 5175 },
});
