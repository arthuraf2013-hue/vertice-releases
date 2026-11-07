// Teste ponta a ponta: sobe os emuladores e o servidor de mídias, serve os três builds e roda e2e/run.py (Playwright).
// Requer Java (emuladores) e Python com Playwright: pip install playwright && playwright install chromium
import { spawn, execSync } from 'node:child_process';
const sh = (cmd, cwd = '.') => execSync(cmd, { stdio: 'inherit', cwd });
sh('npx vite build --mode e2e --outDir dist-e2e', 'apps/panel');
sh('npx vite build --mode e2e --outDir dist-e2e', 'apps/player');
sh('npx vite build --config e2e/harness/vite.config.js');
const servers = [
  ['npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', '4300', '--strictPort'], 'apps/panel'],
  ['npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', '4301', '--strictPort'], 'apps/player'],
  ['npx', ['vite', 'preview', '--config', 'e2e/harness/vite.config.js', '--port', '4302', '--strictPort'], '.'],
].map(([c, a, cwd]) => spawn(c, a, { cwd, stdio: 'ignore' }));
const chrome = process.env.CHROME ? `CHROME=${process.env.CHROME} ` : '';
try {
  // O servidor de mídias roda dentro do emulators:exec para herdar os endereços dos emuladores.
  const media = 'rm -rf /tmp/vx-e2e-media; FIREBASE_PROJECT_ID=demo-vertice DATA_DIR=/tmp/vx-e2e-media PUBLIC_URL=http://127.0.0.1:8787 node servers/media/server.js > /tmp/vx-e2e-media.log 2>&1 & M=\\$!; sleep 1';
  sh(`npx firebase emulators:exec --only auth,firestore --project demo-vertice --config firebase.e2e.json "${media}; ${chrome}python3 e2e/run.py; R=\\$?; kill \\$M; exit \\$R"`);
} finally {
  servers.forEach((s) => s.kill());
}
