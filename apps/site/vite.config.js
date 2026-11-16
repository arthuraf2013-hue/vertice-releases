import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Páginas estáticas: início, termos, privacidade e a página de comentários (aberta pelo QR da TV).
// A configuração do Firebase vem do mesmo .env do painel (apps/panel/.env).
export default defineConfig({
  base: '/',
  envDir: fileURLToPath(new URL('../panel', import.meta.url)),
  build: {
    rollupOptions: { input: { index: 'index.html', termos: 'termos.html', privacidade: 'privacidade.html', comentar: 'comentar.html' } },
  },
  server: { port: 5175 },
});
