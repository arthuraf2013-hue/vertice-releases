// Repassa ao painel a configuração do vertice.config.json (projeto Firebase e servidor de mídias).
const { contextBridge } = require('electron');

let config = {};
try {
  const arg = process.argv.find((a) => a.startsWith('--vx-config='));
  if (arg) config = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(arg.slice(12)), (c) => c.charCodeAt(0))));
} catch { /* segue com o .env do build */ }

contextBridge.exposeInMainWorld('vxDesktop', { config });
