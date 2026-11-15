// Junta os builds num site só para o Firebase Hosting:
//   /      → site comercial (apps/site): início, termos e privacidade
//   /app/  → painel (links antigos /#/... são levados para /app/#/...)
//   /tv/   → player web (Windows, Linux e Raspberry em modo quiosque)
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const out = new URL('../dist-hosting/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(new URL('../apps/site/dist/', import.meta.url), out, { recursive: true });
cpSync(new URL('../apps/panel/dist/', import.meta.url), new URL('app/', out), { recursive: true });
cpSync(new URL('../apps/player/dist/', import.meta.url), new URL('tv/', out), { recursive: true });
console.log('dist-hosting pronto: site em /, painel em /app/ e player em /tv/');
